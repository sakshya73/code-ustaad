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

const FORMAT_INSTRUCTION = `

RESPONSE FORMAT:
1. Start with "## 🧐 Ek Line Mein" followed by a 1-sentence simple summary of what this code does.
2. Then "## 📖 Detail Mein" for the detailed line-by-line explanation.
3. **Bold** all key technical terms (function names, variable names, concepts like "state", "props", "callback", "async", etc.) for easy scanning.
4. ONLY if there are actual bugs, errors, missing cleanup, security issues, or major optimizations needed, include "## ✅ Ustaad ka Fix" with the corrected code in a markdown code block. If the code is correct and has no issues, DO NOT include this section at all - just end after the explanation.`;

const PERSONA_PROMPTS = {
    strict: `You are "Code Ustaad" - a strict but fair Senior Tech Lead. You speak in Hinglish.

Your style:
- Address the user as "Bhai" or "Boss" but be firm about mistakes.
- Point out potential bugs, security issues, and bad practices immediately.
- Use phrases like "Yeh approach galat hai bhai", "Production mein fat jayega", "Standard practice yeh hai".
- Don't sugarcoat it. If the code is bad, say it's risky.
- End with a clear action item: "Chup chaap yeh fix kar lo."${FORMAT_INSTRUCTION}`,

    balanced: `You are "Code Ustaad" - a helpful and experienced Senior Developer (Bhai) who guides juniors. You speak in Hinglish (Hindi + English).

Your personality:
- Address the user as "Bhai", "Dost", or "Guru".
- Use phrases like "Dekho bhai", "Concept samjho", "Sahi hai", "Load mat lo".
- Explain using daily life analogies (traffic, food, cricket).
- Be encouraging but technical.
- Use words like "Scene kya hai", "Basically", "Jugad", "Optimize".
- If code is complex, say: "Thoda tricky hai, par samajh lenge."${FORMAT_INSTRUCTION}`,

    funny: `You are "Code Ustaad" - a hilarious Tech Lead who keeps the mood light. You speak in Hinglish with Mumbai/Bangalore tech slang.

Your style:
- Address user as "Bhai", "Biddu", "Mere Cheetey", or "Ustaad".
- Use slang: "Bhasad mach gayi", "Code phat gaya", "Chamka kya?", "Scene set hai".
- Make funny analogies: "Yeh code toh Jalebi ki tarah uljha hua hai", "Yeh loop kabhi khatam nahi hoga, Suryavansham ki tarah".
- Roast the code gently if it's bad.
- End with a filmy dialogue or high energy encouragement ("Chha gaye guru!").${FORMAT_INSTRUCTION}`,
};

const SECRET_KEYS = {
    openai: "codeUstaad.openaiApiKey",
    gemini: "codeUstaad.geminiApiKey",
};

const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
    typescriptreact: "TypeScript React",
    javascriptreact: "JavaScript React",
    typescript: "TypeScript",
    javascript: "JavaScript",
    python: "Python",
    java: "Java",
    csharp: "C#",
    cpp: "C++",
    c: "C",
    go: "Go",
    rust: "Rust",
    ruby: "Ruby",
    php: "PHP",
    swift: "Swift",
    kotlin: "Kotlin",
    html: "HTML",
    css: "CSS",
    scss: "SCSS",
    json: "JSON",
    yaml: "YAML",
    markdown: "Markdown",
    sql: "SQL",
    shellscript: "Shell",
    bash: "Bash",
    powershell: "PowerShell",
};

function getDisplayLanguage(languageId: string): string {
    return LANGUAGE_DISPLAY_NAMES[languageId] || languageId.charAt(0).toUpperCase() + languageId.slice(1);
}

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

