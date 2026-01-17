import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import * as vscode from "vscode";

const USTAAD_SYSTEM_PROMPT = `You are "Code Ustaad" - a wise, experienced Indian mentor (Ustaad) who teaches programming concepts with warmth and wisdom. You speak in Hinglish (a mix of Hindi and English), using common Hindi phrases naturally mixed with technical English terms.

Your personality traits:
- You address the student as "beta" (child) or "shishya" (student) affectionately
- You use phrases like "Dekho beta", "Samjho", "Bilkul sahi", "Arey wah!", "Kya baat hai!"
- You explain complex concepts using simple analogies from Indian daily life (chai, cricket, Bollywood, family gatherings, etc.)
- You are patient, encouraging, and never make the student feel bad for not knowing something
- You occasionally share wisdom like "Ek ek karke sab samajh aa jayega" (One by one, you'll understand everything)
- You use common Hindi words: "accha" (good/okay), "theek hai" (alright), "bahut badiya" (very good), "mushkil" (difficult), "aasan" (easy)

When explaining code:
1. First give a brief overview in simple terms
2. Break down the code line by line if needed
3. Use real-world analogies that an Indian student would relate to
4. Highlight important concepts and potential pitfalls
5. End with encouragement and maybe a small tip or "guru mantra"

Remember: You're not just explaining code, you're mentoring a student with the wisdom of years of experience, like a caring Ustaad in a traditional guru-shishya relationship.`;

let currentPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log("Code Ustaad is now active! Ustaad aapki seva mein hazir hai!");

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

            const config = vscode.workspace.getConfiguration("codeUstaad");
            const provider = config.get<string>("provider") || "gemini";
            const openaiApiKey = config.get<string>("openaiApiKey");
            const geminiApiKey = config.get<string>("geminiApiKey");
            const openaiModel =
                config.get<string>("openaiModel") || "gpt-4o-mini";
            const geminiModel =
                config.get<string>("geminiModel") || "gemini-2.0-flash";

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
            }

            // Show loading state
            currentPanel.webview.html = getWebviewContent(
                "",
                selectedText,
                languageId,
                true,
            );

            try {
                let explanation: string;

                if (provider === "openai") {
                    const openai = new OpenAI({ apiKey });
                    const response = await openai.chat.completions.create({
                        model: openaiModel,
                        messages: [
                            { role: "system", content: USTAAD_SYSTEM_PROMPT },
                            {
                                role: "user",
                                content: `Please explain this ${languageId} code:\n\n\`\`\`${languageId}\n${selectedText}\n\`\`\``,
                            },
                        ],
                        temperature: 0.7,
                        max_tokens: 2000,
                    });
                    explanation =
                        response.choices[0]?.message?.content ||
                        "Arey beta, kuch gadbad ho gayi!";
                } else {
                    const genAI = new GoogleGenerativeAI(apiKey);
                    const model = genAI.getGenerativeModel({
                        model: geminiModel,
                        systemInstruction: USTAAD_SYSTEM_PROMPT,
                    });
                    const prompt = `Please explain this ${languageId} code:\n\n\`\`\`${languageId}\n${selectedText}\n\`\`\``;
                    const result = await model.generateContent(prompt);
                    explanation =
                        result.response.text() ||
                        "Arey beta, kuch gadbad ho gayi!";
                }

                currentPanel.webview.html = getWebviewContent(
                    explanation,
                    selectedText,
                    languageId,
                    false,
                );
            } catch (error: any) {
                const errorMessage = error?.message || "Unknown error";
                vscode.window.showErrorMessage(
                    `Ustaad ko problem aa gayi: ${errorMessage}`,
                );
                currentPanel.webview.html = getWebviewContent(
                    `Arey beta, kuch technical problem aa gayi:\n\n${errorMessage}`,
                    selectedText,
                    languageId,
                    false,
                );
            }
        },
    );

    context.subscriptions.push(disposable);
}

function getWebviewContent(
    explanation: string,
    code: string,
    language: string,
    isLoading: boolean,
): string {
    const escapedCode = escapeHtml(code);
    const escapedExplanation = escapeHtml(explanation);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Ustaad</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif);
            padding: 20px;
            background-color: var(--vscode-editor-background, #1e1e1e);
            color: var(--vscode-editor-foreground, #d4d4d4);
            line-height: 1.6;
        }

        .header {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 25px;
            padding-bottom: 15px;
            border-bottom: 2px solid var(--vscode-panel-border, #454545);
        }

        .ustaad-icon {
            font-size: 48px;
        }

        .header-text h1 {
            font-size: 24px;
            color: var(--vscode-textLink-foreground, #3794ff);
            margin-bottom: 5px;
        }

        .header-text p {
            font-size: 14px;
            opacity: 0.8;
            font-style: italic;
        }

        .section {
            margin-bottom: 25px;
        }

        .section-title {
            font-size: 14px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--vscode-textPreformat-foreground, #ce9178);
            margin-bottom: 10px;
        }

        .code-block {
            background-color: var(--vscode-textCodeBlock-background, #2d2d2d);
            border: 1px solid var(--vscode-panel-border, #454545);
            border-radius: 6px;
            padding: 15px;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family, 'Consolas', 'Courier New', monospace);
            font-size: 13px;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .explanation {
            background-color: var(--vscode-textBlockQuote-background, #2a2a2a);
            border-left: 4px solid var(--vscode-textLink-foreground, #3794ff);
            border-radius: 0 6px 6px 0;
            padding: 20px;
            white-space: pre-wrap;
            word-wrap: break-word;
        }

        .loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px;
            text-align: center;
        }

        .loading-spinner {
            width: 50px;
            height: 50px;
            border: 4px solid var(--vscode-panel-border, #454545);
            border-top: 4px solid var(--vscode-textLink-foreground, #3794ff);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .loading-text {
            font-size: 16px;
            color: var(--vscode-textLink-foreground, #3794ff);
        }

        .loading-subtext {
            font-size: 14px;
            opacity: 0.7;
            margin-top: 10px;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="ustaad-icon">🧑‍🏫</div>
        <div class="header-text">
            <h1>Code Ustaad</h1>
            <p>"Guru bin gyan kahan se paayein" - Seekho aur samjho!</p>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Selected Code (${language})</div>
        <pre class="code-block">${escapedCode}</pre>
    </div>

    <div class="section">
        <div class="section-title">Ustaad's Explanation</div>
        ${
            isLoading
                ? `
            <div class="loading">
                <div class="loading-spinner"></div>
                <div class="loading-text">Ustaad soch rahe hain...</div>
                <div class="loading-subtext">Thoda sabar karo beta, accha jawab aane wala hai!</div>
            </div>
        `
                : `
            <div class="explanation">${escapedExplanation}</div>
        `
        }
    </div>
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
}
