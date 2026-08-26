import { RuntimeContext } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import LynnAgent from "./agent.ts";
import { commands } from "./commands/index.ts";
import { discordConfig } from "./config.ts";
import { sendChannelMessage, sendTyping } from "./discord-api.ts";
import type { Command } from "./types.ts";
import { AI_AGENT_FLAG_KEY, flagshipBinding } from "../flagship.ts";

const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";
const GUILD_MESSAGES_INTENT = 1 << 9;
const RECONNECT_DELAY_MS = 2_000;

const GatewayEnvelopeSchema = Schema.Struct({
    op: Schema.Number,
    s: Schema.optional(Schema.NullOr(Schema.Number)),
    t: Schema.optional(Schema.NullOr(Schema.String)),
    d: Schema.Unknown,
});

const HelloSchema = Schema.Struct({
    heartbeat_interval: Schema.Number,
});

const MessageCreateSchema = Schema.Struct({
    id: Schema.String,
    channel_id: Schema.String,
    author: Schema.Struct({
        id: Schema.String,
        bot: Schema.optional(Schema.Boolean),
    }),
    content: Schema.String,
    mentions: Schema.Array(Schema.Struct({ id: Schema.String })),
});

const ReadySchema = Schema.Struct({
    session_id: Schema.String,
});

interface GatewayEnvelope {
    op: number;
    s?: number | null;
    t?: string | null;
    d: unknown;
}

interface MessageCreate {
    readonly id: string;
    readonly channel_id: string;
    readonly author: { readonly id: string; readonly bot?: boolean };
    readonly content: string;
    readonly mentions: readonly { readonly id: string }[];
}

const parseMentionCommand = (
    prompt: string,
): { command: Command; args: string } | null => {
    const match = /^\/?(\S+)(?:\s+([\s\S]*))?$/.exec(prompt);
    if (match === null) {
        return null;
    }
    const command = commands.find(
        (candidate) => candidate.definition.name === match[1].toLowerCase(),
    );
    return command === undefined
        ? null
        : { command, args: match[2]?.trim() ?? "" };
};

