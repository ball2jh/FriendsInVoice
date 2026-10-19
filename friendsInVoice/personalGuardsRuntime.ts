/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { insertTextIntoChatInputBox } from "@utils/discord";
import { findByPropsLazy } from "@webpack";
import { ChannelActionCreators, ChannelStore, GuildMemberStore, GuildStore, MediaEngineStore, SelectedChannelStore, SelectedGuildStore, UserStore, VoiceStateStore } from "@webpack/common";

import { openGuardsPage } from ".";
import { getGuardKeys, openGuardPayload, publicKeyString, sealGuardPayload, validatePublicKey } from "./personalGuardsCrypto";
import { GUARD_ACTIONS, GUARD_LABELS, makeCommand, makeGrantNotice, parseGuardMessage, serializeWire } from "./personalGuardsProtocol";
import type { GuardAction, GuardGrant } from "./personalGuardsTypes";

export interface GuardsStore {
    personalGuards: GuardGrant[];
    knownGuardGrants: GuardGrant[];
    guardPeerKeys: { userId: string; publicKey: string; }[];
    guardBlocks: { userId: string; until: number; }[];
    guardReplay: { nonce: string; createdAt: number; }[];
}

export interface GuardEvent {
    id: string;
    guardianId: string;
    action: GuardAction;
    undo(): void;
}

interface IncomingMessage {
    id: string;
    channel_id: string;
    content: string;
    author: { id: string; bot?: boolean; };
}

const voiceActions = findByPropsLazy("toggleSelfMute", "toggleSelfDeaf") as {
    toggleSelfMute?(): void;
    toggleSelfDeaf?(): void;
};
const voiceChannelActions = findByPropsLazy("selectVoiceChannel", "selectChannel") as {
    selectVoiceChannel(id: string | null): void;
};
const seen = new Set<string>();
const eventListeners = new Set<(event: GuardEvent) => void>();

export function subscribeGuardEvents(listener: (event: GuardEvent) => void): () => void {
    eventListeners.add(listener);
    return () => { eventListeners.delete(listener); };
}

export function clearGuardRuntime() {
    seen.clear();
    eventListeners.clear();
}

export function guardDisplayName(userId: string): string {
    const ownChannel = UserStore.getCurrentUser()?.id && VoiceStateStore.getVoiceStateForUser(UserStore.getCurrentUser()!.id)?.channelId;
    const voiceGuild = ownChannel && ChannelStore.getChannel(ownChannel)?.guild_id;
    const guildId = voiceGuild ?? SelectedGuildStore.getGuildId();
    const user = UserStore.getUser(userId);
    const currentNick = guildId && GuildMemberStore.getNick(guildId, userId);
    if (currentNick) return currentNick;
    for (const sharedGuildId of Object.keys(GuildStore.getGuilds())) {
        const nick = GuildMemberStore.getNick(sharedGuildId, userId);
        if (nick) return nick;
    }
    return (user as typeof user & { globalName?: string; } | undefined)?.globalName ?? user?.username ?? userId;
}

export function getGrant(store: GuardsStore, userId: string): GuardAction[] {
    return store.personalGuards.find(grant => grant.userId === userId)?.actions ?? [];
}

export function setGrant(store: GuardsStore, userId: string, actions: GuardAction[]) {
    store.personalGuards = [
        ...store.personalGuards.filter(grant => grant.userId !== userId).map(grant => ({ userId: grant.userId, actions: [...grant.actions] })),
        { userId, actions: GUARD_ACTIONS.filter(action => actions.includes(action)) },
    ];
}

export function revokeGuard(store: GuardsStore, userId: string) {
    store.personalGuards = store.personalGuards.filter(grant => grant.userId !== userId)
        .map(grant => ({ userId: grant.userId, actions: [...grant.actions] }));
}

function peerKey(store: GuardsStore, userId: string): string | undefined {
    return store.guardPeerKeys.find(peer => peer.userId === userId)?.publicKey;
}

export function hasGuardKey(store: GuardsStore, userId: string): boolean {
    return !!peerKey(store, userId);
}

