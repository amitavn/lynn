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
| src/kv.ts | Defines KV store used by bot. |
| scripts/register-commands.ts | Registers slash commands with Discord. |

# Architectures
+ Cloudflare Workers: primary runtime for bot
+ Cloudflare Durable Objects: for 
+ Cloudflare KV Store: for storing bot configuration, metadata, etc.

# Stack
+ Hono
+ Effect v4 (https://www.effect.website/blog/releases/effect/40-beta)
+ Discord Interactions API (https://discord.com/developers/docs/interactions/overview)
+ @discordjs/builders and discord-api-types for command definitions

# Discord setup

1. Create an application at https://discord.com/developers/applications.
2. Enable the bot and copy the **Application ID**, **Public Key**, and **Bot Token**.
3. Copy `.dev.vars.example` to `.dev.vars` and fill in the values for local development.
4. Deploy the Worker and set the same values as secrets through the Cloudflare dashboard or `wrangler secret put`.
5. Set the application's **Interactions Endpoint URL** to `<worker-url>/discord/interactions`.
6. Register slash commands:
   ```bash
   pnpm register
   ```

# Adding commands

Create a new file in `src/discord/commands/` that exports a `Command` with a `definition` and `execute` function, then import it in `src/discord/commands/index.ts`.
