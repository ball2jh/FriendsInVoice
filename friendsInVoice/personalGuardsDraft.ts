/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { GuardDraftBridge, GuardDraftResult } from "./personalGuardsTypes";

export function createGuardDraftPreparer(bridge: GuardDraftBridge) {
    let busy = false;
    return async (userId: string, text: string): Promise<GuardDraftResult> => {
        if (busy) return "busy";
        busy = true;
        try {
            await bridge.open(userId);
            for (let attempt = 0; attempt < 20; attempt++) {
                const channelId = bridge.currentDm(userId);
                if (channelId) {
                    // Channel selection can change before the new composer mounts.
                    await bridge.wait();
                    if (bridge.currentDm(userId) !== channelId) continue;
                    bridge.reveal();
                    const draft = bridge.getDraft(channelId);
                    if (draft === text) return "ready";
                    if (draft.length) return "occupied";
                    bridge.insert(text);
                    for (let check = 0; check < 20; check++) {
                        await bridge.wait();
                        if (bridge.currentDm(userId) !== channelId) return "unavailable";
                        if (bridge.getDraft(channelId) === text) return "ready";
                    }
                    return "unavailable";
                }
                await bridge.wait();
            }
            return "unavailable";
        } catch {
            return "unavailable";
        } finally {
            busy = false;
        }
    };
}
