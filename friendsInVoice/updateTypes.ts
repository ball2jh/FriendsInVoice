/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface UpdateStatus {
    stage: "idle" | "downloading" | "validating" | "installing" | "building" | "restarting" | "failed";
    message: string;
    version?: string;
}

export interface ReleaseAsset {
    name: string;
    browser_download_url: string;
    digest?: string;
    size: number;
}

export interface ReleaseInfo {
    tag_name: string;
    draft: boolean;
    prerelease: boolean;
    assets: ReleaseAsset[];
}
