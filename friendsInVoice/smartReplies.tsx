/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { insertTextIntoChatInputBox } from "@utils/discord";
import { PluginNative } from "@utils/types";
import { Channel, Message } from "@vencord/discord-types";
import { MessageStore, showToast, useMemo, UserStore, useState, useStateFromStores } from "@webpack/common";

import { settings } from ".";
import { ruleReplies } from "./smartReplyEngine";

const cl = classNameFactory("vc-fiv-");
const Native = VencordNative.pluginHelpers.FriendsInVoice as PluginNative<typeof import("./native")>;

// ---------- UI ----------

function recentLines(channelId: string) {
    const myId = UserStore.getCurrentUser()?.id;
    const messages = MessageStore.getMessages(channelId)?._array ?? [];
    return messages
        .filter(m => m.content?.trim())
        .slice(-8)
        .map(m => ({ mine: m.author?.id === myId, content: m.content.slice(0, 500) }));
}

export function SmartReplies({ message, channel }: { message: Message; channel: Channel; }) {
    const lastId = useStateFromStores([MessageStore], () => MessageStore.getLastMessage(channel.id)?.id);
    const { smartRepliesAi } = settings.use(["smartRepliesAi"]);
    const [aiReplies, setAiReplies] = useState<string[] | null>(null);
    const [loading, setLoading] = useState(false);

    const replies = useMemo(
        () => ruleReplies(message.content ?? "", (message.attachments?.length ?? 0) > 0, message.id),
        [message.content, message.attachments?.length, message.id]
    );

    // only under their latest message: once anyone writes something newer, the suggestions go away
    if (lastId !== message.id) return null;

    async function askClaude() {
        const { anthropicApiKey, aiModel } = settings.store;
        if (!anthropicApiKey.trim()) {
            showToast({ text: "Add your Claude API key in the FriendsInVoice settings first", variant: "critical" });
            return;
        }
        setLoading(true);
        try {
            const res = await Native.suggestReplies(anthropicApiKey.trim(), aiModel.trim() || "claude-opus-5-5", recentLines(channel.id));
            if (res.ok && res.replies?.length) setAiReplies(res.replies);
            else showToast({ text: res.error ?? "Claude didn't return any replies", variant: "critical" });
        } finally {
            setLoading(false);
        }
    }

    const shown = aiReplies ?? replies;

    return (
        <div className={cl("replies")}>
            <span className={cl("replies-label")}>{aiReplies ? "✨ Reply:" : "Reply:"}</span>
            {shown.map(r => (
                <span
                    key={r}
                    className={cl("reply", aiReplies && "reply-ai")}
                    title="Put this in the message box"
                    onClick={() => insertTextIntoChatInputBox(r)}
                >
                    {r}
                </span>
            ))}
            {smartRepliesAi && !aiReplies && (
                <span
                    className={cl("reply", "reply-ask")}
                    title="Ask Claude for replies that fit this message (sends recent messages in this chat to Anthropic)"
                    onClick={() => !loading && askClaude()}
                >
                    {loading ? "✨ Thinking…" : "✨ Smarter replies"}
                </span>
            )}
        </div>
    );
}
