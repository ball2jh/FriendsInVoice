import assert from "node:assert/strict";
import { test } from "node:test";

import { openGuardPayload, publicKeyString, sealGuardPayload, validatePublicKey } from "../friendsInVoice/personalGuardsCrypto";
import { makeCommand, makeGrantNotice, parseGuardMessage, serializeWire } from "../friendsInVoice/personalGuardsProtocol";

const ownerId = "123456789012345678";
const guardianId = "234567890123456789";

async function pair() {
    return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}

test("encrypted command hides the action and decrypts only for the owner", async () => {
    const guardian = await pair();
    const owner = await pair();
    const other = await pair();
    const wire = await sealGuardPayload(makeCommand(ownerId, "mute"), guardian, await publicKeyString(owner), guardianId, ownerId);
    const text = serializeWire(wire);
    assert.ok(!text.includes("mute"));
    assert.equal(parseGuardMessage(text)?.type, "sealed");
    const decoded = await openGuardPayload(wire, owner, guardianId, ownerId);
    assert.equal(decoded?.kind, "command");
    if (decoded?.kind === "command") assert.equal(decoded.action, "mute");
    assert.equal(await openGuardPayload(wire, other, guardianId, ownerId), null);
    assert.equal(await openGuardPayload(wire, owner, ownerId, guardianId), null);
    assert.equal(await openGuardPayload({ ...wire, ciphertext: wire.ciphertext.slice(0, -1) + "A" }, owner, guardianId, ownerId), null);
});

test("encrypted grant carries a subset and an empty revocation", async () => {
    const owner = await pair();
    const guardian = await pair();
    const recipientKey = await publicKeyString(guardian);
    assert.equal(await validatePublicKey(recipientKey), true);
    for (const actions of [["mute", "disconnect"] as const, [] as const]) {
        const wire = await sealGuardPayload(makeGrantNotice(ownerId, [...actions]), owner, recipientKey, ownerId, guardianId);
        const decoded = await openGuardPayload(wire, guardian, ownerId, guardianId);
        assert.deepEqual(decoded?.kind === "grant" ? decoded.actions : null, actions);
    }
});

test("old plain-text and malformed messages are rejected", () => {
    assert.equal(parseGuardMessage("[FriendsInVoice Guard v1] {\"kind\":\"command\",\"action\":\"mute\"}"), null);
    assert.equal(parseGuardMessage("hello"), null);
    assert.equal(parseGuardMessage("[FriendsInVoice Guard v2] {}"), null);
});
