import type * as cf from "@cloudflare/workers-types";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

export const FLAGS_APP_ID = "Flags";
export const AI_AGENT_FLAG_KEY = "lynn-ai-agent";

export const FlagsApp = Cloudflare.Flagship.App(FLAGS_APP_ID, {});

export const AIAgentFlag = Effect.gen(function* () {
    const app = yield* FlagsApp;
    return yield* Cloudflare.Flagship.Flag("AIAgent", {
        appId: app.appId,
        key: AI_AGENT_FLAG_KEY,
        defaultVariation: "off",
        variations: { off: false, on: true },
    });
});

export const flagshipBinding = (
    env: Cloudflare.WorkerEnvironment["Service"],
): cf.Flagship => {
    const binding = env[FLAGS_APP_ID];
    if (!binding) {
        throw new Error("Flagship binding is missing");
    }
    // SAFETY: ReadFlagsBinding attaches the Flagship binding under the App resource's LogicalId.
    return binding as cf.Flagship;
};