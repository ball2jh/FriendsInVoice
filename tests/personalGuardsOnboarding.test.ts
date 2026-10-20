import assert from "node:assert/strict";
import { test } from "node:test";

import { ownerSetupMessage, ownerSetupStep } from "../friendsInVoice/personalGuardsOnboarding";

test("owner chooses actions before inviting a guardian", () => {
    assert.equal(ownerSetupStep([]), "choose");
    assert.equal(ownerSetupStep(["mute"]), "invite");
});

test("each setup state gives a concrete next step", () => {
    assert.match(ownerSetupMessage("choose"), /Choose the actions/);
    assert.match(ownerSetupMessage("invite"), /Discord's Send/);
});
