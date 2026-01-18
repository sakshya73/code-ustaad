import * as vscode from "vscode";
import type { ProviderType } from "../providers";
import { ConfigService, SecretsService } from "../services";

export async function setApiKey(
    context: vscode.ExtensionContext,
): Promise<ProviderType | null> {
    const secrets = new SecretsService(context);

    // Let user choose which provider's key to set
    const providerChoice = await vscode.window.showQuickPick(
        [
            {
                label: "Gemini",
                description: "Google Gemini API",
                value: "gemini" as ProviderType,
            },
            {
                label: "OpenAI",
                description: "OpenAI GPT API",
                value: "openai" as ProviderType,
            },
        ],
        { placeHolder: "Kaunsa API key set karna hai?" },
    );

    if (!providerChoice) return null;

    const provider = providerChoice.value;

    const apiKey = await vscode.window.showInputBox({
        prompt: `Enter your ${provider === "openai" ? "OpenAI" : "Gemini"} API Key`,
        password: true,
        placeHolder: provider === "openai" ? "sk-..." : "AI...",
        ignoreFocusOut: true,
    });

    if (apiKey) {
        await secrets.setApiKey(provider, apiKey);
        await ConfigService.setProvider(provider);

        vscode.window.showInformationMessage(
            `${provider === "openai" ? "OpenAI" : "Gemini"} API key saved! Provider set to ${provider}.`,
        );
        return provider;
    }

    return null;
}
