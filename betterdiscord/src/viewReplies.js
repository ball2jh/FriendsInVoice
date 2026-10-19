import { add, button, element, heading, paragraph } from "./dom.js";

function replyButton(text, view) {
    return button(text, () => {
        try { view.bridge.insertReply(text); }
        catch (error) { view.error(error); }
    });
}

export function renderRepliesTab(parent, view) {
    add(parent, heading("Smart replies", 2),
        paragraph("Open a direct message with the other person's latest message. Click a suggestion to put it in Discord's message box; nothing is sent automatically."));
    const current = view.replies.current();
    if (!current) {
        parent.append(paragraph("No recent incoming DM is selected, or smart replies are disabled.", "fivbd-empty"));
        return;
    }
    const suggestions = element("div", "fivbd-actions");
    for (const reply of current.replies) suggestions.append(replyButton(reply, view));
    parent.append(suggestions);
    if (view.data.value.smartRepliesAi) {
        const aiArea = element("div", "fivbd-actions");
        const ask = button("✨ Smarter replies", async () => {
            ask.disabled = true;
            ask.textContent = "Thinking…";
            try {
                const replies = await view.replies.aiReplies();
                aiArea.replaceChildren();
                for (const reply of replies) aiArea.append(replyButton(reply, view));
                if (!replies.length) aiArea.append(paragraph("Claude returned no suggestions."));
            } catch (error) { view.error(error); ask.disabled = false; ask.textContent = "✨ Smarter replies"; }
        });
        aiArea.append(ask);
        parent.append(aiArea);
        parent.append(paragraph("Only clicking Smarter replies sends up to eight recent DM lines to Anthropic.", "fivbd-muted"));
    }
}
