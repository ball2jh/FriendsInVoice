/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Rule } from "./smartReplyTypes";

// Specific questions take precedence over broad topics such as work, games and links.
export const QUESTION_RULES: Rule[] = [
    {
        en: /\b(how are (you|u)|how r u|hru|how'?s it going|how have you been|what'?s up)\b/,
        ar: /كيفك|كيف حالك|شلونك|شخبارك|ازيك|عامل ايه|شو اخبارك|وش اخبارك|شكو ماكو/,
        replies: { en: ["Doing okay, how about you?", "Thanks for asking! How are you?", "How have you been?", "What’s new with you?"], ar: ["الحمد لله، وانت كيفك؟", "تسلم على سؤالك، وش أخبارك؟", "كيف أمورك؟", "وش الجديد عندك؟"], eg: ["الحمد لله، إنت عامل إيه؟", "تسلم، أخبارك إيه؟", "إيه الجديد عندك؟"], lev: ["الحمد لله، وإنت كيفك؟", "يسلمو، شو أخبارك؟", "شو جديدك؟"], iq: ["الحمد لله، شلونك إنت؟", "تسلم، شخبارك؟", "شنو أخبارك؟"] },
    },
    {
        en: /\b(what are you doing|what r u doing|wyd|what you up to|whatcha doing)\b/,
        ar: /وش تسوي|ايش تسوي|شنو تسوي|شو (عم )?(تسوي|تعمل)|بتعمل ايه|شتسوي/,
        replies: { en: ["What are you up to?", "Just checking messages, you?", "Why, what's up?", "Anything interesting going on?"], ar: ["أتصفح الرسائل، وانت؟", "وش عندك؟", "ليش، فيه شي؟", "وش أخبارك؟"], eg: ["بتصفح الرسايل، وإنت؟", "خير، في إيه؟", "إنت بتعمل إيه؟"], lev: ["عم شوف الرسائل، وإنت؟", "خير، شو في؟", "إنت شو عم تعمل؟"], iq: ["دا أشوف الرسايل، وإنت؟", "خير، شكو؟", "إنت شتسوي؟"] },
    },
    {
        en: /\b(where are you(?! from)|you there|u there|are you around|are you online)\b/,
        ar: /وينك|وين انت|فينك|انت فين|موجود|متواجد|انت هنا/,
        replies: { en: ["I'm here 👋", "Did you need something?", "What's up?", "I just saw your message"], ar: ["موجود 👋", "تحتاج شي؟", "وش فيه؟", "توني شفت رسالتك"], eg: ["موجود 👋", "محتاج حاجة؟", "لسه شايف رسالتك"], lev: ["موجود 👋", "بدك شي؟", "هلأ شفت رسالتك"], iq: ["موجود 👋", "تحتاج شي؟", "هسه شفت رسالتك"] },
    },
    {
        en: /\b(what time|when (are we|do we|is it|should we|can we)|what day|which day)\b/,
        ar: /متي|امتي|شوكت|اي وقت|اي ساعه|الساعه كم|متي (نلتقي|نتقابل)|وقتاش/,
        replies: { en: ["What time works for you?", "Let me check my schedule", "Which day did you have in mind?", "Can we decide a time later?"], ar: ["أي وقت يناسبك؟", "خليني أتأكد من وقتي", "أي يوم تقصد؟", "نحدد الوقت بعدين؟"], eg: ["إمتى يناسبك؟", "هشوف مواعيدي وأرد عليك", "تقصد يوم إيه؟"], lev: ["إيمتى بناسبك؟", "خليني شوف وقتي وبرجعلك", "أي يوم قصدك؟"], iq: ["شوكت يناسبك؟", "خلي أتأكد من وقتي وأرد عليك", "أي يوم تقصد؟"] },
    },
    {
        en: /\b(where (should|can|do|are) we|where is (it|that|the)|what (place|location|address))\b/,
        ar: /وين (نروح|نلتقي|نتقابل|المكان)|فين (نروح|نتقابل|المكان)|شو (المكان|العنوان)|اي (مكان|روم)|شنو (المكان|العنوان)/,
        replies: { en: ["Which place do you mean?", "Can you send the location?", "Where would you prefer?", "Let me check the address"], ar: ["أي مكان تقصد؟", "ممكن ترسل الموقع؟", "وين تفضل؟", "خليني أتأكد من العنوان"] },
    },
    {
        en: /\b(can|could|would|will) you (send|share|show|forward)|\b(where (is|are) (the |my )?(file|photo|picture|link|document))\b/,
        ar: /ممكن (ترسل|تبعت|تبعث|توريني)|تقدر (ترسل|تبعت)|وين (الملف|الصوره|الرابط)|فين (الملف|الصوره|اللينك)/,
        replies: { en: ["Which one do you mean?", "I can look for it", "Could you remind me which file?", "Let me check first"], ar: ["أي واحد تقصد؟", "أدور عليه وأرد عليك", "ذكّرني أي ملف؟", "خليني أتأكد أول"] },
    },
    {
        en: /\b(what do you (think|reckon)|your opinion|any thoughts|what should (i|we) do|do you recommend)\b/,
        ar: /وش رايك|ايش رايك|شو رايك|شنو رايك|رايك ايه|ايه رايك|بماذا تنصح|تنصحني بايه|وش تنصح/,
        replies: { en: ["Tell me a bit more first", "What options are you considering?", "I need more context to say", "What matters most to you?"], ar: ["قولي التفاصيل أكثر", "وش الخيارات عندك؟", "أحتاج أعرف السياق أول", "وش الأهم بالنسبة لك؟"], eg: ["قولي تفاصيل أكتر", "إيه الخيارات عندك؟", "محتاج أفهم الموضوع الأول"], lev: ["احكيلي أكتر", "شو الخيارات عندك؟", "بدي أفهم التفاصيل أول"], iq: ["احجيلي تفاصيل أكثر", "شنو الخيارات عندك؟", "أحتاج أفهم الموضوع أول"] },
    },
    {
        en: /\b(why (did|do|does|is|are|was|were|not)|how come)\b/,
        ar: /ليش|ليه|لماذا|علشان ايه|عشان ايه|ليش هيك/,
        replies: { en: ["What part do you mean?", "Can you tell me more?", "I’m not sure yet; let me think", "What happened?"], ar: ["أي جزء تقصد؟", "ممكن توضح أكثر؟", "ما أدري للحين، خليني أفكر", "وش صار؟"] },
    },
    {
        en: /\b(how (do|can|should|would) (i|we)|how does (it|this)|how to)\b/,
        ar: /كيف (اسوي|اعمل|اقدر|نقدر|يشتغل)|ازاي (اعمل|اقدر)|شلون (اسوي|اقدر)|كيفيه/,
        replies: { en: ["What are you trying to do exactly?", "Show me where you're stuck", "Can you share more details?", "Let me look into it"], ar: ["وش تحاول تسوي بالضبط؟", "ورني وين علقت", "ممكن تفاصيل أكثر؟", "خليني أراجع الموضوع"] },
    },
    {
        en: /\b(are you free|can you (talk|chat|call|join|play|meet)|want to (talk|chat|call|join|play|meet)|wanna (talk|chat|call|join|play|meet))\b/,
        ar: /فاضي|فاضيه|نقدر (نتكلم|نلعب|نتقابل)|تقدر (تتكلم|تلعب|تدخل)|بدك (نحكي|نلعب)|ممكن (نكلم|نتكلم|نلعب)/,
        replies: { en: ["What time?", "What did you have in mind?", "Can I get back to you?", "Maybe later?"], ar: ["متى؟", "وش في بالك؟", "أرد عليك بعد شوي؟", "ممكن بعدين؟"], eg: ["إمتى؟", "في بالك إيه؟", "أرد عليك بعد شوية؟"], lev: ["إيمتى؟", "شو ببالك؟", "برجعلك بعد شوي؟"], iq: ["شوكت؟", "شنو ببالك؟", "أرد عليك بعد شوية؟"] },
    },
    {
        en: /\b(what (game|movie|show|song|music|food|restaurant) (should|do|would|can)|any (game|movie|show|song|food|restaurant) (ideas|recommendations|suggestions))\b/,
        ar: /وش (نلعب|نشوف|ناكل)|ايش (نلعب|نشوف|ناكل)|شو (نلعب|نحضر|ناكل)|شنو (نلعب|نشوف|ناكل)|ترشح (لعبه|فيلم|مسلسل|مطعم)|اقتراح (لعبه|فيلم|مطعم)/,
        replies: { en: ["What are you in the mood for?", "Any preferences?", "Want to pick from a few options?", "What did you enjoy recently?"], ar: ["وش نفسك فيه؟", "عندك تفضيل معين؟", "نختار من كم خيار؟", "وش عجبك آخر مرة؟"], eg: ["نفسك في إيه؟", "عندك تفضيل معين؟", "نختار من كذا حاجة؟"], lev: ["شو عبالك؟", "عندك شي مفضل؟", "منختار من كم خيار؟"], iq: ["شنو ببالك؟", "عندك شي تفضله؟", "نختار من كم خيار؟"] },
    },
];
