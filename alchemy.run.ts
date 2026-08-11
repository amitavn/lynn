import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import { kv } from "./src/kv.ts";
import Worker from "./src/worker.ts";

export default Alchemy.Stack(
    "BOT-C",
    {
        providers: Cloudflare.providers(),
        state: Cloudflare.state(),
    },
    Effect.gen(function* () {
        const worker = yield* Worker;
        const kvNamespace = yield* kv;
        return { url: worker.url, namespaceId: kvNamespace.namespaceId };
    }),
);
