import { getGuardKeys, openGuardPayload, publicKeyString, sealGuardPayload, validatePublicKey } from "../../friendsInVoice/personalGuardsCrypto.ts";
import { GUARD_ACTIONS, GUARD_LABELS, makeCommand, makeGrantNotice, parseGuardMessage, serializeWire } from "../../friendsInVoice/personalGuardsProtocol.ts";

const MAX_COMMAND_AGE = 5 * 60_000;
const MAX_GRANT_AGE = 7 * 24 * 60 * 60_000;

export class GuardService {
    constructor(api, bridge, data, openPage) {
        this.api = api;
        this.bridge = bridge;
        this.data = data;
        this.openPage = openPage;
        this.seen = new Set();
        this.active = true;
    }
    stop() { this.active = false; this.seen.clear(); }
    grantFor(id) { return this.data.value.personalGuards.find(item => item.userId === id)?.actions ?? []; }
    knownFor(id) { return this.data.value.knownGuardGrants.find(item => item.userId === id)?.actions ?? []; }
    keyFor(id) { return this.data.value.guardPeerKeys.find(item => item.userId === id)?.publicKey; }
    setKey(id, publicKey) {
        this.data.value.guardPeerKeys = [...this.data.value.guardPeerKeys.filter(item => item.userId !== id), { userId: id, publicKey }];
        this.data.save();
    }
    notify(title, content, action) {
        if (!this.active) return;
        this.api.UI.showNotice(`${title}: ${content}`, action ? { buttons: [{ label: "Open Personal Guards", onClick: action }] } : {});
    }
    async sendKey(id) {
        if (!this.active) return;
        try {
            const publicKey = await publicKeyString(await getGuardKeys());
            await this.bridge.prepareDm(id, serializeWire({ type: "key", version: 2, publicKey }));
            this.api.UI.showToast("Secure key draft is ready. Press Discord's Send button.", { type: "info" });
        } catch (error) { this.api.UI.showToast(String(error), { type: "error" }); }
    }
    async sendGrant(id) {
        if (!this.active) return;
        const ownerId = this.bridge.currentId();
        const key = this.keyFor(id);
        if (!ownerId || !key) return this.api.UI.showToast("Ask this person to offer to guard you first.", { type: "warning" });
        try {
            const payload = makeGrantNotice(ownerId, this.grantFor(id));
            const wire = await sealGuardPayload(payload, await getGuardKeys(), key, ownerId, id);
            await this.bridge.prepareDm(id, serializeWire(wire));
            this.api.UI.showToast("Encrypted access draft is ready. Press Discord's Send button.", { type: "info" });
        } catch (error) { this.api.UI.showToast(String(error), { type: "error" }); }
    }
    async sendCommand(id, action) {
        if (!this.active || !GUARD_ACTIONS.includes(action) || !this.knownFor(id).includes(action) || !this.bridge.sharesVoice(id)) return;
        const senderId = this.bridge.currentId();
        const key = this.keyFor(id);
        if (!senderId || !key) return this.api.UI.showToast("The owner's secure key is unavailable.", { type: "error" });
        try {
            const wire = await sealGuardPayload(makeCommand(id, action), await getGuardKeys(), key, senderId, id);
            await this.bridge.prepareDm(id, serializeWire(wire));
            this.api.UI.showToast("Encrypted action draft is ready. Press Discord's Send button.", { type: "info" });
        } catch (error) { this.api.UI.showToast(String(error), { type: "error" }); }
    }
    revoke(id) {
        const hadKey = !!this.keyFor(id);
        this.data.revoke(id);
        if (hadKey) void this.sendGrant(id);
    }
    async onMessage(message) {
        if (!this.active || !message?.id || this.seen.has(message.id) || message.author?.bot) return;
        const wire = parseGuardMessage(message.content ?? "");
        if (!wire || !this.bridge.isDm(this.bridge.channel(message.channel_id))) return;
        this.seen.add(message.id);
        if (this.seen.size > 1000) this.seen.clear();
        const me = this.bridge.currentId();
        const sender = message.author?.id;
        if (!me || !sender || sender === me) return;
        if (wire.type === "key") {
            if (!await validatePublicKey(wire.publicKey)) return;
            this.setKey(sender, wire.publicKey);
            this.notify("Personal Guards", `Secure key received from ${this.bridge.name(sender)}. Choose their permissions and prepare the access DM.`, () => this.openPage("guards"));
            return;
        }
        if (wire.to !== me) return;
        const pinned = this.keyFor(sender);
        let payload;
        try { payload = await openGuardPayload(wire, await getGuardKeys(), sender, me); } catch { return; }
        if (!payload) return;
        if (payload.kind === "grant") {
            if (payload.ownerId !== sender || Math.abs(Date.now() - payload.createdAt) > MAX_GRANT_AGE) return;
            this.setKey(sender, wire.fromKey);
            this.data.value.knownGuardGrants = [...this.data.value.knownGuardGrants.filter(item => item.userId !== sender),
                ...(payload.actions.length ? [{ userId: sender, actions: [...payload.actions] }] : [])];
            this.data.save();
            this.notify("Personal Guards", `${this.bridge.name(sender)} updated your access.`, () => this.openPage("guards"));
            return;
        }
        if (payload.ownerId !== me || Math.abs(Date.now() - payload.createdAt) > MAX_COMMAND_AGE ||
            !pinned || pinned !== wire.fromKey || !this.grantFor(sender).includes(payload.action) || !this.bridge.sharesVoice(sender) ||
            this.data.value.guardBlocks.some(item => item.userId === sender && item.until > Date.now()) ||
            this.data.value.guardReplay.some(item => item.nonce === payload.nonce)) return;
        const undo = this.bridge.applyGuardAction(payload.action);
        if (!undo) return;
        this.data.value.guardReplay = [...this.data.value.guardReplay.filter(item => Date.now() - item.createdAt < MAX_COMMAND_AGE),
            { nonce: payload.nonce, createdAt: Date.now() }];
        this.data.save();
        this.api.UI.showNotice(`${this.bridge.name(sender)} applied ${GUARD_LABELS[payload.action]} to your account.`, {
            buttons: [
                { label: "Undo", onClick: () => undo() },
                { label: "Block 15 minutes", onClick: () => {
                    this.data.value.guardBlocks = [...this.data.value.guardBlocks.filter(item => item.userId !== sender),
                        { userId: sender, until: Date.now() + 15 * 60_000 }];
                    this.data.save();
                } }
            ]
        });
    }
}
