import * as Config from "effect/Config";

export const discordConfig = Config.unwrap({
    applicationId: Config.string("DISCORD_APPLICATION_ID"),
    publicKey: Config.string("DISCORD_PUBLIC_KEY"),
    token: Config.redacted("DISCORD_TOKEN"),
    boulderingChannelId: Config.string("DISCORD_BOULDERING_CHANNEL_ID").pipe(
        Config.withDefault(""),
    ),
});

export const llmConfig = Config.unwrap({
    cloudflareApiKey: Config.redacted("CLOUDFLARE_API_KEY"),
    cloudflareAccountId: Config.string("CLOUDFLARE_ACCOUNT_ID"),
    model: Config.string("LYNN_MODEL").pipe(
        Config.withDefault("@cf/deepseek-ai/deepseek-v4-flash-0731"),
    ),
});
