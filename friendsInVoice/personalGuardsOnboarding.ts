/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { GuardAction } from "./personalGuardsTypes";

export type OwnerSetupStep = "choose" | "wait-key" | "send-access";

export function ownerSetupStep(actions: GuardAction[], hasKey: boolean): OwnerSetupStep {
    if (!actions.length) return "choose";
    return hasKey ? "send-access" : "wait-key";
}

export function ownerSetupMessage(step: OwnerSetupStep): string {
    switch (step) {
        case "choose": return "Choose the actions this person may use on your account.";
        case "wait-key": return "Ask them to right-click your Discord profile → Personal Guards → Offer to guard. They must press Send in the DM.";
        case "send-access": return "Their public key is ready. Prepare the encrypted access DM, then press Discord's Send button.";
    }
}
