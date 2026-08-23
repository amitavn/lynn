import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { kv } from "./src/kv.ts";
import Worker from "./src/worker.ts";

export default Alchemy.Stack(
    "lynn",
    {
        providers: Layer.mergeAll(
            Cloudflare.providers(),
            Github.providers(),
        ),
        state: Cloudflare.state(),
    },
    Effect.gen(function* () {
        const worker = yield* Worker;
        const kvNamespace = yield* kv;

        if (process.env.PULL_REQUEST) {
            yield* GitHub.Comment("preview-comment", {
                owner: "your-org",
                repository: "your-repo",
                issueNumber: Number(process.env.PULL_REQUEST),
                body: Output.interpolate`
                  ## Preview Deployed

                  **URL:** ${worker.url}

                  Built from commit ${process.env.GITHUB_SHA?.slice(0, 7)}

                  ---
                  _This comment updates automatically with each push._
                `,
            });
        }

        return { url: worker.url, namespaceId: kvNamespace.namespaceId };
    }),
);
