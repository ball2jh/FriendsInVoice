import assert from "node:assert/strict";
import { test } from "node:test";

import { ruleReplies } from "../friendsInVoice/smartReplyEngine";

test("keeps suggestions stable per message and varies across messages", () => {
    assert.deepEqual(ruleReplies("When are we meeting?", false, "same"), ruleReplies("When are we meeting?", false, "same"));
    assert.notDeepEqual(ruleReplies("When are we meeting?", false, "one"), ruleReplies("When are we meeting?", false, "two"));
});

test("specific questions outrank broad topics in both languages", () => {
    assert.match(ruleReplies("What movie should we watch?", false, "movie").join(" "), /mood|preferences|options|enjoy/);
    assert.match(ruleReplies("شو رأيك بالفيلم؟", false, "opinion").join(" "), /الخيارات|التفاصيل|احكيلي|السياق/);
    assert.match(ruleReplies("When can we play?", false, "time").join(" "), /time|day|schedule/);
});

test("unknown questions ask for context without guessing yes or no", () => {
    const replies = ruleReplies("Is the work finished?", false, "unknown");
    assert.ok(replies.every(reply => !/^(yes|no)\b/i.test(reply)));
});

test("Arabic vowel marks and extra spaces do not prevent intent matching", () => {
    assert.match(ruleReplies("إمتى   نلتقي؟", false, "spacing").join(" "), /وقت|يوم|مواعيد/);
});

test("condolences remain ahead of questions and other subjects", () => {
    assert.match(ruleReplies("My dad passed away, can we talk?", false, "loss").join(" "), /sorry|condolences|peace|strength|here/);
});

test("attachment suggestions avoid claiming its contents were seen", () => {
    const replies = ruleReplies("", true, "attachment");
    assert.ok(replies.every(reply => !/seen|watch|nice|funny/i.test(reply)));
});
