import * as vscode from "vscode";
import {
    LARGE_CODE_INSTRUCTION,
    PERSONA_PROMPTS,
    getDisplayLanguage,
} from "../prompts";
import { createProvider } from "../providers";
import { ConfigService, HistoryService, SecretsService } from "../services";
import type { HistoryItem } from "../types";
import { countLines, escapeHtml, generateId, renderMarkdown } from "../utils/helpers";
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
            { enableScripts: true, retainContextWhenHidden: true },
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
                                    explanationHtml: renderMarkdown(item.explanation),
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
                        const keySet = await setApiKey(context);
                        if (keySet) {
                            vscode.commands.executeCommand("code-ustaad.askUstaad");
                        }
                        break;
                    }
                }
            },
            null,
            context.subscriptions,
        );
    }

    // If no API key, show setup screen
    if (!apiKey) {
        currentPanel.webview.html = getSetupHtml(styles, config.provider);
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
    });

    const systemPrompt =
        PERSONA_PROMPTS[config.personaIntensity] || PERSONA_PROMPTS.balanced;

    try {
        const largeCodeInstruction = isLargeSelection ? LARGE_CODE_INSTRUCTION : "";
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
    const statusCode = error?.status || error?.response?.status;
    const errorMessage = error?.message || "Unknown error";

    if (
        statusCode === 429 ||
        errorMessage.includes("429") ||
        errorMessage.toLowerCase().includes("rate limit") ||
        errorMessage.toLowerCase().includes("quota")
    ) {
        return provider === "gemini"
            ? "Gemini ka quota khatam ho gaya! Thoda wait karo."
            : "OpenAI ka rate limit hit ho gaya! Thoda wait karo.";
    }

    if (
        statusCode === 401 ||
        errorMessage.toLowerCase().includes("invalid api key")
    ) {
        return "API key galat hai! 'Code Ustaad: Set API Key' command chalaao.";
    }

    if (
        statusCode === 404 ||
        errorMessage.toLowerCase().includes("not found")
    ) {
        return "Model nahi mila! Settings mein sahi model select karo.";
    }

    if (
        errorMessage.toLowerCase().includes("network") ||
        errorMessage.toLowerCase().includes("fetch")
    ) {
        return "Internet connection mein problem hai!";
    }

    return errorMessage;
}
