/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export function parseVersion(value: string): number[] | null {
    if (!/^\d+\.\d+\.\d+$/.test(value)) return null;
    const parts = value.split(".").map(Number);
    return parts.every(Number.isSafeInteger) ? parts : null;
}

export function isNewer(candidate: string, installed: string): boolean {
    const a = parseVersion(candidate), b = parseVersion(installed);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
}
