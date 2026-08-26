import { Stage } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { type APIInteraction } from "discord-api-types/v10";
import { Hono, type Context } from "hono";
import { commands } from "./discord/commands/index.ts";
import { discordConfig } from "./discord/config.ts";
import Gateway from "./discord/gateway.ts";
import { createInteractionHandler } from "./discord/interactions.ts";
import LynnAgent from "./discord/agent.ts";
import Scheduler from "./schedule/scheduler.ts";
import { createReminders } from "./discord/reminders.ts";
import { verifyDiscordRequest } from "./discord/verify.ts";
import { FlagsApp } from "./flagship.ts";
import { kv as KVNamespace } from "./kv.ts";

type RunEffect = <A, E, R>(effect: Effect.Effect<A, E, R>) => Promise<A>;

interface RouteEnv {
    run: RunEffect;
}

// SAFETY: Route handlers close over resources already resolved by the outer
// worker effect (discord, gateways) and never yield a binding themselves, so
// each handler's `R` is `never` and `runPromise` needs no provided context.
const runEffect = <A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> =>
    Effect.runPromise(effect as Effect.Effect<A, E>);

const effectRoute =
    <A, E, R>(handler: (c: Context) => Effect.Effect<A, E, R>) =>
    (c: Context<{ Bindings: RouteEnv }>) =>
        c.env.run(handler(c));

export default Cloudflare.Worker(
    "lynn",
    {
        main: import.meta.url,
        compatibility: { flags: ["nodejs_compat"] },
        domain: Output.fromEffect(
            Effect.gen(function* () {
                const stage = yield* Stage;
                return stage === "prod"
                    ? { name: "lynn-bot.twdl.us", zoneName: "twdl.us" }
                    : undefined;
            }),
        ),
        workersDev: { enabled: false, previewsEnabled: true },
    },
    Effect.gen(function* () {
        const app = new Hono<{ Bindings: RouteEnv }>();
        const discord = yield* discordConfig;
        yield* Cloudflare.KV.ReadWriteNamespace(KVNamespace);
        const schedulers = yield* Scheduler;
        const reminders = createReminders(() => schedulers.getByName("scheduler"));
        const handleInteraction = createInteractionHandler(commands, { reminders });
        const gateways = yield* Gateway;
        yield* LynnAgent;
        yield* Cloudflare.Flagship.ReadFlags(FlagsApp);

        app.get("/", (c) => c.text("Hello, World!"));

        app.get("/gateway/status", effectRoute((c) =>
            Effect.gen(function* () {
                const gateway = gateways.getByName("gateway");
                const before = yield* gateway.status();
                if (!before.connected) {
                    yield* gateway.start();
                }
                return c.json(yield* gateway.status());
            }),
        ));

        app.post("/discord/interactions", effectRoute((c) =>
            Effect.gen(function* () {
                const result = yield* Effect.tryPromise(() =>
                    verifyDiscordRequest(c.req.raw, discord.publicKey),
                );

                if (!result.valid) {
                    return c.text("Unauthorized", { status: 401 });
                }

                // SAFETY: verifyDiscordRequest already validated the Ed25519
                // signature against Discord's public key, so `result.body` is an
                // authentic interaction payload and can be treated as APIInteraction.
                const response = yield* Effect.tryPromise(() =>
                    handleInteraction(result.body as APIInteraction),
                );
                return c.json(response);
            }),
        ));

        return {
            fetch: Effect.gen(function* () {
                const request = yield* Cloudflare.Request;
                const executionCtx = yield* Cloudflare.WorkerExecutionContext;

                const env: RouteEnv = {
                    run: runEffect,
                };

                const webResponse = yield* Effect.promise(() =>
                    Promise.resolve(app.fetch(request, env, executionCtx.raw)),
                );

                return HttpServerResponse.fromWeb(webResponse);
            }),
        };
    }).pipe(
        Effect.provide(Cloudflare.KV.ReadWriteNamespaceBinding),
        Effect.provide(Cloudflare.Flagship.ReadFlagsBinding),
    ),
);
