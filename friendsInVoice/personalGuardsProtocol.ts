/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { GuardAction, GuardCommand, GuardNotice, GuardWire } from "./personalGuardsTypes";

export const GUARD_ACTIONS: GuardAction[] = ["mute", "deafen", "disconnect"];
export const GUARD_LABELS: Record<GuardAction, string> = {
    mute: "Mute microphone",
    deafen: "Deafen",
    disconnect: "Disconnect from voice",
};

const PREFIX = "[FriendsInVoice Guard v2] ";
const SNOWFLAKE = /^\d{17,20}$/;
const BASE64_URL = /^[A-Za-z0-9_-]+$/;

export function isUserId(value: string): boolean {
    return SNOWFLAKE.test(value);
}

export function makeCommand(ownerId: string, action: GuardAction): GuardCommand {
    return { kind: "command", ownerId, action, createdAt: Date.now(), nonce: crypto.randomUUID() };
}

export function makeGrantNotice(ownerId: string, actions: GuardAction[]): GuardNotice {
    return { kind: "grant", ownerId, actions: GUARD_ACTIONS.filter(action => actions.includes(action)), createdAt: Date.now() };
}

export function serializeWire(wire: GuardWire): string {
    return PREFIX + JSON.stringify(wire);
}

export function parseGuardMessage(content: string): GuardWire | null {
    if (!content.startsWith(PREFIX) || content.length > 3000) return null;
    let data: unknown;
    try { data = JSON.parse(content.slice(PREFIX.length)); } catch { return null; }
    if (!data || typeof data !== "object") return null;
    const value = data as Record<string, unknown>;
    if (value.version !== 2) return null;
    if (value.type === "key" && typeof value.publicKey === "string" &&
        value.publicKey.length === 87 && BASE64_URL.test(value.publicKey)) return value as unknown as GuardWire;
    if (value.type === "sealed" && typeof value.to === "string" && isUserId(value.to) &&
        typeof value.fromKey === "string" && value.fromKey.length === 87 && BASE64_URL.test(value.fromKey) &&
        typeof value.iv === "string" && value.iv.length === 16 && BASE64_URL.test(value.iv) &&
        typeof value.ciphertext === "string" && value.ciphertext.length > 20 && BASE64_URL.test(value.ciphertext)) {
        return value as unknown as GuardWire;
    }
    return null;
}

export function parseGuardPayload(value: unknown): GuardCommand | GuardNotice | null {
    if (!value || typeof value !== "object") return null;
    const payload = value as Record<string, unknown>;
    if (typeof payload.ownerId !== "string" || !isUserId(payload.ownerId) ||
        typeof payload.createdAt !== "number" || !Number.isSafeInteger(payload.createdAt)) return null;
    if (payload.kind === "command" && GUARD_ACTIONS.includes(payload.action as GuardAction) &&
        typeof payload.nonce === "string" && /^[a-f\d-]{36}$/i.test(payload.nonce)) return payload as unknown as GuardCommand;
    if (payload.kind === "grant" && Array.isArray(payload.actions) &&
        payload.actions.every(action => GUARD_ACTIONS.includes(action))) return payload as unknown as GuardNotice;
    return null;
}
