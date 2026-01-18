import * as vscode from "vscode";
import type { ProviderType } from "../providers";
import { SecretsService } from "../services";

export async function clearApiKey(
    context: vscode.ExtensionContext,
): Promise<void> {
    const secrets = new SecretsService(context);

    const providerChoice = await vscode.window.showQuickPick(
        [
            {
                label: "Gemini",
                description: "Clear Gemini API key",
                value: "gemini" as ProviderType,
            },
            {
                label: "OpenAI",
                description: "Clear OpenAI API key",
                value: "openai" as ProviderType,
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
        await secrets.clearAllApiKeys();
        vscode.window.showInformationMessage("Dono API keys clear ho gaye!");
    } else {
        await secrets.clearApiKey(providerChoice.value as ProviderType);
        vscode.window.showInformationMessage(
            `${providerChoice.label} API key clear ho gaya!`,
        );
    }
}
