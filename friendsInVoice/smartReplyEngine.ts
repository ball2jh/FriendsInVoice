/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { QUESTION_RULES } from "./smartReplyQuestionRules";
import { FIRST_RULES } from "./smartReplyRulesFirst";
import { SECOND_RULES } from "./smartReplyRulesSecond";
import type { Dialect, Lang, Replies, Rule } from "./smartReplyTypes";

const RULES: Rule[] = [...FIRST_RULES, ...SECOND_RULES];

const FALLBACK: Replies = {
    en: ["👍", "Okay", "Got it!", "Haha", "Alright 👌", "I see"],
    ar: ["👍", "تمام", "ماشي", "طيب", "أوكي 👌", "فاهم عليك"],
    eg: ["👍", "تمام", "ماشي", "طب", "فاهمك"],
    lev: ["👍", "تمام", "ماشي", "طيب", "فهمت عليك"],
    iq: ["👍", "تمام", "ماشي", "زين", "فهمت عليك"],
};

// distinctive words per dialect (matched against normalized text); Gulf / neutral is the default
const DIALECT_MARKERS: [Exclude<Dialect, "ar">, RegExp][] = [
    ["eg", /(^|[\s،,.!؟?])(ازيك|ازيكم|ازيكو|دلوقتي|عايز|عاوز|عايزه|ازاي|خالص|اوي|بقي|بتاع|عامل ايه|بتعمل ايه|يا عم|ياعم|امتي|كده|النهارده|هنا اهو|مفيش|معلش|طب)(?=$|[\s،,.!؟?])/],
    ["lev", /(^|[\s،,.!؟?])(هلق|منيح|منيحه|كتير|بدي|بدك|بدو|هيك|شو|عنجد|زلمه|ولك|تقبرني|مبلا|هون|منحكي|بحكي|عم)(?=$|[\s،,.!؟?])/],
    ["iq", /(^|[\s،,.!؟?])(شلونك|شلونكم|شكو|ماكو|اكو|هسه|هسا|كلش|شنو|اغاتي|يمعود|معود|شكد|شوكت|باجر|احجي|هواي|هوايه)(?=$|[\s،,.!؟?])/],
];

const isArabic = (text: string) => /[؀-ۿ]/.test(text);

// make Arabic spelling variants match the rules (أ/إ/آ -> ا, ة -> ه, ى -> ي, no tatweel)
function normalize(text: string) {
    return text
        .toLowerCase()
        .replace(/[\u064b-\u065f\u0670\u200c\u200d]/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/ـ/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

export function detectDialect(normalized: string): Dialect {
    let best: Dialect = "ar", bestScore = 0;
    for (const [dialect, re] of DIALECT_MARKERS) {
        const score = (normalized.match(new RegExp(re.source, "g")) ?? []).length;
        if (score > bestScore) [best, bestScore] = [dialect, score];
    }
    return best;
}

function repliesFor(replies: Replies, lang: Lang, dialect: Dialect) {
    if (lang === "en") return replies.en;
    return (dialect !== "ar" && replies[dialect]) || replies.ar;
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
    const lang: Lang = isArabic(content) ? "ar" : "en";
    const dialect = lang === "ar" ? detectDialect(text) : "ar";

    if (!text) return hasAttachments
        ? pick(lang === "ar" ? ["وصلتني 👀", "وش فيها؟", "شكراً على المشاركة", "بشوفها"] : ["Got it 👀", "What's in it?", "Thanks for sharing", "I'll take a look"], 3, seed)
        : pick(["❤️", "👍", "👀", "🤍"], 3, seed);

    // Bereavement must outrank questions, jokes and every other subject.
    const condolence = RULES[1];
    const match = (rule: Rule) => rule[lang]?.test(text) ?? false;
    const question = RULES.find(candidate => candidate.generic && match(candidate));
    const rule = match(condolence) ? condolence
        : QUESTION_RULES.find(match) ?? question
            ?? RULES.find(candidate => !candidate.generic && match(candidate));
    const choices = repliesFor(rule?.replies ?? FALLBACK, lang, dialect);
    return pick([...new Set(choices)], Math.min(4, choices.length), seed || text);
}
