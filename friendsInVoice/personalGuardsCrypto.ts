/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { parseGuardPayload } from "./personalGuardsProtocol";
import type { GuardCommand, GuardNotice, GuardSealedWire } from "./personalGuardsTypes";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const DB_NAME = "FriendsInVoiceGuardKeys";
let keyPromise: Promise<CryptoKeyPair> | undefined;

function toBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function buffer(bytes: Uint8Array): ArrayBuffer {
    const value = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(value).set(bytes);
    return value;
}

function openKeyDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore("keys");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function loadOrCreateKeys(): Promise<CryptoKeyPair> {
    const database = await openKeyDatabase();
    try {
        const saved = await new Promise<CryptoKeyPair | undefined>((resolve, reject) => {
            const request = database.transaction("keys", "readonly").objectStore("keys").get("current");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        if (saved?.privateKey && saved.publicKey) return saved;
        const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
        await new Promise<void>((resolve, reject) => {
            const transaction = database.transaction("keys", "readwrite");
            transaction.objectStore("keys").put(pair, "current");
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
        return pair;
    } finally {
        database.close();
    }
}

export function getGuardKeys(): Promise<CryptoKeyPair> {
    return keyPromise ??= loadOrCreateKeys().catch(error => { keyPromise = undefined; throw error; });
}

export async function publicKeyString(pair: CryptoKeyPair): Promise<string> {
    return toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
}

export async function validatePublicKey(value: string): Promise<boolean> {
    try {
        const bytes = fromBase64Url(value);
        if (bytes.length !== 65 || bytes[0] !== 4) return false;
        await crypto.subtle.importKey("raw", buffer(bytes), { name: "ECDH", namedCurve: "P-256" }, false, []);
        return true;
    } catch { return false; }
}

async function sharedKey(pair: CryptoKeyPair, peerPublic: string, firstId: string, secondId: string): Promise<CryptoKey> {
    const peer = await crypto.subtle.importKey("raw", buffer(fromBase64Url(peerPublic)), { name: "ECDH", namedCurve: "P-256" }, false, []);
    const secret = await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, pair.privateKey, 256);
    const hkdf = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
    const info = encoder.encode([firstId, secondId].sort().join("|"));
    return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: buffer(encoder.encode("FriendsInVoice Guard v2")), info: buffer(info) },
        hkdf, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

function additionalData(senderId: string, recipientId: string, senderKey: string): Uint8Array {
    return encoder.encode(`FriendsInVoice Guard v2|${senderId}|${recipientId}|${senderKey}`);
}

export async function sealGuardPayload(
    payload: GuardCommand | GuardNotice, pair: CryptoKeyPair, peerPublic: string, senderId: string, recipientId: string
): Promise<GuardSealedWire> {
    const fromKey = await publicKeyString(pair);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await sharedKey(pair, peerPublic, senderId, recipientId);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: buffer(iv), additionalData: buffer(additionalData(senderId, recipientId, fromKey)) },
        key, buffer(encoder.encode(JSON.stringify(payload))));
    return { type: "sealed", version: 2, to: recipientId, fromKey, iv: toBase64Url(iv), ciphertext: toBase64Url(new Uint8Array(ciphertext)) };
}

export async function openGuardPayload(wire: GuardSealedWire, pair: CryptoKeyPair, senderId: string, recipientId: string): Promise<GuardCommand | GuardNotice | null> {
    if (wire.to !== recipientId) return null;
    try {
        const key = await sharedKey(pair, wire.fromKey, senderId, recipientId);
        const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buffer(fromBase64Url(wire.iv)), additionalData: buffer(additionalData(senderId, recipientId, wire.fromKey)) },
            key, buffer(fromBase64Url(wire.ciphertext)));
        return parseGuardPayload(JSON.parse(decoder.decode(plaintext)));
    } catch { return null; }
}
