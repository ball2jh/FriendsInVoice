import assert from "node:assert/strict";
import { test } from "node:test";

import { removeGuardAccess, saveGuardInvitation, writeGuardSetting } from "../friendsInVoice/personalGuardsSettings";
import type { GuardsStore } from "../friendsInVoice/personalGuardsTypes";

function proxied<Value extends object>(value: Value): Value {
    return new Proxy(value, {
        get(target, key, receiver) {
            const item = Reflect.get(target, key, receiver);
            return item !== null && typeof item === "object" ? proxied(item) : item;
        }
    });
}

function settingsFixture() {
    const data: GuardsStore = {
        personalGuards: [{ userId: "one", actions: ["mute"] }, { userId: "two", actions: ["deafen"], inviteNonce: "previous" }],
        knownGuardGrants: [{ userId: "owner", actions: ["mute"], inviteNonce: "accepted" }],
        pendingGuardInvites: [{ userId: "pending", actions: ["deafen"], nonce: "invite", publicKey: "public" }],
        guardPeerKeys: [{ userId: "owner", publicKey: "public" }],
        guardBlocks: [{ userId: "one", until: 123 }],
        guardReplay: [{ nonce: "command", createdAt: 456 }]
    };
    const store = new Proxy(data, {
        get(target, key) { return proxied(Reflect.get(target, key)); },
        set(target, key, value) { return Reflect.set(target, key, structuredClone(value)); }
    });
    return { data, store };
}

test("invitation saving reproduces proxy clone failure and persists plain nested actions", () => {
    const { data, store } = settingsFixture();
    assert.throws(() => {
        store.personalGuards = store.personalGuards.map(grant => grant.userId === "one" ? { ...grant, inviteNonce: "new" } : grant);
    }, { name: "DataCloneError" });
    saveGuardInvitation(store, "one", "new");
    assert.deepEqual(data.personalGuards, [
        { userId: "one", actions: ["mute"], inviteNonce: "new" },
        { userId: "two", actions: ["deafen"], inviteNonce: "previous" }
    ]);
});

test("every guard settings collection can cross IPC with retained proxied entries", () => {
    const { data, store } = settingsFixture();
    for (const key of Object.keys(data) as (keyof GuardsStore)[]) {
        const expected = JSON.parse(JSON.stringify(store[key]));
        writeGuardSetting(store, key, store[key]);
        assert.deepEqual(data[key], expected);
        assert.doesNotThrow(() => structuredClone(data[key]));
    }
});

test("removing received access preserves other owners and reciprocal guardian permissions", () => {
    const { data, store } = settingsFixture();
    data.knownGuardGrants.push({ userId: "other-owner", actions: ["deafen"], inviteNonce: "other-invite" });
    const before = structuredClone(data);
    removeGuardAccess(store, "owner");
    assert.deepEqual(data.knownGuardGrants, [{ userId: "other-owner", actions: ["deafen"], inviteNonce: "other-invite" }]);
    for (const key of Object.keys(data) as (keyof GuardsStore)[]) {
        if (key !== "knownGuardGrants") assert.deepEqual(data[key], before[key]);
    }
    assert.doesNotThrow(() => removeGuardAccess(store, "owner"));
});
