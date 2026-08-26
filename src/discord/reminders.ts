import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { RuntimeContext } from "alchemy/RuntimeContext";
import type { JobView, ScheduleInput } from "../schedule/scheduler.ts";
import type { Schedule } from "../schedule/spec.ts";
import { ReminderPayload } from "./tasks/index.ts";

export type ReminderOutcome =
    | { readonly ok: true; readonly id: string }
    | { readonly ok: false; readonly reason: string };

export interface ReminderView {
    readonly id: string;
    readonly content: string;
    readonly nextFireAt: number | null;
    readonly createdBy: string | null;
}

export interface Reminders {
    at: (input: {
        readonly channelId: string;
        readonly content: string;
        readonly at: number;
        readonly createdBy?: string;
    }) => Promise<ReminderOutcome>;
    recurring: (input: {
        readonly channelId: string;
        readonly content: string;
        readonly schedule: Schedule;
        readonly createdBy?: string;
    }) => Promise<ReminderOutcome>;
    list: () => Promise<readonly ReminderView[]>;
    cancel: (id: string) => Promise<boolean>;
}

type WidenedScheduleResult = {
    readonly ok: boolean;
    readonly id?: string;
    readonly reason?: string;
};

interface SchedulerStub {
    readonly schedule: (
        input: ScheduleInput,
    ) => Effect.Effect<WidenedScheduleResult, never, RuntimeContext>;
    readonly list: () => Effect.Effect<readonly JobView[], never, RuntimeContext>;
    readonly cancel: (id: string) => Effect.Effect<boolean, never, RuntimeContext>;
}

const toOutcome = (result: WidenedScheduleResult): ReminderOutcome =>
    result.ok && result.id !== undefined
        ? { ok: true, id: result.id }
        : { ok: false, reason: result.reason ?? "scheduling failed" };

const toView = (job: JobView): ReminderView | null => {
    if (job.type !== "reminder") {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(job.payload);
        const payload = Schema.decodeUnknownSync(ReminderPayload)(parsed);
        return {
            id: job.id,
            content: payload.content,
            nextFireAt: job.nextFireAt,
            createdBy: job.createdBy,
        };
    } catch {
        return null;
    }
};

export const createReminders = (getScheduler: () => SchedulerStub): Reminders => {
    const run = <A>(effect: Effect.Effect<A, never, RuntimeContext>): Promise<A> =>
        // SAFETY: scheduler stubs execute inside the worker/DO runtime, which
        // provides RuntimeContext before the effect runs.
        Effect.runPromise(effect as Effect.Effect<A>);
    const schedule = (...args: Parameters<SchedulerStub["schedule"]>) =>
        run(getScheduler().schedule(...args));
    return {
        at: ({ channelId, content, at, createdBy }) =>
            schedule({
                type: "reminder",
                payload: { type: "reminder", channelId, content },
                when: { kind: "once", at },
                createdBy,
            }).then(toOutcome),
        recurring: ({ channelId, content, schedule: recurringSchedule, createdBy }) =>
            schedule({
                type: "reminder",
                payload: { type: "reminder", channelId, content },
                when: recurringSchedule,
                createdBy,
            }).then(toOutcome),
        list: async () => {
            const jobs = await run(getScheduler().list());
            const views: ReminderView[] = [];
            for (const job of jobs) {
                const view = toView(job);
                if (view !== null) {
                    views.push(view);
                }
            }
            return views;
        },
        cancel: (id) => run(getScheduler().cancel(id)),
    };
};
