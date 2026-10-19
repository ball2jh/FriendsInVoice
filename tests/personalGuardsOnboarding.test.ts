import assert from "node:assert/strict";
import { test } from "node:test";

import { ownerSetupMessage, ownerSetupStep } from "../friendsInVoice/personalGuardsOnboarding";

test("owner chooses actions before sending encrypted access", () => {
    assert.equal(ownerSetupStep([], false), "choose");
    assert.equal(ownerSetupStep([], true), "choose");
    assert.equal(ownerSetupStep(["mute"], false), "wait-key");
    assert.equal(ownerSetupStep(["mute"], true), "send-access");
});

test("each setup state gives a concrete next step", () => {
    assert.match(ownerSetupMessage("choose"), /Choose the actions/);
    assert.match(ownerSetupMessage("wait-key"), /right-click/);
    assert.match(ownerSetupMessage("send-access"), /Discord's Send/);
});
