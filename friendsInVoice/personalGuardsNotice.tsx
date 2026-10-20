/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { React, useEffect, useState } from "@webpack/common";

import { GUARD_LABELS } from "./personalGuardsProtocol";
import { guardDisplayName, type GuardEvent, type GuardsStore, subscribeGuardEvents } from "./personalGuardsRuntime";
import { writeGuardSetting } from "./personalGuardsSettings";

const cl = classNameFactory("vc-fiv-");
const BLOCK_MINUTES = [5, 15, 30, 60, 120];

function Notice({ event, store, dismiss }: { event: GuardEvent; store: GuardsStore; dismiss(): void; }) {
    const [minutes, setMinutes] = useState(15);
    const [blocked, setBlocked] = useState(false);

    return <div className={cl("guard-notice")} role="alertdialog" aria-label="Personal Guard command">
        <strong>{guardDisplayName(event.guardianId)}</strong>
        <div>{GUARD_LABELS[event.action]} was applied to your account.</div>
        <div className={cl("guard-notice-actions")}>
            <button onClick={() => { event.undo(); dismiss(); }}>Undo</button>
            <label>Block for
                <select value={minutes} onChange={e => setMinutes(Number(e.currentTarget.value))}>
                    {BLOCK_MINUTES.map(value => <option key={value} value={value}>{value} minutes</option>)}
                </select>
            </label>
            <button onClick={() => {
                writeGuardSetting(store, "guardBlocks", [...store.guardBlocks.filter(item => item.userId !== event.guardianId)
                    .map(item => ({ userId: item.userId, until: item.until })),
                    { userId: event.guardianId, until: Date.now() + minutes * 60_000 }]);
                setBlocked(true);
            }}>{blocked ? "Blocked" : "Block commands"}</button>
            <button onClick={dismiss} aria-label="Dismiss notification">✕</button>
        </div>
    </div>;
}

export function GuardNotificationHost({ store }: { store: GuardsStore; }) {
    const [events, setEvents] = useState<GuardEvent[]>([]);
    useEffect(() => subscribeGuardEvents(event => setEvents(current => [...current, event].slice(-5))), []);
    return <div className={cl("guard-notices")}>
        {events.map(event => <Notice key={event.id} event={event} store={store}
            dismiss={() => setEvents(current => current.filter(item => item.id !== event.id))} />)}
    </div>;
}