export default class Gateway extends Cloudflare.DurableObject<Gateway>()(
    "Gateway",
    Effect.gen(function* () {
        const discord = yield* discordConfig.pipe(Effect.orDie);
        const agents = yield* LynnAgent;
        const state = yield* Cloudflare.DurableObjectState;
        const env = yield* Cloudflare.WorkerEnvironment;

        return Effect.gen(function* () {
            const runtimeContext = yield* RuntimeContext;
            const flagship = flagshipBinding(env);
            let socket: WebSocket | null = null;
            let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
            let heartbeatIntervalMs = 41_250;
            let seq: number | null = null;
            let sessionId: string | null = null;
            let connected = false;

            const runInContext = <A, E>(
                effect: Effect.Effect<A, E, RuntimeContext>,
            ): Promise<A> =>
                Effect.runPromise(
                    effect.pipe(
                        Effect.provideService(RuntimeContext, runtimeContext),
                    ),
                );

            const persistSession = () =>
                Effect.gen(function* () {
                    yield* state.storage.put("seq", seq);
                    yield* state.storage.put("sessionId", sessionId);
                });

            const restoreSession = () =>
                Effect.gen(function* () {
                    seq = (yield* state.storage.get<number | null>("seq")) ?? null;
                    sessionId =
                        (yield* state.storage.get<string | null>("sessionId")) ??
                        null;
                });

            const scheduleReconnect = () =>
                Effect.gen(function* () {
                    yield* state.storage.setAlarm(Date.now() + RECONNECT_DELAY_MS);
                });

            const identify = (): void => {
                if (!socket || socket.readyState !== WebSocket.OPEN) {
                    return;
                }
                socket.send(
                    JSON.stringify({
                        op: 2,
                        d: {
                            token: Redacted.value(discord.token),
                            intents: GUILD_MESSAGES_INTENT,
                            properties: {
                                os: "linux",
                                browser: "lynn",
                                device: "lynn",
                            },
                        },
                    }),
                );
            };

            const resume = (): void => {
                if (!socket || socket.readyState !== WebSocket.OPEN) {
                    return;
                }
                socket.send(
                    JSON.stringify({
                        op: 6,
                        d: {
                            token: Redacted.value(discord.token),
                            session_id: sessionId,
                            seq,
                        },
                    }),
                );
            };

            const sendHeartbeat = (): void => {
                if (!socket || socket.readyState !== WebSocket.OPEN) {
                    return;
                }
                socket.send(JSON.stringify({ op: 1, d: seq }));
            };

            const startHeartbeat = (): void => {
                if (heartbeatTimer) {
                    clearInterval(heartbeatTimer);
                }
                heartbeatTimer = setInterval(
                    sendHeartbeat,
                    heartbeatIntervalMs,
                );
            };

            const clearHeartbeat = (): void => {
                if (heartbeatTimer) {
                    clearInterval(heartbeatTimer);
                    heartbeatTimer = null;
                }
            };

            const stripMention = (content: string): string =>
                content
                    .replace(
                        new RegExp(`^<@!?${discord.applicationId}>\\s*`),
                        "",
                    )
                    .trim();

            const handleMessageCreate = async (
                d: MessageCreate,
            ): Promise<void> => {
                if (d.author.bot === true) {
                    return;
                }

                const mentioned = d.mentions.some(
                    (mention) => mention.id === discord.applicationId,
                );
                const prompt = stripMention(d.content);
                console.log(
                    JSON.stringify({
                        message: "gateway message received",
                        id: d.id,
                        channelId: d.channel_id,
                        authorId: d.author.id,
                        mentioned,
                        prompt,
                    }),
                );
                if (!mentioned && prompt === d.content) {
                    return;
                }
                if (prompt.length === 0) {
                    return;
                }

                const mentionCommand = parseMentionCommand(prompt);
                if (mentionCommand !== null) {
                    console.log(
                        JSON.stringify({
                            message: "gateway command invoked",
                            id: d.id,
                            channelId: d.channel_id,
                            command: mentionCommand.command.definition.name,
                        }),
                    );
                    try {
                        await sendTyping(d.channel_id, discord.token);
                        const result = await mentionCommand.command.execute({
                            channelId: d.channel_id,
                            userId: d.author.id,
                            args: mentionCommand.args,
                        });
                        await sendChannelMessage(
                            d.channel_id,
                            result.content,
                            discord.token,
                        );
                    } catch (error) {
                        console.error(
                            JSON.stringify({
                                message: "gateway command failed",
                                error:
                                    error instanceof Error
                                        ? error.message
                                        : String(error),
                            }),
                        );
                    }
                    return;
                }

                const enabled = await flagship.getBooleanValue(
                    AI_AGENT_FLAG_KEY,
                    false,
                    {
                        userId: d.author.id,
                        channelId: d.channel_id,
                    },
                );
                console.log(
                    JSON.stringify({
                        message: "gateway flag evaluated",
                        id: d.id,
                        enabled,
                    }),
                );
                if (!enabled) {
                    return;
                }

                try {
                    await sendTyping(d.channel_id, discord.token);
                    const reply = await runInContext(
                        agents.getByName(d.channel_id).ask(prompt),
                    );
                    await sendChannelMessage(d.channel_id, reply, discord.token);
                } catch (error) {
                    console.error(
                        JSON.stringify({
                            message: "gateway message handling failed",
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        }),
                    );
                }
            };

            const handleMessage = async (raw: string): Promise<void> => {
                let envelope: GatewayEnvelope;
                try {
                    const parsed: unknown = JSON.parse(raw);
                    envelope = Schema.decodeUnknownSync(GatewayEnvelopeSchema)(
                        parsed,
                    );
                } catch (error) {
                    console.error(
                        JSON.stringify({
                            message: "gateway message parse failed",
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        }),
                    );
                    return;
                }

                if (envelope.s !== undefined && envelope.s !== null) {
                    seq = envelope.s;
                    await runInContext(persistSession());
                }

                switch (envelope.op) {
                    case 10: {
                        const hello = Schema.decodeUnknownSync(HelloSchema)(
                            envelope.d,
                        );
                        heartbeatIntervalMs = hello.heartbeat_interval;
                        startHeartbeat();
                        if (sessionId !== null && seq !== null) {
                            resume();
                        } else {
                            identify();
                        }
                        return;
                    }

                    case 11:
                        return;

                    case 0: {
                        console.log(
                            JSON.stringify({
                                message: "gateway dispatch",
                                t: envelope.t,
                            }),
                        );

                        if (envelope.t === "READY") {
                            const ready = Schema.decodeUnknownSync(ReadySchema)(
                                envelope.d,
                            );
                            sessionId = ready.session_id;
                            await runInContext(persistSession());
                            return;
                        }

                        if (envelope.t === "MESSAGE_CREATE") {
                            const message = Schema.decodeUnknownSync(
                                MessageCreateSchema,
                            )(envelope.d);
                            await handleMessageCreate(message);
                        }
                        return;
                    }

                    case 7:
                        if (socket) {
                            socket.close(4000, "reconnect requested");
                        }
                        return;

                    case 9: {
                        const resumable = envelope.d;
                        if (resumable === false) {
                            sessionId = null;
                            seq = null;
                            await runInContext(persistSession());
                            identify();
                        } else {
                            resume();
                        }
                        return;
                    }

                    default:
                        return;
                }
            };

            const connect = () =>
                Effect.gen(function* () {
                    if (
                        socket &&
                        (socket.readyState === WebSocket.OPEN ||
                            socket.readyState === WebSocket.CONNECTING)
                    ) {
                        return;
                    }

                    yield* restoreSession();

                    const ws = new WebSocket(GATEWAY_URL);
                    socket = ws;
                    connected = false;

                    ws.addEventListener("open", () => {
                        connected = true;
                    });

                    ws.addEventListener("message", (event) => {
                        void handleMessage(String(event.data)).catch((error) => {
                            console.error(
                                JSON.stringify({
                                    message: "gateway dispatch failed",
                                    error:
                                        error instanceof Error
                                            ? error.message
                                            : String(error),
                                }),
                            );
                        });
                    });

                    ws.addEventListener("close", () => {
                        connected = false;
                        clearHeartbeat();
                        socket = null;
                        void runInContext(scheduleReconnect()).catch(
                            (error) => {
                                console.error(
                                    JSON.stringify({
                                        message: "gateway reconnect schedule failed",
                                        error:
                                            error instanceof Error
                                                ? error.message
                                                : String(error),
                                    }),
                                );
                            },
                        );
                    });

                    ws.addEventListener("error", () => {
                        connected = false;
                        clearHeartbeat();
                        try {
                            ws.close();
                        } catch {
                            // the socket may already be closing
                        }
                    });
                });

            return {
                start: () =>
                    Effect.gen(function* () {
                        yield* connect();
                        return { ok: true };
                    }),
                status: () =>
                    Effect.succeed({
                        connected,
                        seq,
                        sessionId,
                    }),
                alarm: () =>
                    Effect.gen(function* () {
                        if (
                            !socket ||
                            socket.readyState === WebSocket.CLOSED ||
                            socket.readyState === WebSocket.CLOSING
                        ) {
                            yield* connect();
                        }
                    }),
            };
        });
    }),
) {}