import { existsSync, readFileSync } from "node:fs";
import { commands } from "../src/discord/commands/index.ts";

const loadDevVars = () => {
    if (!existsSync(".dev.vars")) return;
    for (const line of readFileSync(".dev.vars", "utf8").split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (!(key in process.env)) process.env[key] = value;
    }
};

loadDevVars();

const token = process.env.DISCORD_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;

if (!token || !applicationId) {
    console.error("Missing DISCORD_TOKEN or DISCORD_APPLICATION_ID environment variables");
    process.exit(1);
}

const guildId = process.env.DISCORD_GUILD_ID;

const definitions = commands.map((command) => command.definition);

const url = guildId
    ? `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${applicationId}/commands`;

const response = await fetch(
    url,
    {
        method: "PUT",
        headers: {
            Authorization: `Bot ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(definitions),
    },
);

if (!response.ok) {
    const text = await response.text();
    console.error(`Failed to register commands: ${response.status} ${text}`);
    process.exit(1);
}

const result = await response.json();
console.log(`Registered ${Array.isArray(result) ? result.length : 0} commands ${guildId ? `in guild ${guildId}` : "globally"}`);
