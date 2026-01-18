import * as vscode from "vscode";

export interface HistoryItem {
    id: string;
    code: string;
    language: string;
    explanation: string;
    timestamp: Date;
}

export interface CodeSelection {
    text: string;
    language: string;
    displayLanguage: string;
    lineCount: number;
    isLarge: boolean;
    isVeryLarge: boolean;
}

export interface ExplanationContext {
    code: string;
    contextInfo: string;
    isLargeSelection: boolean;
}

export interface WebviewMessage {
    command: string;
    [key: string]: any;
}

export interface AIProvider {
    name: string;
    generateStream(
        systemPrompt: string,
        userPrompt: string,
        onChunk: (content: string) => void,
    ): Promise<string>;
}

export interface AppConfig {
    provider: "openai" | "gemini";
    openaiModel: string;
    geminiModel: string;
    personaIntensity: "strict" | "balanced" | "funny";
    maxHistoryItems: number;
}

export interface AppContext {
    extensionContext: vscode.ExtensionContext;
    panel?: vscode.WebviewPanel;
}
