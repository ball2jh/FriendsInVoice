import assert from "node:assert/strict";
import { test } from "node:test";

import { DataStore, normalizeData } from "../src/data.js";

const owner = "111111111111111111";
const other = "222222222222222222";

test("stored data removes invalid IDs and unknown permissions", () => {
    const data = normalizeData({
        watchlist: [owner, owner, "not-an-id"],
        personalGuards: [{ userId: other, actions: ["mute", "unsafe"] }],
        guardPeerKeys: [{ userId: owner, publicKey: "bad" }]
    });
    assert.deepEqual(data.watchlist, [owner]);
    assert.deepEqual(data.personalGuards, [{ userId: other, actions: ["mute"] }]);
    assert.deepEqual(data.guardPeerKeys, []);
});

test("permissions start empty and each change is saved", () => {
    const writes = [];
    const store = new DataStore({ Data: { load: () => null, save: (_key, value) => writes.push(structuredClone(value)) } });
    assert.equal(store.grant(other, []), true);
    assert.deepEqual(store.value.personalGuards[0].actions, []);
    assert.equal(store.grant(other, ["mute"]), true);
    assert.deepEqual(store.value.personalGuards[0].actions, ["mute"]);
    store.revoke(other);
    assert.equal(store.value.personalGuards.length, 0);
    assert.equal(writes.length, 3);
});
