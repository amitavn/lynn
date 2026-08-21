import { commands } from "../src/discord/commands/index.ts";

const token = process.env.DISCORD_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;

if (!token || !applicationId) {
    console.error("Missing DISCORD_TOKEN or DISCORD_APPLICATION_ID environment variables");
    process.exit(1);
}

const definitions = commands.map((command) => command.definition);

const response = await fetch(
    `https://discord.com/api/v10/applications/${applicationId}/commands`,
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
console.log(`Registered ${Array.isArray(result) ? result.length : 0} commands`);
