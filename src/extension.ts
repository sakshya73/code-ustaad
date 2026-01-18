import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";
import MarkdownIt from "markdown-it";
import OpenAI from "openai";
import * as path from "path";
import * as vscode from "vscode";
import { getSetupHtml, getWebviewHtml } from "./webview/template";

const md = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: true,
});

export interface HistoryItem {
    id: string;
    code: string;
    language: string;
    explanation: string;
    timestamp: Date;
}

const PERSONA_PROMPTS = {
    strict: `You are "Code Ustaad" - a strict but fair Indian mentor who focuses on best practices and proper coding standards. You speak in Hinglish.

Your style:
- Address students as "beta" but be firm about mistakes
- Point out potential bugs, security issues, and bad practices immediately
- Use phrases like "Yeh galat hai", "Isko theek karo", "Best practice yeh hai"
- Give warnings about common pitfalls
- Less jokes, more focus on correctness
- End with a clear action item or improvement suggestion`,

    balanced: `You are "Code Ustaad" - a wise, experienced Indian mentor who teaches programming with warmth and wisdom. You speak in Hinglish (Hindi + English).

Your personality:
- Address students as "beta" or "shishya" affectionately
- Use phrases like "Dekho beta", "Samjho", "Bilkul sahi", "Arey wah!"
- Explain using Indian daily life analogies (chai, cricket, family gatherings)
- Be patient and encouraging
- Use words like "accha", "theek hai", "bahut badiya"

When explaining:
1. Give a brief overview first
2. Break down code line by line if needed
3. Use relatable analogies
4. Highlight important concepts and pitfalls
5. End with encouragement and a tip`,

    funny: `You are "Code Ustaad" - a hilarious Indian mentor who makes learning fun with jokes and Bollywood references. You speak in Hinglish with extra masala!

Your style:
- Address students as "beta", "mere yaar", "bhai sahab"
- Use Bollywood dialogues: "Mogambo khush hua" (when code works), "Kitne aadmi the?" (counting loops)
- Make funny analogies: "Yeh loop Salman Khan ki gaadi jaisa hai - kabhi rukta nahi!"
- Add dramatic reactions: "Arey baap re!", "Kya scene hai!", "Ekdum jhakaas!"
- Use cricket commentary style for explaining logic
- Include at least one joke or meme reference per explanation
- Still teach correctly, but make it entertaining
- End with a filmy dialogue or funny encouragement`,
};

const SECRET_KEYS = {
    openai: "codeUstaad.openaiApiKey",
    gemini: "codeUstaad.geminiApiKey",
};

const MIN_SELECTION_LENGTH = 20;
const CONTEXT_LINES = 10;

let currentPanel: vscode.WebviewPanel | undefined;
let history: HistoryItem[] = [];
let styles: string = "";

export function activate(context: vscode.ExtensionContext) {
    console.log("Code Ustaad is now active!");

    // Load CSS
    const stylesPath = path.join(
        context.extensionPath,
        "src",
        "webview",
        "styles.css",
    );
    try {
        styles = fs.readFileSync(stylesPath, "utf8");
    } catch {
        styles = ""; // Fallback to inline styles if file not found
    }

    // Load history
    history = context.globalState.get<HistoryItem[]>("codeUstaad.history", []);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand("code-ustaad.askUstaad", () =>
            askUstaad(context),
        ),
        vscode.commands.registerCommand("code-ustaad.setApiKey", () =>
            setApiKey(context),
        ),
        vscode.commands.registerCommand("code-ustaad.clearApiKey", () =>
            clearApiKey(context),
        ),
    );

    // Listen for config changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration("codeUstaad") && currentPanel) {
                vscode.window.showInformationMessage(
                    "Code Ustaad: Settings updated!",
                );
            }
        }),
    );
}

async function setApiKey(context: vscode.ExtensionContext): Promise<void> {
    const config = vscode.workspace.getConfiguration("codeUstaad");
    const provider = config.get<string>("provider") || "gemini";

    const apiKey = await vscode.window.showInputBox({
        prompt: `Enter your ${provider === "openai" ? "OpenAI" : "Gemini"} API Key`,
        password: true,
        placeHolder: provider === "openai" ? "sk-..." : "AI...",
        ignoreFocusOut: true,
    });

    if (apiKey) {
        await context.secrets.store(
            SECRET_KEYS[provider as keyof typeof SECRET_KEYS],
            apiKey,
        );
        vscode.window.showInformationMessage(
            `${provider === "openai" ? "OpenAI" : "Gemini"} API key saved securely!`,
        );
    }
}

