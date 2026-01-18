export interface WebviewTemplateParams {
    styles: string;
    historyHtml: string;
    language: string;
    displayLanguage: string;
    escapedCode: string;
    isLoading: boolean;
}

export function getWebviewHtml(params: WebviewTemplateParams): string {
    const { styles, historyHtml, language, displayLanguage, escapedCode, isLoading } = params;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://cdnjs.cloudflare.com; script-src 'unsafe-inline' https://cdnjs.cloudflare.com;">
    <title>Code Ustaad</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
    <style>${styles}</style>
</head>
<body>
    <div class="main-content">
        <div class="header">
            <div class="ustaad-icon">🧑‍🏫</div>
            <div class="header-text">
                <h1>Code Ustaad</h1>
                <p>Seekho aur samjho!</p>
            </div>
            <button class="history-toggle-btn" onclick="toggleHistory()" title="Toggle History">🕒 History</button>
        </div>

        <div class="section">
            <div class="section-title">Selected Code (${displayLanguage})</div>
            <pre class="code-block"><code class="language-${language}" id="codeBlock">${escapedCode}</code></pre>
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

    <div class="sidebar" id="sidebar">
        <div class="sidebar-header">
            <h3>History</h3>
            <div class="sidebar-actions">
                <button class="clear-btn" onclick="clearHistory()">Clear</button>
                <button class="close-btn" onclick="toggleHistory()" title="Close">✕</button>
            </div>
        </div>
        <div class="history-list" id="historyList">
            ${historyHtml || '<div class="no-history">No history yet</div>'}
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        window.addEventListener('message', event => {
            const message = event.data;
            const explanation = document.getElementById('explanation');

            switch (message.command) {
                case 'streamUpdate':
                    // We wrap content in a div to attach the cursor
                    explanation.innerHTML = '<div class="streaming-content streaming-cursor">' + message.content + '</div>';
                    // Auto-scroll to bottom while streaming
                    explanation.scrollTop = explanation.scrollHeight;
                    break;

                case 'streamComplete':
                    // Remove the cursor animation class
                    const contentDiv = explanation.querySelector('.streaming-content');
                    if (contentDiv) contentDiv.classList.remove('streaming-cursor');
                    addToHistorySidebar(message.historyItem);
                    // Highlight code blocks and add copy buttons
                    highlightCode();
                    addCopyButtons();
                    break;

                case 'streamError':
                    explanation.innerHTML = '<div class="error">' + message.error + '</div>';
                    break;

                case 'showHistoryItem':
                    const historyCodeBlock = document.getElementById('codeBlock');
                    historyCodeBlock.textContent = message.item.code;
                    historyCodeBlock.className = 'language-' + message.item.language;
                    historyCodeBlock.removeAttribute('data-highlighted');
                    explanation.innerHTML = message.item.explanationHtml;
                    // Scroll to top when loading history
                    explanation.scrollTop = 0;
                    // Re-highlight and add copy buttons
                    highlightCode();
                    addCopyButtons();
                    break;

                case 'historyCleared':
                    document.getElementById('historyList').innerHTML = '<div class="no-history">No history yet</div>';
                    break;
            }
        });

        function extractCodeTitle(code) {
            const trimmed = code.trim();
            const patterns = [
                /(?:function|const|let|var)\\s+([A-Z][a-zA-Z0-9]*)\\s*[=(]/,
                /function\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*\\(/,
                /(?:const|let|var)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=\\s*(?:async\\s*)?\\(/,
                /class\\s+([A-Z][a-zA-Z0-9]*)/,
                /(?:async\\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*\\([^)]*\\)\\s*{/,
                /(use[A-Z][a-zA-Z]*)\\s*\\(/,
            ];
            for (const pattern of patterns) {
                const match = trimmed.match(pattern);
                if (match && match[1]) return match[1];
            }
            const lines = trimmed.split('\\n');
            for (const line of lines) {
                const cleaned = line.trim();
                if (cleaned && !cleaned.startsWith('//') && !cleaned.startsWith('/*')) {
                    return cleaned.slice(0, 25) + (cleaned.length > 25 ? '...' : '');
                }
            }
            return 'Code snippet';
        }

        function addToHistorySidebar(item) {
            const historyList = document.getElementById('historyList');
            const noHistory = historyList.querySelector('.no-history');
            if (noHistory) noHistory.remove();

            const title = extractCodeTitle(item.code);
            const preview = item.code.trim().split('\\n')[0].slice(0, 30);

            const div = document.createElement('div');
            div.className = 'history-item';
            div.dataset.id = item.id;
            div.innerHTML =
                '<span class="history-lang">' + escapeHtml(title) + '</span>' +
                '<span class="history-code">' + escapeHtml(preview) + (preview.length >= 30 ? '...' : '') + '</span>';

            historyList.insertAdjacentElement('afterbegin', div);
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Delegate click event for history items (handles both static and dynamic items)
        document.getElementById('historyList').addEventListener('click', (e) => {
            const item = e.target.closest('.history-item');
            if (item) {
                vscode.postMessage({ command: 'loadHistory', id: item.dataset.id });
                
                // Visual feedback for selection
                document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
            }
        });

        function clearHistory() {
            vscode.postMessage({ command: 'clearHistory' });
        }

        function toggleHistory() {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.toggle('open');
        }

        function highlightCode() {
            const codeBlock = document.getElementById('codeBlock');
            if (codeBlock && window.hljs) {
                hljs.highlightElement(codeBlock);
            }
            // Also highlight code blocks in explanation
            document.querySelectorAll('.explanation pre code').forEach((block) => {
                if (!block.classList.contains('hljs')) {
                    hljs.highlightElement(block);
                }
            });
        }

        function addCopyButtons() {
            document.querySelectorAll('.explanation pre').forEach((pre) => {
                // Skip if already has a copy button
                if (pre.querySelector('.copy-btn')) return;

                // Create wrapper for positioning
                pre.style.position = 'relative';

                const btn = document.createElement('button');
                btn.className = 'copy-btn';
                btn.textContent = 'Copy';
                btn.onclick = function() {
                    const code = pre.querySelector('code');
                    const text = code ? code.textContent : pre.textContent;
                    navigator.clipboard.writeText(text).then(() => {
                        btn.textContent = 'Copied!';
                        btn.classList.add('copied');
                        setTimeout(() => {
                            btn.textContent = 'Copy';
                            btn.classList.remove('copied');
                        }, 2000);
                    });
                };
                pre.appendChild(btn);
            });
        }
    </script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
    <script>
        // Highlight on load
        document.addEventListener('DOMContentLoaded', highlightCode);
        // Also try immediately in case DOM is already ready
        if (document.readyState !== 'loading') highlightCode();
    </script>
</body>
</html>`;
}

export function getSetupHtml(styles: string, provider: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Ustaad - Setup</title>
    <style>${styles}</style>
</head>
<body>
    <div class="main-content setup-wrapper">
        <div class="header">
            <div class="ustaad-icon">🧑‍🏫</div>
            <div class="header-text">
                <h1>Code Ustaad</h1>
                <p>Seekho aur samjho!</p>
            </div>
        </div>

        <div class="setup-container">
            <h2>API Key Required</h2>
            <p>Beta, pehle ${provider === "openai" ? "OpenAI" : "Gemini"} API key set karo!</p>
            <button class="setup-btn" onclick="setupApiKey()">Set API Key</button>
            <p class="secure-note">
                Your key is stored securely using VS Code's SecretStorage.
            </p>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        function setupApiKey() {
            vscode.postMessage({ command: 'setupApiKey' });
        }
    </script>
</body>
</html>`;
}
