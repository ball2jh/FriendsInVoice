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

const cl = classNameFactory("vc-fiv-");
const Native = VencordNative.pluginHelpers.FriendsInVoice as PluginNative<typeof import("./native")>;

// ---------- built-in rules ----------

interface Rule {
    en?: RegExp;
    ar?: RegExp;
    /** only used when no more specific rule matched */
    generic?: boolean;
    replies: { en: string[]; ar: string[]; };
}

// first matching rules win; replies are shown in the message's language
const RULES: Rule[] = [
    {
        ar: /السلام عليكم|سلام عليكم/,
        replies: { en: ["Wa alaikum assalam 👋"], ar: ["وعليكم السلام 👋", "وعليكم السلام ورحمة الله", "هلا والله، كيفك؟"] },
    },
    {
        en: /\b(how are (you|u)|how r u|hru|how'?s it going|wyd|what'?s up|sup)\b/,
        ar: /كيفك|كيف حالك|كيف الحال|شلونك|شخبارك|ايش اخبارك|شو اخبارك|كيف الاحوال/,
        replies: {
            en: ["I'm good, thanks! You?", "All good here 😄 How about you?", "Pretty busy, but fine!"],
            ar: ["الحمدلله تمام، وانت؟", "منيح والحمدلله، انت كيفك؟", "تمام، مشغول شوي بس 😅"],
        },
    },
    {
        en: /\b(hi+|hello|hey+|heya|yo|good (morning|evening|afternoon))\b/,
        ar: /(^|\s)(مرحبا|هلا|اهلا|هاي|هلو|صباح الخير|مساء الخير)/,
        replies: {
            en: ["Hey! 👋", "Hi, how are you?", "Hello! What's up?"],
            ar: ["هلا 👋", "أهلين، كيفك؟", "مرحبا! شو الأخبار؟"],
        },
    },
    {
        en: /\b(thanks|thank you|thx|ty|tysm|appreciate)/,
        ar: /شكرا|مشكور|يعطيك العافيه|تسلم|يسلمو|الله يعطيك/,
        replies: {
            en: ["You're welcome! 😊", "Anytime!", "No problem 👍"],
            ar: ["العفو 🙏", "الله يعافيك", "تكرم، ولا يهمك"],
        },
    },
    {
        en: /\b(sorry|my bad|apologi)/,
        ar: /اسف|سامحني|معلش|عذرا/,
        replies: {
            en: ["No worries!", "It's okay 😊", "All good!"],
            ar: ["ولا يهمك", "مسامح 😊", "عادي ما صار شي"],
        },
    },
    {
        en: /\b(vc|voice|call|join|hop on|come on)\b/,
        ar: /تعال|ادخل|روم|مكالمه|كول|نتكلم|اتصل/,
        replies: {
            en: ["Joining now!", "Give me 5 minutes", "Can't right now, maybe later?"],
            ar: ["جاي هلق!", "عطيني ٥ دقايق", "ما بقدر هلق، بعدين؟"],
        },
    },
    {
        en: /\b(bye+|gn|good ?night|see (you|ya)|cya|ttyl|later)\b/,
        ar: /باي|تصبح علي خير|مع السلامه|يلا سلام|اشوفك|نلتقي/, // rules are matched against normalized text (ى -> ي)
        replies: {
            en: ["Bye! 👋", "Good night! 🌙", "See you later!"],
            ar: ["مع السلامة 👋", "وانت من أهله 🌙", "نشوفك بعدين!"],
        },
    },
    {
        en: /\b(lol|lmao|lmfao|xd|ha(ha)+)\b|😂|🤣/,
        ar: /ههه+|😂|🤣/,
        replies: {
            en: ["😂😂", "lmao", "haha true"],
            ar: ["😂😂", "ههههههه", "والله ضحكتني 😂"],
        },
    },
    {
        en: /https?:\/\//,
        ar: /https?:\/\//,
        replies: {
            en: ["Thanks for sharing!", "Checking it out 👀", "Nice!"],
            ar: ["شكراً على الرابط!", "رح شوفه 👀", "حلو!"],
        },
    },
    {
        generic: true,
        en: /\?\s*$|^(what|when|where|why|how|who|which|can|could|do|does|did|is|are|will|would|should)\b/,
        ar: /[؟?]\s*$|(^|\s)(هل|متى|وين|ليش|كيف|شو|ايش|مين|قديش|كم)(\s|$)/,
        replies: {
            en: ["Yes 👍", "No, sorry", "Let me check and get back to you"],
            ar: ["اي 👍", "لا، للأسف", "خليني اشوف وارجعلك"],
        },
    },
];

const FALLBACK = { en: ["👍", "Okay", "Got it!"], ar: ["👍", "تمام", "ماشي"] };

const isArabic = (text: string) => /[؀-ۿ]/.test(text);

// make Arabic spelling variants match the rules (أ/إ/آ -> ا, ة -> ه, ى -> ي, no tatweel)
function normalize(text: string) {
    return text
        .toLowerCase()
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/ـ/g, "")
        .trim();
}

export function ruleReplies(content: string, hasAttachments: boolean) {
    const text = normalize(content);
    const lang = isArabic(content) ? "ar" : "en";

    if (!text) return hasAttachments ? ["😂", "Nice! 😄", "🔥"] : ["😂", "❤️", "👍"];

    const out: string[] = [];
    for (const rule of RULES) {
        const re = rule[lang];
        if (rule.generic && out.length) continue;
        if (re?.test(text)) out.push(...rule.replies[lang]);
        if (out.length >= 4) break;
    }
    if (!out.length) out.push(...FALLBACK[lang]);
    return [...new Set(out)].slice(0, 4);
}

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
        () => ruleReplies(message.content ?? "", (message.attachments?.length ?? 0) > 0),
        [message.content]
    );

    // only under their latest message: once anyone writes something newer, the suggestions go away
    if (lastId !== message.id) return null;

    async function askClaude() {
        const { anthropicApiKey, aiModel } = settings.store;
        if (!anthropicApiKey.trim()) {
            showToast("Add your Claude API key in the FriendsInVoice settings first", "failure");
            return;
        }
        setLoading(true);
        try {
            const res = await Native.suggestReplies(anthropicApiKey.trim(), aiModel.trim() || "claude-opus-5-5", recentLines(channel.id));
            if (res.ok && res.replies?.length) setAiReplies(res.replies);
            else showToast(res.error ?? "Claude didn't return any replies", "failure");
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
