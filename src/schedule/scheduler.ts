import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { automations, type Automation } from "../discord/automations/index.ts";
import { discordConfig } from "../discord/config.ts";
import { tasks } from "../discord/tasks/index.ts";
import type { JsonValue } from "./json.ts";
import { nextFireAt } from "./next-run.ts";
import { Schedule } from "./spec.ts";

type JobRow = {
    id: string;
    origin: string;
    name: string | null;
    type: string;
    schedule: string;
    payload: string;
    created_by: string | null;
    next_fire_at: number | null;
};

export interface JobView {
    readonly id: string;
    readonly origin: "automation" | "dynamic";
    readonly name: string | null;
    readonly type: string;
    readonly schedule: Schedule;
    readonly payload: string;
    readonly createdBy: string | null;
    readonly nextFireAt: number | null;
}

export type ScheduleResult =
    | { readonly ok: true; readonly id: string }
    | { readonly ok: false; readonly reason: string };

export interface ScheduleInput {
    readonly type: string;
    readonly payload: JsonValue;
    readonly when: Schedule;
    readonly createdBy?: string;
}

const JOBS_TABLE = `
    CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        origin TEXT NOT NULL,
        name TEXT,
        type TEXT NOT NULL,
        schedule TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_by TEXT,
        next_fire_at INTEGER
    )
`;

const TaggedPayload = Schema.Struct({ type: Schema.String });

