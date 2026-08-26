import { describe, expect, test } from "vitest";
import {
    InteractionResponseType,
    InteractionType,
    type APIApplicationCommandInteractionData,
    type APIInteraction,
} from "discord-api-types/v10";
import { createInteractionHandler } from "./interactions.ts";
import type { Command, CommandContext } from "./types.ts";
import type { Reminders } from "./reminders.ts";

const fakeReminders: Reminders = {
    at: async () => ({ ok: true, id: "x" }),
    recurring: async () => ({ ok: true, id: "x" }),
    list: async () => [],
    cancel: async () => true,
};

const fakeCommand: Command = {
    definition: {
        name: "remind",
        description: "test command",
        type: 1,
    },
    execute: async (context: CommandContext) => ({
        content: `args=${context.args} channel=${context.channelId ?? "none"} reminders=${
            context.reminders === fakeReminders ? "wired" : "missing"
        }`,
    }),
};

const handler = createInteractionHandler([fakeCommand], { reminders: fakeReminders });

const interaction = (overrides: {
    readonly type: InteractionType;
    readonly channel_id?: string;
    readonly data?: APIApplicationCommandInteractionData;
}): APIInteraction => {
    // SAFETY: fixtures only populate the envelope fields the handler reads;
    // discord-api-types requires further envelope metadata irrelevant here.
    return {
        id: "test",
        token: "tok",
        application_id: "app",
        version: 1,
        app_permissions: "0",
        entitlements: [],
        authorizing_integration_owners: {},
        attachment_size_limit: 0,
        ...overrides,
    } as APIInteraction;
};

describe("interaction handler", () => {
    test("answers pings", async () => {
        const response = await handler(interaction({ type: InteractionType.Ping }));
        expect(response).toEqual({ type: InteractionResponseType.Pong });
    });

    test("awaits async command results and wires reminders", async () => {
        const response = await handler(
            interaction({
                type: InteractionType.ApplicationCommand,
                channel_id: "chan-1",
                data: { id: "r1", name: "remind", type: 1 },
            }),
        );
        expect(response).toEqual({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: {
                content: "args= channel=chan-1 reminders=wired",
                flags: undefined,
            },
        });
    });

    test("rejects unknown commands", async () => {
        const response = await handler(
            interaction({
                type: InteractionType.ApplicationCommand,
                data: { id: "x1", name: "nope", type: 1 },
            }),
        );
        expect(response).toEqual({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: { content: "Unknown command", flags: 1 << 6 },
        });
    });
});
