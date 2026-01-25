export interface WebviewTemplateParams {
    styles: string;
    historyHtml: string;
    language: string;
    displayLanguage: string;
    escapedCode: string;
    isLoading: boolean;
    iconUri: string;
}

export function getWebviewHtml(params: WebviewTemplateParams): string {
    const {
        styles,
        historyHtml,
        language,
        displayLanguage,
        escapedCode,
        isLoading,
        iconUri,
    } = params;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-webview-resource: https:; style-src 'unsafe-inline' https://cdnjs.cloudflare.com; script-src 'unsafe-inline' https://cdnjs.cloudflare.com;">
    <title>Code Ustaad</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
    <style>${styles}</style>
</head>
<body>
    <div class="main-content">
        <div class="header">
            <img class="ustaad-icon" src="${iconUri}" alt="Code Ustaad" />
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
                    // Auto-scroll to bottom while streaming (scroll the parent section)
                    explanation.parentElement.scrollTop = explanation.parentElement.scrollHeight;
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
                    // Scroll to top when loading history (scroll the parent section)
                    explanation.parentElement.scrollTop = 0;
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
                    }).catch(() => {
                        btn.textContent = 'Failed';
                        setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
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

export function getSetupHtml(styles: string, iconUri: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-webview-resource: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
    <title>Code Ustaad - Setup</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
            background: var(--vscode-editor-background, #1e1e1e);
            color: var(--vscode-editor-foreground, #d4d4d4);
            line-height: 1.6;
            min-height: 100vh;
            padding: 24px;
        }

        .onboarding-wrapper {
            max-width: 420px;
            margin: 0 auto;
        }

        /* Header */
        .header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 32px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--vscode-panel-border, #454545);
        }

        .header-icon {
            width: 48px;
            height: 48px;
            border-radius: 12px;
            object-fit: contain;
        }

        .header-title {
            font-size: 20px;
            font-weight: 600;
            color: var(--vscode-textLink-foreground, #3794ff);
            margin: 0;
        }

        .header-subtitle {
            font-size: 13px;
            opacity: 0.7;
            font-style: italic;
            margin: 2px 0 0 0;
        }

        /* Welcome Card */
        .welcome-card {
            background: linear-gradient(135deg, rgba(55, 148, 255, 0.1) 0%, rgba(55, 148, 255, 0.05) 100%);
            border: 1px solid rgba(55, 148, 255, 0.2);
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            margin-bottom: 28px;
        }

        .welcome-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 6px;
            color: var(--vscode-editor-foreground);
        }

        .welcome-subtitle {
            font-size: 14px;
            opacity: 0.8;
        }

        .welcome-subtitle span {
            color: #4ade80;
            font-weight: 600;
        }

        /* Provider Toggle */
        .provider-section {
            margin-bottom: 28px;
        }

        .section-label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 1px;
            opacity: 0.6;
            margin-bottom: 10px;
            display: block;
        }

        .provider-toggle {
            display: flex;
            background: var(--vscode-input-background, #3c3c3c);
            border-radius: 8px;
            padding: 4px;
            gap: 4px;
        }

        .provider-option {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 10px 16px;
            border: none;
            border-radius: 6px;
            background: transparent;
            color: var(--vscode-editor-foreground, #d4d4d4);
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s ease;
            font-family: inherit;
        }

        .provider-option:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .provider-option.active {
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
        }

        .provider-tag {
            font-size: 10px;
            padding: 3px 8px;
            border-radius: 4px;
            text-transform: uppercase;
            font-weight: 700;
            letter-spacing: 0.5px;
        }

        .provider-tag.free {
            background: #22c55e;
            color: #fff;
        }

        .provider-tag.paid {
            background: #f59e0b;
            color: #000;
        }

        .provider-option.active .provider-tag.free {
            background: #22c55e;
            color: #fff;
            box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
        }

        .provider-option.active .provider-tag.paid {
            background: #f59e0b;
            color: #000;
            box-shadow: 0 0 8px rgba(245, 158, 11, 0.5);
        }

        /* Steps */
        .steps-container {
            display: flex;
            flex-direction: column;
            gap: 20px;
            margin-bottom: 28px;
        }

        .step-item {
            display: flex;
            gap: 14px;
        }

        .step-badge {
            width: 28px;
            height: 28px;
            background: var(--vscode-textLink-foreground, #3794ff);
            color: #fff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 13px;
            font-weight: 700;
            flex-shrink: 0;
        }

        .step-body {
            flex: 1;
            padding-top: 3px;
        }

        .step-text {
            font-size: 14px;
            margin-bottom: 12px;
            color: var(--vscode-editor-foreground);
        }

        .step-text strong {
            color: var(--vscode-textLink-foreground, #3794ff);
        }

        /* Get Key Button */
        .btn-get-key {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: transparent;
            color: var(--vscode-textLink-foreground, #3794ff);
            border: 1px solid var(--vscode-textLink-foreground, #3794ff);
            padding: 10px 18px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: all 0.2s ease;
            font-family: inherit;
        }

        .btn-get-key:hover {
            background: var(--vscode-textLink-foreground, #3794ff);
            color: #fff;
        }

        .btn-get-key svg {
            width: 14px;
            height: 14px;
        }

        /* Input Group */
        .input-group {
            position: relative;
        }

        .api-input {
            width: 100%;
            background: var(--vscode-input-background, #3c3c3c);
            border: 1px solid var(--vscode-input-border, #3c3c3c);
            color: var(--vscode-input-foreground, #d4d4d4);
            padding: 12px 44px 12px 14px;
            border-radius: 6px;
            font-size: 13px;
            font-family: var(--vscode-editor-font-family, monospace);
            transition: border-color 0.2s ease;
        }

        .api-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder, #007fd4);
        }

        .api-input::placeholder {
            color: var(--vscode-input-placeholderForeground, #888);
            font-family: var(--vscode-font-family, sans-serif);
        }

        .btn-toggle-visibility {
            position: absolute;
            right: 8px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            color: var(--vscode-editor-foreground);
            cursor: pointer;
            padding: 6px;
            opacity: 0.5;
            font-size: 16px;
            transition: opacity 0.2s ease;
        }

        .btn-toggle-visibility:hover {
            opacity: 1;
        }

        .input-feedback {
            font-size: 12px;
            margin-top: 8px;
            min-height: 18px;
        }

        .input-feedback.success {
            color: #4ade80;
        }

        .input-feedback.error {
            color: var(--vscode-errorForeground, #f14c4c);
        }

        /* Save Button */
        .btn-save {
            width: 100%;
            background: var(--vscode-button-background, #0e639c);
            color: var(--vscode-button-foreground, #fff);
            border: none;
            padding: 14px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: all 0.2s ease;
            font-family: inherit;
        }

        .btn-save:hover:not(:disabled) {
            background: var(--vscode-button-hoverBackground, #1177bb);
        }

        .btn-save:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        /* Footer Note */
        .footer-note {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 16px;
            background: rgba(127, 127, 127, 0.05);
            border-radius: 8px;
            font-size: 12px;
            opacity: 0.7;
            line-height: 1.5;
        }

        .footer-note-icon {
            font-size: 16px;
            flex-shrink: 0;
        }
    </style>
</head>
<body>
    <div class="onboarding-wrapper">
        <div class="header">
            <img class="header-icon" src="${iconUri}" alt="Code Ustaad" />
            <div>
                <h1 class="header-title">Code Ustaad</h1>
                <p class="header-subtitle">Seekho aur samjho!</p>
            </div>
        </div>

        <div class="welcome-card">
            <h2 class="welcome-title">Welcome, Coder! 👋</h2>
            <p class="welcome-subtitle">Setup in 30 seconds. <span>It's FREE!</span></p>
        </div>

        <div class="provider-section">
            <span class="section-label">Choose AI Provider</span>
            <div class="provider-toggle">
                <button class="provider-option active" data-provider="gemini" onclick="selectProvider('gemini')">
                    Gemini <span class="provider-tag free">Free</span>
                </button>
                <button class="provider-option" data-provider="openai" onclick="selectProvider('openai')">
                    OpenAI <span class="provider-tag paid">Paid</span>
                </button>
            </div>
        </div>

        <div class="steps-container">
            <div class="step-item">
                <div class="step-badge">1</div>
                <div class="step-body">
                    <p class="step-text">Get your <strong id="providerName">Gemini</strong> API key</p>
                    <button class="btn-get-key" onclick="openApiKeyPage()">
                        <span id="getKeyText">Get Free API Key</span>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd" d="M5.22 14.78a.75.75 0 001.06 0l7.22-7.22v5.69a.75.75 0 001.5 0v-7.5a.75.75 0 00-.75-.75h-7.5a.75.75 0 000 1.5h5.69l-7.22 7.22a.75.75 0 000 1.06z" clip-rule="evenodd" />
                        </svg>
                    </button>
                </div>
            </div>

            <div class="step-item">
                <div class="step-badge">2</div>
                <div class="step-body">
                    <p class="step-text">Paste your API key below</p>
                    <div class="input-group">
                        <input
                            type="password"
                            id="apiKeyInput"
                            class="api-input"
                            placeholder="Paste key here (AIza...)"
                            autocomplete="off"
                            spellcheck="false"
                        />
                        <button class="btn-toggle-visibility" onclick="toggleKeyVisibility()" title="Show/Hide" type="button">
                            <span id="visibilityIcon">👁</span>
                        </button>
                    </div>
                    <div class="input-feedback" id="inputHint"></div>
                </div>
            </div>

            <div class="step-item">
                <div class="step-badge">3</div>
                <div class="step-body">
                    <button class="btn-save" id="saveBtn" onclick="saveApiKey()" disabled>
                        Save & Start Learning
                    </button>
                </div>
            </div>
        </div>

        <div class="footer-note">
            <span class="footer-note-icon">🔒</span>
            <span>Your key is stored securely on your machine. We never see or store your key on any server.</span>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let selectedProvider = 'gemini';

        const API_KEY_URLS = {
            gemini: 'https://aistudio.google.com/app/apikey',
            openai: 'https://platform.openai.com/api-keys'
        };

        const API_KEY_PATTERNS = {
            gemini: /^AIza[a-zA-Z0-9_-]{35}$/,
            openai: /^sk-[a-zA-Z0-9_-]{20,}$/
        };

        const apiKeyInput = document.getElementById('apiKeyInput');
        const saveBtn = document.getElementById('saveBtn');
        const inputHint = document.getElementById('inputHint');

        function selectProvider(provider) {
            selectedProvider = provider;

            document.querySelectorAll('.provider-option').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.provider === provider);
            });

            document.getElementById('providerName').textContent = provider === 'gemini' ? 'Gemini' : 'OpenAI';
            document.getElementById('getKeyText').textContent = provider === 'gemini' ? 'Get Free API Key' : 'Get OpenAI Key';

            apiKeyInput.placeholder = provider === 'gemini'
                ? 'Paste key here (AIza...)'
                : 'Paste key here (sk-...)';

            validateApiKey();
        }

        function openApiKeyPage() {
            vscode.postMessage({ command: 'openExternalUrl', url: API_KEY_URLS[selectedProvider] });
        }

        function validateApiKey() {
            const key = apiKeyInput.value.trim();

            if (!key) {
                saveBtn.disabled = true;
                inputHint.textContent = '';
                inputHint.className = 'input-feedback';
                return false;
            }

            const pattern = API_KEY_PATTERNS[selectedProvider];
            const isValid = pattern.test(key);

            if (isValid) {
                saveBtn.disabled = false;
                inputHint.textContent = '✓ Key format looks good!';
                inputHint.className = 'input-feedback success';
            } else {
                saveBtn.disabled = true;
                const prefix = selectedProvider === 'gemini' ? 'AIza' : 'sk-';
                if (!key.startsWith(prefix)) {
                    inputHint.textContent = selectedProvider === 'gemini'
                        ? 'Gemini keys start with "AIza"'
                        : 'OpenAI keys start with "sk-"';
                } else {
                    inputHint.textContent = 'Key format doesn\\'t look right';
                }
                inputHint.className = 'input-feedback error';
            }

            return isValid;
        }

        function toggleKeyVisibility() {
            const icon = document.getElementById('visibilityIcon');
            if (apiKeyInput.type === 'password') {
                apiKeyInput.type = 'text';
                icon.textContent = '🙈';
            } else {
                apiKeyInput.type = 'password';
                icon.textContent = '👁';
            }
        }

        function saveApiKey() {
            if (!validateApiKey()) return;

            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';

            vscode.postMessage({
                command: 'saveApiKey',
                provider: selectedProvider,
                apiKey: apiKeyInput.value.trim()
            });
        }

        apiKeyInput.addEventListener('input', validateApiKey);
        apiKeyInput.addEventListener('paste', () => setTimeout(validateApiKey, 10));
        apiKeyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !saveBtn.disabled) saveApiKey();
        });

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'apiKeyError') {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save & Start Learning';
                inputHint.textContent = message.error || 'Failed to save. Try again.';
                inputHint.className = 'input-feedback error';
            }
        });
    </script>
</body>
</html>`;
}
