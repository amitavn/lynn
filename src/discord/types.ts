import { type APIApplicationCommandInteractionData, type RESTPostAPIApplicationCommandsJSONBody } from "discord-api-types/v10";
import type { Reminders } from "./reminders.ts";

export interface CommandContext {
    readonly channelId?: string;
    readonly userId?: string;
    readonly args: string;
    readonly data?: APIApplicationCommandInteractionData;
    readonly reminders: Reminders;
}

export interface CommandResult {
    readonly content: string;
    readonly ephemeral?: boolean;
}

export interface Command {
    readonly definition: RESTPostAPIApplicationCommandsJSONBody;
    readonly execute: (context: CommandContext) => Promise<CommandResult>;
}
