import assert from "node:assert/strict";
import { test } from "node:test";

import { makeCommand, makeGrantNotice, parseGuardMessage } from "../friendsInVoice/personalGuardsProtocol";

const ownerId = "123456789012345678";

test("command drafts contain a unique nonce, timestamp, owner and action", () => {
    const first = parseGuardMessage(makeCommand(ownerId, "mute"));
    const second = parseGuardMessage(makeCommand(ownerId, "mute"));
    assert.equal(first?.kind, "command");
    assert.equal(second?.kind, "command");
    if (first?.kind !== "command" || second?.kind !== "command") return;
    assert.equal(first.ownerId, ownerId);
    assert.equal(first.action, "mute");
    assert.notEqual(first.nonce, second.nonce);
});

test("grant notices support subsets and revocation", () => {
    const grant = parseGuardMessage(makeGrantNotice(ownerId, ["mute", "disconnect"]));
    const revoke = parseGuardMessage(makeGrantNotice(ownerId, []));
    assert.deepEqual(grant?.kind === "grant" && grant.actions, ["mute", "disconnect"]);
    assert.deepEqual(revoke?.kind === "grant" && revoke.actions, []);
});

test("malformed or unsupported command text is rejected", () => {
    assert.equal(parseGuardMessage("hello"), null);
    assert.equal(parseGuardMessage("[FriendsInVoice Guard v1] {}"), null);
    assert.equal(parseGuardMessage("[FriendsInVoice Guard v1] {\"kind\":\"command\",\"ownerId\":\"123456789012345678\",\"action\":\"ban\",\"createdAt\":1,\"nonce\":\"00000000-0000-0000-0000-000000000000\"}"), null);
});
