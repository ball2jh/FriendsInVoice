/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { insertTextIntoChatInputBox } from "@utils/discord";
import { findByPropsLazy } from "@webpack";
import { ChannelActionCreators, ChannelStore, MediaEngineStore, SelectedChannelStore, UserStore, VoiceStateStore } from "@webpack/common";

import { GUARD_ACTIONS, GUARD_LABELS, makeCommand, makeGrantNotice, parseGuardMessage } from "./personalGuardsProtocol";
import type { GuardAction, GuardGrant } from "./personalGuardsTypes";

export interface GuardsStore {
    personalGuards: GuardGrant[];
    knownGuardGrants: GuardGrant[];
    guardBlocks: { userId: string; until: number; }[];
    guardReplay: { nonce: string; createdAt: number; }[];
}

export interface GuardEvent {
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
let onEvent: ((event: GuardEvent) => void) | undefined;

export function setGuardEventListener(listener?: (event: GuardEvent) => void) {
    onEvent = listener;
}

export function clearGuardRuntime() {
    seen.clear();
    onEvent = undefined;
}

export function getGrant(store: GuardsStore, userId: string): GuardAction[] {
    return store.personalGuards.find(grant => grant.userId === userId)?.actions ?? [];
}

export function setGrant(store: GuardsStore, userId: string, actions: GuardAction[]) {
    store.personalGuards = [
        ...store.personalGuards.filter(grant => grant.userId !== userId),
        { userId, actions: GUARD_ACTIONS.filter(action => actions.includes(action)) },
    ];
}

export async function prepareGuardDm(userId: string, text: string) {
    try {
        await ChannelActionCreators.openPrivateChannel({ recipientIds: [userId] });
        for (let attempt = 0; attempt < 20; attempt++) {
            const channel = ChannelStore.getChannel(SelectedChannelStore.getChannelId());
            if (channel?.isDM() && channel.recipients?.includes(userId)) {
                // The user reviews the draft and presses Send. This function never sends a message.
                insertTextIntoChatInputBox(text);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        showNotification({ title: "Personal Guards", body: "Could not open the intended DM. Command was not inserted." });
    } catch {
        showNotification({ title: "Personal Guards", body: "Could not open the intended DM. Command was not inserted." });
    }
}

export function prepareGrantNotice(store: GuardsStore, userId: string) {
    const ownerId = UserStore.getCurrentUser()?.id;
    if (ownerId) void prepareGuardDm(userId, makeGrantNotice(ownerId, getGrant(store, userId)));
}

export function prepareGuardCommand(ownerId: string, action: GuardAction) {
    void prepareGuardDm(ownerId, makeCommand(ownerId, action));
}

function getVoiceChannel(userId: string): string | null {
    return VoiceStateStore.getVoiceStateForUser(userId)?.channelId ?? null;
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

export function handleGuardMessage(store: GuardsStore, message: IncomingMessage) {
    if (!message?.id || seen.has(message.id) || message.author?.bot) return;
    const parsed = parseGuardMessage(message.content);
    if (!parsed) return;
    const channel = ChannelStore.getChannel(message.channel_id);
    if (!channel?.isDM()) return;
    seen.add(message.id);
    if (seen.size > 1000) seen.clear();
    const me = UserStore.getCurrentUser()?.id;
    if (!me || !message.author?.id) return;
    if (parsed.kind === "grant") {
        if (parsed.ownerId !== message.author.id || Math.abs(Date.now() - parsed.createdAt) > 7 * 24 * 60 * 60_000) return;
        store.knownGuardGrants = [
            ...store.knownGuardGrants.filter(grant => grant.userId !== parsed.ownerId),
            ...(parsed.actions.length ? [{ userId: parsed.ownerId, actions: parsed.actions }] : []),
        ];
        return;
    }
    if (parsed.ownerId !== me || Math.abs(Date.now() - parsed.createdAt) > 5 * 60_000) return;
    if (!getGrant(store, message.author.id).includes(parsed.action)) return;
    if (store.guardBlocks.some(block => block.userId === message.author.id && block.until > Date.now())) return;
    if (store.guardReplay.some(entry => entry.nonce === parsed.nonce)) return;
    const myChannel = getVoiceChannel(me);
    if (!myChannel || getVoiceChannel(message.author.id) !== myChannel) return;
    const undo = applyAction(parsed.action);
    if (!undo) return;
    store.guardReplay = [...store.guardReplay.filter(entry => Date.now() - entry.createdAt < 5 * 60_000), { nonce: parsed.nonce, createdAt: Date.now() }];
    const name = UserStore.getUser(message.author.id)?.username ?? message.author.id;
    showNotification({
        title: `Personal Guard: ${name}`,
        body: `${GUARD_LABELS[parsed.action]} applied. Click to undo. Open Personal Guards to temporarily block commands.`,
        permanent: true,
        onClick: undo,
    });
    onEvent?.({ guardianId: message.author.id, action: parsed.action, undo });
}
