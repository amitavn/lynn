import {
    InteractionResponseType,
    InteractionType,
    type APIApplicationCommandInteractionData,
    type APIInteraction,
    type APIInteractionResponse,
} from "discord-api-types/v10";
import type { Command } from "./types.ts";

const unknownCommand: APIInteractionResponse = {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content: "Unknown command", flags: 1 << 6 },
};

const unsupportedInteraction: APIInteractionResponse = {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content: "This interaction is not supported", flags: 1 << 6 },
};

const isChatInputCommand = (
    data: APIApplicationCommandInteractionData,
): data is APIApplicationCommandInteractionData & { readonly name: string } =>
    "name" in data && typeof data.name === "string";

export const createInteractionHandler = (commands: readonly Command[]) =>
    (interaction: APIInteraction): APIInteractionResponse => {
        if (interaction.type === InteractionType.Ping) {
            return { type: InteractionResponseType.Pong };
        }

        if (interaction.type === InteractionType.ApplicationCommand) {
            const data = interaction.data;

            if (isChatInputCommand(data)) {
                const command = commands.find((c) => c.definition.name === data.name);
                return command ? command.execute(interaction) : unknownCommand;
            }
        }

        return unsupportedInteraction;
    };
