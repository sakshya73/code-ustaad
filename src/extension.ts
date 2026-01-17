import { GoogleGenerativeAI } from "@google/generative-ai";
import MarkdownIt from "markdown-it";
import OpenAI from "openai";
import * as vscode from "vscode";

const md = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: true,
});

interface HistoryItem {
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

const MIN_SELECTION_LENGTH = 20;
const CONTEXT_LINES = 10;

let currentPanel: vscode.WebviewPanel | undefined;
let history: HistoryItem[] = [];
let configChangeListener: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log("Code Ustaad is now active! Ustaad aapki seva mein hazir hai!");

    // Load history from global state
    history = context.globalState.get<HistoryItem[]>("codeUstaad.history", []);

    // Listen for configuration changes
    configChangeListener = vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("codeUstaad")) {
            if (currentPanel) {
                vscode.window.showInformationMessage(
                    "Code Ustaad: Settings updated! Naya sawaal pucho, naye settings ke saath jawab milega.",
                );
            }
        }
    });
    context.subscriptions.push(configChangeListener);

    const disposable = vscode.commands.registerCommand(
        "code-ustaad.askUstaad",
        async () => {
            const editor = vscode.window.activeTextEditor;

            if (!editor) {
                vscode.window.showErrorMessage(
                    "Arey beta, pehle koi file toh kholo!",
                );
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
                const startLine = Math.max(
                    0,
                    selection.start.line - CONTEXT_LINES,
                );
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
                const surroundingCode = editor.document.getText(contextRange);
                codeToExplain = surroundingCode;
                contextInfo = `\n\nNote: The user selected "${selectedText}". Focus on explaining this specific part using the surrounding context.\n\nSelected: "${selectedText}"`;
            }

            const config = vscode.workspace.getConfiguration("codeUstaad");
            const provider = config.get<string>("provider") || "gemini";
            const openaiApiKey = config.get<string>("openaiApiKey");
            const geminiApiKey = config.get<string>("geminiApiKey");
            const openaiModel =
                config.get<string>("openaiModel") || "gpt-4o-mini";
            const geminiModel =
                config.get<string>("geminiModel") || "gemini-2.0-flash";
            const personaIntensity =
                config.get<string>("personaIntensity") || "balanced";
            const maxHistoryItems = config.get<number>("maxHistoryItems") || 10;

            const apiKey = provider === "openai" ? openaiApiKey : geminiApiKey;
            const settingKey =
                provider === "openai"
                    ? "codeUstaad.openaiApiKey"
                    : "codeUstaad.geminiApiKey";

            if (!apiKey) {
                const action = await vscode.window.showErrorMessage(
                    `Beta, ${provider === "openai" ? "OpenAI" : "Gemini"} API key toh daalo settings mein!`,
                    "Open Settings",
                );
                if (action === "Open Settings") {
                    vscode.commands.executeCommand(
                        "workbench.action.openSettings",
                        settingKey,
                    );
                }
                return;
            }

            const languageId = editor.document.languageId;
            const systemPrompt =
                PERSONA_PROMPTS[
                    personaIntensity as keyof typeof PERSONA_PROMPTS
                ] || PERSONA_PROMPTS.balanced;

            // Create or reveal the webview panel
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
                    },
                );

                currentPanel.onDidDispose(
                    () => {
                        currentPanel = undefined;
                    },
                    null,
                    context.subscriptions,
                );

                // Handle messages from webview
                currentPanel.webview.onDidReceiveMessage(
                    (message) => {
                        if (message.command === "loadHistory") {
                            const item = history.find(
                                (h) => h.id === message.id,
                            );
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
                        } else if (message.command === "clearHistory") {
                            history = [];
                            context.globalState.update(
                                "codeUstaad.history",
                                history,
                            );
                            if (currentPanel) {
                                currentPanel.webview.postMessage({
                                    command: "historyCleared",
                                });
                            }
                        }
                    },
                    null,
                    context.subscriptions,
                );
            }

            // Create new history item
            const historyId = Date.now().toString();

            // Show loading state with history
            currentPanel.webview.html = getWebviewContent(
                history,
                selectedText,
                languageId,
                true,
            );

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

                    const result =
                        await model.generateContentStream(userPrompt);

                    for await (const chunk of result.stream) {
                        const content = chunk.text();
                        fullExplanation += content;
                        currentPanel.webview.postMessage({
                            command: "streamUpdate",
                            content: md.render(fullExplanation),
                        });
                    }
                }

                // Add to history
                const newHistoryItem: HistoryItem = {
                    id: historyId,
                    code: selectedText,
                    language: languageId,
                    explanation: fullExplanation,
                    timestamp: new Date(),
                };

                history.unshift(newHistoryItem);
                if (history.length > maxHistoryItems) {
                    history = history.slice(0, maxHistoryItems);
                }

                // Save history
                context.globalState.update("codeUstaad.history", history);

                // Send completion message
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
        },
    );

    context.subscriptions.push(disposable);
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
        if (provider === "gemini") {
            return "Gemini ka quota khatam ho gaya hai, beta! Thoda wait karo (1-2 minute) ya phir apna API plan check karo: https://aistudio.google.com/apikey";
        }
        return "OpenAI ka rate limit hit ho gaya hai, beta! Thoda wait karo (1 minute) aur phir try karo.";
    }

    if (
        statusCode === 401 ||
        errorMessage.includes("401") ||
        errorMessage.toLowerCase().includes("invalid api key")
    ) {
        return "API key galat lag rahi hai, beta! Settings mein jaake sahi key daalo.";
    }

    if (
        statusCode === 404 ||
        errorMessage.includes("404") ||
        errorMessage.toLowerCase().includes("not found")
    ) {
        return `Model nahi mila, beta! Settings mein jaake sahi model select karo.`;
    }

    if (
        errorMessage.toLowerCase().includes("network") ||
        errorMessage.toLowerCase().includes("fetch")
    ) {
        return "Internet connection mein problem hai, beta!";
    }

    return errorMessage;
}

