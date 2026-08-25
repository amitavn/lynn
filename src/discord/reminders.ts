import type * as cf from "@cloudflare/workers-types";
import * as Effect from "effect/Effect";
import type * as Redacted from "effect/Redacted";
import { sendChannelMessage } from "./discord-api.ts";

export const BOULDERING_REMINDER_CRONS = [
    "0 19 * * SUN",
    "0 20 * * SUN",
] as const;

const BOULDERING_REMINDERS = [
    "Bouldering roll call: drop a photo or video from this week's sends, tries, flails, or spicy little pebble wrestles. Don't leave us hanging on the beta!",
    "Sunday send-share time. Post a climbing photo or video from this week so #bouldering can admire your grip, your grit, and your questionable foot chips.",
    "The slab has spoken: please share one photo or video from this week's climbing. Bonus points for big smiles, tiny crimps, and absolutely unhinged heel hooks.",
    "Chalk check. If you climbed this week, toss a photo or video into the channel. We want sends, almost-sends, and respectable gravity negotiations.",
    "Time to rock the timeline. Share a climbing photo or video from this week before your beta turns into folklore.",
    "This is your weekly reminder to be a little boulder and post your climbing pics or clips. Sends, projects, dynos, dab debates: all welcome.",
    "Please mantle your media into chat: one climbing photo or video from the week. Crimps appreciated, campus-board propaganda tolerated.",
    "Sunday at 2pm means show-and-tell on the wall. Share a pic or clip from this week's climbing so nobody has to take your send at face value.",
];

const centralHour = (date: Date): string =>
    new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        hour12: false,
        timeZone: "America/Chicago",
    }).format(date);

const isTwoPmCentral = (scheduledTime: number): boolean =>
    centralHour(new Date(scheduledTime)) === "14";

const reminderFor = (scheduledTime: number): string => {
    const week = Math.floor(scheduledTime / (7 * 24 * 60 * 60 * 1_000));
    return BOULDERING_REMINDERS[week % BOULDERING_REMINDERS.length];
};

export const sendBoulderingReminder = (
    controller: cf.ScheduledController,
    channelId: string,
    token: Redacted.Redacted<string>,
) =>
    Effect.gen(function* () {
        if (!isTwoPmCentral(controller.scheduledTime)) {
            return;
        }

        if (channelId.length === 0) {
            yield* Effect.logWarning(
                "DISCORD_BOULDERING_CHANNEL_ID is unset; skipping bouldering reminder",
            );
            return;
        }

        yield* Effect.promise(() =>
            sendChannelMessage(
                channelId,
                reminderFor(controller.scheduledTime),
                token,
            ),
        );
    });
