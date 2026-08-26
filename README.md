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
| src/discord/reminders.ts | Promise-based adapter that lets commands schedule reminders through the scheduler Durable Object. |
| src/discord/tasks/index.ts | Scheduled task registry: payload schemas plus handlers run when jobs fire. |
| src/discord/automations/index.ts | Statically declared automations, reconciled into the scheduler on boot. |
| src/discord/when.ts | Natural-language time parser for `/remind` (`in 30 minutes`, `tomorrow 9am`, `monday 10am`). |
| src/schedule/spec.ts | Schedule value types and constructors for one-shot, daily, and weekly schedules. |
| src/schedule/next-run.ts | Pure next-fire-time math with daylight saving time handling. |
| src/schedule/scheduler.ts | Scheduler Durable Object: job registry, alarm firing, task dispatch, automation reconcile. |
| src/discord/discord-api.ts | Discord REST helpers for sending messages and typing indicators. |
| src/worker.ts | Worker entrypoint. Handles routing requests to the necessary handler. |
| src/kv.ts | Defines the KV namespace resource used by the bot. |
| scripts/register-commands.ts | Registers slash commands with Discord (loads `.dev.vars` directly). |

# Architectures
+ Cloudflare Workers: primary runtime for bot
+ Cloudflare KV Store: for storing bot configuration, metadata, etc.
+ Cloudflare Durable Objects: `Gateway` (Discord WebSocket connection), `LynnAgent` (per-channel AI agent with SQLite history), and `Scheduler` (scheduled job registry driven by alarms)
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

# Scheduling

Lynn can send messages on a schedule two ways: the `/remind` slash command (or mentioning the bot with reminder text) and automations declared in code.

## Reminders

Use `/remind at` with a free-form time expression, for example:

+ `in 30 minutes`
+ `tomorrow 9am`
+ `monday 10am`
+ `2026-09-01 14:30`

Bare dates and weekdays default to 9:00 am. All wall-clock times resolve in `America/New_York`. Past times are rejected.

For recurring reminders use `/remind every daily 9:00` or `/remind every monday 10:00`. `/remind list` shows your pending reminders with their short ids, and `/remind cancel <id>` removes one. You can also mention the bot directly: `@lynn remind in 30 minutes trash day`.

## Automations

Automations are reminders declared in `src/discord/automations/index.ts` instead of created by users. On boot, the scheduler reconciles its stored automation rows against the declarations: edited declarations are updated, removed ones are deleted.

Each automation needs a real channel id (enable Developer Mode in Discord, right-click the channel, Copy Channel ID). An automation with an empty `channelId` fails payload validation and is skipped at boot with a log line, so it stays inert until configured.

## Adding task types

Scheduled jobs dispatch by payload type through the registry in `src/discord/tasks/index.ts`. Define a Schema for the payload and call `defineTask(type, schema, handler)`; the handler runs when a job fires, and payloads are validated again at dispatch time.

# Feature flags

The AI agent is gated behind Cloudflare Flagship. Create a Flagship app named `lynn-flags` and a boolean flag named `lynn-ai-agent` (variations `off`/`on`). The bot evaluates that flag before answering a mention, so you can disable or roll out the feature without redeploying.

Alchemy references the app for the Worker binding but does not manage flags. The app must already exist at deploy time, and the Cloudflare credentials used by alchemy need `flagship:read` (or `flagship:write` if you want alchemy to create the app).

# Adding commands

Create a new file in `src/discord/commands/` that exports a `Command` with a `definition` and `execute` function, then import it in `src/discord/commands/index.ts`.