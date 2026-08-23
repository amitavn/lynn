import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

export default Alchemy.Stack(
  "github",
  {
    providers: Layer.mergeAll(
      Cloudflare.providers(),
      GitHub.providers(),
    ),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;
    const apiToken = yield* Cloudflare.ApiToken.AccountApiToken("CIToken", {
      accountId,
      policies: [
        {
          effect: "allow",
          permissionGroups: [
            "Secrets Store Write",
            "Workers AI Read",
            "Workers Scripts Write",
            "Workers KV Storage Write",
            "Queues Write",
            "Pages Write",
            "Account Settings Write",
            "Workers Tail Read",
          ],
          resources: {
            [`com.cloudflare.api.account.${accountId}`]: "*",
          },
        },
      ],
    });

    yield* GitHub.Secret("cf-api-token", {
      owner: "amitavn",
      repository: "lynn",
      name: "CLOUDFLARE_API_TOKEN",
      value: apiToken.value,
    });

    yield* GitHub.Secret("cf-account-id", {
      owner: "amitavn",
      repository: "lynn",
      name: "CLOUDFLARE_ACCOUNT_ID",
      value: Redacted.make(accountId),
    });

    const discordApplicationId = yield* Config.redacted("DISCORD_APPLICATION_ID");
    const discordPublicKey = yield* Config.redacted("DISCORD_PUBLIC_KEY");
    const discordToken = yield* Config.redacted("DISCORD_TOKEN");
    const lynnModel = yield* Config.redacted("LYNN_MODEL");

    yield* GitHub.Secret("discord-application-id", {
      owner: "amitavn",
      repository: "lynn",
      name: "DISCORD_APPLICATION_ID",
      value: discordApplicationId,
    });

    yield* GitHub.Secret("discord-public-key", {
      owner: "amitavn",
      repository: "lynn",
      name: "DISCORD_PUBLIC_KEY",
      value: discordPublicKey,
    });

    yield* GitHub.Secret("discord-token", {
      owner: "amitavn",
      repository: "lynn",
      name: "DISCORD_TOKEN",
      value: discordToken,
    });

    yield* GitHub.Secret("lynn-model", {
      owner: "amitavn",
      repository: "lynn",
      name: "LYNN_MODEL",
      value: lynnModel,
    });
  }),
);
