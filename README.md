# BOT(C)
A general purpose discord bot for our server.

# Structure
| path | description |
| ---- | ----------- |
| alchemy.run.ts | Defines application architecture using alchemy. |
| src/commands | Contains definitions for each available bot command. one command per file. |
| src/worker.ts | Worker entrypoint. Handles routing requests to the necessary handler. |
| src/kv.ts | Defines KV store used by bot. |

# Architectures
+ Cloudflare Workers: primary runtime for bot
+ Cloudflare Durable Objects: for 
+ Cloudflare KV Store: for storing bot configuration, metadata, etc.

# Stack
+ Hono
+ Effect v4 (https://www.effect.website/blog/releases/effect/40-beta)
+ discord.js (https://discord.js.org/docs/packages/discord.js/main)
