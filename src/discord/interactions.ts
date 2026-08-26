import {
    ApplicationCommandType,
    InteractionResponseType,
    InteractionType,
    type APIApplicationCommandInteractionData,
    type APIChatInputApplicationCommandInteractionData,
    type APIInteraction,
    type APIInteractionResponse,
} from "discord-api-types/v10";
import type { Command, CommandContext, CommandResult } from "./types.ts";
import type { Reminders } from "./reminders.ts";

const unknownCommand: APIInteractionResponse = {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content: "Unknown command", flags: 1 << 6 },
};

const unsupportedInteraction: APIInteractionResponse = {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content: "This interaction is not supported", flags: 1 << 6 },
};

const toInteractionResponse = (result: CommandResult): APIInteractionResponse => ({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
        content: result.content,
        flags: result.ephemeral === true ? 1 << 6 : undefined,
    },
});

const isChatInputCommand = (
    data: APIApplicationCommandInteractionData,
): data is APIChatInputApplicationCommandInteractionData =>
    data.type === ApplicationCommandType.ChatInput;

export const createInteractionHandler = (
    commands: readonly Command[],
    deps: { readonly reminders: Reminders },
) =>
    async (interaction: APIInteraction): Promise<APIInteractionResponse> => {
        if (interaction.type === InteractionType.Ping) {
            return { type: InteractionResponseType.Pong };
        }

        if (interaction.type === InteractionType.ApplicationCommand) {
            const data = interaction.data;

            if (isChatInputCommand(data)) {
                const command = commands.find((c) => c.definition.name === data.name);
                if (command === undefined) {
                    return unknownCommand;
                }
                const context: CommandContext = {
                    channelId: interaction.channel_id,
                    userId: interaction.member?.user.id ?? interaction.user?.id,
                    args: "",
                    data,
                    reminders: deps.reminders,
                };
                return toInteractionResponse(await command.execute(context));
            }
        }

        return unsupportedInteraction;
    };
