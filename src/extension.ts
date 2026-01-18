import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import {
    askUstaad,
    clearApiKey,
    disposePanel,
    getCurrentPanel,
    setApiKey,
    setStyles,
} from "./commands";

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
        const styles = fs.readFileSync(stylesPath, "utf8");
        setStyles(styles);
    } catch {
        console.warn("Code Ustaad: Could not load styles.css");
    }

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
            if (e.affectsConfiguration("codeUstaad") && getCurrentPanel()) {
                vscode.window.showInformationMessage(
                    "Code Ustaad: Settings updated!",
                );
            }
        }),
    );
}

export function deactivate() {
    disposePanel();
}
