/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { NavContextMenuPatchCallback } from "@api/ContextMenu";
import type { User } from "@vencord/discord-types";
import { Menu, UserStore } from "@webpack/common";

import { inList, openGuardsPage, selfMenuItems, settings, toggleInList } from ".";
import { GUARD_ACTIONS, GUARD_LABELS } from "./personalGuardsProtocol";
import { hasGuardKey, sendGuardCommand, sendGuardKey, setGrant, sharesVoice } from "./personalGuardsRuntime";

export const UserContextPatch: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user) return;
    if (user.id === UserStore.getCurrentUser()?.id) {
        children.push(selfMenuItems());
        return;
    }

    const watched = inList("watchlist", user.id);
    const notifyVoice = inList("notifyVoice", user.id);
    const notify = inList("notifyOnline", user.id);
    const blocked = inList("blacklist", user.id);
    const known = settings.store.knownGuardGrants.find(grant => grant.userId === user.id);
    const actions = known && hasGuardKey(settings.store, user.id) && sharesVoice(user.id)
        ? GUARD_ACTIONS.filter(action => known.actions.includes(action)) : [];

    children.push(<Menu.MenuGroup>
        <Menu.MenuItem id="vc-fiv-watch" label={watched ? "Remove from My list" : "Add to My list"}
            action={() => toggleInList("watchlist", user.id)} />
        <Menu.MenuItem id="vc-fiv-notify-voice" label={notifyVoice ? "Stop notifying me when in voice" : "Notify me when in voice"}
            action={() => toggleInList("notifyVoice", user.id)} />
        <Menu.MenuItem id="vc-fiv-notify" label={notify ? "Stop notifying me when online" : "Notify me when online"}
            action={() => toggleInList("notifyOnline", user.id)} />
        <Menu.MenuItem id="vc-fiv-blacklist" label={blocked ? "Remove from Run away" : "Add to Run away"}
            color={blocked ? undefined : "danger"} action={() => toggleInList("blacklist", user.id)} />
        <Menu.MenuItem id="vc-fiv-personal-guards" label="Personal Guards">
            <Menu.MenuItem id="vc-fiv-add-guard" label={settings.store.personalGuards.some(grant => grant.userId === user.id) ? "Manage guardian" : "Add as Guardian"}
                action={() => {
                    if (!settings.store.personalGuards.some(grant => grant.userId === user.id)) setGrant(settings.store, user.id, []);
                    openGuardsPage();
                }} />
            <Menu.MenuItem id="vc-fiv-send-key" label="Offer to guard (prepare secure key DM)" action={() => void sendGuardKey(user.id)} />
            {actions.length > 0 && <Menu.MenuItem id="vc-fiv-guard-actions" label="Guard Actions">
                {actions.map(action => <Menu.MenuItem key={action} id={`vc-fiv-guard-${action}`} label={`Send ${GUARD_LABELS[action]}`}
                    action={() => void sendGuardCommand(settings.store, user.id, action)} />)}
            </Menu.MenuItem>}
        </Menu.MenuItem>
    </Menu.MenuGroup>);
};