async function setApiKey(context: vscode.ExtensionContext): Promise<boolean> {
    // Let user choose which provider's key to set
    const providerChoice = await vscode.window.showQuickPick(
        [
            {
                label: "Gemini",
                description: "Google Gemini API",
                value: "gemini",
            },
            { label: "OpenAI", description: "OpenAI GPT API", value: "openai" },
        ],
        { placeHolder: "Kaunsa API key set karna hai?" },
    );

    if (!providerChoice) return false;

    const provider = providerChoice.value;

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

        // Also update the provider setting to match
        const config = vscode.workspace.getConfiguration("codeUstaad");
        await config.update(
            "provider",
            provider,
            vscode.ConfigurationTarget.Global,
        );

        vscode.window.showInformationMessage(
            `${provider === "openai" ? "OpenAI" : "Gemini"} API key saved! Provider set to ${provider}.`,
        );
        return true;
    }
    return false;
}

async function clearApiKey(context: vscode.ExtensionContext): Promise<void> {
    const providerChoice = await vscode.window.showQuickPick(
        [
            {
                label: "Gemini",
                description: "Clear Gemini API key",
                value: "gemini",
            },
            {
                label: "OpenAI",
                description: "Clear OpenAI API key",
                value: "openai",
            },
            {
                label: "Both",
                description: "Clear both API keys",
                value: "both",
            },
        ],
        { placeHolder: "Kaunsa API key clear karna hai?" },
    );

    if (!providerChoice) return;

    if (providerChoice.value === "both") {
        await context.secrets.delete(SECRET_KEYS.gemini);
        await context.secrets.delete(SECRET_KEYS.openai);
        vscode.window.showInformationMessage("Dono API keys clear ho gaye!");
    } else {
        await context.secrets.delete(
            SECRET_KEYS[providerChoice.value as keyof typeof SECRET_KEYS],
        );
        vscode.window.showInformationMessage(
            `${providerChoice.label} API key clear ho gaya!`,
        );
    }
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
                    case "setupApiKey": {
                        const keySet = await setApiKey(context);
                        if (keySet) {
                            // Refresh the panel by re-triggering askUstaad
                            vscode.commands.executeCommand(
                                "code-ustaad.askUstaad",
                            );
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
        displayLanguage: getDisplayLanguage(languageId),
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

function extractCodeTitle(code: string): string {
    const trimmed = code.trim();

    // Try to extract meaningful names using regex patterns
    const patterns = [
        // React component: function ComponentName( or const ComponentName =
        /(?:function|const|let|var)\s+([A-Z][a-zA-Z0-9]*)\s*[=(]/,
        // Regular function: function name(
        /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/,
        // Arrow function: const name = ( or const name = async (
        /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\(/,
        // Class declaration: class ClassName
        /class\s+([A-Z][a-zA-Z0-9]*)/,
        // Method: methodName( or async methodName(
        /(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*{/,
        // Hook usage: useEffect, useState, etc.
        /(use[A-Z][a-zA-Z]*)\s*\(/,
        // Export default function/class
        /export\s+default\s+(?:function|class)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
    ];

    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match?.[1]) {
            return match[1];
        }
    }

    // Fallback: first meaningful line (skip comments, whitespace)
    const lines = trimmed.split("\n");
    for (const line of lines) {
        const cleaned = line.trim();
        if (cleaned && !cleaned.startsWith("//") && !cleaned.startsWith("/*")) {
            // Return first 25 chars of first meaningful line
            return cleaned.slice(0, 25) + (cleaned.length > 25 ? "..." : "");
        }
    }

    return "Code snippet";
}

function getHistoryHtml(items: HistoryItem[]): string {
    if (items.length === 0) return "";

    return items
        .slice(0, 10)
        .map((item) => {
            const title = extractCodeTitle(item.code);
            const preview = item.code.trim().split("\n")[0].slice(0, 30);
            return `
        <div class="history-item" data-id="${item.id}">
            <span class="history-lang">${escapeHtml(title)}</span>
            <span class="history-code">${escapeHtml(preview)}${preview.length >= 30 ? "..." : ""}</span>
        </div>`;
        })
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
