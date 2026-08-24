import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { gatewayAccess } from "./src/access.ts";
import { kv } from "./src/kv.ts";
import { AIAgentFlag } from "./src/flagship.ts";
import Worker from "./src/worker.ts";

export default Alchemy.Stack(
    "lynn",
    {
        providers: Layer.mergeAll(
            Cloudflare.providers(),
            GitHub.providers(),
        ),
        state: Cloudflare.state(),
    },
    Effect.gen(function* () {
        const worker = yield* Worker;
        const kvNamespace = yield* kv;
        yield* AIAgentFlag;
        yield* gatewayAccess;

        const github = yield* GitHub.GitHubEnv.pipe(Effect.orElseSucceed(() => undefined));
        if (github?.pr) {
            yield* GitHub.Comment("preview-comment", {
                owner: github.owner,
                repository: github.repository,
                issueNumber: github.pr,
                body: Output.interpolate`
                  ## Preview Deployed

                  **URL:** ${worker.url}

                  Built from commit ${github.sha.slice(0, 7)}

                  ---
                  _This comment updates automatically with each push._
                `,
            });
        }

        return { url: worker.url, namespaceId: kvNamespace.namespaceId };
    }),
);
