import { ruleReplies } from "../../friendsInVoice/smartReplyEngine.ts";

const SYSTEM_PROMPT = `You suggest quick replies for a Discord direct message conversation.
Write 3 short, natural replies the user could send to the other person's latest message.
Reply in the same language and dialect, match the tone, and keep each reply under 15 words.
Return only the requested JSON object.`;

export class ReplyService {
    constructor(api, bridge, data) {
        this.api = api;
        this.bridge = bridge;
        this.data = data;
    }
    current() {
        const item = this.bridge.lastIncomingDm();
        if (!item || !this.data.value.smartReplies) return null;
        return {
            channelId: item.channel.id,
            messageId: item.message.id,
            replies: ruleReplies(item.message.content ?? "", !!item.message.attachments?.length, item.message.id)
        };
    }
    async aiReplies() {
        if (!this.data.value.smartRepliesAi) throw new Error("Smarter replies are disabled in settings.");
        const apiKey = this.data.value.anthropicApiKey.trim();
        if (!apiKey) throw new Error("Add your Claude API key in plugin settings first.");
        const current = this.current();
        if (!current) throw new Error("Open a DM with a recent incoming message first.");
        const lines = this.bridge.recentDmLines(current.channelId);
        if (!lines.length) throw new Error("No DM text is available to suggest a reply.");
        const model = this.data.value.aiModel.trim() || "claude-opus-5-5";
        const response = await this.api.Net.fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
            body: JSON.stringify({
                model, max_tokens: 1000, system: SYSTEM_PROMPT,
                output_config: { format: { type: "json_schema", schema: {
                    type: "object", properties: { replies: { type: "array", items: { type: "string" } } },
                    required: ["replies"], additionalProperties: false
                } } },
                messages: [{ role: "user", content: `Conversation (most recent last):\n${lines.map(line => `${line.mine ? "Me" : "Them"}: ${line.content}`).join("\n")}` }]
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error?.message ?? `Claude returned HTTP ${response.status}.`);
        const text = (data.content ?? []).filter(item => item.type === "text").map(item => item.text).join("");
        const replies = JSON.parse(text).replies;
        if (!Array.isArray(replies)) throw new Error("Claude returned an unexpected response.");
        return replies.filter(reply => typeof reply === "string" && reply.trim()).map(reply => reply.trim()).slice(0, 3);
    }
}
