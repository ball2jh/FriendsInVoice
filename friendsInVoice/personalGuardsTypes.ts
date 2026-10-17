/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type GuardAction = "mute" | "deafen" | "disconnect";

export interface GuardGrant {
    userId: string;
    actions: GuardAction[];
}

export interface GuardCommand {
    kind: "command";
    ownerId: string;
    action: GuardAction;
    createdAt: number;
    nonce: string;
}

export interface GuardNotice {
    kind: "grant";
    ownerId: string;
    actions: GuardAction[];
    createdAt: number;
}

export interface GuardKeyWire {
    type: "key";
    version: 2;
    publicKey: string;
}

export interface GuardSealedWire {
    type: "sealed";
    version: 2;
    to: string;
    fromKey: string;
    iv: string;
    ciphertext: string;
}

export type GuardWire = GuardKeyWire | GuardSealedWire;
