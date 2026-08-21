import type { APIInteraction, APIInteractionResponse, RESTPostAPIApplicationCommandsJSONBody } from "discord-api-types/v10";

export interface Command {
    readonly definition: RESTPostAPIApplicationCommandsJSONBody;
    readonly execute: (interaction: APIInteraction) => APIInteractionResponse;
}
