import { SlashCommandBuilder } from "@discordjs/builders";
import {
    ApplicationCommandOptionType,
    ApplicationCommandType,
    type APIApplicationCommandInteractionDataOption,
} from "discord-api-types/v10";
import type { Schedule } from "../../schedule/spec.ts";
import { daily, weekly } from "../../schedule/spec.ts";
import type { Command, CommandContext } from "../types.ts";
import { dayOfWeekFor, normalizeTime, parseWhen } from "../when.ts";

const USAGE =
    "Usage: `/remind at <when> <message>`, `/remind every <day> <time> <message>`, " +
    "`/remind list`, or `/remind cancel <id>`. " +
    '`<when>` examples: "in 30 minutes", "tomorrow 9am", "friday 17:00", "2026-09-01 15:00".';

const formatEastern = (epochMs: number): string =>
    new Date(epochMs).toLocaleString("en-US", {
        timeZone: "America/New_York",
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });

interface ReminderRequest {
    readonly kind: "at" | "every" | "list" | "cancel";
    readonly whenText?: string;
    readonly message?: string;
    readonly day?: string;
    readonly time?: string;
    readonly id?: string;
}

type StringDataOption = APIApplicationCommandInteractionDataOption & {
    readonly value: string;
};

const isStringOption = (
    option: APIApplicationCommandInteractionDataOption,
): option is StringDataOption => option.type === ApplicationCommandOptionType.String;

const optionValue = (
    options: readonly APIApplicationCommandInteractionDataOption[] | undefined,
    name: string,
): string | undefined => {
    const match = options?.find((option): option is StringDataOption => {
        if (option.name !== name) {
            return false;
        }
        return isStringOption(option);
    });
    return match?.value;
};

const fromSlashData = (ctx: CommandContext): ReminderRequest | null => {
    const data = ctx.data;
    if (data === undefined || data.type !== ApplicationCommandType.ChatInput) {
        return null;
    }
    const top = data.options?.[0];
    if (top === undefined || top.type !== ApplicationCommandOptionType.Subcommand) {
        return null;
    }
    switch (top.name) {
        case "at":
            return {
                kind: "at",
                whenText: optionValue(top.options, "when"),
                message: optionValue(top.options, "message"),
            };
        case "every":
            return {
                kind: "every",
                day: optionValue(top.options, "day"),
                time: optionValue(top.options, "time"),
                message: optionValue(top.options, "message"),
            };
        case "list":
            return { kind: "list" };
        case "cancel":
            return { kind: "cancel", id: optionValue(top.options, "id") };
        default:
            return null;
    }
};

const fromMentionArgs = (args: string): ReminderRequest | null => {
    const trimmed = args.trim();
    if (trimmed.length === 0) {
        return null;
    }
    const [first, ...tail] = trimmed.split(/\s+/);
    const head = (first ?? "").toLowerCase();
    const rest = tail.join(" ");
    if (head === "list") {
        return { kind: "list" };
    }
    if (head === "cancel") {
        return { kind: "cancel", id: rest.trim() || undefined };
    }
    if (head === "every") {
        const [day, time, ...message] = rest.trim().split(/\s+/);
        return {
            kind: "every",
            day,
            time,
            message: message.join(" ") || undefined,
        };
    }
    const whenText = head === "at" ? rest : trimmed;
    return { kind: "at", whenText };
};

const buildRecurring = (request: ReminderRequest): Schedule | null => {
    if (request.day === undefined || request.time === undefined) {
        return null;
    }
    const normalized = normalizeTime(request.time);
    if (normalized === null) {
        return null;
    }
    if (request.day.toLowerCase() === "daily") {
        return daily(normalized);
    }
    const dayOfWeek = dayOfWeekFor(request.day.toLowerCase());
    if (dayOfWeek === null) {
        return null;
    }
    return weekly({ dayOfWeek, time: normalized });
};

const executeRequest = async (
    ctx: CommandContext,
    request: ReminderRequest,
): Promise<string> => {
    const channelId = ctx.channelId;
    if (channelId === undefined) {
        return "I can only schedule reminders inside a channel.";
    }

    switch (request.kind) {
        case "at": {
            const parsed =
                request.whenText === undefined
                    ? null
                    : parseWhen(request.whenText, Date.now());
            if (parsed === null || request.message === undefined || request.message.length === 0) {
                return `I couldn't read that as a time. ${USAGE}`;
            }
            const outcome = await ctx.reminders.at({
                channelId,
                content: request.message,
                at: parsed.at,
                createdBy: ctx.userId,
            });
            return outcome.ok
                ? `Reminder \`${outcome.id}\` set for ${formatEastern(parsed.at)} ET.`
                : outcome.reason;
        }
        case "every": {
            const schedule = buildRecurring(request);
            if (schedule === null || request.message === undefined || request.message.length === 0) {
                return `I couldn't read that recurrence. ${USAGE}`;
            }
            const outcome = await ctx.reminders.recurring({
                channelId,
                content: request.message,
                schedule,
                createdBy: ctx.userId,
            });
            return outcome.ok
                ? `Recurring reminder \`${outcome.id}\` set.`
                : outcome.reason;
        }
        case "list": {
            const reminders = await ctx.reminders.list();
            if (reminders.length === 0) {
                return "No reminders scheduled.";
            }
            const lines = reminders.map((reminder) => {
                const when =
                    reminder.nextFireAt === null
                        ? "completed"
                        : formatEastern(reminder.nextFireAt);
                return `\`${reminder.id}\` ${when} ET — ${reminder.content}`;
            });
            return lines.join("\n");
        }
        case "cancel": {
            if (request.id === undefined || request.id.length === 0) {
                return `Which id? Check \`/remind list\`.`;
            }
            const cancelled = await ctx.reminders.cancel(request.id);
            return cancelled
                ? `Cancelled reminder \`${request.id}\`.`
                : `No reminder found with id \`${request.id}\`.`;
        }
    }
};

export const remind: Command = {
    definition: new SlashCommandBuilder()
        .setName("remind")
        .setDescription("Schedule reminders")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("at")
                .setDescription("Remind once at a specific time")
                .addStringOption((option) =>
                    option
                        .setName("when")
                        .setDescription('"in 30 minutes", "tomorrow 9am", "friday 17:00", "2026-09-01 15:00"')
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option.setName("message").setDescription("What to remind about").setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("every")
                .setDescription("Remind on a repeating schedule")
                .addStringOption((option) =>
                    option
                        .setName("day")
                        .setDescription('"daily" or a weekday like "monday"')
                        .setRequired(true),
                )
                .addStringOption((option) =>
                    option.setName("time").setDescription('"9am", "14:30"').setRequired(true),
                )
                .addStringOption((option) =>
                    option.setName("message").setDescription("What to remind about").setRequired(true),
                ),
        )
        .addSubcommand((subcommand) =>
            subcommand.setName("list").setDescription("List reminders in this server"),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("cancel")
                .setDescription("Cancel a reminder")
                .addStringOption((option) =>
                    option.setName("id").setDescription("Reminder id from /remind list").setRequired(true),
                ),
        )
        .toJSON(),
    execute: async (ctx) => {
        const request = fromSlashData(ctx) ?? fromMentionArgs(ctx.args);
        if (request === null) {
            return { content: `What should I do? ${USAGE}` };
        }
        try {
            const content = await executeRequest(ctx, request);
            return { content };
        } catch (error) {
            return {
                content:
                    error instanceof Error
                        ? `That didn't work: ${error.message}`
                        : "Something went wrong scheduling that.",
            };
        }
    },
};
