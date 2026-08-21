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
| src/worker.ts | Worker entrypoint. Handles routing requests to the necessary handler. |
| src/kv.ts | Defines the KV namespace resource used by the bot. |
| scripts/register-commands.ts | Registers slash commands with Discord (loads `.dev.vars` directly). |

# Architectures
+ Cloudflare Workers: primary runtime for bot
+ Cloudflare KV Store: for storing bot configuration, metadata, etc.
+ Alchemy resources: Worker `lynn` and KV namespace `lynn-kv` (resource ids must be unique within a stack, so the KV namespace doesn't share the Worker's id)

# Stack
+ Hono
+ Effect v4 (https://www.effect.website/blog/releases/effect/40-beta)
+ Discord Interactions API (https://discord.com/developers/docs/interactions/overview)
+ @discordjs/builders and discord-api-types for command definitions

# Local development

```bash
pnpm dev
```

Runs the stack locally against the local KV simulator. `.dev.vars` is loaded automatically (the `dev` script passes `--env-file .dev.vars`).

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
7. Register slash commands:
   ```bash
   pnpm register
   ```
   Registers commands in `DISCORD_GUILD_ID` (guild commands appear immediately). If `DISCORD_GUILD_ID` is unset, it registers commands globally instead.

# Adding commands

Create a new file in `src/discord/commands/` that exports a `Command` with a `definition` and `execute` function, then import it in `src/discord/commands/index.ts`.