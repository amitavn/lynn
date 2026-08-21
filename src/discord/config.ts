import * as Config from "effect/Config";

export const discordConfig = Config.unwrap({
    applicationId: Config.string("DISCORD_APPLICATION_ID"),
    publicKey: Config.string("DISCORD_PUBLIC_KEY"),
    token: Config.redacted("DISCORD_TOKEN"),
});
