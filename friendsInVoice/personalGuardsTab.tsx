/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { React, UserStore, useState } from "@webpack/common";

import { GUARD_ACTIONS, GUARD_LABELS, isUserId } from "./personalGuardsProtocol";
import { getGrant, guardDisplayName, type GuardsStore, hasGuardKey, revokeGuard, sendGuardCommand, sendGuardGrant, sendGuardKey, setGrant, sharesVoice } from "./personalGuardsRuntime";
import type { GuardAction } from "./personalGuardsTypes";

const cl = classNameFactory("vc-fiv-");

function GuardianRow({ userId, store, refresh }: { userId: string; store: GuardsStore; refresh(): void; }) {
    const actions = getGrant(store, userId);
    const user = UserStore.getUser(userId);

    function update(next: GuardAction[]) {
        setGrant(store, userId, next);
        refresh();
    }

    return <section className={cl("guard-card")}>
        <div className={cl("guard-title")}>
            {user && <img src={user.getAvatarURL(undefined, 64)} alt="" />}
            <span><strong>{guardDisplayName(userId)}</strong><small>{userId}</small></span>
        </div>
        <div className={cl("guard-options")}>
            {GUARD_ACTIONS.map(action => <label key={action}>
                <input type="checkbox" checked={actions.includes(action)}
                    onChange={() => update(actions.includes(action) ? actions.filter(item => item !== action) : [...actions, action])} />
                {GUARD_LABELS[action]}
            </label>)}
            <label><input type="checkbox" checked={actions.length === GUARD_ACTIONS.length}
                onChange={() => update(actions.length === GUARD_ACTIONS.length ? [] : GUARD_ACTIONS)} />Select all</label>
        </div>
        <div className={cl("guard-controls")}>
            <button onClick={() => void sendGuardGrant(store, userId)} disabled={!hasGuardKey(store, userId)}>Send grant</button>
            {!hasGuardKey(store, userId) && <span className={cl("guard-hint")}>Ask them to share their public key first.</span>}
            <button className={cl("guard-danger")} onClick={() => {
                revokeGuard(store, userId);
                refresh();
                void sendGuardGrant(store, userId);
            }}>Revoke and remove</button>
        </div>
    </section>;
}

function AccessRow({ ownerId, store }: { ownerId: string; store: GuardsStore; }) {
    const grant = store.knownGuardGrants.find(item => item.userId === ownerId);
    if (!grant) return null;
    const together = sharesVoice(ownerId);
    return <section className={cl("guard-card")}>
        <div className={cl("guard-title")}><strong>{guardDisplayName(ownerId)}</strong></div>
        <div className={cl("guard-controls")}>
            {grant.actions.map(action => <button key={action} disabled={!together || !hasGuardKey(store, ownerId)}
                onClick={() => void sendGuardCommand(store, ownerId, action)}>Send {GUARD_LABELS[action]}</button>)}
            <button onClick={() => void sendGuardKey(ownerId)}>Share public key</button>
        </div>
        {!together && <small>Join the same voice channel to use guard actions.</small>}
    </section>;
}

export function PersonalGuardsTab({ store, refresh }: { store: GuardsStore; refresh(): void; }) {
    const [input, setInput] = useState("");
    const [error, setError] = useState("");

    return <div className={cl("guards-tab")}>
        <div className={cl("guards-intro")}>
            <h2>Personal Guards</h2>
            <p>Choose who can mute, deafen, or disconnect your own account while you share voice.</p>
            <small>Share public key → owner sends grant → guardian sends one action. Your private key stays on this device. Press Discord’s Send button for each DM draft.</small>
        </div>
        <form className={cl("guard-add")} onSubmit={event => {
            event.preventDefault();
            const id = input.trim();
            if (!isUserId(id)) { setError("Enter a valid Discord user ID."); return; }
            if (id === UserStore.getCurrentUser()?.id) { setError("You cannot guard yourself."); return; }
            if (!store.personalGuards.some(grant => grant.userId === id)) setGrant(store, id, GUARD_ACTIONS);
            setInput(""); setError(""); refresh();
        }}>
            <input value={input} onChange={event => setInput(event.currentTarget.value)} placeholder="Discord user ID" aria-label="Discord user ID" />
            <button type="submit">Add guard</button>
        </form>
        {error && <div role="alert">{error}</div>}
        <div className={cl("guards-grid")}>
            {store.personalGuards.map(grant => <GuardianRow key={grant.userId} userId={grant.userId} store={store} refresh={refresh} />)}
        </div>
        {!store.personalGuards.length && <p className={cl("guard-empty")}>No guards yet. Add someone here or from their right-click menu.</p>}
        <h3>Access others gave you</h3>
        <div className={cl("guards-grid")}>
            {store.knownGuardGrants.map(grant => <AccessRow key={grant.userId} ownerId={grant.userId} store={store} />)}
        </div>
        {!store.knownGuardGrants.length && <p className={cl("guard-empty")}>No access yet. Share your public key from the owner's right-click menu.</p>}
    </div>;
}