async function openDraft(userId: string, text: string): Promise<boolean> {
    try {
        await ChannelActionCreators.openPrivateChannel({ recipientIds: [userId] });
        for (let attempt = 0; attempt < 20; attempt++) {
            const channel = ChannelStore.getChannel(SelectedChannelStore.getChannelId());
            if (channel?.isDM() && channel.recipients?.includes(userId)) {
                insertTextIntoChatInputBox(text);
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } catch { /* The draft stays untouched. */ }
    showNotification({ title: "Personal Guards", body: "Could not open the intended DM. Nothing was inserted." });
    return false;
}

function sendError(message: string) {
    showNotification({ title: "Personal Guards", body: message });
}

export async function sendGuardKey(userId: string) {
    try {
        const publicKey = await publicKeyString(await getGuardKeys());
        if (await openDraft(userId, serializeWire({ type: "key", version: 2, publicKey })))
            showNotification({ title: "Personal Guards", body: "Secure key DM is ready. Press Discord's Send button. The owner can then choose what you may do." });
    } catch { sendError("Secure key storage is unavailable. No message was prepared."); }
}

export async function sendGuardGrant(store: GuardsStore, guardianId: string) {
    const ownerId = UserStore.getCurrentUser()?.id;
    const key = peerKey(store, guardianId);
    if (!ownerId || !key) { sendError("Ask this person to share their public key from the Personal Guards menu first."); return; }
    try {
        const wire = await sealGuardPayload(makeGrantNotice(ownerId, getGrant(store, guardianId)), await getGuardKeys(), key, ownerId, guardianId);
        if (await openDraft(guardianId, serializeWire(wire)))
            showNotification({ title: "Personal Guards", body: "Encrypted access DM is ready. Press Discord's Send button to finish setup." });
    } catch { sendError("Could not prepare the encrypted grant. Nothing was sent."); }
}

export async function sendGuardCommand(store: GuardsStore, ownerId: string, action: GuardAction) {
    const guardianId = UserStore.getCurrentUser()?.id;
    const key = peerKey(store, ownerId);
    if (!guardianId || !key) { sendError("No public key for this owner. Ask them to send an updated grant."); return; }
    try {
        const wire = await sealGuardPayload(makeCommand(ownerId, action), await getGuardKeys(), key, guardianId, ownerId);
        await openDraft(ownerId, serializeWire(wire));
    } catch { sendError("Could not prepare the encrypted command. Nothing was sent."); }
}

function getVoiceChannel(userId: string): string | null {
    return VoiceStateStore.getVoiceStateForUser(userId)?.channelId ?? null;
}

export function sharesVoice(userId: string): boolean {
    const myId = UserStore.getCurrentUser()?.id;
    const channel = myId && getVoiceChannel(myId);
    return !!channel && getVoiceChannel(userId) === channel;
}

function applyAction(action: GuardAction): (() => void) | null {
    if (action === "disconnect") {
        const ownId = UserStore.getCurrentUser()?.id;
        const oldChannel = ownId && getVoiceChannel(ownId);
        if (!oldChannel) return null;
        voiceChannelActions.selectVoiceChannel(null);
        return () => voiceChannelActions.selectVoiceChannel(oldChannel);
    }
    if (action === "mute") {
        const previous = MediaEngineStore.isSelfMute();
        if (!voiceActions.toggleSelfMute) return null;
        if (!previous) voiceActions.toggleSelfMute();
        return () => { if (!previous && MediaEngineStore.isSelfMute()) voiceActions.toggleSelfMute?.(); };
    }
    const previous = MediaEngineStore.isSelfDeaf();
    if (!voiceActions.toggleSelfDeaf) return null;
    if (!previous) voiceActions.toggleSelfDeaf();
    return () => { if (!previous && MediaEngineStore.isSelfDeaf()) voiceActions.toggleSelfDeaf?.(); };
}

export async function handleGuardMessage(store: GuardsStore, message: IncomingMessage) {
    if (!message?.id || seen.has(message.id) || message.author?.bot) return;
    const wire = parseGuardMessage(message.content);
    if (!wire || !ChannelStore.getChannel(message.channel_id)?.isDM()) return;
    seen.add(message.id);
    if (seen.size > 1000) seen.clear();
    const me = UserStore.getCurrentUser()?.id;
    const senderId = message.author?.id;
    if (!me || !senderId || senderId === me) return;
    if (wire.type === "key") {
        if (!await validatePublicKey(wire.publicKey)) return;
        store.guardPeerKeys = [...store.guardPeerKeys.filter(peer => peer.userId !== senderId)
            .map(peer => ({ userId: peer.userId, publicKey: peer.publicKey })), { userId: senderId, publicKey: wire.publicKey }];
        showNotification({
            title: "Personal Guards",
            body: `Secure key received from ${guardDisplayName(senderId)}. Click to choose allowed actions and prepare their access DM.`,
            onClick: openGuardsPage
        });
        return;
    }
    if (wire.to !== me) return;
    const pinned = peerKey(store, senderId);
    let payload;
    try { payload = await openGuardPayload(wire, await getGuardKeys(), senderId, me); } catch { return; }
    if (!payload) return;
    if (payload.kind === "grant") {
        if (payload.ownerId !== senderId || Math.abs(Date.now() - payload.createdAt) > 7 * 24 * 60 * 60_000) return;
        store.guardPeerKeys = [...store.guardPeerKeys.filter(peer => peer.userId !== senderId)
            .map(peer => ({ userId: peer.userId, publicKey: peer.publicKey })), { userId: senderId, publicKey: wire.fromKey }];
        store.knownGuardGrants = [
            ...store.knownGuardGrants.filter(grant => grant.userId !== senderId)
                .map(grant => ({ userId: grant.userId, actions: [...grant.actions] })),
            ...(payload.actions.length ? [{ userId: senderId, actions: [...payload.actions] }] : []),
        ];
        showNotification({ title: "Personal Guards", body: `${guardDisplayName(senderId)} updated your guard access. Click to see your available actions.`, onClick: openGuardsPage });
        return;
    }
    if (payload.ownerId !== me || Math.abs(Date.now() - payload.createdAt) > 5 * 60_000) return;
    if (!pinned || pinned !== wire.fromKey || !getGrant(store, senderId).includes(payload.action) || !sharesVoice(senderId)) return;
    if (store.guardBlocks.some(block => block.userId === senderId && block.until > Date.now())) return;
    if (store.guardReplay.some(entry => entry.nonce === payload.nonce)) return;
    const undo = applyAction(payload.action);
    if (!undo) return;
    store.guardReplay = [...store.guardReplay.filter(entry => Date.now() - entry.createdAt < 5 * 60_000)
        .map(entry => ({ nonce: entry.nonce, createdAt: entry.createdAt })), { nonce: payload.nonce, createdAt: Date.now() }];
    const event = { id: message.id, guardianId: senderId, action: payload.action, undo };
    for (const listener of eventListeners) listener(event);
    if (!eventListeners.size) showNotification({ title: `Personal Guard: ${guardDisplayName(senderId)}`, body: `${GUARD_LABELS[payload.action]} applied. Click to undo.`, permanent: true, onClick: undo });
}
