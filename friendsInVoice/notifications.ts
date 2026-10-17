/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { getUserSettingLazy } from "@api/UserSettings";
import { ChannelStore, PresenceStore, showToast, UserStore, VoiceStateStore } from "@webpack/common";

import { openPageFor,openPrivateChannel, setPageOpen, settings } from ".";
import { describeChannel, displayName } from "./voiceContent";
const StatusSettings = getUserSettingLazy<string>("status", "status")!;
const VERSION = "1.8.0";
const REPO = "mPhpMaster/FriendsInVoice";// ---------- lists ----------

export type ListKey = "watchlist" | "notifyOnline" | "blacklist" | "notifyVoice";

export function inList(key: ListKey, id: string) {
    return settings.store[key].includes(id);
}

export function toggleInList(key: ListKey, id: string) {
    const list = settings.store[key];
    settings.store[key] = list.includes(id) ? list.filter(x => x !== id) : [...list, id];
    if (key === "notifyOnline" || key === "blacklist") lastStatus.set(id, PresenceStore.getStatus(id));
    if (key === "notifyVoice") lastVoiceChannel.set(id, VoiceStateStore.getVoiceStateForUser(id)?.channelId ?? null);
}

// ---------- voice join notifications ----------

const lastVoiceChannel = new Map<string, string | null>();

export function seedVoiceChannels() {
    lastVoiceChannel.clear();
    for (const id of settings.store.notifyVoice) {
        lastVoiceChannel.set(id, VoiceStateStore.getVoiceStateForUser(id)?.channelId ?? null);
    }
}

function notifyJoinedVoice(id: string, channelId: string) {
    const { user, name } = nameOf(id);
    const channel = ChannelStore.getChannel(channelId);
    const where = channel ? describeChannel(channel) : null;
    const offline = !isOnline(PresenceStore.getStatus(id));

    showNotification({
        title: `🔊 ${name} joined a voice room${offline ? " (shows offline)" : ""}`,
        body: where ? `${where.roomName} · ${where.place}. Click to see who's with them.` : "Click to see where they are.",
        icon: user?.getAvatarURL(undefined, 128),
        onClick: () => openPageFor(id),
    });
}

export function onVoiceStateUpdates(voiceStates: { userId: string; channelId?: string | null; }[]) {
    const list = settings.store.notifyVoice;
    if (!list.length) return;

    for (const s of voiceStates) {
        if (!list.includes(s.userId)) continue;

        const now = s.channelId ?? null;
        const prev = lastVoiceChannel.get(s.userId);
        lastVoiceChannel.set(s.userId, now);

        // only notify when they go from "not in voice" to "in a room"; moving between rooms isn't a new join
        if (Date.now() < quietUntil || !now || prev) continue;
        notifyJoinedVoice(s.userId, now);
    }
}

// ---------- online notifications ----------

const lastStatus = new Map<string, string>();
let quietUntil = 0;
let reseedTimer: ReturnType<typeof setTimeout> | undefined;

// after (re)connecting, Discord sends presences and voice states in bulk; don't treat those as changes,
// and re-read where everyone is once things have settled
export function startQuietPeriod() {
    quietUntil = Date.now() + 15_000;
    clearTimeout(reseedTimer);
    reseedTimer = setTimeout(() => {
        seedStatuses();
        seedVoiceChannels();
    }, 15_000);
}

export const isOnline = (status?: string) => !!status && status !== "offline" && status !== "invisible";

export function seedStatuses() {
    lastStatus.clear();
    for (const id of [...settings.store.notifyOnline, ...settings.store.blacklist]) {
        lastStatus.set(id, PresenceStore.getStatus(id));
    }
}

function nameOf(id: string) {
    const user = UserStore.getUser(id);
    return { user, name: user ? displayName(user, null) : "Someone" };
}

function notifyCameOnline(id: string) {
    const { user, name } = nameOf(id);
    showNotification({
        title: `${name} is online`,
        body: "Click to open your DM with them.",
        icon: user?.getAvatarURL(undefined, 128),
        onClick: () => {
            setPageOpen(false);
            openPrivateChannel(id);
        },
    });

    if (settings.store.notifyOnce) {
        settings.store.notifyOnline = settings.store.notifyOnline.filter(x => x !== id);
    }
}

function notifyRunAway(id: string) {
    const { user, name } = nameOf(id);
    showNotification({
        title: `🏃 ${name} is online`,
        body: "They're on your Run away list. Click to go invisible.",
        icon: user?.getAvatarURL(undefined, 128),
        onClick: async () => {
            await StatusSettings.updateSetting("invisible");
            showToast({ text: "Your status is now Invisible", variant: "success" });
        },
    });
}

export function onPresenceChange() {
    const { notifyOnline, blacklist } = settings.store;
    if (!notifyOnline.length && !blacklist.length) return;

    for (const id of new Set([...notifyOnline, ...blacklist])) {
        const status = PresenceStore.getStatus(id);
        const prev = lastStatus.get(id);
        lastStatus.set(id, status);

        // presences arrive in bulk after (re)connecting, so don't treat those as "came online"
        if (Date.now() < quietUntil || prev === undefined) continue;
        if (isOnline(prev) || !isOnline(status)) continue;

        if (blacklist.includes(id)) notifyRunAway(id);
        if (notifyOnline.includes(id)) notifyCameOnline(id);
    }
}

// ---------- update check ----------

let notifiedVersion: string | null = null;
let updateTimer: ReturnType<typeof setInterval> | undefined;

function isNewer(a: string, b: string) {
    const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
        if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    }
    return false;
}

export async function checkForUpdate(manual = false) {
    if (!manual && !settings.store.checkForUpdates) return;

    try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
            headers: { Accept: "application/vnd.github+json" }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const { tag_name, html_url } = await res.json();
        const latest = String(tag_name).replace(/^v/, "");

        if (!isNewer(latest, VERSION)) {
            if (manual) showToast({ text: `Friends in Voice is up to date (v${VERSION})`, variant: "success" });
            return;
        }
        if (!manual && notifiedVersion === latest) return;
        notifiedVersion = latest;

        showNotification({
            title: `Friends in Voice v${latest} is out`,
            body: `You have v${VERSION}. Click to open the download page, then run install.bat from the new zip.`,
            permanent: true,
            onClick: () => VencordNative.native.openExternal(html_url),
        });
    } catch {
        if (manual) showToast({ text: "Couldn't check for updates", variant: "critical" });
    }
}

export function startUpdateTimer() { updateTimer = setInterval(() => checkForUpdate(), 6 * 60 * 60 * 1000); }
export function stopUpdateTimer() { clearInterval(updateTimer); clearTimeout(reseedTimer); }
