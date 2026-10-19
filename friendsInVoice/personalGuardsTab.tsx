/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { openUserProfileModal, React, UserStore, useState } from "@webpack/common";

import { ownerSetupMessage, ownerSetupStep } from "./personalGuardsOnboarding";
import { GUARD_ACTIONS, GUARD_LABELS } from "./personalGuardsProtocol";
import { getGrant, guardDisplayName, type GuardsStore, hasGuardKey, revokeGuard, sendGuardCommand, sendGuardGrant, sendGuardKey, setGrant, sharesVoice } from "./personalGuardsRuntime";
import type { GuardAction } from "./personalGuardsTypes";

const cl = classNameFactory("vc-fiv-");

function GuardIdentity({ userId }: { userId: string; }) {
    const user = UserStore.getUser(userId);
    return <div className={cl("guard-title")}>
        {user && <img src={user.getAvatarURL(undefined, 64)} alt="" />}
        <span>
            <button className={cl("guard-person")} onClick={() => openUserProfileModal({ userId })}>
                <strong>{guardDisplayName(userId)}</strong>
                {user && <small>@{user.username}</small>}
                <small>{userId}</small>
            </button>
        </span>
    </div>;
}

function matchesGuard(userId: string, search: string): boolean {
    const user = UserStore.getUser(userId);
    return [guardDisplayName(userId), user?.username ?? "", userId]
        .some(value => value.toLowerCase().includes(search));
}

function GuardianRow({ userId, store, refresh }: { userId: string; store: GuardsStore; refresh(): void; }) {
    const actions = getGrant(store, userId);
    const step = ownerSetupStep(actions, hasGuardKey(store, userId));

    function update(next: GuardAction[]) {
        setGrant(store, userId, next);
        refresh();
    }

    return <section className={cl("guard-card")}>
        <GuardIdentity userId={userId} />
        <p className={cl("guard-step")}>{ownerSetupMessage(step)}</p>
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
            <button onClick={() => void sendGuardGrant(store, userId)} disabled={step !== "send-access"}>Prepare access DM</button>
            <button className={cl("guard-danger")} onClick={() => {
                revokeGuard(store, userId);
                refresh();
                if (hasGuardKey(store, userId)) void sendGuardGrant(store, userId);
            }}>Revoke and remove</button>
        </div>
    </section>;
}

function AccessRow({ ownerId, store }: { ownerId: string; store: GuardsStore; }) {
    const grant = store.knownGuardGrants.find(item => item.userId === ownerId);
    if (!grant) return null;
    const together = sharesVoice(ownerId);
    return <section className={cl("guard-card")}>
        <GuardIdentity userId={ownerId} />
        <p className={cl("guard-step")}>Access granted. Join the same voice channel, choose one action, then press Send in the DM.</p>
        <div className={cl("guard-controls")}>
            {grant.actions.map(action => <button key={action} disabled={!together || !hasGuardKey(store, ownerId)}
                onClick={() => void sendGuardCommand(store, ownerId, action)}>Send {GUARD_LABELS[action]}</button>)}
            <button onClick={() => void sendGuardKey(ownerId)}>Renew secure setup</button>
        </div>
        {!together && <small>Join the same voice channel to use guard actions.</small>}
    </section>;
}

export function PersonalGuardsTab({ store, refresh }: { store: GuardsStore; refresh(): void; }) {
    const [search, setSearch] = useState("");
    const query = search.trim().toLowerCase();
    const guardians = store.personalGuards.filter(item => matchesGuard(item.userId, query));
    const owners = store.knownGuardGrants.filter(item => matchesGuard(item.userId, query));

    return <div className={cl("guards-tab")}>
        <div className={cl("guards-intro")}>
            <h2>Personal Guards</h2>
            <p>Choose who can mute, deafen, or disconnect your own account while you share voice.</p>
            <small>To add someone, right-click their Discord profile → Personal Guards → Add as Guardian. They then choose Offer to guard on your profile and send the prepared DM. When their key arrives, select allowed actions and send one encrypted access DM. Your private key stays on this device; every DM needs you to press Discord's Send button.</small>
        </div>
        <input className={cl("guard-search")} type="search" value={search} onChange={event => setSearch(event.currentTarget.value)}
            placeholder="Search guardians and access" aria-label="Search guardians and access" />
        <h3>People who guard me</h3>
        <div className={cl("guards-grid")}>
            {guardians.map(grant => <GuardianRow key={grant.userId} userId={grant.userId} store={store} refresh={refresh} />)}
        </div>
        {!store.personalGuards.length && <p className={cl("guard-empty")}>No guardians yet. Right-click a person in Discord and choose Personal Guards → Add as Guardian.</p>}
        <h3>Access others gave you</h3>
        <div className={cl("guards-grid")}>
            {owners.map(grant => <AccessRow key={grant.userId} ownerId={grant.userId} store={store} />)}
        </div>
        {!store.knownGuardGrants.length && <p className={cl("guard-empty")}>No access yet. Right-click the owner and choose Personal Guards → Offer to guard, then press Send in the DM.</p>}
    </div>;
}
