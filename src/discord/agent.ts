import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { llmConfig } from "./config.ts";
import {
    createLynnAgent,
    lastAssistantText,
    persistMessages,
    restoreMessages,
    resolveModelId,
    type PersistedMessage,
} from "./pi-agent.ts";

const HISTORY_TABLE = `
    CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        messages TEXT NOT NULL
    )
`;

const PersistedMessageSchema = Schema.Struct({
    role: Schema.Literals(["user", "assistant"] as const),
    text: Schema.String,
    timestamp: Schema.Number,
});
const PersistedMessagesSchema = Schema.Array(PersistedMessageSchema);

const parseHistory = (raw: string): readonly PersistedMessage[] => {
    const parsed: unknown = JSON.parse(raw);
    return Schema.decodeUnknownSync(PersistedMessagesSchema)(parsed);
};

export default class LynnAgent extends Cloudflare.DurableObject<LynnAgent>()(
    "LynnAgent",
    Effect.gen(function* () {
        const config = yield* llmConfig.pipe(Effect.orDie);
        const state = yield* Cloudflare.DurableObjectState;

        return Effect.gen(function* () {
            yield* state.blockConcurrencyWhile(() =>
                Effect.gen(function* () {
                    yield* state.storage.sql.exec(HISTORY_TABLE);
                }),
            );

            const loadHistory = () =>
                Effect.gen(function* () {
                    const cursor = yield* state.storage.sql.exec<{
                        messages: string;
                    }>("SELECT messages FROM history WHERE id = 1");
                    const rows = yield* cursor.toArray();
                    if (rows.length === 0) {
                        return [];
                    }
                    return parseHistory(rows[0].messages);
                });

            const saveHistory = (messages: readonly PersistedMessage[]) =>
                Effect.gen(function* () {
                    yield* state.storage.sql.exec(
                        `INSERT INTO history (id, messages) VALUES (1, ?)
                         ON CONFLICT (id) DO UPDATE SET messages = excluded.messages`,
                        JSON.stringify(messages),
                    );
                });

            return {
                ask: (prompt: string) =>
                    Effect.gen(function* () {
                        const modelId = resolveModelId(config.model);
                        const history = yield* loadHistory();
                        const messages = restoreMessages(history, modelId);

                        const agent = yield* Effect.tryPromise(() =>
                            createLynnAgent({
                                modelId,
                                apiKey: config.cloudflareApiKey,
                                accountId: config.cloudflareAccountId,
                                history: messages,
                            }),
                        );

                        try {
                            yield* Effect.promise(() => agent.prompt(prompt));
                            const text = lastAssistantText(agent.state.messages);
                            yield* saveHistory(persistMessages(agent.state.messages));
                            return text;
                        } finally {
                            agent.abort();
                        }
                    }),
            };
        });
    }),
) {}