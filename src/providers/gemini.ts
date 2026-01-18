import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AIProvider } from "./base";

export class GeminiProvider implements AIProvider {
    name = "gemini";
    private genAI: GoogleGenerativeAI;
    private model: string;

    constructor(apiKey: string, model: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = model;
    }

    async streamExplanation(
        systemPrompt: string,
        userPrompt: string,
        onChunk: (content: string) => void,
    ): Promise<string> {
        const model = this.genAI.getGenerativeModel({
            model: this.model,
            systemInstruction: systemPrompt,
        });

        const result = await model.generateContentStream(userPrompt);

        let fullContent = "";

        for await (const chunk of result.stream) {
            fullContent += chunk.text();
            onChunk(fullContent);
        }

        return fullContent;
    }
}
