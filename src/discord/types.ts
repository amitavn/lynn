import type { RESTPostAPIApplicationCommandsJSONBody } from "discord-api-types/v10";

export interface CommandContext {
    readonly channelId?: string;
    readonly userId?: string;
    readonly args: string;
}

export interface CommandResult {
    readonly content: string;
    readonly ephemeral?: boolean;
}

export interface Command {
    readonly definition: RESTPostAPIApplicationCommandsJSONBody;
    readonly execute: (context: CommandContext) => CommandResult;
}
