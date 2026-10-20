import assert from "node:assert/strict";
import { test } from "node:test";

import { createGuardDraftPreparer } from "../friendsInVoice/personalGuardsDraft";
import type { GuardDraftBridge } from "../friendsInVoice/personalGuardsTypes";

function fixture(initialDraft = "") {
    const state = { draft: initialDraft, selected: "target", inserted: [] as string[], revealed: false };
    const bridge: GuardDraftBridge = {
        open: async () => undefined,
        currentDm: () => state.selected === "target" ? "dm" : null,
        getDraft: () => state.draft,
        insert: text => { state.inserted.push(text); state.draft += text; },
        reveal: () => { state.revealed = true; },
        wait: async () => undefined
    };
    return { state, bridge };
}

test("one command is prepared and the visible composer contains exactly that command", async () => {
    const { state, bridge } = fixture();
    const prepare = createGuardDraftPreparer(bridge);
    assert.equal(await prepare("guardian", "command"), "ready");
    assert.equal(state.draft, "command");
    assert.equal(state.revealed, true);
    assert.equal(await prepare("guardian", "command"), "ready");
    assert.deepEqual(state.inserted, ["command"]);
});

test("a guard command never appends to an invitation or overwrites a user's draft", async () => {
    for (const existing of ["invitation", "my unsent message", "  "]) {
        const { state, bridge } = fixture(existing);
        assert.equal(await createGuardDraftPreparer(bridge)("guardian", "command"), "occupied");
        assert.equal(state.draft, existing);
        assert.deepEqual(state.inserted, []);
        assert.equal(state.revealed, true);
    }
});

test("rapid action clicks cannot create concatenated guard messages", async () => {
    const { state, bridge } = fixture();
    const prepare = createGuardDraftPreparer(bridge);
    const first = prepare("guardian", "mute");
    assert.equal(await prepare("guardian", "deafen"), "busy");
    assert.equal(await first, "ready");
    assert.equal(state.draft, "mute");
});

test("navigation away during composer mounting prevents insertion into another DM", async () => {
    const { state, bridge } = fixture();
    bridge.wait = async () => { state.selected = "other"; };
    assert.equal(await createGuardDraftPreparer(bridge)("guardian", "command"), "unavailable");
    assert.deepEqual(state.inserted, []);
});

test("failed preparation releases the lock for the next attempt", async () => {
    const { state, bridge } = fixture();
    bridge.open = async () => { throw new Error("offline"); };
    const prepare = createGuardDraftPreparer(bridge);
    assert.equal(await prepare("guardian", "command"), "unavailable");
    bridge.open = async () => undefined;
    assert.equal(await prepare("guardian", "command"), "ready");
    assert.equal(state.draft, "command");
});

test("a missing composer is reported as failure instead of announcing a prepared invitation", async () => {
    const { bridge } = fixture();
    bridge.insert = () => undefined;
    assert.equal(await createGuardDraftPreparer(bridge)("guardian", "command"), "unavailable");
});
