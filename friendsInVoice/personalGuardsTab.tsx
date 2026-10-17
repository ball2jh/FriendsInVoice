/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { React, UserStore, useState } from "@webpack/common";

import { GUARD_ACTIONS, GUARD_LABELS, isUserId } from "./personalGuardsProtocol";
import { getGrant, type GuardEvent, type GuardsStore,prepareGrantNotice, setGrant } from "./personalGuardsRuntime";
import type { GuardAction } from "./personalGuardsTypes";

const cl = classNameFactory("vc-fiv-");
const BLOCK_MINUTES = [5, 15, 30, 60, 120];

interface Props {
    store: GuardsStore;
    event: GuardEvent | null;
    onChange(): void;
    clearEvent(): void;
}

function GuardianRow({ userId, store, onChange }: { userId: string; store: GuardsStore; onChange(): void; }) {
    const actions = getGrant(store, userId);
    const name = UserStore.getUser(userId)?.username ?? userId;
    const blockedUntil = store.guardBlocks.find(block => block.userId === userId)?.until ?? 0;

    function update(next: GuardAction[]) {
        setGrant(store, userId, next);
        onChange();
    }

    return <div className={cl("guard-card")}>
        <div className={cl("guard-title")}><strong>{name}</strong> <small>{userId}</small></div>
        <div className={cl("guard-options")}>
            {GUARD_ACTIONS.map(action => <label key={action}>
                <input type="checkbox" checked={actions.includes(action)} onChange={() => update(actions.includes(action) ? actions.filter(value => value !== action) : [...actions, action])} />
                {GUARD_LABELS[action]}
            </label>)}
            <label><input type="checkbox" checked={actions.length === GUARD_ACTIONS.length} onChange={() => update(actions.length === GUARD_ACTIONS.length ? [] : GUARD_ACTIONS)} /> Select all</label>
        </div>
        <div className={cl("guard-controls")}>
            <button onClick={() => prepareGrantNotice(store, userId)}>Prepare grant notice DM</button>
            <select defaultValue="15" aria-label={`Block duration for ${name}`} id={`vc-fiv-block-${userId}`}>
                {BLOCK_MINUTES.map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
            </select>
            <button onClick={() => {
                const select = document.getElementById(`vc-fiv-block-${userId}`) as HTMLSelectElement | null;
                const minutes = Number(select?.value ?? 15);
                store.guardBlocks = [...store.guardBlocks.filter(block => block.userId !== userId), { userId, until: Date.now() + minutes * 60_000 }];
                onChange();
            }}>Block commands</button>
            {blockedUntil > Date.now() && <button onClick={() => {
                store.guardBlocks = store.guardBlocks.filter(block => block.userId !== userId);
                onChange();
            }}>Unblock</button>}
            <button onClick={() => update([])}>Revoke</button>
        </div>
        {blockedUntil > Date.now() && <small>Blocked until {new Date(blockedUntil).toLocaleTimeString()}</small>}
    </div>;
}

export function PersonalGuardsTab({ store, event, onChange, clearEvent }: Props) {
    const [input, setInput] = useState("");
    const [error, setError] = useState("");

    return <div className={cl("guards-tab")}>
        <h2>Personal Guards</h2>
        <p>Grant someone permission to mute your microphone, deafen you, or disconnect you while you share a voice channel. Your client performs the action on your account.</p>
        <p>Right-click a user to add them. After changing permissions, prepare a grant notice DM and press Send yourself. Revocations take effect here immediately; send a new notice to update their menu.</p>
        {event && <div className={cl("guard-event")}>
            {UserStore.getUser(event.guardianId)?.username ?? event.guardianId} used {GUARD_LABELS[event.action]}.
            <button onClick={() => { event.undo(); clearEvent(); }}>Undo</button>
            <button onClick={clearEvent}>Dismiss</button>
        </div>}
        <form onSubmit={e => {
            e.preventDefault();
            const id = input.trim();
            if (!isUserId(id)) { setError("Enter a valid Discord user ID."); return; }
            if (id === UserStore.getCurrentUser()?.id) { setError("You cannot guard yourself."); return; }
            if (!getGrant(store, id).length) setGrant(store, id, GUARD_ACTIONS);
            setInput(""); setError(""); onChange();
        }}>
            <input value={input} onChange={e => setInput(e.currentTarget.value)} placeholder="Discord user ID" aria-label="Discord user ID" />
            <button type="submit">Add to Personal Guards</button>
        </form>
        {error && <div role="alert">{error}</div>}
        {store.personalGuards.length === 0 && <p>No Personal Guards yet.</p>}
        {store.personalGuards.map(grant => <GuardianRow key={grant.userId} userId={grant.userId} store={store} onChange={onChange} />)}
        <h3>People who granted you access</h3>
        {store.knownGuardGrants.length === 0 && <p>No grant notices received. Ask the owner to send one manually.</p>}
        {store.knownGuardGrants.map(grant => <div key={grant.userId} className={cl("guard-card")}>
            {UserStore.getUser(grant.userId)?.username ?? grant.userId}: {grant.actions.map(action => GUARD_LABELS[action]).join(", ")}
        </div>)}
    </div>;
}
