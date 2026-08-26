import * as Schema from "effect/Schema";

export const DEFAULT_TIME_ZONE = "America/New_York";

const isValidTimeZone = (zone: string): boolean => {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: zone });
        return true;
    } catch {
        return false;
    }
};

export const TimeOfDay = Schema.String.pipe(
    Schema.check(Schema.isPattern(/^([01]\d|2[0-3]):[0-5]\d$/)),
    Schema.brand("TimeOfDay"),
);
export type TimeOfDay = typeof TimeOfDay.Type;

export const DayOfWeek = Schema.Natural.pipe(
    Schema.check(Schema.isLessThanOrEqualTo(6)),
    Schema.brand("DayOfWeek"),
);
export type DayOfWeek = typeof DayOfWeek.Type;

export const IanaZone = Schema.String.pipe(
    Schema.check(Schema.makeFilter(isValidTimeZone)),
    Schema.brand("IanaZone"),
);
export type IanaZone = typeof IanaZone.Type;

export const OnceSchedule = Schema.Struct({
    kind: Schema.Literals(["once"]),
    at: Schema.Int,
});

export const DailySchedule = Schema.Struct({
    kind: Schema.Literals(["daily"]),
    time: TimeOfDay,
    timeZone: IanaZone,
});

export const WeeklySchedule = Schema.Struct({
    kind: Schema.Literals(["weekly"]),
    dayOfWeek: DayOfWeek,
    time: TimeOfDay,
    timeZone: IanaZone,
});

export const Schedule = Schema.Union([
    OnceSchedule,
    DailySchedule,
    WeeklySchedule,
]);

export type OnceSchedule = typeof OnceSchedule.Type;
export type DailySchedule = typeof DailySchedule.Type;
export type WeeklySchedule = typeof WeeklySchedule.Type;
export type Schedule = typeof Schedule.Type;

export const onceAt = (at: Date | number): OnceSchedule =>
    Schema.decodeSync(OnceSchedule)({
        kind: "once",
        at: at instanceof Date ? at.getTime() : at,
    });

export const daily = (time: string, timeZone?: string): DailySchedule =>
    Schema.decodeSync(DailySchedule)({
        kind: "daily",
        time,
        timeZone: timeZone ?? DEFAULT_TIME_ZONE,
    });

export const weekly = (options: {
    readonly dayOfWeek: number;
    readonly time: string;
    readonly timeZone?: string;
}): WeeklySchedule =>
    Schema.decodeSync(WeeklySchedule)({
        kind: "weekly",
        dayOfWeek: options.dayOfWeek,
        time: options.time,
        timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
    });