async function clearApiKey(context: vscode.ExtensionContext): Promise<void> {
    const config = vscode.workspace.getConfiguration("codeUstaad");
    const provider = config.get<string>("provider") || "gemini";

    await context.secrets.delete(
        SECRET_KEYS[provider as keyof typeof SECRET_KEYS],
    );
    vscode.window.showInformationMessage(
        `${provider === "openai" ? "OpenAI" : "Gemini"} API key cleared!`,
    );
}

async function askUstaad(context: vscode.ExtensionContext): Promise<void> {
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

    const config = vscode.workspace.getConfiguration("codeUstaad");
    const provider = config.get<string>("provider") || "gemini";
    const openaiModel = config.get<string>("openaiModel") || "gpt-4o-mini";
    const geminiModel = config.get<string>("geminiModel") || "gemini-2.0-flash";
    const personaIntensity =
        config.get<string>("personaIntensity") || "balanced";
    const maxHistoryItems = config.get<number>("maxHistoryItems") || 10;

    // Get API key from SecretStorage
    const apiKey = await context.secrets.get(
        SECRET_KEYS[provider as keyof typeof SECRET_KEYS],
    );

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
                        const item = history.find((h) => h.id === message.id);
                        if (item && currentPanel) {
                            currentPanel.webview.postMessage({
                                command: "showHistoryItem",
                                item: {
                                    ...item,
                                    explanationHtml: md.render(
                                        item.explanation,
                                    ),
                                },
                            });
                        }
                        break;
                    }
                    case "clearHistory":
                        history = [];
                        context.globalState.update(
                            "codeUstaad.history",
                            history,
                        );
                        currentPanel?.webview.postMessage({
                            command: "historyCleared",
                        });
                        break;
                    case "setupApiKey":
                        await setApiKey(context);
                        break;
                }
            },
            null,
            context.subscriptions,
        );
    }

    // If no API key, show setup screen
    if (!apiKey) {
        currentPanel.webview.html = getSetupHtml(styles, provider);
        return;
    }

    const historyId = Date.now().toString();
    const historyHtml = getHistoryHtml(history);

    // Show loading state
    currentPanel.webview.html = getWebviewHtml({
        styles,
        historyHtml,
        language: languageId,
        escapedCode: escapeHtml(selectedText),
        isLoading: true,
    });

    const systemPrompt =
        PERSONA_PROMPTS[personaIntensity as keyof typeof PERSONA_PROMPTS] ||
        PERSONA_PROMPTS.balanced;

    try {
        const userPrompt = `Please explain this ${languageId} code:\n\n\`\`\`${languageId}\n${codeToExplain}\n\`\`\`${contextInfo}`;
        let fullExplanation = "";

        if (provider === "openai") {
            const openai = new OpenAI({ apiKey });
            const stream = await openai.chat.completions.create({
                model: openaiModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                temperature: 0.7,
                max_tokens: 2000,
                stream: true,
            });

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || "";
                fullExplanation += content;
                currentPanel.webview.postMessage({
                    command: "streamUpdate",
                    content: md.render(fullExplanation),
                });
            }
        } else {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: geminiModel,
                systemInstruction: systemPrompt,
            });

            const result = await model.generateContentStream(userPrompt);

            for await (const chunk of result.stream) {
                fullExplanation += chunk.text();
                currentPanel.webview.postMessage({
                    command: "streamUpdate",
                    content: md.render(fullExplanation),
                });
            }
        }

        // Save to history
        const newItem: HistoryItem = {
            id: historyId,
            code: selectedText,
            language: languageId,
            explanation: fullExplanation,
            timestamp: new Date(),
        };

        history.unshift(newItem);
        if (history.length > maxHistoryItems) {
            history = history.slice(0, maxHistoryItems);
        }
        context.globalState.update("codeUstaad.history", history);

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
        const errorMessage = handleApiError(error, provider);
        vscode.window.showErrorMessage(
            `Ustaad ko problem aa gayi: ${errorMessage}`,
        );
        currentPanel.webview.postMessage({
            command: "streamError",
            error: errorMessage,
        });
    }
}

function getHistoryHtml(items: HistoryItem[]): string {
    if (items.length === 0) return "";

    return items
        .slice(0, 10)
        .map(
            (item) => `
        <div class="history-item" data-id="${item.id}">
            <span class="history-lang">${item.language}</span>
            <span class="history-code">${escapeHtml(item.code.slice(0, 30))}${item.code.length > 30 ? "..." : ""}</span>
        </div>`,
        )
        .join("");
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

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function deactivate() {
    currentPanel?.dispose();
}
