import { SlashCommandBuilder } from "@discordjs/builders";
import type { Command } from "../types.ts";

export const ping: Command = {
    definition: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Replies with pong")
        .toJSON(),
    execute: async () => ({ content: "Pong!" }),
};
