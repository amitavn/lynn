# Lynn
A general purpose discord bot for our server.

# Structure
| path | description |
| ---- | ----------- |
| alchemy.run.ts | Defines application architecture using alchemy. |
| src/discord/commands | Contains definitions for each available bot command. one command per file. |
| src/discord/interactions.ts | Handles incoming Discord interaction payloads. |
| src/discord/verify.ts | Verifies Discord interaction request signatures. |
| src/discord/config.ts | Loads Discord secrets and configuration. |
| src/discord/gateway.ts | Discord gateway Durable Object: WebSocket, heartbeats, mention detection, replies. |
| src/discord/agent.ts | Per-channel AI agent Durable Object with SQLite-backed history. |
| src/discord/pi-agent.ts | Official pi agent wiring for Workers AI. |
| src/discord/discord-api.ts | Discord REST helpers for sending messages and typing indicators. |
| src/worker.ts | Worker entrypoint. Handles routing requests to the necessary handler. |
| src/kv.ts | Defines the KV namespace resource used by the bot. |
| scripts/register-commands.ts | Registers slash commands with Discord (loads `.dev.vars` directly). |

# Architectures
+ Cloudflare Workers: primary runtime for bot
+ Cloudflare KV Store: for storing bot configuration, metadata, etc.
+ Cloudflare Durable Objects: `Gateway` (Discord WebSocket connection) and `LynnAgent` (per-channel AI agent with SQLite history)
+ Alchemy resources: Worker `lynn` and KV namespace `lynn-kv` (resource ids must be unique within a stack, so the KV namespace doesn't share the Worker's id)

# Stack
+ Hono
+ Effect v4 (https://www.effect.website/blog/releases/effect/40-beta)
+ Discord Interactions API (https://discord.com/developers/docs/interactions/overview)
+ @discordjs/builders and discord-api-types for command definitions
+ @earendil-works/pi-agent-core and @earendil-works/pi-ai for the AI agent, running on Cloudflare Workers AI

# Local development

```bash
pnpm dev
```

Runs the stack locally against the local KV simulator. `.dev.vars` is loaded automatically (the `dev` script passes `--env-file .dev.vars`).

The AI agent needs `CLOUDFLARE_API_KEY` and `CLOUDFLARE_ACCOUNT_ID` in `.dev.vars`. `LYNN_MODEL` optionally overrides the model, and accepts the model id directly or prefixed with `cloudflare-workers-ai/`.

# Discord setup

1. Create an application at https://discord.com/developers/applications.
2. Enable the bot and copy the **Application ID**, **Public Key**, and **Bot Token**.
3. Copy `.dev.vars.example` to `.dev.vars` and fill in the values, including `DISCORD_GUILD_ID` (right-click your server icon → Copy Server ID).
4. Deploy:
   ```bash
   pnpm deploy
   ```
   Creates the Worker (`lynn`) and KV namespace (`lynn-kv`) and wires the `DISCORD_*` values from `.dev.vars` into the Worker automatically (the `deploy` script passes `--env-file .dev.vars`). The deploy prints the Worker URL.
5. Invite the bot to your server: **OAuth2 → URL Generator** with scope `bot` and permissions `Send Messages` + `Use Slash Commands`, then open the generated URL and authorize on your server. The bot must be a member of `DISCORD_GUILD_ID` before registering commands, or Discord returns a 404.
6. Set the application's **Interactions Endpoint URL** to `<worker-url>/discord/interactions`, using the URL printed by `pnpm deploy`.
7. Start the Discord gateway by visiting `<worker-url>/gateway/status` once. It connects a Durable Object to the Discord WebSocket and reconnects automatically after deploys or evictions.
8. Register slash commands:
   ```bash
   pnpm register
   ```
   Registers commands in `DISCORD_GUILD_ID` (guild commands appear immediately). If `DISCORD_GUILD_ID` is unset, it registers commands globally instead.

# Mentioning the bot

Mention `@lynn` in a channel with a message, for example `@lynn summarize #announcements`. The gateway strips the mention and sends the rest to a per-channel AI agent, then posts the reply back.

If the first word after the mention matches a slash command name — for example `@lynn ping`, optionally with a leading slash (`@lynn /ping`) — that command runs instead of the agent, with the remaining text passed as arguments. Commands bypass the `lynn-ai-agent` feature flag; only the agent fallback is gated.

No privileged intents are required. Discord includes message content for messages that mention the bot. The bot invite needs **View Channel** and **Send Messages** permissions.

# Feature flags

The AI agent is gated behind Cloudflare Flagship. Create a Flagship app named `lynn-flags` and a boolean flag named `lynn-ai-agent` (variations `off`/`on`). The bot evaluates that flag before answering a mention, so you can disable or roll out the feature without redeploying.

Alchemy references the app for the Worker binding but does not manage flags. The app must already exist at deploy time, and the Cloudflare credentials used by alchemy need `flagship:read` (or `flagship:write` if you want alchemy to create the app).

# Adding commands

Create a new file in `src/discord/commands/` that exports a `Command` with a `definition` and `execute` function, then import it in `src/discord/commands/index.ts`.