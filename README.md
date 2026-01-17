# 👨‍🏫 Code Ustaad (Code उस्ताद)

**Complex Code? Tension mat le, Ustaad hai na.**

Code Ustaad is a VS Code and Cursor extension designed for developers who find English technical jargon overwhelming. It explains selected code snippets in **Hinglish** (Hindi + English), acting like a wise Senior Architect sitting right next to you.

It uses the **"Bring Your Own Key" (BYOK)** model—meaning you use your own API key (OpenAI or Gemini), keeping the extension free and open source forever.

## ✨ Features

* **Hinglish Explanations:** Get explanations that feel like a chat with a senior dev. ("*Dekho beta, ye loop basic filtering kar raha hai...*")
* **Multiple AI Providers:** Choose between OpenAI (GPT) or Google Gemini - use whichever you have access to.
* **Context Aware:** Understands functions, classes, and logic blocks in any programming language.
* **Privacy First:** Your code is sent directly to the AI provider using *your* key. No middleman servers.
* **Zero Cost:** Free to use (you only pay for your API usage).
* **Works in Cursor:** Fully compatible with Cursor AI code editor.

## 🚀 How to Use (Kaise Use Karein)

1. **Install** the extension from the VS Code Marketplace (or load locally).
2. **Add Key:** Open Settings (`Cmd + ,` / `Ctrl + ,`), search for `Code Ustaad`, and enter your API Key.
3. **Select Code:** Highlight any confusing function or logic block.
4. **Ask Ustaad:** Right-click and select **"Ask Ustaad"**.
5. **Learn:** Read the explanation in the side panel.

## ⚙️ Configuration

| Setting | Description |
| :--- | :--- |
| `codeUstaad.provider` | Choose AI provider: `openai` or `gemini` (default: `gemini`) |
| `codeUstaad.geminiApiKey` | Your Google Gemini API Key. Get one at [aistudio.google.com](https://aistudio.google.com/apikey) |
| `codeUstaad.openaiApiKey` | Your OpenAI API Key (starts with `sk-...`) |
| `codeUstaad.geminiModel` | Gemini model to use (default: `gemini-2.0-flash`) |
| `codeUstaad.openaiModel` | OpenAI model to use (default: `gpt-4o-mini`) |

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
