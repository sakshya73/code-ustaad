import type * as vscode from "vscode";
import type { ProviderType } from "../providers";

const SECRET_KEYS: Record<ProviderType, string> = {
    openai: "codeUstaad.openaiApiKey",
    gemini: "codeUstaad.geminiApiKey",
};

export class SecretsService {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    async getApiKey(provider: ProviderType): Promise<string | undefined> {
        return this.context.secrets.get(SECRET_KEYS[provider]);
    }

    async setApiKey(provider: ProviderType, apiKey: string): Promise<void> {
        await this.context.secrets.store(SECRET_KEYS[provider], apiKey);
    }

    async clearApiKey(provider: ProviderType): Promise<void> {
        await this.context.secrets.delete(SECRET_KEYS[provider]);
    }

    async clearAllApiKeys(): Promise<void> {
        await this.context.secrets.delete(SECRET_KEYS.openai);
        await this.context.secrets.delete(SECRET_KEYS.gemini);
    }
}
