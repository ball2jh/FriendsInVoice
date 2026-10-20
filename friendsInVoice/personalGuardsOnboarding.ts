/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { GuardAction } from "./personalGuardsTypes";

export type OwnerSetupStep = "choose" | "invite";

export function ownerSetupStep(actions: GuardAction[]): OwnerSetupStep {
    return actions.length ? "invite" : "choose";
}

export function ownerSetupMessage(step: OwnerSetupStep): string {
    switch (step) {
        case "choose": return "Choose the actions this person may use on your account.";
        case "invite": return "Invite this guardian, then press Discord's Send button in the DM. They accept without sending a reply.";
    }
}
