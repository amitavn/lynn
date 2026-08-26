import type { JsonValue } from "../../schedule/json.ts";
import type { Schedule } from "../../schedule/spec.ts";

export interface Automation {
    readonly name: string;
    readonly schedule: Schedule;
    readonly payload: JsonValue;
}

export const automations: readonly Automation[] = [];
