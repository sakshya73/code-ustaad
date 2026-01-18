import * as vscode from "vscode";
import {
    getDisplayLanguage,
    LARGE_CODE_INSTRUCTION,
    PERSONA_PROMPTS,
} from "../prompts";
import { createProvider } from "../providers";
import { ConfigService, HistoryService, SecretsService } from "../services";
import type { HistoryItem } from "../types";
import {
    checkConnectivity,
    countLines,
    escapeHtml,
    generateId,
    renderMarkdown,
} from "../utils/helpers";
import { getSetupHtml, getWebviewHtml } from "../webview/template";
import { setApiKey } from "./setApiKey";

const MIN_SELECTION_LENGTH = 20;
const CONTEXT_LINES = 10;
const LARGE_SELECTION_THRESHOLD = 100;
const VERY_LARGE_SELECTION_THRESHOLD = 300;

let currentPanel: vscode.WebviewPanel | undefined;
let styles: string = "";

export function setStyles(css: string): void {
    styles = css;
}

export function getCurrentPanel(): vscode.WebviewPanel | undefined {
    return currentPanel;
}

export function disposePanel(): void {
    currentPanel?.dispose();
    currentPanel = undefined;
}

export async function askUstaad(
    context: vscode.ExtensionContext,
): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        vscode.window.showErrorMessage("Arey beta, pehle koi file toh kholo!");
        return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);

    if (!selectedText) {
        vscode.window.showErrorMessage(
            "Beta, pehle code select karo jo samajhna hai!",
        );
        return;
    }

    // Check line count for large selections
    const lineCount = countLines(selectedText);
    const isLargeSelection = lineCount > LARGE_SELECTION_THRESHOLD;
    const isVeryLargeSelection = lineCount > VERY_LARGE_SELECTION_THRESHOLD;

    // Warn user for very large selections
    if (isVeryLargeSelection) {
        const choice = await vscode.window.showWarningMessage(
            `Code kaafi lamba hai (${lineCount} lines). Summarize karun?`,
            "Haan, Summary Do",
            "Cancel",
        );
        if (choice !== "Haan, Summary Do") {
            return;
        }
    }

    // Get surrounding context for small selections
    let codeToExplain = selectedText;
    let contextInfo = "";

    if (selectedText.length < MIN_SELECTION_LENGTH) {
        const startLine = Math.max(0, selection.start.line - CONTEXT_LINES);
        const endLine = Math.min(
            editor.document.lineCount - 1,
            selection.end.line + CONTEXT_LINES,
        );
        const contextRange = new vscode.Range(
            startLine,
            0,
            endLine,
            editor.document.lineAt(endLine).text.length,
        );
        codeToExplain = editor.document.getText(contextRange);
        contextInfo = `\n\nNote: The user selected "${selectedText}". Focus on explaining this specific part.\n\nSelected: "${selectedText}"`;
    }

    const config = ConfigService.get();
    const secrets = new SecretsService(context);
    const history = new HistoryService(context, config.maxHistoryItems);

    const apiKey = await secrets.getApiKey(config.provider);
    const languageId = editor.document.languageId;

    // Create or reveal panel
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.Beside);
    } else {
        currentPanel = vscode.window.createWebviewPanel(
            "codeUstaad",
            "Code Ustaad",
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [context.extensionUri],
            },
        );

        currentPanel.onDidDispose(
            () => {
                currentPanel = undefined;
            },
            null,
            context.subscriptions,
        );

        // Handle webview messages
        currentPanel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case "loadHistory": {
                        const item = history.getById(message.id);
                        if (item && currentPanel) {
                            currentPanel.webview.postMessage({
                                command: "showHistoryItem",
                                item: {
                                    ...item,
                                    explanationHtml: renderMarkdown(
                                        item.explanation,
                                    ),
                                },
                            });
                        }
                        break;
                    }
                    case "clearHistory":
                        history.clear();
                        currentPanel?.webview.postMessage({
                            command: "historyCleared",
                        });
                        break;
                    case "setupApiKey": {
                        const provider = await setApiKey(context);
                        if (provider && currentPanel) {
                            currentPanel.dispose();
                            currentPanel = undefined;
                            // Small delay to ensure config changes propagate
                            setTimeout(() => {
                                vscode.commands.executeCommand(
                                    "code-ustaad.askUstaad",
                                );
                            }, 100);
                        }
                        break;
                    }
                }
            },
            null,
            context.subscriptions,
        );
    }

    // Get icon URI for webview
    const iconPath = vscode.Uri.joinPath(context.extensionUri, "icon.png");
    const iconUri = currentPanel.webview.asWebviewUri(iconPath).toString();

    // If no API key, show setup screen
    if (!apiKey) {
        currentPanel.webview.html = getSetupHtml(
            styles,
            config.provider,
            iconUri,
        );
        return;
    }

    const historyId = generateId();
    const historyHtml = history.generateHistoryHtml();

    // Show loading state
    currentPanel.webview.html = getWebviewHtml({
        styles,
        historyHtml,
        language: languageId,
        displayLanguage: getDisplayLanguage(languageId),
        escapedCode: escapeHtml(selectedText),
        isLoading: true,
        iconUri,
    });

    const systemPrompt =
        PERSONA_PROMPTS[config.personaIntensity] || PERSONA_PROMPTS.balanced;

    // Check connectivity before making API call
    const isOnline = await checkConnectivity();
    if (!isOnline) {
        const offlineError =
            "Internet nahi chal raha bhai! Connection check karo.";
        vscode.window.showErrorMessage(offlineError);
        currentPanel.webview.postMessage({
            command: "streamError",
            error: offlineError,
        });
        return;
    }

    try {
        const largeCodeInstruction = isLargeSelection
            ? LARGE_CODE_INSTRUCTION
            : "";
        const userPrompt = `Please explain this ${languageId} code:\n\n\`\`\`${languageId}\n${codeToExplain}\n\`\`\`${contextInfo}${largeCodeInstruction}`;

        const provider = createProvider(
            config.provider,
            apiKey,
            ConfigService.getModel(config.provider),
        );

        const fullExplanation = await provider.streamExplanation(
            systemPrompt,
            userPrompt,
            (content) => {
                currentPanel?.webview.postMessage({
                    command: "streamUpdate",
                    content: renderMarkdown(content),
                });
            },
        );

        // Save to history
        const newItem: HistoryItem = {
            id: historyId,
            code: selectedText,
            language: languageId,
            explanation: fullExplanation,
            timestamp: new Date(),
        };

        history.add(newItem);

        currentPanel.webview.postMessage({
            command: "streamComplete",
            historyItem: {
                id: historyId,
                code: selectedText,
                language: languageId,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error: any) {
        const errorMessage = handleApiError(error, config.provider);
        vscode.window.showErrorMessage(
            `Ustaad ko problem aa gayi: ${errorMessage}`,
        );
        currentPanel.webview.postMessage({
            command: "streamError",
            error: errorMessage,
        });
    }
}

function handleApiError(error: any, provider: string): string {
    const statusCode =
        error?.status || error?.response?.status || error?.statusCode;
    const errorMessage = error?.message || "Unknown error";
    const lowerMessage = errorMessage.toLowerCase();

    // Check for API key / authentication errors first
    if (
        statusCode === 401 ||
        statusCode === 403 ||
        lowerMessage.includes("invalid api key") ||
        lowerMessage.includes("api key not valid") ||
        lowerMessage.includes("api_key_invalid") ||
        lowerMessage.includes("unauthorized") ||
        lowerMessage.includes("authentication") ||
        lowerMessage.includes("permission denied") ||
        lowerMessage.includes("incorrect api key")
    ) {
        return "API key galat hai! 'Code Ustaad: Set API Key' command chalaao.";
    }

    // Rate limit / quota errors
    if (
        statusCode === 429 ||
        errorMessage.includes("429") ||
        lowerMessage.includes("rate limit") ||
        lowerMessage.includes("quota") ||
        lowerMessage.includes("too many requests")
    ) {
        return provider === "gemini"
            ? "Gemini ka quota khatam ho gaya! Thoda wait karo."
            : "OpenAI ka rate limit hit ho gaya! Thoda wait karo.";
    }

    // Model not found errors
    if (
        statusCode === 404 ||
        lowerMessage.includes("model not found") ||
        lowerMessage.includes("does not exist")
    ) {
        return "Model nahi mila! Settings mein sahi model select karo.";
    }

    // Network errors - be more specific to avoid false positives
    if (
        lowerMessage.includes("network error") ||
        lowerMessage.includes("failed to fetch") ||
        lowerMessage.includes("enotfound") ||
        lowerMessage.includes("econnrefused") ||
        lowerMessage.includes("etimedout") ||
        lowerMessage.includes("econnreset") ||
        lowerMessage.includes("socket hang up") ||
        lowerMessage.includes("getaddrinfo") ||
        lowerMessage.includes("dns") ||
        error?.code === "ENOTFOUND" ||
        error?.code === "ECONNREFUSED" ||
        error?.code === "ETIMEDOUT" ||
        error?.code === "ECONNRESET"
    ) {
        return "Internet nahi chal raha bhai! Connection check karo.";
    }

    if (lowerMessage.includes("timeout")) {
        return "Request timeout ho gaya! Server slow hai ya internet weak hai.";
    }

    return errorMessage;
}
