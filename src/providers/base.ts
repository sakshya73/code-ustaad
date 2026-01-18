export interface AIProvider {
    name: string;
    streamExplanation(
        systemPrompt: string,
        userPrompt: string,
        onChunk: (content: string) => void,
    ): Promise<string>;
}

export type ProviderType = "openai" | "gemini";
