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
    /** matched against normalized text: write ا not أ/إ/آ, ه not ة, ي not ى */
    ar?: RegExp;
    /** only used when no more specific rule matched */
    generic?: boolean;
    replies: { en: string[]; ar: string[]; };
}

// The first matching rules win (most specific first). Each rule shows 3 of its replies,
// picked per message so suggestions vary from message to message.
const RULES: Rule[] = [
    {
        ar: /السلام عليكم|سلام عليكم/,
        en: /\b(assalam|salam|salaam) ?(u )?alaikum\b/,
        replies: {
            en: ["Wa alaikum assalam 👋", "Wa alaikum assalam! How are you?", "Wa alaikum assalam, good to hear from you"],
            ar: ["وعليكم السلام 👋", "وعليكم السلام ورحمة الله وبركاته", "وعليكم السلام، هلا والله", "وعليكم السلام، كيفك؟", "وعليكم السلام، حياك الله"],
        },
    },
    {
        ar: /عيد ميلادي/,
        en: /\bit'?s my (birthday|bday)\b/,
        replies: {
            en: ["Happy birthday!! 🎉🎂", "Happy birthday! Have an amazing day 🥳", "HBD! 🎂 Wishing you the best"],
            ar: ["كل عام وانت بخير 🎂", "عيد ميلاد سعيد 🎉", "كل عام وانت بألف خير، عقبال المية 🥳", "يا هلا بعيد ميلادك 🎂 الله يسعدك"],
        },
    },
    {
        ar: /عيد ميلاد سعيد|ميلاد سعيد|عيد ميلادك/,
        en: /\b(happy birthday|hbd|happy bday)\b/,
        replies: {
            en: ["Thank you so much! 🥳", "Thanks!! ❤️", "Aww thank you 🥹", "Thank you, appreciate it!"],
            ar: ["الله يسلمك، شكراً 🥳", "تسلم على التهنئة ❤️", "وانت بخير يا رب 🎂", "شكراً، ما تقصر 🥹"],
        },
    },
    {
        ar: /رمضان/,
        en: /\bramadan\b/,
        replies: {
            en: ["Ramadan Mubarak! 🌙", "Ramadan Kareem to you too 🌙", "Wishing you a blessed Ramadan"],
            ar: ["رمضان كريم 🌙", "الله أكرم، وانت بخير", "رمضان مبارك عليك وعلى أهلك 🌙", "الله يبلغنا وإياك"],
        },
    },
    {
        ar: /عيد مبارك|عيدك مبارك|عيدكم مبارك|كل عام وانت|كل سنه وانت|عساكم من عواده/,
        en: /\b(eid mubarak|happy eid)\b/,
        replies: {
            en: ["Eid Mubarak! 🎉", "Eid Mubarak to you too! 🌙", "Have a blessed Eid!"],
            ar: ["وانت بخير 🎉", "عيدك مبارك 🌙", "ينعاد عليك بالخير والصحة", "الله يتقبل منا ومنكم", "من العايدين والفايزين"],
        },
    },
    {
        ar: /جمعه مباركه/,
        en: /\b(jumma|jummah|jumu'?ah) mubarak\b/,
        replies: {
            en: ["Jumu'ah Mubarak! 🤍", "Jumu'ah Mubarak to you too"],
            ar: ["جمعة مباركة عليك 🤍", "علينا وعليك", "الله يتقبل منا ومنك"],
        },
    },
    {
        ar: /مبروك|مبارك عليك|الف مبروك/,
        en: /\b(congrats|congratulations|congratz)\b/,
        replies: {
            en: ["Thank you! 🙏", "Thanks a lot! ❤️", "Appreciate it!", "Thank you, means a lot 🥹"],
            ar: ["الله يبارك فيك 🙏", "يبارك فيك، تسلم", "شكراً ❤️", "الله يبارك فيك وعقبالك"],
        },
    },
    {
        ar: /نجحت|تخرجت|توظفت|انقبلت|خبر حلو|اخبار حلوه/,
        en: /\b(i passed|i got the job|i got in|good news|i graduated|i did it)\b/,
        replies: {
            en: ["Congrats!! 🎉", "That's awesome, well deserved 👏", "So happy for you!", "Let's gooo! 🥳"],
            ar: ["مبروك! 🎉", "ألف مبروك، تستاهل 👏", "الله يبارك فيك ويوفقك", "يا سلام! فرحتلك والله 🥳"],
        },
    },
    {
        ar: /صباح الخير|صباحو|صباح النور|صباح الورد/,
        en: /\b(good morning|gm|morning)\b/,
        replies: {
            en: ["Good morning! ☀️", "Morning! How'd you sleep?", "Good morning 😊 Have a nice day"],
            ar: ["صباح النور ☀️", "صباح الورد 🌸", "صباح الخير، كيفك اليوم؟", "صباحك سعادة ☀️"],
        },
    },
    {
        ar: /مساء الخير|مسا الخير|مساء النور|مساء الورد/,
        en: /\bgood (evening|afternoon)\b/,
        replies: {
            en: ["Good evening! 🌙", "Evening! How was your day?", "Good evening 😊"],
            ar: ["مساء النور 🌙", "مساء الورد 🌸", "مساء الخير، كيف كان يومك؟"],
        },
    },
    {
        en: /\b(how are (you|u)|how r u|hru|how'?s it going|how have you been|wyd|what'?s up|whats up|sup)\b/,
        ar: /كيفك|كيف حالك|كيف الحال|شلونك|شخبارك|ايش اخبارك|شو اخبارك|وش اخبارك|كيف الاحوال|وش لونك|اخبارك/,
        replies: {
            en: ["I'm good, thanks! You?", "All good here 😄 How about you?", "Pretty busy, but fine!", "Doing great! What's up with you?", "Not bad, just chilling. You?"],
            ar: ["الحمدلله تمام، وانت؟", "بخير الحمدلله، وانت كيفك؟", "تمام، مشغول شوي بس 😅", "الحمدلله، انت وش أخبارك؟", "بخير، طمني عنك"],
        },
    },
    {
        en: /\b(hi+|hello|hey+|heya|yo|hiya|howdy)\b/,
        ar: /(^|\s)(مرحبا|مرحبتين|هلا|اهلا|هاي|هلو|يا هلا)/,
        replies: {
            en: ["Hey! 👋", "Hi, how are you?", "Hello! What's up?", "Hey hey 😄", "Hi! Good to hear from you"],
            ar: ["هلا 👋", "أهلين، كيفك؟", "هلا والله، وش أخبارك؟", "مرحبا! حياك 😄", "هلا فيك"],
        },
    },
    {
        ar: /وينك|انت فين|فينك|موجود|متواجد|صاحي/,
        en: /\b(where are you|you there|u there|are you around|you up|are you online)\b/,
        replies: {
            en: ["I'm here, what's up?", "Yep, here! 👋", "Here, tell me", "Just saw this, what's up?"],
            ar: ["موجود، تفضل", "هنا، وش تبي؟", "معك، قول", "توني شفت رسالتك، آمر"],
        },
    },
    {
        ar: /اشتقتلك|اشتقت لك|وحشتني|مشتاقلك|توحشني|اشتقنا/,
        en: /\b(miss (you|u|ya)|missed (you|u))\b/,
        replies: {
            en: ["Miss you too! ❤️", "Aww, miss you more 🥺", "Same here! We should catch up"],
            ar: ["وانا أكثر ❤️", "والله وانا اشتقتلك", "وحشتني أكثر 🥺", "لازم نشوفك قريب"],
        },
    },
    {
        ar: /احبك/,
        en: /\b(love (you|u|ya)|ily)\b/,
        replies: {
            en: ["Love you too ❤️", "❤️❤️", "Aww 🥹❤️"],
            ar: ["وانا أكثر ❤️", "❤️❤️", "يا عمري 🥹"],
        },
    },
    {
        ar: /شكرا|مشكور|يعطيك العافيه|تسلم|يسلمو|الله يعطيك|ما قصرت|جزاك الله/,
        en: /\b(thanks|thank you|thx|ty|tysm|appreciate it)\b/,
        replies: {
            en: ["You're welcome! 😊", "Anytime!", "No problem 👍", "Happy to help!", "Of course 🙌"],
            ar: ["العفو 🙏", "الله يعافيك", "تكرم، ولا يهمك", "ما سويت شي 😊", "بالخدمة دايماً"],
        },
    },
    {
        en: /\b(sorry|my bad|apologi[sz]e)\b/,
        ar: /اسف|سامحني|معلش|معليش|عذرا|المعذره/,
        replies: {
            en: ["No worries!", "It's okay 😊", "All good!", "Don't worry about it"],
            ar: ["ولا يهمك", "مسامح 😊", "عادي ما صار شي", "لا تشيل هم"],
        },
    },
    {
        en: /\b(vc|voice|call|join|hop on|come on|get on)\b/,
        ar: /تعال|ادخل|روم|مكالمه|كول|نتكلم|نسولف|اتصل|ديسكورد/,
        replies: {
            en: ["Joining now!", "Give me 5 minutes", "Can't right now, maybe later?", "On my way 🏃", "Sure, which channel?"],
            ar: ["جاي الحين!", "أعطني ٥ دقايق", "ما أقدر الحين، بعدين؟", "دقيقة وأدخل 🏃", "أي روم؟"],
        },
    },
    {
        en: /\b(play|game|gaming|match|ranked|lobby)\b/,
        ar: /نلعب|تلعب|قيم|جيم|بابجي|فورت|ماين|فالو|روكيت/,
        replies: {
            en: ["Let's go! 🎮", "Down, give me 5 min", "Not right now, later?", "What are we playing?", "I'm in 🎮"],
            ar: ["يلا، جاي 🎮", "أعطني شوي وأبدأ", "مو الحين، بعدين؟", "وش نلعب؟", "معك 🎮"],
        },
    },
    {
        en: /\b(busy|brb|one sec|1 sec|wait|hold on|give me a (sec|min|minute))\b/,
        ar: /مشغول|بعدين|لحظه|ثواني|دقيقه|انتظر|استنى/,
        replies: {
            en: ["Take your time 👍", "No rush!", "Sure, I'll wait", "Okay, ping me when you're free"],
            ar: ["خذ راحتك 👍", "تمام، أنتظرك", "ولا يهمك", "تمام، كلمني لما تفضى"],
        },
    },
    {
        en: /\b(tired|sick|sad|upset|exhausted|not feeling well|depressed)\b/,
        ar: /تعبان|مريض|زعلان|حزين|مضايق|مخنوق|مصدع/,
        replies: {
            en: ["Feel better soon 🤍", "Oh no, what happened?", "Get some rest!", "I'm here if you want to talk"],
            ar: ["سلامتك 🤍", "الله يشفيك، ارتاح", "وش فيك؟ قولي", "ما تشوف شر", "أنا موجود لو تبي تسولف"],
        },
    },
    {
        en: /\b(bored|boring)\b/,
        ar: /طفشان|طفش|زهقان|ملل|مليت/,
        replies: {
            en: ["Same 😅 wanna play something?", "Hop in voice, let's talk", "Let's do something!"],
            ar: ["وانا والله 😅 نلعب شي؟", "تعال الروم نسولف", "يلا نسوي شي!"],
        },
    },
    {
        en: /\b(sleep|sleeping|going to bed|sleepy|gonna sleep)\b/,
        ar: /نايم|بنام|رايح انام|نعسان|بروح انام/,
        replies: {
            en: ["Sleep well! 😴", "Good night 🌙", "Get some rest, talk tomorrow"],
            ar: ["نوم العوافي 😴", "تصبح على خير 🌙", "روح نام، نكمل بكرة"],
        },
    },
    {
        en: /\b(bye+|gn|good ?night|see (you|ya)|cya|ttyl|later|take care)\b/,
        ar: /باي|تصبح علي خير|مع السلامه|يلا سلام|اشوفك|نلتقي|في امان الله/,
        replies: {
            en: ["Bye! 👋", "Good night! 🌙", "See you later!", "Take care! 🤍", "Talk soon!"],
            ar: ["مع السلامة 👋", "وانت من أهله 🌙", "نشوفك بعدين!", "في أمان الله 🤍", "الله يحفظك"],
        },
    },
    {
        ar: /ان شاء الله|انشالله|انشاءالله|انشاالله/,
        en: /\b(inshallah|insha'?allah)\b/,
        replies: {
            en: ["Inshallah 🤲", "Ameen", "Hopefully!"],
            ar: ["إن شاء الله 🤲", "يا رب", "الله يكتب اللي فيه الخير"],
        },
    },
    {
        en: /\b(lol|lmao|lmfao|xd|ha(ha)+|rofl)\b|😂|🤣/,
        ar: /ههه+|خخخ+|😂|🤣/,
        replies: {
            en: ["😂😂", "lmao", "haha true", "💀💀", "I'm dead 😂"],
            ar: ["😂😂", "هههههههه", "والله ضحكتني 😂", "💀💀", "ههههه مو طبيعي"],
        },
    },
    {
        en: /\b(nice|cool|awesome|amazing|great|beautiful|perfect|fire|insane)\b|🔥|😍/,
        ar: /حلو|روعه|جميل|خرافي|كفو|يجنن|ابداع|رهيب|فخم/,
        replies: {
            en: ["Thanks! 😄", "Glad you like it!", "🔥🔥", "Right?! 😄"],
            ar: ["شكراً ❤️", "تسلم 😄", "كفو والله", "صح؟ 😄", "عيونك الحلوة"],
        },
    },
    {
        en: /https?:\/\//,
        ar: /https?:\/\//,
        replies: {
            en: ["Thanks for sharing!", "Checking it out 👀", "Nice!", "Oh I'll watch it later"],
            ar: ["شكراً على الرابط!", "بشوفه 👀", "حلو!", "بشوفه بعدين إن شاء الله"],
        },
    },
    {
        en: /^(ok|okay|k|kk|sure|alright|true|yes|yep|yeah|yup|bet|deal|fine)\b/,
        ar: /^(تمام|اوكي|اوك|طيب|ماشي|اكيد|صح|زين|ابشر|خلاص|اوكيه|تم)/,
        replies: {
            en: ["👍", "Great!", "Deal 🤝", "Perfect 👌"],
            ar: ["👍", "تمام 👌", "اتفقنا", "حلو 👌"],
        },
    },
    {
        en: /^(no|nah|nope|can'?t|cannot)\b/,
        ar: /^(لا|لاء|مستحيل|ما اقدر|مو)(\s|$)/,
        replies: {
            en: ["No worries!", "Alright, maybe later", "Okay 👍"],
            ar: ["تمام، ولا يهمك", "خلاص براحتك", "أوكي، بعدين؟"],
        },
    },
    {
        generic: true,
        en: /\?\s*$|^(what|when|where|why|how|who|which|can|could|do|does|did|is|are|will|would|should)\b/,
        ar: /[؟?]\s*$|(^|\s)(هل|متى|وين|ليش|كيف|شو|ايش|وش|مين|قديش|كم)(\s|$)/,
        replies: {
            en: ["Yes 👍", "No, sorry", "Let me check and get back to you", "Hmm, not sure", "Good question 🤔"],
            ar: ["ايه 👍", "لا، للأسف", "خلني أشوف وأرد عليك", "والله ما أدري", "سؤال حلو 🤔"],
        },
    },
];

const FALLBACK = {
    en: ["👍", "Okay", "Got it!", "Haha", "Alright 👌"],
    ar: ["👍", "تمام", "ماشي", "طيب", "أوكي 👌"],
};

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

// small deterministic pick, so one message keeps the same suggestions but different messages vary
function pick(list: string[], count: number, seed: string) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    const arr = [...list];
    for (let i = arr.length - 1; i > 0; i--) {
        h = Math.imul(h ^ i, 16777619);
        const j = (h >>> 0) % (i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, count);
}

export function ruleReplies(content: string, hasAttachments: boolean, seed = "") {
    const text = normalize(content);
    const lang = isArabic(content) ? "ar" : "en";

    if (!text) return hasAttachments ? pick(["😂", "Nice! 😄", "🔥", "😍", "Haha"], 3, seed) : pick(["😂", "❤️", "👍", "🔥"], 3, seed);

    const out: string[] = [];
    for (const rule of RULES) {
        if (rule.generic && out.length) continue;
        const re = rule[lang];
        if (re?.test(text)) out.push(...pick(rule.replies[lang], 3, seed + out.length));
        if (out.length >= 4) break;
    }
    if (!out.length) out.push(...pick(FALLBACK[lang], 3, seed));
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
        () => ruleReplies(message.content ?? "", (message.attachments?.length ?? 0) > 0, message.id),
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
