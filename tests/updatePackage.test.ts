import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { zipSync } from "fflate";

import { selectReleaseAsset, validatePackage } from "../friendsInVoice/updatePackage";
import { isNewer } from "../friendsInVoice/updateVersion";

const version = "1.9.0";
const name = `FriendsInVoice-v${version}.zip`;
const url = `https://github.com/mPhpMaster/FriendsInVoice/releases/download/v${version}/${name}`;

function fixture(extra: Record<string, Uint8Array> = {}) {
    const data = new TextEncoder();
    const bytes = zipSync({
        "friendsInVoice/index.tsx": data.encode(`const VERSION = "${version}";`),
        "friendsInVoice/notifications.ts": data.encode(`const VERSION = "${version}";`),
        "friendsInVoice/native.ts": data.encode("export const ready = true;"),
        ...extra
    });
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    return { bytes, asset: { name, browser_download_url: url, digest, size: bytes.length } };
}

test("version comparison rejects malformed releases", () => {
    assert.equal(isNewer("1.9.0", "1.8.0"), true);
    assert.equal(isNewer("1.8.0-rc1", "1.8.0"), false);
    assert.equal(isNewer("1.8.0", "1.8.0"), false);
});

test("release asset must be exact and carry a digest", () => {
    const { asset } = fixture();
    assert.deepEqual(selectReleaseAsset({ tag_name: `v${version}`, draft: false, prerelease: false, assets: [asset] }, version), asset);
    assert.throws(() => selectReleaseAsset({ tag_name: `v${version}`, draft: false, prerelease: false, assets: [{ ...asset, browser_download_url: "https://evil.example/update.zip" }] }, version));
});

test("valid ZIP extracts only plugin source and detects tampering", () => {
    const { bytes, asset } = fixture({ "install.ps1": new TextEncoder().encode("danger") });
    const files = validatePackage(bytes, asset, version);
    assert.equal(files.size, 3);
    const changed = Uint8Array.from(bytes);
    changed[20] ^= 1;
    assert.throws(() => validatePackage(changed, asset, version), /checksum/);
});

test("unsafe paths and mismatched source versions fail", () => {
    const unsafe = fixture({ "../escape.ts": new Uint8Array([1]) });
    assert.throws(() => validatePackage(unsafe.bytes, unsafe.asset, version), /unsafe path/);
    const mismatch = fixture({ "friendsInVoice/index.tsx": new TextEncoder().encode('const VERSION = "1.8.0";') });
    assert.throws(() => validatePackage(mismatch.bytes, mismatch.asset, version), /wrong version/);
});