function getWebviewContent(
    historyItems: HistoryItem[],
    currentCode: string,
    language: string,
    isLoading: boolean,
): string {
    const escapedCode = escapeHtml(currentCode);
    const historyHtml = historyItems
        .slice(0, 10)
        .map(
            (item) => `
        <div class="history-item" data-id="${item.id}">
            <span class="history-lang">${item.language}</span>
            <span class="history-code">${escapeHtml(item.code.slice(0, 30))}${item.code.length > 30 ? "..." : ""}</span>
        </div>
    `,
        )
        .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>Code Ustaad</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: var(--vscode-font-family, system-ui);
            background: var(--vscode-editor-background, #1e1e1e);
            color: var(--vscode-editor-foreground, #d4d4d4);
            line-height: 1.6;
            display: flex;
            height: 100vh;
        }

        .sidebar {
            width: 200px;
            background: var(--vscode-sideBar-background, #252526);
            border-right: 1px solid var(--vscode-panel-border, #454545);
            display: flex;
            flex-direction: column;
            flex-shrink: 0;
        }

        .sidebar-header {
            padding: 12px;
            border-bottom: 1px solid var(--vscode-panel-border, #454545);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .sidebar-header h3 {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            opacity: 0.8;
        }

        .clear-btn {
            background: none;
            border: none;
            color: var(--vscode-textLink-foreground, #3794ff);
            cursor: pointer;
            font-size: 11px;
        }

        .history-list {
            flex: 1;
            overflow-y: auto;
            padding: 8px;
        }

        .history-item {
            padding: 8px;
            margin-bottom: 4px;
            border-radius: 4px;
            cursor: pointer;
            background: var(--vscode-list-hoverBackground, #2a2d2e);
        }

        .history-item:hover {
            background: var(--vscode-list-activeSelectionBackground, #094771);
        }

        .history-lang {
            display: block;
            font-size: 10px;
            color: var(--vscode-textPreformat-foreground, #ce9178);
            margin-bottom: 2px;
        }

        .history-code {
            font-size: 11px;
            font-family: monospace;
            opacity: 0.8;
        }

        .main-content {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
        }

        .header {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 2px solid var(--vscode-panel-border, #454545);
        }

        .ustaad-icon { font-size: 40px; }

        .header-text h1 {
            font-size: 20px;
            color: var(--vscode-textLink-foreground, #3794ff);
        }

        .header-text p {
            font-size: 12px;
            opacity: 0.7;
            font-style: italic;
        }

        .section { margin-bottom: 20px; }

        .section-title {
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--vscode-textPreformat-foreground, #ce9178);
            margin-bottom: 8px;
        }

        .code-block {
            background: var(--vscode-textCodeBlock-background, #2d2d2d);
            border: 1px solid var(--vscode-panel-border, #454545);
            border-radius: 6px;
            padding: 12px;
            font-family: monospace;
            font-size: 12px;
            white-space: pre-wrap;
            overflow-x: auto;
        }

        .explanation {
            background: var(--vscode-textBlockQuote-background, #2a2a2a);
            border-left: 4px solid var(--vscode-textLink-foreground, #3794ff);
            border-radius: 0 6px 6px 0;
            padding: 16px;
            min-height: 100px;
        }

        .explanation h1, .explanation h2, .explanation h3 {
            color: var(--vscode-textLink-foreground, #3794ff);
            margin: 12px 0 8px 0;
        }
        .explanation h1 { font-size: 1.4em; }
        .explanation h2 { font-size: 1.2em; }
        .explanation h3 { font-size: 1.1em; }
        .explanation p { margin-bottom: 10px; }
        .explanation code {
            background: var(--vscode-textCodeBlock-background, #2d2d2d);
            padding: 2px 5px;
            border-radius: 3px;
            font-family: monospace;
        }
        .explanation pre {
            background: var(--vscode-textCodeBlock-background, #2d2d2d);
            border: 1px solid var(--vscode-panel-border, #454545);
            border-radius: 6px;
            padding: 10px;
            margin: 10px 0;
            overflow-x: auto;
        }
        .explanation pre code { background: none; padding: 0; }
        .explanation ul, .explanation ol { margin: 10px 0; padding-left: 20px; }
        .explanation li { margin-bottom: 5px; }
        .explanation strong { color: var(--vscode-textPreformat-foreground, #ce9178); }
        .explanation blockquote {
            border-left: 3px solid var(--vscode-textLink-foreground, #3794ff);
            padding-left: 10px;
            margin: 10px 0;
            opacity: 0.9;
        }

        .loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: 30px;
        }

        .loading-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid var(--vscode-panel-border, #454545);
            border-top-color: var(--vscode-textLink-foreground, #3794ff);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 15px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .loading-text {
            color: var(--vscode-textLink-foreground, #3794ff);
        }

        .streaming-cursor::after {
            content: "▋";
            animation: blink 1s infinite;
            color: var(--vscode-textLink-foreground, #3794ff);
        }

        @keyframes blink {
            50% { opacity: 0; }
        }

        .error {
            background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
            border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
            border-radius: 6px;
            padding: 12px;
            color: var(--vscode-errorForeground, #f48771);
        }

        .no-history {
            text-align: center;
            padding: 20px;
            opacity: 0.6;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="sidebar">
        <div class="sidebar-header">
            <h3>History</h3>
            <button class="clear-btn" onclick="clearHistory()">Clear</button>
        </div>
        <div class="history-list" id="historyList">
            ${historyHtml || '<div class="no-history">No history yet</div>'}
        </div>
    </div>

    <div class="main-content">
        <div class="header">
            <div class="ustaad-icon">🧑‍🏫</div>
            <div class="header-text">
                <h1>Code Ustaad</h1>
                <p>Seekho aur samjho!</p>
            </div>
        </div>

        <div class="section">
            <div class="section-title">Selected Code (${language})</div>
            <pre class="code-block" id="codeBlock">${escapedCode}</pre>
        </div>

        <div class="section">
            <div class="section-title">Ustaad's Explanation</div>
            <div class="explanation" id="explanation">
                ${
                    isLoading
                        ? `<div class="loading">
                        <div class="loading-spinner"></div>
                        <div class="loading-text">Ustaad soch rahe hain...</div>
                    </div>`
                        : ""
                }
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let isStreaming = false;

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            const explanation = document.getElementById('explanation');

            if (message.command === 'streamUpdate') {
                isStreaming = true;
                explanation.innerHTML = '<div class="streaming-cursor">' + message.content + '</div>';
                explanation.scrollTop = explanation.scrollHeight;
            } else if (message.command === 'streamComplete') {
                isStreaming = false;
                // Remove cursor class
                const content = explanation.querySelector('.streaming-cursor');
                if (content) {
                    content.classList.remove('streaming-cursor');
                }
                // Add to history sidebar
                addToHistorySidebar(message.historyItem);
            } else if (message.command === 'streamError') {
                isStreaming = false;
                explanation.innerHTML = '<div class="error">' + message.error + '</div>';
            } else if (message.command === 'showHistoryItem') {
                document.getElementById('codeBlock').textContent = message.item.code;
                explanation.innerHTML = message.item.explanationHtml;
            } else if (message.command === 'historyCleared') {
                document.getElementById('historyList').innerHTML = '<div class="no-history">No history yet</div>';
            }
        });

        function addToHistorySidebar(item) {
            const historyList = document.getElementById('historyList');
            const noHistory = historyList.querySelector('.no-history');
            if (noHistory) noHistory.remove();

            const code = item.code.length > 30 ? item.code.slice(0, 30) + '...' : item.code;
            const html = '<div class="history-item" data-id="' + item.id + '">' +
                '<span class="history-lang">' + item.language + '</span>' +
                '<span class="history-code">' + escapeHtml(code) + '</span>' +
            '</div>';
            historyList.insertAdjacentHTML('afterbegin', html);
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Click handler for history items
        document.getElementById('historyList').addEventListener('click', (e) => {
            const item = e.target.closest('.history-item');
            if (item) {
                vscode.postMessage({ command: 'loadHistory', id: item.dataset.id });
            }
        });

        function clearHistory() {
            vscode.postMessage({ command: 'clearHistory' });
        }
    </script>
</body>
</html>`;
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
    if (currentPanel) {
        currentPanel.dispose();
    }
    if (configChangeListener) {
        configChangeListener.dispose();
    }
}
