import MarkdownIt from "markdown-it";

const md = new MarkdownIt({
    html: false,
    breaks: true,
    linkify: true,
});

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function renderMarkdown(content: string): string {
    return md.render(content);
}

export function extractCodeTitle(code: string): string {
    const trimmed = code.trim();

    const patterns = [
        // React component: function ComponentName( or const ComponentName =
        /(?:function|const|let|var)\s+([A-Z][a-zA-Z0-9]*)\s*[=(]/,
        // Regular function: function name(
        /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/,
        // Arrow function: const name = ( or const name = async (
        /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s*)?\(/,
        // Class declaration: class ClassName
        /class\s+([A-Z][a-zA-Z0-9]*)/,
        // Method: methodName( or async methodName(
        /(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*{/,
        // Hook usage: useEffect, useState, etc.
        /(use[A-Z][a-zA-Z]*)\s*\(/,
        // Export default function/class
        /export\s+default\s+(?:function|class)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
    ];

    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (match?.[1]) {
            return match[1];
        }
    }

    // Fallback: first meaningful line (skip comments, whitespace)
    const lines = trimmed.split("\n");
    for (const line of lines) {
        const cleaned = line.trim();
        if (cleaned && !cleaned.startsWith("//") && !cleaned.startsWith("/*")) {
            return cleaned.slice(0, 25) + (cleaned.length > 25 ? "..." : "");
        }
    }

    return "Code snippet";
}

export function countLines(text: string): number {
    return text.split("\n").length;
}

export function generateId(): string {
    return Date.now().toString();
}

export async function checkConnectivity(): Promise<boolean> {
    try {
        // Try to reach Google's DNS - lightweight check
        const { request } = await import("node:https");
        return new Promise((resolve) => {
            const req = request(
                {
                    hostname: "dns.google",
                    port: 443,
                    path: "/",
                    method: "HEAD",
                    timeout: 3000,
                },
                () => resolve(true),
            );
            req.on("error", () => resolve(false));
            req.on("timeout", () => {
                req.destroy();
                resolve(false);
            });
            req.end();
        });
    } catch {
        return false;
    }
}
