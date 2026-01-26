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
const MAX_FOLLOWUPS_IN_CONTEXT = 5; // Sliding window for follow-up context

let currentPanel: vscode.WebviewPanel | undefined;
let styles: string = "";

// Conversation context for follow-up questions
interface ConversationContext {
    code: string;
    language: string;
    explanation: string;
    followups: Array<{ question: string; answer: string }>;
}
let conversationContext: ConversationContext | null = null;

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
        vscode.window.showErrorMessage("Arey bhai, pehle koi file toh kholo!");
        return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);

    if (!selectedText) {
        vscode.window.showErrorMessage(
            "Bhai, pehle code select karo jo samajhna hai!",
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
                    case "openExternalUrl": {
                        const url = message.url;
                        if (url) {
                            vscode.env.openExternal(vscode.Uri.parse(url));
                        }
                        break;
                    }
                    case "saveApiKey": {
                        const { provider: newProvider, apiKey: newApiKey } =
                            message;
                        if (newProvider && newApiKey) {
                            try {
                                const secretsService = new SecretsService(
                                    context,
                                );
                                await secretsService.setApiKey(
                                    newProvider,
                                    newApiKey.trim(),
                                );
                                await ConfigService.setProvider(newProvider);

                                // Send success message
                                currentPanel?.webview.postMessage({
                                    command: "apiKeySaved",
                                });

                                vscode.window.showInformationMessage(
                                    "API key saved! Ab code select karo aur Ustaad se seekho!",
                                );

                                // Dispose and re-run command to show main interface
                                if (currentPanel) {
                                    currentPanel.dispose();
                                    currentPanel = undefined;
                                    setTimeout(() => {
                                        vscode.commands.executeCommand(
                                            "code-ustaad.askUstaad",
                                        );
                                    }, 100);
                                }
                            } catch (err: any) {
                                currentPanel?.webview.postMessage({
                                    command: "apiKeyError",
                                    error:
                                        err?.message ||
                                        "Failed to save API key",
                                });
                            }
                        }
                        break;
                    }
                    case "askFollowup": {
                        const question = message.question;
                        if (!question || !conversationContext) {
                            currentPanel?.webview.postMessage({
                                command: "followupError",
                                error: "No context available for follow-up.",
                            });
                            break;
                        }

                        const cfg = ConfigService.get();
                        const secretsSvc = new SecretsService(context);
                        const key = await secretsSvc.getApiKey(cfg.provider);

                        if (!key) {
                            currentPanel?.webview.postMessage({
                                command: "followupError",
                                error: "API key not found.",
                            });
                            break;
                        }

                        try {
                            const followupProvider = createProvider(
                                cfg.provider,
                                key,
                                ConfigService.getModel(cfg.provider),
                            );

                            const systemPrompt =
                                PERSONA_PROMPTS[cfg.personaIntensity] ||
                                PERSONA_PROMPTS.balanced;

                            // Build context-aware prompt
                            let contextPrompt = `You previously explained this ${conversationContext.language} code:\n\n\`\`\`${conversationContext.language}\n${conversationContext.code}\n\`\`\`\n\nYour explanation was:\n${conversationContext.explanation}\n\n`;

                            // Add recent follow-ups for context (sliding window)
                            if (conversationContext.followups.length > 0) {
                                const recentFollowups =
                                    conversationContext.followups.slice(
                                        -MAX_FOLLOWUPS_IN_CONTEXT,
                                    );
                                contextPrompt += "Recent follow-up Q&A:\n";
                                for (const fu of recentFollowups) {
                                    contextPrompt += `Q: ${fu.question}\nA: ${fu.answer}\n\n`;
                                }
                            }

                            contextPrompt += `Now the user asks: "${question}"\n\nPlease answer this follow-up question about the code. Be concise but helpful.`;

                            const followupAnswer =
                                await followupProvider.streamExplanation(
                                    systemPrompt,
                                    contextPrompt,
                                    (content) => {
                                        currentPanel?.webview.postMessage({
                                            command: "followupStreamUpdate",
                                            content: renderMarkdown(content),
                                        });
                                    },
                                );

                            // Store in conversation context
                            conversationContext.followups.push({
                                question,
                                answer: followupAnswer,
                            });

                            currentPanel?.webview.postMessage({
                                command: "followupStreamComplete",
                            });
                        } catch (err: any) {
                            const errMsg = handleApiError(err, cfg.provider);
                            currentPanel?.webview.postMessage({
                                command: "followupError",
                                error: errMsg,
                            });
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
        currentPanel.webview.html = getSetupHtml(styles, iconUri);
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

        // Store conversation context for follow-up questions
        conversationContext = {
            code: codeToExplain,
            language: languageId,
            explanation: fullExplanation,
            followups: [],
        };

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
