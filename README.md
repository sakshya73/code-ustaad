# 👨‍🏫 Code Ustaad (Code उस्ताद)

**Complex Code? Tension mat le, Ustaad hai na.**

Code Ustaad is a VS Code and Cursor extension designed for developers who find English technical jargon overwhelming. It explains selected code snippets in **Hinglish** (Hindi + English), acting like a wise Senior Architect sitting right next to you.

It uses the **"Bring Your Own Key" (BYOK)** model—meaning you use your own API key (OpenAI or Gemini), keeping the extension free and open source forever.

## ✨ Features

* **Hinglish Explanations:** Get explanations that feel like a chat with a senior dev. ("*Dekho beta, ye loop basic filtering kar raha hai...*")
* **Streaming Responses:** See text appear in real-time, character by character - no more waiting for the full response!
* **Multiple AI Providers:** Choose between OpenAI (GPT) or Google Gemini - use whichever you have access to.
* **History Panel:** Compare multiple explanations side-by-side. Your history is saved across sessions.
* **Persona Modes:** Choose Ustaad's teaching style - Strict, Balanced, or Funny (with Bollywood references!)
* **Smart Context:** Select even a single word - Ustaad grabs surrounding code for accurate explanations.
* **Keyboard Shortcut:** `Cmd+Shift+U` (Mac) / `Ctrl+Shift+U` (Windows/Linux) for instant access.
* **Secure Key Storage:** API keys stored securely using VS Code's encrypted SecretStorage.
* **Privacy First:** Your code is sent directly to the AI provider using *your* key. No middleman servers.
* **Zero Cost:** Free to use (you only pay for your API usage).
* **Works in Cursor:** Fully compatible with Cursor AI code editor.

## 🚀 How to Use (Kaise Use Karein)

1. **Install** the extension from the VS Code Marketplace (or load locally).
2. **Set API Key:** Run command `Code Ustaad: Set API Key` (Cmd+Shift+P → type "Set API Key").
3. **Select Code:** Highlight any confusing function or logic block.
4. **Ask Ustaad:**
   - **Keyboard:** `Cmd+Shift+U` (Mac) / `Ctrl+Shift+U` (Windows/Linux)
   - **Right-click:** Select **"Ask Ustaad"** from context menu
5. **Learn:** Read the streaming explanation in the side panel!

## ⚙️ Configuration

### Commands

| Command | Description |
| :--- | :--- |
| `Code Ustaad: Set API Key` | Securely store your API key (encrypted) |
| `Code Ustaad: Clear API Key` | Remove stored API key |
| `Ask Ustaad` | Explain selected code (also via right-click or keyboard shortcut) |

### Settings

| Setting | Description |
| :--- | :--- |
| `codeUstaad.provider` | Choose AI provider: `openai` or `gemini` (default: `gemini`) |
| `codeUstaad.geminiModel` | Gemini model to use (default: `gemini-2.0-flash`) |
| `codeUstaad.openaiModel` | OpenAI model to use (default: `gpt-4o-mini`) |
| `codeUstaad.personaIntensity` | Ustaad's teaching style: `strict`, `balanced`, or `funny` (default: `balanced`) |
| `codeUstaad.maxHistoryItems` | Number of explanations to keep in history (default: `10`, max: `50`) |

### Keyboard Shortcuts

| Shortcut | Platform | Action |
| :--- | :--- | :--- |
| `Cmd+Shift+U` | Mac | Ask Ustaad |
| `Ctrl+Shift+U` | Windows/Linux | Ask Ustaad |

### Persona Modes

| Mode | Description |
| :--- | :--- |
| **Strict** | Focus on best practices, warnings, and correctness. Less jokes, more discipline. |
| **Balanced** | Warm teaching with Indian analogies and encouragement. (Default) |
| **Funny** | Bollywood dialogues, cricket commentary, and memes! *"Mogambo khush hua!"* |

## 🛠️ Installation for Developers (Local Setup)

Want to contribute? *Aaja maidan mein!*

1. Clone the repo:
   ```bash
   git clone https://github.com/sakshya73/code-ustaad.git
   cd code-ustaad
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Compile the extension:
   ```bash
   npm run compile
   ```

4. Run the extension:
   Press `F5` to open a new VS Code/Cursor window with the extension loaded.

## 📜 Scripts

| Command | Description |
| :--- | :--- |
| `npm run compile` | Compile TypeScript to JavaScript |
| `npm run watch` | Watch mode for development |
| `npm run lint` | Run Biome linter |
| `npm run lint:fix` | Auto-fix linting issues |
| `npm run format` | Format code with Biome |

## 🤝 Contributing

We welcome contributions! Whether it's improving the "Ustaad" system prompt to be funnier, adding new features, or fixing bugs.

1. Fork the repo.
2. Create a feature branch (`git checkout -b feature/better-jokes`).
3. Commit your changes.
4. Open a Pull Request.

## 📜 License

MIT License. *Dil khol ke use karo.*

---

**Made with ❤️ and ☕**
