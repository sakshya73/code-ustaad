export interface WebviewTemplateParams {
    styles: string;
    historyHtml: string;
    language: string;
    escapedCode: string;
    isLoading: boolean;
}

export function getWebviewHtml(params: WebviewTemplateParams): string {
    const { styles, historyHtml, language, escapedCode, isLoading } = params;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>Code Ustaad</title>
    <style>${styles}</style>
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

        window.addEventListener('message', event => {
            const message = event.data;
            const explanation = document.getElementById('explanation');

            switch (message.command) {
                case 'streamUpdate':
                    explanation.innerHTML = '<div class="streaming-cursor">' + message.content + '</div>';
                    explanation.scrollTop = explanation.scrollHeight;
                    break;

                case 'streamComplete':
                    const cursor = explanation.querySelector('.streaming-cursor');
                    if (cursor) cursor.classList.remove('streaming-cursor');
                    addToHistorySidebar(message.historyItem);
                    break;

                case 'streamError':
                    explanation.innerHTML = '<div class="error">' + message.error + '</div>';
                    break;

                case 'showHistoryItem':
                    document.getElementById('codeBlock').textContent = message.item.code;
                    explanation.innerHTML = message.item.explanationHtml;
                    break;

                case 'historyCleared':
                    document.getElementById('historyList').innerHTML = '<div class="no-history">No history yet</div>';
                    break;
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

export function getSetupHtml(styles: string, provider: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>Code Ustaad - Setup</title>
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
        </div>

        <div class="setup-container">
            <h2>API Key Required</h2>
            <p>Beta, pehle ${provider === "openai" ? "OpenAI" : "Gemini"} API key set karo!</p>
            <button class="setup-btn" onclick="setupApiKey()">Set API Key</button>
            <p style="margin-top: 20px; font-size: 12px; opacity: 0.7;">
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
