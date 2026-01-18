import type * as vscode from "vscode";
import type { HistoryItem } from "../types";
import { escapeHtml, extractCodeTitle } from "../utils/helpers";

const HISTORY_KEY = "codeUstaad.history";

export class HistoryService {
    private context: vscode.ExtensionContext;
    private items: HistoryItem[] = [];
    private maxItems: number;

    constructor(context: vscode.ExtensionContext, maxItems: number = 10) {
        this.context = context;
        this.maxItems = maxItems;
        this.load();
    }

    private load(): void {
        this.items = this.context.globalState.get<HistoryItem[]>(
            HISTORY_KEY,
            [],
        );
    }

    private save(): void {
        this.context.globalState.update(HISTORY_KEY, this.items);
    }

    getAll(): HistoryItem[] {
        return this.items;
    }

    getById(id: string): HistoryItem | undefined {
        return this.items.find((item) => item.id === id);
    }

    add(item: HistoryItem): void {
        this.items.unshift(item);
        if (this.items.length > this.maxItems) {
            this.items = this.items.slice(0, this.maxItems);
        }
        this.save();
    }

    clear(): void {
        this.items = [];
        this.save();
    }

    setMaxItems(max: number): void {
        this.maxItems = max;
        if (this.items.length > max) {
            this.items = this.items.slice(0, max);
            this.save();
        }
    }

    generateHistoryHtml(): string {
        if (this.items.length === 0) return "";

        return this.items
            .slice(0, 10)
            .map((item) => {
                const title = extractCodeTitle(item.code);
                const preview = item.code.trim().split("\n")[0].slice(0, 30);
                return `
            <div class="history-item" data-id="${item.id}">
                <span class="history-lang">${escapeHtml(title)}</span>
                <span class="history-code">${escapeHtml(preview)}${preview.length >= 30 ? "..." : ""}</span>
            </div>`;
            })
            .join("");
    }
}
