import OpenAI from "openai";
import type { AIProvider } from "./base";

export class OpenAIProvider implements AIProvider {
    name = "openai";
    private client: OpenAI;
    private model: string;

    constructor(apiKey: string, model: string) {
        this.client = new OpenAI({ apiKey });
        this.model = model;
    }

    async streamExplanation(
        systemPrompt: string,
        userPrompt: string,
        onChunk: (content: string) => void,
    ): Promise<string> {
        const stream = await this.client.chat.completions.create({
            model: this.model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            temperature: 0.7,
            max_tokens: 2000,
            stream: true,
        });

        let fullContent = "";

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            fullContent += content;
            onChunk(fullContent);
        }

        return fullContent;
    }
}
