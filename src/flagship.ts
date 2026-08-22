import type * as cf from "@cloudflare/workers-types";
import * as Cloudflare from "alchemy/Cloudflare";

export const FLAGS_APP_ID = "LynnFlags";
export const AI_AGENT_FLAG_KEY = "lynn-ai-agent";

export const FlagsApp = Cloudflare.Flagship.App(FLAGS_APP_ID, {
    name: "lynn-flags",
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