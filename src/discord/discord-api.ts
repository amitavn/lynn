import * as Redacted from "effect/Redacted";

const API_BASE = "https://discord.com/api/v10";
const MAX_MESSAGE_LENGTH = 2_000;

const discordHeaders = (token: Redacted.Redacted<string>): HeadersInit => ({
    Authorization: `Bot ${Redacted.value(token)}`,
    "Content-Type": "application/json",
});

export const sendTyping = async (
    channelId: string,
    token: Redacted.Redacted<string>,
): Promise<void> => {
    const response = await fetch(`${API_BASE}/channels/${channelId}/typing`, {
        method: "POST",
        headers: discordHeaders(token),
    });
    if (!response.ok) {
        throw new Error(`Discord typing request failed: ${response.status}`);
    }
};

export const sendChannelMessage = async (
    channelId: string,
    content: string,
    token: Redacted.Redacted<string>,
): Promise<void> => {
    const chunks = splitMessage(content);

    for (const chunk of chunks) {
        const response = await fetch(
            `${API_BASE}/channels/${channelId}/messages`,
            {
                method: "POST",
                headers: discordHeaders(token),
                body: JSON.stringify({ content: chunk }),
            },
        );
        if (!response.ok) {
            throw new Error(`Discord message request failed: ${response.status}`);
        }
    }
};

const splitMessage = (content: string): string[] => {
    if (content.length <= MAX_MESSAGE_LENGTH) {
        return [content];
    }

    const chunks: string[] = [];
    let remaining = content;

    while (remaining.length > MAX_MESSAGE_LENGTH) {
        const slice = remaining.slice(0, MAX_MESSAGE_LENGTH);
        const lastBreak = Math.max(
            slice.lastIndexOf("\n"),
            slice.lastIndexOf(" "),
        );
        const cut = lastBreak > 0 ? lastBreak : MAX_MESSAGE_LENGTH;
        chunks.push(remaining.slice(0, cut));
        remaining = remaining.slice(cut);
    }

    if (remaining.length > 0) {
        chunks.push(remaining);
    }

    return chunks;
};