import { Stage } from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";

const PROD_DOMAIN = "lynn-bot.twdl.us";

export const gatewayAccess = Effect.gen(function* () {
    const stage = yield* Stage;
    if (stage !== "prod") return undefined;

    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;

    return yield* Cloudflare.Access.Application("LynnBot", {
        type: "self_hosted",
        domain: `${PROD_DOMAIN}/gateway*`,
        policies: [
            {
                decision: "allow",
                include: [{ cloudflareAccountMember: accountId }],
            },
        ],
    });
});
