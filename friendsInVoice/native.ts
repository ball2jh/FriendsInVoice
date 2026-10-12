/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent } from "electron";

// Discord's content security policy blocks api.anthropic.com from the page, so the request runs here.
// Raw HTTP instead of the Anthropic SDK: Vencord user plugins can't add npm dependencies.

export interface ChatLine {
    mine: boolean;
    content: string;
}

// models that accept the server-side refusal fallback (fallbacks: "default")
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

const SYSTEM_PROMPT = `You suggest quick replies for a Discord direct message conversation.
Write 3 short, natural replies the user could send to the other person's latest message.
- Reply in the same language and dialect as that message, and match its tone (casual, emoji use, etc.).
- Make the 3 replies meaningfully different (for example: agree / decline / ask something back).
- Keep each reply under 15 words. Don't add quotes or explanations.`;

export async function suggestReplies(_: IpcMainInvokeEvent, apiKey: string, model: string, lines: ChatLine[]) {
    if (!apiKey) return { ok: false, error: "No API key set." };
    if (!lines.length) return { ok: false, error: "No message to reply to." };

    const transcript = lines.map(l => `${l.mine ? "Me" : "Them"}: ${l.content}`).join("\n");

    const body: Record<string, any> = {
        model,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        output_config: {
            effort: "low",
            format: {
                type: "json_schema",
                schema: {
                    type: "object",
                    properties: { replies: { type: "array", items: { type: "string" } } },
                    required: ["replies"],
                    additionalProperties: false,
                },
            },
        },
        messages: [{ role: "user", content: `Conversation (most recent last):\n${transcript}` }],
    };

    const headers: Record<string, string> = {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
    };
    if (FALLBACK_MODELS.has(model)) {
        body.fallbacks = "default";
        headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
    }

    try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        });
        const data: any = await res.json().catch(() => null);

        if (!res.ok) {
            const msg = data?.error?.message ?? `HTTP ${res.status}`;
            return { ok: false, error: res.status === 401 ? "The API key isn't valid." : msg };
        }
        if (data?.stop_reason === "refusal") return { ok: false, error: "Claude declined to suggest replies for this message." };

        const text = (data?.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
        const replies = JSON.parse(text)?.replies;
        if (!Array.isArray(replies)) return { ok: false, error: "Unexpected response from Claude." };

        return {
            ok: true,
            replies: replies.filter((r: unknown) => typeof r === "string" && r.trim()).map((r: string) => r.trim()).slice(0, 3),
        };
    } catch (e: any) {
        return { ok: false, error: String(e?.message ?? e) };
    }
}
