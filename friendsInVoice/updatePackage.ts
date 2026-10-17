/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createHash } from "node:crypto";

import { unzipSync } from "fflate";

import type { ReleaseAsset, ReleaseInfo } from "./updateTypes";
import { parseVersion } from "./updateVersion";

const REPO = "mPhpMaster/FriendsInVoice";
const MAX_DOWNLOAD = 10 * 1024 * 1024;
const MAX_UNPACKED = 20 * 1024 * 1024;
const FILE_PATTERN = /^friendsInVoice\/[A-Za-z][A-Za-z0-9]*\.(?:ts|tsx|css)$/;
const REQUIRED = ["index.tsx", "native.ts", "notifications.ts"];

export function selectReleaseAsset(release: ReleaseInfo, version: string): ReleaseAsset {
    if (!parseVersion(version) || release.tag_name !== `v${version}` || release.draft || release.prerelease)
        throw new Error("The release identity is invalid.");
    const name = `FriendsInVoice-v${version}.zip`;
    const asset = release.assets?.find(item => item.name === name);
    const expectedUrl = `https://github.com/${REPO}/releases/download/v${version}/${name}`;
    if (!asset || asset.browser_download_url !== expectedUrl ||
        !/^sha256:[0-9a-f]{64}$/i.test(asset.digest ?? "") ||
        !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > MAX_DOWNLOAD)
        throw new Error("The release ZIP or its SHA-256 digest is missing or invalid.");
    return asset;
}

function inspectCentralDirectory(bytes: Uint8Array): void {
    let total = 0, entries = 0;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let at = 0; at + 46 <= bytes.length; at++) {
        if (view.getUint32(at, true) !== 0x02014b50) continue;
        const flags = view.getUint16(at + 8, true);
        const size = view.getUint32(at + 24, true);
        const nameLength = view.getUint16(at + 28, true);
        const extraLength = view.getUint16(at + 30, true);
        const commentLength = view.getUint16(at + 32, true);
        const mode = view.getUint32(at + 38, true) >>> 16;
        if (flags & 1 || size > 2 * 1024 * 1024 || (mode & 0xf000) === 0xa000)
            throw new Error("The ZIP contains an unsafe entry.");
        total += size;
        if (total > MAX_UNPACKED || ++entries > 100) throw new Error("The ZIP is too large.");
        at += 45 + nameLength + extraLength + commentLength;
    }
    if (!entries) throw new Error("The ZIP has no entries.");
}

export function validatePackage(bytes: Uint8Array, asset: ReleaseAsset, version: string): Map<string, Uint8Array> {
    if (bytes.length !== asset.size || bytes.length > MAX_DOWNLOAD) throw new Error("The ZIP size changed during download.");
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (`sha256:${digest}` !== asset.digest?.toLowerCase()) throw new Error("The ZIP checksum does not match GitHub's release digest.");
    inspectCentralDirectory(bytes);
    const archive = unzipSync(bytes);
    const files = new Map<string, Uint8Array>();
    for (const [name, content] of Object.entries(archive)) {
        if (name.includes("\\") || name.startsWith("/") || name.split("/").includes("..") || name.includes("\0"))
            throw new Error("The ZIP contains an unsafe path.");
        if (!FILE_PATTERN.test(name)) continue;
        if (files.has(name)) throw new Error("The ZIP contains duplicate plugin files.");
        files.set(name, content);
    }
    for (const name of REQUIRED) if (!files.has(`friendsInVoice/${name}`))
        throw new Error(`The ZIP is missing ${name}.`);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for (const name of ["index.tsx", "notifications.ts"]) {
        const source = decoder.decode(files.get(`friendsInVoice/${name}`)!);
        if (!source.includes(`const VERSION = "${version}";`)) throw new Error(`${name} has the wrong version.`);
    }
    return files;
}
