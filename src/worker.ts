import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse";
import { type APIInteraction } from "discord-api-types/v10";
import { Hono, type Context } from "hono";
import { commands } from "./discord/commands/index.ts";
import { discordConfig } from "./discord/config.ts";
import { createInteractionHandler } from "./discord/interactions.ts";
import { verifyDiscordRequest } from "./discord/verify.ts";
import { kv as KVNamespace } from "./kv.ts";

type RunEffect = <A, E, R>(effect: Effect.Effect<A, E, R>) => Promise<A>;

interface RouteEnv {
    run: RunEffect;
}

const runEffect = <A, E, R>(effect: Effect.Effect<A, E, R>): Promise<A> =>
    Effect.runPromise(effect as Effect.Effect<A, E>);

const effectRoute =
    <A, E, R>(handler: (c: Context) => Effect.Effect<A, E, R>) =>
    (c: Context<{ Bindings: RouteEnv }>) =>
        c.env.run(handler(c));

export default Cloudflare.Worker(
    "lynn",
    { main: import.meta.url },
    Effect.gen(function* () {
        const app = new Hono<{ Bindings: RouteEnv }>();
        const kv = yield* Cloudflare.KV.ReadWriteNamespace(KVNamespace);
        const discord = yield* discordConfig;
        const handleInteraction = createInteractionHandler(commands);

        app.get("/", (c) => c.text("Hello, World!"));

        app.post("/discord/interactions", effectRoute((c) =>
            Effect.gen(function* () {
                const result = yield* Effect.tryPromise(() =>
                    verifyDiscordRequest(c.req.raw, discord.publicKey),
                );

                if (!result.valid) {
                    return c.text("Unauthorized", { status: 401 });
                }

                const response = handleInteraction(result.body as APIInteraction);
                return c.json(response);
            }),
        ));

        app.post("/kv_test_put", effectRoute((c) =>
            Effect.gen(function* () {
                yield* kv.put("greeting", "howdy!");
                return c.text("put");
            }).pipe(
                Effect.catchTag("NamespaceError", (error) =>
                    Effect.succeed(c.text(error.message, { status: 500 })),
                ),
            ),
        ));

        app.get("/kv_test_get", effectRoute((c) =>
            Effect.gen(function* () {
                return c.text("test");
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
    }).pipe(Effect.provide(Cloudflare.KV.ReadWriteNamespaceBinding)),
);
