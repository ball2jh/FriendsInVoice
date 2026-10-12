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

type Lang = "en" | "ar";
type Dialect = "ar" | "eg" | "lev" | "iq";

interface Replies {
    en: string[];
    /** Gulf / neutral Arabic, used when no other dialect is detected or has no list of its own */
    ar: string[];
    /** Egyptian */
    eg?: string[];
    /** Levantine (Syria, Lebanon, Jordan, Palestine) */
    lev?: string[];
    /** Iraqi */
    iq?: string[];
}

interface Rule {
    en?: RegExp;
    /** matched against normalized text: write ا not أ/إ/آ, ه not ة, ي not ى */
    ar?: RegExp;
    /** only used when no more specific rule matched */
    generic?: boolean;
    replies: Replies;
}

// The first matching rules win (most specific first). Each rule shows 3 of its replies,
// picked per message so suggestions vary from message to message.
const RULES: Rule[] = [
    {
        en: /^(❤️|🤍|💙|💜|💚|🖤|♥️|😘|🥰|\s)+$/,
        ar: /^(❤️|🤍|💙|💜|💚|🖤|♥️|😘|🥰|\s)+$/,
        replies: { en: ["❤️", "🤍", "🥹❤️", "💙"], ar: ["❤️", "🤍", "🥹❤️", "💙"] },
    },
    {
        // condolences come first so nothing light-hearted is ever suggested
        ar: /الله يرحمه|الله يرحمها|الله يرحمهم|(^|\s)(توفي|توفيت|توفت|مات|ماتت)(\s|$)|عظم الله|البقاء لله|انا لله وانا اليه راجعون|انتقل الي رحمه/,
        en: /\b(passed away|died|rip|condolences|funeral)\b/,
        replies: {
            en: ["I'm so sorry for your loss 🤍", "May they rest in peace", "My deepest condolences", "I'm here if you need anything 🤍", "Sending you strength"],
            ar: ["الله يرحمه ويغفر له 🤍", "عظم الله أجركم وأحسن عزاكم", "إنا لله وإنا إليه راجعون", "الله يصبركم ويجبر قلوبكم", "البقاء لله 🤍", "الله يجعل مثواه الجنة"],
            eg: ["البقاء لله 🤍", "ربنا يرحمه ويصبركم", "إنا لله وإنا إليه راجعون", "شد حيلك، ربنا يصبرك", "ربنا يجعلها آخر الأحزان"],
            lev: ["الله يرحمه 🤍", "الله يصبركن", "إنا لله وإنا إليه راجعون", "العوض بسلامتك", "البقية بحياتك"],
            iq: ["الله يرحمه 🤍", "عظم الله أجركم", "إنا لله وإنا إليه راجعون", "الله يصبركم", "البقية بحياتكم"],
        },
    },
    {
        ar: /السلام عليكم|سلام عليكم/,
        en: /\b(assalam|salam|salaam) ?(u )?alaikum\b/,
        replies: {
            en: ["Wa alaikum assalam 👋", "Wa alaikum assalam! How are you?", "Wa alaikum assalam, good to hear from you"],
            ar: ["وعليكم السلام 👋", "وعليكم السلام ورحمة الله وبركاته", "وعليكم السلام، هلا والله", "وعليكم السلام، كيفك؟", "وعليكم السلام، حياك الله", "وعليكم السلام، يا هلا"],
            eg: ["وعليكم السلام 👋", "وعليكم السلام ورحمة الله", "وعليكم السلام، إزيك؟", "وعليكم السلام، منور 😄"],
            lev: ["وعليكم السلام 👋", "وعليكم السلام ورحمة الله", "وعليكم السلام، كيفك؟", "وعليكم السلام، أهلين"],
            iq: ["وعليكم السلام 👋", "وعليكم السلام ورحمة الله", "وعليكم السلام، شلونك؟", "وعليكم السلام، هلا بيك"],
        },
    },
    {
        ar: /عيد ميلادي/,
        en: /\bit'?s my (birthday|bday)\b/,
        replies: {
            en: ["Happy birthday!! 🎉🎂", "Happy birthday! Have an amazing day 🥳", "HBD! 🎂 Wishing you the best", "Happy birthday! Many happy returns 🎈"],
            ar: ["كل عام وانت بخير 🎂", "عيد ميلاد سعيد 🎉", "كل عام وانت بألف خير، عقبال المية 🥳", "يا هلا بعيد ميلادك 🎂 الله يسعدك", "عساك من عواده 🎈"],
            eg: ["كل سنة وانت طيب 🎂", "عيد ميلاد سعيد 🎉", "كل سنة وانت طيب يا باشا، عقبال ١٠٠ سنة 🥳"],
            lev: ["كل عام وانت بخير 🎂", "عيد ميلاد سعيد 🎉", "كل سنة وانت سالم، عقبال المية 🥳"],
            iq: ["كل عام وانت بخير 🎂", "عيد ميلاد سعيد 🎉", "عيد ميلاد سعيد عيني، عقبال المية 🥳"],
        },
    },
    {
        ar: /عيد ميلاد سعيد|ميلاد سعيد|عيد ميلادك/,
        en: /\b(happy birthday|hbd|happy bday)\b/,
        replies: {
            en: ["Thank you so much! 🥳", "Thanks!! ❤️", "Aww thank you 🥹", "Thank you, appreciate it!", "You're the best, thanks! 🎂"],
            ar: ["الله يسلمك، شكراً 🥳", "تسلم على التهنئة ❤️", "وانت بخير يا رب 🎂", "شكراً، ما تقصر 🥹", "الله يسعدك، تسلم"],
            eg: ["ميرسي أوي 🥳", "تسلم يا حبيبي ❤️", "وانت طيب 🎂", "ربنا يخليك 🥹"],
            lev: ["يسلمو كتير 🥳", "تسلم ❤️", "وانت بخير 🎂", "الله يخليك 🥹"],
            iq: ["تسلم عيني 🥳", "الله يخليك ❤️", "وانت بخير 🎂", "تسلملي 🥹"],
        },
    },
    {
        ar: /رمضان/,
        en: /\bramadan\b/,
        replies: {
            en: ["Ramadan Mubarak! 🌙", "Ramadan Kareem to you too 🌙", "Wishing you a blessed Ramadan", "May Allah accept your fasting 🤲"],
            ar: ["رمضان كريم 🌙", "الله أكرم، وانت بخير", "رمضان مبارك عليك وعلى أهلك 🌙", "الله يبلغنا وإياك", "علينا وعليك يتم بخير"],
            eg: ["رمضان كريم 🌙", "الله أكرم", "كل سنة وانت طيب 🌙"],
            lev: ["رمضان كريم 🌙", "الله أكرم", "كل عام وانت بخير 🌙"],
            iq: ["رمضان كريم 🌙", "الله أكرم", "شهر مبارك عليك 🌙"],
        },
    },
    {
        ar: /عيد مبارك|عيدك مبارك|عيدكم مبارك|كل عام وانت|كل سنه وانت|عساكم من عواده|عيد سعيد/,
        en: /\b(eid mubarak|happy eid)\b/,
        replies: {
            en: ["Eid Mubarak! 🎉", "Eid Mubarak to you too! 🌙", "Have a blessed Eid!", "Eid Mubarak to you and your family 🤍"],
            ar: ["وانت بخير 🎉", "عيدك مبارك 🌙", "ينعاد عليك بالخير والصحة", "الله يتقبل منا ومنكم", "من العايدين والفايزين", "وانت من أهله، عساك من عواده"],
            eg: ["وانت طيب 🎉", "كل سنة وانت طيب", "عيد سعيد عليك وعلى أهلك 🌙"],
            lev: ["وانت بخير 🎉", "ينعاد عليك 🌙", "كل عام وانت بخير"],
            iq: ["وانت بخير 🎉", "أيامك سعيدة 🌙", "عيد سعيد عليك وعلى أهلك"],
        },
    },
    {
        ar: /جمعه مباركه/,
        en: /\b(jumma|jummah|jumu'?ah) mubarak\b/,
        replies: {
            en: ["Jumu'ah Mubarak! 🤍", "Jumu'ah Mubarak to you too", "May Allah bless your Friday 🤲"],
            ar: ["جمعة مباركة عليك 🤍", "علينا وعليك", "الله يتقبل منا ومنك", "جمعة مباركة، الله يسعدك"],
        },
    },
    {
        ar: /مبروك|مبارك عليك|الف مبروك/,
        en: /\b(congrats|congratulations|congratz)\b/,
        replies: {
            en: ["Thank you! 🙏", "Thanks a lot! ❤️", "Appreciate it!", "Thank you, means a lot 🥹", "Thanks so much! 🎉"],
            ar: ["الله يبارك فيك 🙏", "يبارك فيك، تسلم", "شكراً ❤️", "الله يبارك فيك وعقبالك", "تسلم، الله يسعدك"],
            eg: ["الله يبارك فيك 🙏", "ميرسي أوي ❤️", "عقبالك يا رب", "تسلم يا حبيبي"],
            lev: ["الله يبارك فيك 🙏", "يسلمو ❤️", "عقبالك", "تسلم كتير"],
            iq: ["الله يبارك بيك 🙏", "تسلم عيني ❤️", "عقبالك", "الله يخليك"],
        },
    },
    {
        ar: /نجحت|تخرجت|توظفت|انقبلت|خبر حلو|اخبار حلوه|تعينت/,
        en: /\b(i passed|i got the job|i got in|good news|i graduated|i did it)\b/,
        replies: {
            en: ["Congrats!! 🎉", "That's awesome, well deserved 👏", "So happy for you!", "Let's gooo! 🥳", "Proud of you! 💪"],
            ar: ["مبروك! 🎉", "ألف مبروك، تستاهل 👏", "الله يبارك فيك ويوفقك", "يا سلام! فرحتلك والله 🥳", "كفو! تستاهل كل خير 💪"],
            eg: ["مبروك! 🎉", "ألف مبروك، تستاهل 👏", "الله ينور يا باشا 🥳", "فرحتلك أوي"],
            lev: ["مبروك! 🎉", "ألف مبروك، بتستاهل 👏", "يا سلام! انبسطتلك كتير 🥳", "الله يوفقك"],
            iq: ["مبروك! 🎉", "ألف مبروك، تستاهل 👏", "فرحتلي كلش 🥳", "الله يوفقك عيني"],
        },
    },
    {
        ar: /صباح الخير|صباحو|صباح النور|صباح الورد|صباح الفل/,
        en: /\b(good morning|gm|morning)\b/,
        replies: {
            en: ["Good morning! ☀️", "Morning! How'd you sleep?", "Good morning 😊 Have a nice day", "Morning! ☕"],
            ar: ["صباح النور ☀️", "صباح الورد 🌸", "صباح الخير، كيفك اليوم؟", "صباحك سعادة ☀️", "صباح الخيرات"],
            eg: ["صباح النور ☀️", "صباح الفل 🌸", "صباح الخير، عامل إيه النهارده؟"],
            lev: ["صباح النور ☀️", "صباح الورد 🌸", "صباحو، كيفك اليوم؟"],
            iq: ["صباح النور ☀️", "صباح الورد 🌸", "صباح الخير، شلونك اليوم؟"],
        },
    },
    {
        ar: /مساء الخير|مسا الخير|مساء النور|مساء الورد|مساء الفل/,
        en: /\bgood (evening|afternoon)\b/,
        replies: {
            en: ["Good evening! 🌙", "Evening! How was your day?", "Good evening 😊"],
            ar: ["مساء النور 🌙", "مساء الورد 🌸", "مساء الخير، كيف كان يومك؟", "مساء الخيرات"],
            eg: ["مساء النور 🌙", "مساء الفل 🌸", "مساء الخير، يومك كان عامل إيه؟"],
            lev: ["مساء النور 🌙", "مساء الورد 🌸", "مسا الخير، كيف كان نهارك؟"],
            iq: ["مساء النور 🌙", "مساء الورد 🌸", "مساء الخير، شلون كان يومك؟"],
        },
    },
    {
        ar: /وش تسوي|ايش تسوي|شنو تسوي|شو تسوي|وش تعمل|ايش تعمل|شو تعمل|شو عم تعمل|شو بتعمل|شو عم تساوي|بتعمل ايه|بتعملي ايه|شتسوي|شدتسوي|وش قاعد تسوي|شنو دتسوي/,
        en: /\b(what are you doing|what r u doing|wyd|what you up to|whatcha doing)\b/,
        replies: {
            en: ["Nothing much, you?", "Just gaming 🎮", "Working a bit", "Just chilling 😅", "Bored, honestly 😂"],
            ar: ["ولا شي، انت؟", "قاعد ألعب 🎮", "أشتغل شوي", "منسدح بس 😅", "ولا شي، طفشان", "أتابع شي، وانت؟"],
            eg: ["ولا حاجة، إنت؟", "بلعب 🎮", "بشتغل شوية", "قاعد كده 😅", "زهقان والله"],
            lev: ["ولا شي، انت؟", "عم إلعب 🎮", "عم إشتغل شوي", "قاعد هيك 😅", "ضجران والله"],
            iq: ["ولا شي، انت؟", "دا ألعب 🎮", "دا أشتغل شوية", "كاعد بس 😅", "ضايج والله"],
        },
    },
    {
        // only when they're complimenting it, so "send your photo" isn't mistaken for praise
        ar: /(صورتك|بروفايلك|افتارك|البروفايل|الافتار|صوره البروفايل).{0,15}(حلو|حلوه|روعه|جميل|جميله|تجنن|كيوت|خرافي)|(حلو|حلوه|روعه|جميل|جميله|تجنن|كيوت|خرافي).{0,15}(صورتك|بروفايلك|افتارك|البروفايل|الافتار)/,
        en: /\b(nice|cool|cute|love|great|sick|fire) (pfp|profile pic|profile picture|avatar)\b|\byour (pfp|avatar|profile pic)\b.{0,15}\b(nice|cool|cute|great|fire)\b/,
        replies: {
            en: ["Thanks! 😄", "Haha thank you, yours is cool too", "Glad you like it!", "Thanks, took me ages to pick 😂"],
            ar: ["تسلم 😄 عيونك الحلوة", "شكراً، صورتك أحلى", "حلوة؟ 😄", "تسلم، اخترتها من زمان", "الله يسلمك ❤️"],
            eg: ["ميرسي 😄", "تسلم، صورتك أحلى", "حلوة؟ 😄"],
            lev: ["يسلمو 😄", "تسلم، صورتك أحلى", "حلوة؟ 😄"],
            iq: ["تسلم عيني 😄", "صورتك أحلى", "حلوة؟ 😄"],
        },
    },
    {
        ar: /سهران|ما نمت|مو نايم|ما جاني نوم|ما جاني النوم|لسه صاحي|صاحي للحين|صاحي لهلق|مش جايلي نوم/,
        en: /\b(can'?t sleep|still up|still awake|staying up|up late|insomnia)\b/,
        replies: {
            en: ["Same, can't sleep either 😅", "Go to sleep, it's late!", "What's keeping you up?", "Night owls 🌙"],
            ar: ["وانا سهران بعد 😅", "نام يا رجال، الوقت متأخر", "وش مسهرك؟", "سهرانين سوا 🌙", "روح نام، بكرة عندك يوم"],
            eg: ["وانا سهران كمان 😅", "نام يا عم الوقت اتأخر", "إيه اللي مسهرك؟"],
            lev: ["وانا سهران كمان 😅", "نام يا زلمة صار الوقت متأخر", "شو مسهرك؟"],
            iq: ["وانا هم سهران 😅", "نام يمعود صار متأخر", "شمسهرك؟"],
        },
    },
    {
        ar: /ساعدني|تساعدني|ممكن تساعد|محتاج مساعده|ابي مساعده|ابغي مساعده|فزعتك|فزعه|ممكن خدمه|عندي طلب|عايز مساعده|بدي مساعده|اريد مساعده/,
        en: /\b(help me|can you help|could you help|need (your |some )?help|a favou?r|do me a favou?r)\b/,
        replies: {
            en: ["Sure, what do you need?", "Of course, tell me", "Happy to help, what's up?", "Yeah, what's going on?"],
            ar: ["أكيد، وش تحتاج؟", "تامر، قول", "إن شاء الله، وش السالفة؟", "حاضر، بس قولي وش المطلوب", "أبشر، وش عندك؟"],
            eg: ["أكيد، محتاج إيه؟", "تحت أمرك، قول", "طبعاً، في إيه؟"],
            lev: ["أكيد، شو بدك؟", "تكرم، احكي", "أكيد، شو القصة؟"],
            iq: ["أكيد، شتحتاج؟", "تامر، كول", "أكيد، شنو السالفة؟"],
        },
    },
    {
        ar: /سلفني|اقرضني|فلوس|مصاري|محتاج مبلغ|عندك مبلغ|رجعلي فلوسي|دينك/,
        en: /\b(lend me|borrow|money|cash|pay me back|you owe me)\b/,
        replies: {
            en: ["How much do you need?", "I'm broke right now 😅", "Let me see what I can do", "Sure, just pay me back 😄"],
            ar: ["كم تحتاج؟", "والله ما معي الحين 😅", "خلني أشوف وأرد عليك", "أبشر، بس لا تنسى 😄"],
            eg: ["محتاج كام؟", "والله مفلس دلوقتي 😅", "هشوف وأرد عليك"],
            lev: ["قديش بدك؟", "والله مفلس هلق 😅", "خليني شوف وبرجعلك"],
            iq: ["شكد تحتاج؟", "والله ماعندي هسه 😅", "خلي أشوف وأرد عليك"],
        },
    },
    {
        ar: /مباراه|ماتش|الدوري|ريال مدريد|برشلونه|الهلال|النصر|الاتحاد|الاهلي|الزمالك|ميسي|رونالدو|كوره|كره القدم|كاس العالم|هاتريك/,
        en: /\b(football|soccer|goal|messi|ronaldo|madrid|barca|premier league|champions league|world cup|hat ?trick)\b/,
        replies: {
            en: ["Did you watch the match? 🔥", "Who do you support? ⚽", "That game was crazy!", "Facts 🐐", "Football is life ⚽"],
            ar: ["شفت المباراة؟ 🔥", "مين تشجع؟ ⚽", "والله كانت مباراة نار", "أسطورة فعلاً 🐐", "صدقت ⚽", "يا شيخ لا تذكرني 😂"],
            eg: ["شفت الماتش؟ 🔥", "بتشجع مين؟ ⚽", "الماتش كان نار", "أسطورة فعلاً 🐐"],
            lev: ["شفت الماتش؟ 🔥", "مين بتشجع؟ ⚽", "كان ماتش نار", "أسطورة عنجد 🐐"],
            iq: ["شفت المباراة؟ 🔥", "منو تشجع؟ ⚽", "كانت مباراة نار", "أسطورة صدك 🐐"],
        },
    },
    {
        ar: /فلم|فيلم|مسلسل|انمي|نتفلكس|حلقه|سيزون|الموسم الجديد/,
        en: /\b(movie|film|series|episode|season|netflix|anime)\b/,
        replies: {
            en: ["What's it called? 🍿", "Is it good?", "No spoilers! 😂", "I loved that one!", "Wanna watch it together?"],
            ar: ["وش اسمه؟ 🍿", "يستاهل؟", "شفته! خرافي", "لا تحرقه علي 😂", "نشوفه سوا؟"],
            eg: ["اسمه إيه؟ 🍿", "حلو؟", "متحرقوش عليا 😂", "نتفرج عليه سوا؟"],
            lev: ["شو اسمو؟ 🍿", "حلو؟", "لا تحرقلي ياه 😂", "منحضرو سوا؟"],
            iq: ["شنو اسمه؟ 🍿", "يستاهل؟", "لا تحركه علي 😂", "نشوفه سوا؟"],
        },
    },
    {
        ar: /اغنيه|اغاني|موسيقي|سبوتيفاي|شيله|البوم/,
        en: /\b(song|music|spotify|playlist|album|listen to this)\b/,
        replies: {
            en: ["Banger! 🎧", "What's it called?", "Send it to me", "Good taste 🎶", "On repeat now 😄"],
            ar: ["حلوة! 🎧", "وش اسمها؟", "أرسلها لي", "ذوقك حلو 🎶", "صارت على التكرار 😄"],
            eg: ["حلوة أوي 🎧", "اسمها إيه؟", "ابعتهالي", "ذوقك حلو 🎶"],
            lev: ["حلوة كتير 🎧", "شو اسمها؟", "ابعتلي ياها", "ذوقك حلو 🎶"],
            iq: ["حلوة كلش 🎧", "شنو اسمها؟", "دزها إلي", "ذوقك حلو 🎶"],
        },
    },
    {
        ar: /(^|\s)(حر|حار|الحر|حراره|رطوبه|شوب|نار)(\s|$|[؟?!.,])/,
        en: /\b(so hot|hot today|heatwave|boiling|burning up|sweating)\b/,
        replies: {
            en: ["Right?! It's boiling 🥵", "Stay cool out there 🥵", "AC on full blast 😂", "Drink lots of water!"],
            ar: ["صدق والله، نار 🥵", "الله يعين على الحر", "المكيف على الآخر 😂", "خلنا بالبيت أحسن", "اشرب موية كثير"],
            eg: ["فعلاً الجو نار 🥵", "ربنا يعين على الحر", "التكييف على الآخر 😂"],
            lev: ["عنجد شوب 🥵", "الله يعين عالحر", "المكيف عالآخر 😂"],
            iq: ["صدك نار 🥵", "الله يعين على الحر", "المبردة على الآخر 😂"],
        },
    },
    {
        ar: /(^|\s)(برد|البرد|بارد|مطر|المطر|امطار|ثلج|سقعه|صقيع)(\s|$|[؟?!.,])/,
        en: /\b(so cold|freezing|raining|rain|snow|snowing|chilly|stormy)\b/,
        replies: {
            en: ["Stay warm! ❄️", "Perfect weather to stay in 😂", "Love this weather ☁️", "Grab a blanket 🧣"],
            ar: ["تدفى زين ❄️", "أحلى جو للبيت 😂", "الله يعطينا خيره ☁️", "جو شاهي وبطانية 🧣", "أحب هالجو"],
            eg: ["اتدفى كويس ❄️", "أحلى جو للبيت 😂", "جو شاي وبطانية 🧣"],
            lev: ["تدفى منيح ❄️", "أحلى طقس للبيت 😂", "طقس شاي وحرام 🧣"],
            iq: ["تدفى زين ❄️", "أحلى جو للبيت 😂", "جو جاي وبطانية 🧣"],
        },
    },
    {
        ar: /(^|\s)(الجو|الطقس|غبار|عاصفه)(\s|$|[؟?!.,])/,
        en: /\b(weather|sunny|windy|dusty)\b/,
        replies: {
            en: ["Right? 😅", "The weather's been weird lately", "Hope it gets better!"],
            ar: ["صدق والله 😅", "الجو هالأيام غريب", "الله يعطينا خيره", "إن شاء الله يتحسن"],
            eg: ["فعلاً 😅", "الجو غريب اليومين دول", "ربنا يستر"],
            lev: ["عنجد 😅", "الطقس غريب هالأيام", "الله يستر"],
            iq: ["صدك 😅", "الجو غريب هالأيام", "الله يستر"],
        },
    },
    {
        ar: /مسافر|بسافر|السفر|سفره|المطار|طياره|رحله|اجازه|عطله/,
        en: /\b(travel|traveling|travelling|trip|vacation|holiday|flight|airport)\b/,
        replies: {
            en: ["Safe travels! ✈️", "Where are you going?", "Have fun! 🌴", "Bring me something back 😂"],
            ar: ["الله يوصلك بالسلامة ✈️", "وين رايح؟", "استمتع! 🌴", "لا تنسانا من الهدايا 😂", "تروح وترجع بالسلامة"],
            eg: ["توصل بالسلامة ✈️", "رايح فين؟", "انبسط! 🌴", "متنساش الهدايا 😂"],
            lev: ["توصل بالسلامة ✈️", "لوين رايح؟", "انبسط! 🌴", "لا تنسانا من الهدايا 😂"],
            iq: ["توصل بالسلامة ✈️", "وين رايح؟", "استانس! 🌴", "لا تنسانا من الهدايا 😂"],
        },
    },
    {
        ar: /الويكند|الويك اند|نهايه الاسبوع|عندك شي|وش عندك بكره|فاضي|فاضيه|عندك وقت|انت فاضي/,
        en: /\b(weekend|any plans|plans (for|tonight|tomorrow)|are you free|you free|free (today|tonight|tomorrow))\b/,
        replies: {
            en: ["I'm free, what's up?", "Kinda busy, maybe later?", "Nothing planned, wanna hang out?", "Depends, why?"],
            ar: ["والله فاضي، وش عندك؟", "عندي شغلات، بعدين؟", "ما عندي شي، نطلع؟", "على حسب، ليش؟"],
            eg: ["فاضي، عندك إيه؟", "مشغول شوية، بعدين؟", "ولا حاجة، نخرج؟", "على حسب، ليه؟"],
            lev: ["فاضي، شو عندك؟", "مشغول شوي، بعدين؟", "ما عندي شي، منطلع؟", "حسب، ليش؟"],
            iq: ["فارغ، شعندك؟", "مشغول شوية، بعدين؟", "ماعندي شي، نطلع؟", "حسب، ليش؟"],
        },
    },
    {
        en: /\b(how are (you|u)|how r u|hru|how'?s it going|how have you been|what'?s up|whats up|sup)\b/,
        ar: /كيفك|كيف حالك|كيف الحال|شلونك|شلونكم|شخبارك|ايش اخبارك|شو اخبارك|وش اخبارك|كيف الاحوال|وش لونك|اخبارك|ازيك|ازيكم|عامل ايه|عامله ايه|شكو ماكو|كيفكم/,
        replies: {
            en: ["I'm good, thanks! You?", "All good here 😄 How about you?", "Pretty busy, but fine!", "Doing great! What's up with you?", "Not bad, just chilling. You?", "Can't complain! You?"],
            ar: ["الحمدلله تمام، وانت؟", "بخير الحمدلله، وانت كيفك؟", "تمام، مشغول شوي بس 😅", "الحمدلله، انت وش أخبارك؟", "بخير، طمني عنك", "زين الحمدلله، وانت؟", "تمام التمام 😄", "الحمدلله على كل حال، وانت؟"],
            eg: ["الحمد لله تمام، وانت؟", "كويس الحمد لله، إنت عامل إيه؟", "تمام يا باشا 😄", "الحمد لله، ماشي الحال", "بخير، طمني عليك", "زي الفل، وانت؟"],
            lev: ["منيح الحمدلله، وانت؟", "تمام، انت كيفك؟", "الحمدلله ماشي الحال", "منيح، مشغول شوي بس 😅", "كلو تمام، طمني عنك", "بخير، انت شو أخبارك؟"],
            iq: ["زين الحمدلله، وانت شلونك؟", "تمام عيني، انت شلونك؟", "الحمدلله ماشي الحال", "زين، بس مشغول شوية 😅", "بخير، طمني عليك", "كلش زين، وانت؟"],
        },
    },
    {
        en: /\b(hi+|hello|hey+|heya|yo|hiya|howdy)\b/,
        ar: /(^|\s)(مرحبا|مرحبتين|هلا|اهلا|هاي|هلو|يا هلا|اهلين)/,
        replies: {
            en: ["Hey! 👋", "Hi, how are you?", "Hello! What's up?", "Hey hey 😄", "Hi! Good to hear from you", "Yo! 👋"],
            ar: ["هلا 👋", "أهلين، كيفك؟", "هلا والله، وش أخبارك؟", "مرحبا! حياك 😄", "هلا فيك", "يا هلا والله", "أهلاً وسهلاً", "هلا بالغالي"],
            eg: ["أهلاً 👋", "إزيك؟", "أهلاً يا باشا 😄", "أهلاً، عامل إيه؟", "يا أهلاً وسهلاً", "منور 😄"],
            lev: ["أهلين 👋", "مرحبا، كيفك؟", "هلا والله، شو الأخبار؟", "أهلين فيك 😄", "يا هلا", "مرحبتين"],
            iq: ["هلو 👋", "هلا بيك، شلونك؟", "هلا عيني 😄", "أهلاً وسهلاً، شكو ماكو؟", "هلا بالغالي", "هلا والله"],
        },
    },
    {
        ar: /وينك|(?<!من )وين انت|وينكم|انت فين|فينك|موجود|متواجد|صاحي|انت هنا/,
        en: /\b(where are you(?! from)|you there|u there|are you around|you up|are you online)\b/,
        replies: {
            en: ["I'm here, what's up?", "Yep, here! 👋", "Here, tell me", "Just saw this, what's up?", "Here! Need something?"],
            ar: ["موجود، تفضل", "هنا، وش تبي؟", "معك، قول", "توني شفت رسالتك، آمر", "موجود، وش عندك؟"],
            eg: ["موجود، اتفضل", "أيوه معاك", "هنا، عايز إيه؟", "لسه شايف رسالتك، قول"],
            lev: ["موجود، تفضل", "هون، شو بدك؟", "معك، احكي", "هلق شفت رسالتك، قول"],
            iq: ["موجود، تفضل", "هنا، شتريد؟", "وياك، كول", "هسه شفت رسالتك، أمر"],
        },
    },
    {
        ar: /رجعت|وصلت|توني جيت|انا جيت/,
        en: /\b(i'?m back|im back|i'?m home|made it home)\b/,
        replies: {
            en: ["Welcome back! 👋", "Glad you made it!", "Finally 😄", "Hey, welcome back"],
            ar: ["حي الله 👋", "الحمدلله على السلامة", "ولكم 😄", "هلا بك، نورت"],
            eg: ["حمد الله على السلامة 👋", "نورت 😄", "أخيراً!"],
            lev: ["الحمدلله عالسلامة 👋", "أهلين، نورت 😄", "أخيراً!"],
            iq: ["الحمدلله على السلامة 👋", "هلا بيك، نورت 😄", "أخيراً!"],
        },
    },
    {
        ar: /اشتقتلك|اشتقت لك|وحشتني|مشتاقلك|توحشني|اشتقنا|اشتاقيتلك/,
        en: /\b(miss (you|u|ya)|missed (you|u))\b/,
        replies: {
            en: ["Miss you too! ❤️", "Aww, miss you more 🥺", "Same here! We should catch up", "Me too! When are you free?"],
            ar: ["وانا أكثر ❤️", "والله وانا اشتقتلك", "وحشتني أكثر 🥺", "لازم نشوفك قريب", "وانا أكثر والله، متى نشوفك؟"],
            eg: ["وانا أكتر ❤️", "وحشتني أوي 🥺", "لازم نتقابل قريب"],
            lev: ["وانا أكتر ❤️", "اشتقتلك كتير 🥺", "لازم نشوفك قريب"],
            iq: ["وانا أكثر ❤️", "اشتاقيتلك هواية 🥺", "لازم نشوفك قريب"],
        },
    },
    {
        ar: /احبك|بحبك/,
        en: /\b(love (you|u|ya)|ily)\b/,
        replies: {
            en: ["Love you too ❤️", "❤️❤️", "Aww 🥹❤️"],
            ar: ["وانا أكثر ❤️", "❤️❤️", "يا عمري 🥹"],
            eg: ["وانا كمان ❤️", "❤️❤️", "يا حبيبي 🥹"],
            lev: ["وانا كمان ❤️", "❤️❤️", "تقبرني 🥹"],
            iq: ["وانا هم ❤️", "❤️❤️", "يا عمري 🥹"],
        },
    },
    {
        ar: /شكرا|مشكور|يعطيك العافيه|تسلم|يسلمو|الله يعطيك|ما قصرت|جزاك الله|ميرسي|متشكر/,
        en: /\b(thanks|thank you|thx|ty|tysm|appreciate it)\b/,
        replies: {
            en: ["You're welcome! 😊", "Anytime!", "No problem 👍", "Happy to help!", "Of course 🙌", "Don't mention it"],
            ar: ["العفو 🙏", "الله يعافيك", "تكرم، ولا يهمك", "ما سويت شي 😊", "بالخدمة دايماً", "حاضرين", "ولو، واجبنا"],
            eg: ["العفو 🙏", "على إيه بس", "تحت أمرك", "ولا يهمك يا باشا", "أي خدمة 😊", "ده واجبي"],
            lev: ["ولو، العفو 🙏", "يسلمو، ولا يهمك", "تكرم عينك", "ما عملت شي 😊", "بالخدمة دايماً", "تدلل"],
            iq: ["العفو عيني 🙏", "تدلل", "ولا يهمك", "هذا واجبي", "على راسي 😊", "تامر"],
        },
    },
    {
        ar: /الله يوفقك|الله يسعدك|الله يحفظك|الله يخليك|الله يجزاك|ربي يحفظك|ربي يسعدك|ربنا يخليك|ربنا يوفقك|الله يعافيك/,
        en: /\b(god bless|may god|bless you)\b/,
        replies: {
            en: ["Thank you, you too 🤲", "Ameen, and you!", "That means a lot ❤️"],
            ar: ["آمين وإياك 🤲", "وياك يا رب", "الله يسعدك أكثر", "تسلم، وانت كذلك", "الله يحفظك"],
            eg: ["وانت كمان يا رب 🤲", "ربنا يخليك", "تسلم يا حبيبي"],
            lev: ["وانت كمان 🤲", "الله يخليك", "تسلم"],
            iq: ["وياك يا رب 🤲", "الله يخليك", "تسلم عيني"],
        },
    },
    {
        ar: /بالتوفيق|حظ سعيد|حظ موفق|بالنجاح/,
        en: /\b(good luck|gl|best of luck)\b/,
        replies: {
            en: ["Thanks! 🍀", "Thank you, I need it 😅", "Appreciate it!", "Thanks, fingers crossed 🤞"],
            ar: ["الله يسلمك 🤍", "تسلم، وانت كذلك", "آمين، يا رب", "شكراً، ادعيلي 🤲"],
            eg: ["تسلم 🤍", "ربنا يسترها 😅", "ادعيلي 🤲"],
            lev: ["يسلمو 🤍", "الله يسترها 😅", "ادعيلي 🤲"],
            iq: ["تسلم عيني 🤍", "الله يستر 😅", "ادعيلي 🤲"],
        },
    },
    {
        en: /\b(sorry|my bad|apologi[sz]e)\b/,
        ar: /اسف|سامحني|معلش|معليش|عذرا|المعذره|متزعلش|لا تزعل/,
        replies: {
            en: ["No worries!", "It's okay 😊", "All good!", "Don't worry about it", "It happens!"],
            ar: ["ولا يهمك", "مسامح 😊", "عادي ما صار شي", "لا تشيل هم", "ما عليك", "ولا شي، عادي"],
            eg: ["ولا يهمك", "مش مشكلة خالص", "حصل خير 😊", "عادي يا عم", "متشغلش بالك"],
            lev: ["ولا يهمك", "ما في شي", "مسامح 😊", "عادي، صارت", "لا تحمل هم"],
            iq: ["ولا يهمك", "ماكو شي", "عادي عيني 😊", "مسامح", "لا تشيل هم"],
        },
    },
    {
        en: /\b(vc|voice|call|join|hop on|get on)\b/,
        ar: /تعال|ادخل|روم|مكالمه|كول|نتكلم|نسولف|اتصل|ديسكورد|فوت|نحجي/,
        replies: {
            en: ["Joining now!", "Give me 5 minutes", "Can't right now, maybe later?", "On my way 🏃", "Sure, which channel?", "Coming!"],
            ar: ["جاي الحين!", "أعطني ٥ دقايق", "ما أقدر الحين، بعدين؟", "دقيقة وأدخل 🏃", "أي روم؟", "يلا جاي", "شوي وأدخل"],
            eg: ["جاي حالاً!", "خمس دقايق وجاي", "مش هقدر دلوقتي، بعدين؟", "ثانية وداخل 🏃", "أنهي روم؟", "يلا جاي"],
            lev: ["جاي هلق!", "عطيني ٥ دقايق", "ما بقدر هلق، بعدين؟", "دقيقة وبفوت 🏃", "أي روم؟", "يلا جاي"],
            iq: ["جاي هسه!", "انطيني ٥ دقايق", "ما أكدر هسه، بعدين؟", "دقيقة وأدخل 🏃", "يا روم؟", "يلا جاي"],
        },
    },
    {
        en: /\b(play|game|gaming|match|ranked|lobby)\b/,
        ar: /نلعب|تلعب|قيم|جيم|بابجي|فورت|ماين|فالو|روكيت|ببجي|كود/,
        replies: {
            en: ["Let's go! 🎮", "Down, give me 5 min", "Not right now, later?", "What are we playing?", "I'm in 🎮", "One more match? 😄"],
            ar: ["يلا، جاي 🎮", "أعطني شوي وأبدأ", "مو الحين، بعدين؟", "وش نلعب؟", "معك 🎮", "يلا بس رانكد 😄"],
            eg: ["يلا بينا 🎮", "ثواني وأفتح", "مش دلوقتي، بعدين؟", "هنلعب إيه؟", "معاك 🎮"],
            lev: ["يلا، جاي 🎮", "عطيني شوي", "مش هلق، بعدين؟", "شو بدنا نلعب؟", "معك 🎮"],
            iq: ["يلا، جاي 🎮", "انطيني شوية", "مو هسه، بعدين؟", "شنو نلعب؟", "وياك 🎮"],
        },
    },
    {
        ar: /جوعان|جعان|نتعشي|نتغدي|نفطر|مطعم|نطلع|طلعه|قهوه|كوفي|ناكل/,
        en: /\b(hungry|starving|dinner|lunch|breakfast|coffee|go out|hang out|grab food)\b/,
        replies: {
            en: ["I'm down! Where? 😋", "Same, I'm starving 😅", "Sounds good!", "When?", "Not today, maybe tomorrow?"],
            ar: ["يلا، وين؟ 😋", "وانا جوعان والله 😅", "فكرة حلوة!", "متى؟", "مو اليوم، بكرة؟", "على حسابك؟ 😄"],
            eg: ["يلا، فين؟ 😋", "وانا جعان والله 😅", "فكرة حلوة!", "إمتى؟", "مش النهارده، بكرة؟"],
            lev: ["يلا، وين؟ 😋", "وانا جوعان كتير 😅", "فكرة حلوة!", "إيمتى؟", "مش اليوم، بكرا؟"],
            iq: ["يلا، وين؟ 😋", "وانا جوعان والله 😅", "فكرة حلوة!", "شوكت؟", "مو اليوم، باجر؟"],
        },
    },
    {
        ar: /صوره|ورني|وريني|ارسلها|ابعتها|ابعتلي|ارسلي|سناب/,
        en: /\b(send (a |the )?(pic|photo|picture|screenshot)|show me|pic\?)\b/,
        replies: {
            en: ["One sec 📸", "Sending it now", "Which one?", "Later, I'll send it"],
            ar: ["لحظة أرسلها 📸", "الحين أرسلها", "أي صورة؟", "بعدين أرسلها"],
            eg: ["ثانية أبعتها 📸", "حالاً", "أنهي صورة؟"],
            lev: ["لحظة ببعتها 📸", "هلق ببعتها", "أي صورة؟"],
            iq: ["لحظة أدزها 📸", "هسه أدزها", "يا صورة؟"],
        },
    },
    {
        ar: /من وين انت|انت منين|كم عمرك|اسمك ايه|وش اسمك|شو اسمك|شنو اسمك|ممكن نتعرف|نتعرف/,
        en: /\b(where are you from|how old are you|what'?s your name|asl)\b/,
        replies: {
            en: ["Nice to meet you! What about you?", "Haha why do you ask? 😄", "Tell me about you first 😄"],
            ar: ["تشرفنا 😊 وانت؟", "ليش تسأل؟ 😄", "قول عن نفسك أول 😄", "أهلاً! وانت من وين؟"],
            eg: ["اتشرفنا 😊 وانت؟", "بتسأل ليه؟ 😄", "قولي عنك الأول 😄"],
            lev: ["تشرفنا 😊 وانت؟", "ليش عم تسأل؟ 😄", "احكيلي عنك أول 😄"],
            iq: ["تشرفنا 😊 وانت؟", "ليش تسأل؟ 😄", "كلي عن نفسك أول 😄"],
        },
    },
    {
        en: /\b(exam|test|quiz|study|studying|homework|assignment|work|shift|class|school|college|uni)\b/,
        ar: /اختبار|امتحان|مذاكره|اذاكر|ادرس|دوام|شغل|جامعه|مدرسه|واجب|بحث|كويز/,
        replies: {
            en: ["Good luck! 🍀", "You got this 💪", "Hang in there!", "Hope it goes well!", "Don't stress too much 🤍"],
            ar: ["بالتوفيق 🤍", "الله يعينك", "شد حيلك 💪", "ركز وبتنجح إن شاء الله", "الله يسهل عليك", "لا تضغط على نفسك 🤍"],
            eg: ["بالتوفيق 🤍", "ربنا معاك", "شد حيلك 💪", "هتعديها إن شاء الله"],
            lev: ["بالتوفيق 🤍", "الله يقويك", "شد حيلك 💪", "رح تمرق إن شاء الله"],
            iq: ["بالتوفيق 🤍", "الله يعينك", "شد حيلك 💪", "راح تعبرها إن شاء الله"],
        },
    },
    {
        en: /\b(busy|brb|one sec|1 sec|wait|hold on|give me a (sec|min|minute))\b/,
        ar: /مشغول|بعدين|لحظه|ثواني|دقيقه|انتظر|استني|استناني/,
        replies: {
            en: ["Take your time 👍", "No rush!", "Sure, I'll wait", "Okay, ping me when you're free"],
            ar: ["خذ راحتك 👍", "تمام، أنتظرك", "ولا يهمك", "تمام، كلمني لما تفضى", "على راحتك"],
            eg: ["براحتك 👍", "تمام، مستنيك", "ولا يهمك", "كلمني لما تفضى"],
            lev: ["خود راحتك 👍", "تمام، ناطرك", "ولا يهمك", "احكيني لما تفضى"],
            iq: ["على راحتك 👍", "تمام، أنتظرك", "ولا يهمك", "حاجيني من تفضى"],
        },
    },
    {
        en: /\b(tired|sick|sad|upset|exhausted|not feeling well|depressed)\b/,
        ar: /تعبان|مريض|زعلان|حزين|مضايق|مخنوق|مصدع|ضايج|مقهور/,
        replies: {
            en: ["Feel better soon 🤍", "Oh no, what happened?", "Get some rest!", "I'm here if you want to talk", "Sending hugs 🫂"],
            ar: ["سلامتك 🤍", "الله يشفيك، ارتاح", "وش فيك؟ قولي", "ما تشوف شر", "أنا موجود لو تبي تسولف", "طهور إن شاء الله"],
            eg: ["سلامتك 🤍", "ألف سلامة، ارتاح", "مالك؟ احكيلي", "ربنا يشفيك"],
            lev: ["سلامتك 🤍", "الله يشفيك، ارتاح", "شو بك؟ احكيلي", "ما تشوف شر"],
            iq: ["سلامتك 🤍", "الله يشافيك، ارتاح", "شبيك؟ احجيلي", "ما تشوف شر"],
        },
    },
    {
        en: /\b(bored|boring)\b/,
        ar: /طفشان|طفش|زهقان|ملل|مليت|ضجران/,
        replies: {
            en: ["Same 😅 wanna play something?", "Hop in voice, let's talk", "Let's do something!", "Wanna watch something?"],
            ar: ["وانا والله 😅 نلعب شي؟", "تعال الروم نسولف", "يلا نسوي شي!", "نشوف فلم؟"],
            eg: ["وانا كمان 😅 نلعب حاجة؟", "تعالى الروم نتكلم", "يلا نعمل حاجة!"],
            lev: ["وانا كمان 😅 منلعب شي؟", "تعا عالروم نحكي", "يلا نعمل شي!"],
            iq: ["وانا هم 😅 نلعب شي؟", "تعال للروم نحجي", "يلا نسوي شي!"],
        },
    },
    {
        en: /\b(sleep|sleeping|going to bed|sleepy|gonna sleep)\b/,
        ar: /نايم|بنام|رايح انام|نعسان|بروح انام|هنام/,
        replies: {
            en: ["Sleep well! 😴", "Good night 🌙", "Get some rest, talk tomorrow", "Sweet dreams ✨"],
            ar: ["نوم العوافي 😴", "تصبح على خير 🌙", "روح نام، نكمل بكرة", "أحلام سعيدة ✨"],
            eg: ["نوم الهنا 😴", "تصبح على خير 🌙", "روح نام ونكمل بكرة"],
            lev: ["نوم الهنا 😴", "تصبح على خير 🌙", "روح نام، منكمل بكرا"],
            iq: ["نوم العوافي 😴", "تصبح على خير 🌙", "روح نام، نكمل باجر"],
        },
    },
    {
        en: /\b(bye+|gn|good ?night|see (you|ya)|cya|ttyl|later|take care)\b/,
        ar: /باي|تصبح علي خير|مع السلامه|يلا سلام|اشوفك|نلتقي|في امان الله|بامان الله/,
        replies: {
            en: ["Bye! 👋", "Good night! 🌙", "See you later!", "Take care! 🤍", "Talk soon!"],
            ar: ["مع السلامة 👋", "وانت من أهله 🌙", "نشوفك بعدين!", "في أمان الله 🤍", "الله يحفظك", "الله معك"],
            eg: ["مع السلامة 👋", "وانت من أهله 🌙", "نتكلم بعدين!", "في رعاية الله 🤍", "سلام يا باشا"],
            lev: ["مع السلامة 👋", "وانت من أهلو 🌙", "منحكي بعدين!", "الله معك 🤍", "يلا باي"],
            iq: ["مع السلامة 👋", "وانت من أهله 🌙", "نحجي بعدين!", "الله وياك 🤍", "بأمان الله"],
        },
    },
    {
        ar: /ان شاء الله|انشالله|انشاءالله|انشاالله/,
        en: /\b(inshallah|insha'?allah)\b/,
        replies: {
            en: ["Inshallah 🤲", "Ameen", "Hopefully!"],
            ar: ["إن شاء الله 🤲", "يا رب", "الله يكتب اللي فيه الخير", "آمين"],
            eg: ["إن شاء الله 🤲", "يا رب", "ربنا يسهل"],
        },
    },
    {
        ar: /^(يلا|يالله|هيا|يلا بينا)/,
        en: /^(let'?s go|lets go|come on)\b/,
        replies: {
            en: ["Let's go! 🔥", "Coming!", "One sec!"],
            ar: ["يلا 🔥", "جاي!", "ثواني بس"],
            eg: ["يلا بينا 🔥", "جاي!", "ثانية بس"],
        },
    },
    {
        en: /\b(lol|lmao|lmfao|xd|ha(ha)+|rofl)\b|😂|🤣/,
        ar: /ههه+|خخخ+|😂|🤣/,
        replies: {
            en: ["😂😂", "lmao", "haha true", "💀💀", "I'm dead 😂", "Stoppp 😂"],
            ar: ["😂😂", "هههههههه", "والله ضحكتني 😂", "💀💀", "ههههه مو طبيعي", "خلاص بموت ضحك 😂"],
            eg: ["😂😂", "هههههه", "موتتني من الضحك 😂", "إنت مش طبيعي 😂", "💀💀"],
            lev: ["😂😂", "ههههههه", "فطستني ضحك 😂", "💀💀", "شو هاد 😂"],
            iq: ["😂😂", "هههههه", "موتتني 😂", "💀💀", "شنو هذا 😂"],
        },
    },
    {
        en: /\b(nice|cool|awesome|amazing|great|beautiful|perfect|fire|insane)\b|🔥|😍/,
        ar: /حلو|روعه|جميل|خرافي|كفو|يجنن|ابداع|رهيب|فخم|جامد|تحفه|حلوه/,
        replies: {
            en: ["Thanks! 😄", "Glad you like it!", "🔥🔥", "Right?! 😄", "Appreciate it!"],
            ar: ["شكراً ❤️", "تسلم 😄", "كفو والله", "صح؟ 😄", "عيونك الحلوة", "الله يسلمك"],
            eg: ["تسلم 😄", "ميرسي ❤️", "صح؟ 😄", "حبيبي والله"],
            lev: ["يسلمو ❤️", "تسلم 😄", "عيونك الحلوين", "صح؟ 😄"],
            iq: ["تسلم عيني ❤️", "عيونك الحلوة 😄", "صح؟ 😄"],
        },
    },
    {
        en: /https?:\/\//,
        ar: /https?:\/\//,
        replies: {
            en: ["Thanks for sharing!", "Checking it out 👀", "Nice!", "Oh I'll watch it later", "Haha I've seen this 😂"],
            ar: ["شكراً على الرابط!", "بشوفه 👀", "حلو!", "بشوفه بعدين إن شاء الله", "شفته قبل 😂"],
            eg: ["هشوفه 👀", "ميرسي!", "حلو!"],
            lev: ["رح شوفه 👀", "يسلمو!", "حلو!"],
            iq: ["راح أشوفه 👀", "تسلم!", "حلو!"],
        },
    },
    {
        en: /^(ok|okay|k|kk|sure|alright|true|yes|yep|yeah|yup|bet|deal|fine)\b/,
        ar: /^(تمام|اوكي|اوك|طيب|ماشي|اكيد|صح|زين|ابشر|خلاص|اوكيه|تم|ايوه|ايوا)/,
        replies: {
            en: ["👍", "Great!", "Deal 🤝", "Perfect 👌", "Sounds good"],
            ar: ["👍", "تمام 👌", "اتفقنا", "حلو 👌", "أبشر", "تم"],
            eg: ["👍", "تمام 👌", "اتفقنا", "ماشي", "حلو كده"],
            lev: ["👍", "تمام 👌", "اتفقنا", "منيح", "ماشي الحال"],
            iq: ["👍", "تمام 👌", "اتفقنا", "زين", "ماشي"],
        },
    },
    {
        en: /^(no|nah|nope|can'?t|cannot)\b/,
        ar: /^(لا|لاء|مستحيل|ما اقدر|مو|مش|ما بقدر|ما اكدر)(\s|$)/,
        replies: {
            en: ["No worries!", "Alright, maybe later", "Okay 👍", "All good"],
            ar: ["تمام، ولا يهمك", "خلاص براحتك", "أوكي، بعدين؟", "ما عليه"],
            eg: ["تمام، ولا يهمك", "خلاص براحتك", "ماشي، بعدين؟", "مفيش مشكلة"],
            lev: ["تمام، ولا يهمك", "خلص براحتك", "ماشي، بعدين؟", "ما في مشكلة"],
            iq: ["تمام، ولا يهمك", "خلاص براحتك", "ماشي، بعدين؟", "ماكو مشكلة"],
        },
    },
    {
        generic: true,
        en: /\?\s*$|^(what|when|where|why|how|who|which|can|could|do|does|did|is|are|will|would|should)\b/,
        ar: /[؟?]\s*$|(^|\s)(هل|متي|وين|ليش|كيف|شو|ايش|وش|مين|قديش|كم|ليه|ازاي|امتي|فين|شنو|شوكت|ليش)(\s|$)/,
        replies: {
            en: ["Yes 👍", "No, sorry", "Let me check and get back to you", "Hmm, not sure", "Good question 🤔", "Maybe, why?"],
            ar: ["ايه 👍", "لا، للأسف", "خلني أشوف وأرد عليك", "والله ما أدري", "سؤال حلو 🤔", "يمكن، ليش؟"],
            eg: ["أيوه 👍", "لا، للأسف", "ثانية أشوف وأرد عليك", "والله مش عارف", "سؤال حلو 🤔"],
            lev: ["إي 👍", "لا، للأسف", "خليني شوف وبرجعلك", "والله ما بعرف", "سؤال حلو 🤔"],
            iq: ["إي 👍", "لا، للأسف", "خلي أشوف وأرد عليك", "والله ما أدري", "سؤال حلو 🤔"],
        },
    },
];

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
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/ـ/g, "")
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

    if (!text) return hasAttachments ? pick(["😂", "Nice! 😄", "🔥", "😍", "Haha"], 3, seed) : pick(["😂", "❤️", "👍", "🔥"], 3, seed);

    const out: string[] = [];
    for (const rule of RULES) {
        if (rule.generic && out.length) continue;
        const re = rule[lang];
        if (re?.test(text)) out.push(...pick(repliesFor(rule.replies, lang, dialect), 3, seed + out.length));
        if (out.length >= 4) break;
    }
    if (!out.length) out.push(...pick(repliesFor(FALLBACK, lang, dialect), 3, seed));
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
