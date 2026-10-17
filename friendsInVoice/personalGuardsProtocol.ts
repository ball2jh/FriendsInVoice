/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { GuardAction, GuardCommand, GuardNotice } from "./personalGuardsTypes";

export const GUARD_ACTIONS: GuardAction[] = ["mute", "deafen", "disconnect"];
export const GUARD_LABELS: Record<GuardAction, string> = {
    mute: "Mute microphone",
    deafen: "Deafen",
    disconnect: "Disconnect from voice",
};

const PREFIX = "[FriendsInVoice Guard v1] ";
const SNOWFLAKE = /^\d{17,20}$/;

export function isUserId(value: string): boolean {
    return SNOWFLAKE.test(value);
}

export function makeCommand(ownerId: string, action: GuardAction): string {
    const message: GuardCommand = {
        kind: "command", ownerId, action, createdAt: Date.now(), nonce: crypto.randomUUID(),
    };
    return PREFIX + JSON.stringify(message);
}

export function makeGrantNotice(ownerId: string, actions: GuardAction[]): string {
    const message: GuardNotice = { kind: "grant", ownerId, actions, createdAt: Date.now() };
    return PREFIX + JSON.stringify(message);
}

export function parseGuardMessage(content: string): GuardCommand | GuardNotice | null {
    if (!content.startsWith(PREFIX) || content.length > 600) return null;
    let data: unknown;
    try { data = JSON.parse(content.slice(PREFIX.length)); } catch { return null; }
    if (!data || typeof data !== "object") return null;
    const value = data as Record<string, unknown>;
    if (typeof value.ownerId !== "string" || !isUserId(value.ownerId)) return null;
    if (typeof value.createdAt !== "number" || !Number.isSafeInteger(value.createdAt)) return null;
    if (value.kind === "command") {
        if (!GUARD_ACTIONS.includes(value.action as GuardAction) ||
            typeof value.nonce !== "string" || !/^[a-f\d-]{36}$/i.test(value.nonce)) return null;
        return value as unknown as GuardCommand;
    }
    if (value.kind === "grant") {
        if (!Array.isArray(value.actions) || !value.actions.every(action => GUARD_ACTIONS.includes(action))) return null;
        return value as unknown as GuardNotice;
    }
    return null;
}
