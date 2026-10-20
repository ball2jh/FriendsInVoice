/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { GuardsStore } from "./personalGuardsTypes";

export function writeGuardSetting<Key extends keyof GuardsStore>(store: GuardsStore, key: Key, value: GuardsStore[Key]): void {
    // Settings reads are proxies. IPC can clone only plain data, including every nested array and retained row.
    const plain = JSON.parse(JSON.stringify(value)) as GuardsStore[Key];
    store[key] = plain;
}

export function saveGuardInvitation(store: GuardsStore, guardianId: string, nonce: string): void {
    writeGuardSetting(store, "personalGuards", store.personalGuards.map(grant =>
        grant.userId === guardianId ? { ...grant, inviteNonce: nonce } : grant));
}
