import * as Schema from "effect/Schema";
import type * as Redacted from "effect/Redacted";
import { sendChannelMessage } from "../discord-api.ts";
import type { JsonValue } from "../../schedule/json.ts";

export interface TaskDeps {
    readonly discordToken: Redacted.Redacted<string>;
}

export interface RegisteredTask {
    readonly type: string;
    readonly validate: (payload: JsonValue) => boolean;
    readonly dispatch: (payloadJson: string, deps: TaskDeps) => Promise<void>;
}

const defineTask = <S extends Schema.ConstraintDecoder<unknown, never>>(
    type: string,
    schema: S,
    run: (payload: S["Type"], deps: TaskDeps) => Promise<void>,
): RegisteredTask => ({
    type,
    validate: (payload) => {
        try {
            Schema.decodeUnknownSync(schema)(payload);
            return true;
        } catch {
            return false;
        }
    },
    dispatch: async (payloadJson, deps) => {
        try {
            const parsed: unknown = JSON.parse(payloadJson);
            const payload = Schema.decodeUnknownSync(schema)(parsed);
            await run(payload, deps);
        } catch (error) {
            console.error(
                JSON.stringify({
                    message: "task dispatch failed",
                    type,
                    error: error instanceof Error ? error.message : String(error),
                }),
            );
        }
    },
});

export const ReminderPayload = Schema.Struct({
    type: Schema.Literals(["reminder"]),
    channelId: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
    content: Schema.String,
});

export const tasks: readonly RegisteredTask[] = [
    defineTask(
        "reminder",
        ReminderPayload,
        async (payload, deps) => {
            await sendChannelMessage(payload.channelId, payload.content, deps.discordToken);
        },
    ),
];
