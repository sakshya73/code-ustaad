import type { AIProvider, ProviderType } from "./base";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";

export type { AIProvider, ProviderType };
export { GeminiProvider, OpenAIProvider };

export function createProvider(
    type: ProviderType,
    apiKey: string,
    model: string,
): AIProvider {
    switch (type) {
        case "openai":
            return new OpenAIProvider(apiKey, model);
        case "gemini":
            return new GeminiProvider(apiKey, model);
        default:
            throw new Error(`Unknown provider: ${type}`);
    }
}
