import { describe, expect, test } from "vitest";
import type { APIInteraction } from "discord-api-types/v10";
import { InteractionResponseType, InteractionType } from "discord-api-types/v10";
import { createInteractionHandler } from "./interactions.ts";
import type { Command, CommandContext } from "../types.ts";

const fakeCommand: Command = {
    definition: {
        id: "remind",
        name: "remind",
        type: 1,
    },
    execute: async (context: CommandContext) => ({
        content: `args=${context.args} channel=${context.channelId ?? "none"}`,
    }),
};

const handler = createInteractionHandler([fakeCommand]);

describe("interaction handler", () => {
    test("answers pings", async () => {
        const response = await handler({ type: InteractionType.Ping });
        expect(response).toEqual({ type: InteractionResponseType.Pong });
    });

    test("awaits async command results", async () => {
        const response = await handler({
            type: InteractionType.ApplicationCommand,
            channel_id: "chan-1",
            data: {
                id: "remind",
                name: "remind",
                type: 1,
            },
        } as unknown as APIInteraction);
        expect(response).toEqual({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: { content: "args= channel=chan-1", flags: undefined },
        });
    });

    test("rejects unknown commands", async () => {
        const response = await handler({
            type: InteractionType.ApplicationCommand,
            data: { id: "x", name: "nope", type: 1 },
        } as unknown as APIInteraction);
        expect(response).toEqual({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: { content: "Unknown command", flags: 1 << 6 },
        });
    });
});
