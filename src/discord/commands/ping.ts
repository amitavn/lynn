import { SlashCommandBuilder } from "@discordjs/builders";
import { InteractionResponseType, type APIInteraction, type APIInteractionResponse } from "discord-api-types/v10";
import type { Command } from "../types.ts";

export const ping: Command = {
    definition: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Replies with pong")
        .toJSON(),
    execute: (_interaction: APIInteraction): APIInteractionResponse => ({
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: "Pong!" },
    }),
};
