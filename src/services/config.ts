import * as vscode from "vscode";
import type { ProviderType } from "../providers";

export interface AppConfig {
    provider: ProviderType;
    openaiModel: string;
    geminiModel: string;
    personaIntensity: "strict" | "balanced" | "funny";
    maxHistoryItems: number;
}

export class ConfigService {
    private static readonly SECTION = "codeUstaad";

    static get(): AppConfig {
        const config = vscode.workspace.getConfiguration(ConfigService.SECTION);
        return {
            provider: config.get<ProviderType>("provider") || "gemini",
            openaiModel: config.get<string>("openaiModel") || "gpt-4o-mini",
            geminiModel:
                config.get<string>("geminiModel") || "gemini-2.5-flash",
            personaIntensity:
                config.get<"strict" | "balanced" | "funny">(
                    "personaIntensity",
                ) || "balanced",
            maxHistoryItems: config.get<number>("maxHistoryItems") || 10,
        };
    }

    static async setProvider(provider: ProviderType): Promise<void> {
        const config = vscode.workspace.getConfiguration(ConfigService.SECTION);
        await config.update(
            "provider",
            provider,
            vscode.ConfigurationTarget.Global,
        );
    }

    static getModel(provider: ProviderType): string {
        const config = ConfigService.get();
        return provider === "openai" ? config.openaiModel : config.geminiModel;
    }
}
