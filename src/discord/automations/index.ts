import type { JsonValue } from "../../schedule/json.ts";
import type { Schedule } from "../../schedule/spec.ts";
import { weekly } from "../../schedule/spec.ts";

export interface Automation {
    readonly name: string;
    readonly schedule: Schedule;
    readonly payload: JsonValue;
}

// Paste a real channel id (enable Developer Mode in Discord, right-click the
// channel, Copy Channel ID) to activate this automation; while it is empty
// the scheduler logs a skip line at boot instead of scheduling it.
const STANDUP_CHANNEL_ID = "";

export const automations: readonly Automation[] = [
    {
        name: "standup-reminder",
        schedule: weekly({ dayOfWeek: 1, time: "09:45" }),
        payload: {
            type: "reminder",
            channelId: STANDUP_CHANNEL_ID,
            content: "Standup in 15 minutes!",
        },
    },
];