export default class Scheduler extends Cloudflare.DurableObject<Scheduler>()(
    "Scheduler",
    Effect.gen(function* () {
        const state = yield* Cloudflare.DurableObjectState;
        const discord = yield* discordConfig.pipe(Effect.orDie);
        const sql = state.storage.sql;

        const dispatchers = new Map(tasks.map((task) => [task.type, task]));

        const tagOf = (payload: JsonValue): string | null => {
            try {
                return Schema.decodeUnknownSync(TaggedPayload)(payload).type;
            } catch {
                return null;
            }
        };

        const decodeSchedule = (raw: string): Schedule => {
            const parsed: unknown = JSON.parse(raw);
            return Schema.decodeUnknownSync(Schedule)(parsed);
        };

        const initialFireAt = (when: Schedule): number | null =>
            when.kind === "once" ? when.at : nextFireAt(when, Date.now());

        const generateId = Effect.gen(function* () {
            for (let attempt = 0; attempt < 5; attempt += 1) {
                const candidate = crypto.randomUUID().replace(/-/g, "").slice(0, 5);
                const cursor = yield* sql.exec<{ taken: number }>(
                    "SELECT COUNT(*) AS taken FROM jobs WHERE id = ?",
                    candidate,
                );
                const rows = yield* cursor.toArray();
                if ((rows[0]?.taken ?? 0) === 0) {
                    return candidate;
                }
            }
            return yield* Effect.die(new Error("could not generate a unique job id"));
        });

        const rearm = Effect.gen(function* () {
            const cursor = yield* sql.exec<{ earliest: number | null }>(
                "SELECT MIN(next_fire_at) AS earliest FROM jobs WHERE next_fire_at IS NOT NULL",
            );
            const rows = yield* cursor.toArray();
            const earliest = rows[0]?.earliest ?? null;
            if (earliest === null) {
                yield* state.storage.deleteAlarm();
            } else {
                yield* state.storage.setAlarm(earliest);
            }
        });

        const upsertAutomation = (automation: Automation) =>
            Effect.gen(function* () {
                const type = tagOf(automation.payload);
                const task = type === null ? undefined : dispatchers.get(type);
                if (type === null || task === undefined || !task.validate(automation.payload)) {
                    console.error(
                        JSON.stringify({
                            message: "automation payload invalid or unregistered; skipping",
                            automation: automation.name,
                        }),
                    );
                    return;
                }
                const fireAt = initialFireAt(automation.schedule);
                if (fireAt === null) {
                    console.error(
                        JSON.stringify({
                            message: "automation schedule has no upcoming occurrence",
                            automation: automation.name,
                        }),
                    );
                    return;
                }
                yield* sql.exec(
                    `INSERT INTO jobs (id, origin, name, type, schedule, payload, created_by, next_fire_at)
                     VALUES (?, 'automation', ?, ?, ?, ?, NULL, ?)
                     ON CONFLICT(id) DO UPDATE SET
                         type = excluded.type,
                         schedule = excluded.schedule,
                         payload = excluded.payload,
                         next_fire_at = excluded.next_fire_at`,
                    automation.name,
                    automation.name,
                    type,
                    JSON.stringify(Schema.encodeSync(Schedule)(automation.schedule)),
                    JSON.stringify(automation.payload),
                    fireAt,
                );
            });

        const reconcileAutomations = Effect.gen(function* () {
            yield* sql.exec("DELETE FROM jobs WHERE origin = 'automation'");
            for (const automation of automations) {
                yield* upsertAutomation(automation);
            }
        });

        return Effect.gen(function* () {
            yield* state.blockConcurrencyWhile(() =>
                Effect.gen(function* () {
                    yield* sql.exec(JOBS_TABLE);
                    yield* reconcileAutomations;
                }),
            );

            const toView = (row: JobRow): JobView | null => {
                try {
                    return {
                        id: row.id,
                        origin: row.origin === "dynamic" ? "dynamic" : "automation",
                        name: row.name,
                        type: row.type,
                        schedule: decodeSchedule(row.schedule),
                        payload: row.payload,
                        createdBy: row.created_by,
                        nextFireAt: row.next_fire_at,
                    };
                } catch (error) {
                    console.error(
                        JSON.stringify({
                            message: "job row failed to decode",
                            id: row.id,
                            error: error instanceof Error ? error.message : String(error),
                        }),
                    );
                    return null;
                }
            };

            return {
                schedule: (input: ScheduleInput) =>
                    Effect.gen(function* () {
                        const task = dispatchers.get(input.type);
                        if (task === undefined) {
                            return {
                                ok: false,
                                reason: `no task registered for type ${input.type}`,
                            };
                        }
                        if (!task.validate(input.payload)) {
                            return { ok: false, reason: `invalid ${input.type} payload` };
                        }
                        const fireAt = initialFireAt(input.when);
                        if (fireAt === null) {
                            return { ok: false, reason: "schedule has no upcoming occurrence" };
                        }
                        const id = yield* generateId;
                        yield* sql.exec(
                            `INSERT INTO jobs (id, origin, name, type, schedule, payload, created_by, next_fire_at)
                             VALUES (?, 'dynamic', NULL, ?, ?, ?, ?, ?)`,
                            id,
                            input.type,
                            JSON.stringify(Schema.encodeSync(Schedule)(input.when)),
                            JSON.stringify(input.payload),
                            input.createdBy ?? null,
                            fireAt,
                        );
                        yield* rearm;
                        return { ok: true, id };
                    }),

                cancel: (id: string) =>
                    Effect.gen(function* () {
                        yield* sql.exec(
                            "DELETE FROM jobs WHERE id = ? AND origin = 'dynamic'",
                            id,
                        );
                        const cursor = yield* sql.exec<{ changes: number }>(
                            "SELECT changes() AS changes",
                        );
                        const rows = yield* cursor.toArray();
                        yield* rearm;
                        return (rows[0]?.changes ?? 0) > 0;
                    }),

                list: () =>
                    Effect.gen(function* () {
                        const cursor = yield* sql.exec<JobRow>(
                            "SELECT * FROM jobs ORDER BY next_fire_at",
                        );
                        const rows = yield* cursor.toArray();
                        const views: JobView[] = [];
                        for (const row of rows) {
                            const view = toView(row);
                            if (view !== null) {
                                views.push(view);
                            }
                        }
                        return views;
                    }),

                alarm: () =>
                    Effect.gen(function* () {
                        const now = Date.now();
                        const cursor = yield* sql.exec<JobRow>(
                            "SELECT * FROM jobs WHERE next_fire_at IS NOT NULL AND next_fire_at <= ? ORDER BY next_fire_at",
                            now,
                        );
                        const due = yield* cursor.toArray();
                        for (const row of due) {
                            let spec: Schedule;
                            try {
                                spec = decodeSchedule(row.schedule);
                            } catch (error) {
                                yield* sql.exec("DELETE FROM jobs WHERE id = ?", row.id);
                                console.error(
                                    JSON.stringify({
                                        message: "dropped undecodable job",
                                        id: row.id,
                                        error: error instanceof Error
                                            ? error.message
                                            : String(error),
                                    }),
                                );
                                continue;
                            }
                            const next = nextFireAt(spec, row.next_fire_at ?? now);
                            yield* sql.exec(
                                "UPDATE jobs SET next_fire_at = ? WHERE id = ?",
                                next,
                                row.id,
                            );
                            const task = dispatchers.get(row.type);
                            if (task === undefined) {
                                console.error(
                                    JSON.stringify({
                                        message: "no task registered for job payload type",
                                        id: row.id,
                                        type: row.type,
                                    }),
                                );
                                continue;
                            }
                            yield* Effect.promise(() =>
                                task.dispatch(row.payload, {
                                    discordToken: discord.token,
                                }),
                            );
                        }
                        yield* rearm;
                    }),
            };
        });
    }),
) {}
