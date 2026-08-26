import {
    civilToEpoch,
    localDate,
    nextFireAt,
    type LocalDate,
} from "../schedule/next-run.ts";
import { DEFAULT_TIME_ZONE, weekly } from "../schedule/spec.ts";

export interface ParsedWhen {
    readonly at: number;
    readonly rest: string;
}

interface TimeOfDay {
    readonly hour: number;
    readonly minute: number;
}

const unitMs = (unit: string): number | null => {
    switch (unit) {
        case "second":
            return 1_000;
        case "minute":
            return 60_000;
        case "hour":
            return 3_600_000;
        case "day":
            return 86_400_000;
        case "week":
            return 604_800_000;
        default:
            return null;
    }
};

export const dayOfWeekFor = (name: string): number | null => {
    switch (name) {
        case "sunday":
        case "sun":
            return 0;
        case "monday":
        case "mon":
            return 1;
        case "tuesday":
        case "tue":
            return 2;
        case "wednesday":
        case "wed":
            return 3;
        case "thursday":
        case "thu":
            return 4;
        case "friday":
        case "fri":
            return 5;
        case "saturday":
        case "sat":
            return 6;
        default:
            return null;
    }
};

const TIME_TOKEN = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/i;
const DATE_TOKEN = /^\d{4}-\d{2}-\d{2}$/;

const parseTimeToken = (token: string): TimeOfDay | null => {
    const match = TIME_TOKEN.exec(token);
    if (match === null) {
        return null;
    }
    const hourRaw = Number(match[1]);
    const minute = match[2] !== undefined ? Number(match[2]) : 0;
    const meridiem = match[3]?.toLowerCase();
    if (minute > 59) {
        return null;
    }
    if (meridiem === undefined) {
        return hourRaw <= 23 ? { hour: hourRaw, minute } : null;
    }
    if (hourRaw < 1 || hourRaw > 12) {
        return null;
    }
    const hour =
        meridiem === "am"
            ? hourRaw === 12
                ? 0
                : hourRaw
            : hourRaw === 12
                ? 12
                : hourRaw + 12;
    return { hour, minute };
};

const looksLikeTime = (token: string): boolean => /^\d/.test(token);

const DEFAULT_TIME: TimeOfDay = { hour: 9, minute: 0 };

const pad = (value: number): string => String(value).padStart(2, "0");

const formatClock = (time: TimeOfDay): string =>
    `${pad(time.hour)}:${pad(time.minute)}`;

const addDays = (date: LocalDate, days: number): LocalDate => {
    const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
    };
};

const futureCivilEpoch = (
    date: LocalDate,
    time: TimeOfDay,
    now: number,
): number | null => {
    const at = civilToEpoch(DEFAULT_TIME_ZONE, date, time.hour, time.minute);
    if (at === null || at <= now) {
        return null;
    }
    return at;
};

export const normalizeTime = (raw: string): string | null => {
    const time = parseTimeToken(raw);
    if (time === null) {
        return null;
    }
    return formatClock(time);
};

export const parseWhen = (input: string, now: number): ParsedWhen | null => {
    const tokens = input.trim().split(/\s+/);
    if (tokens.length === 0 || tokens[0] === "") {
        return null;
    }

    const first = tokens[0].toLowerCase();

    if (first === "in") {
        const count = Number(tokens[1]);
        if (!Number.isInteger(count) || count <= 0) {
            return null;
        }
        const singular = tokens[2]?.toLowerCase().replace(/s$/, "");
        const multiplier = singular === undefined ? null : unitMs(singular);
        if (multiplier === null) {
            return null;
        }
        return {
            at: now + count * multiplier,
            rest: tokens.slice(3).join(" "),
        };
    }

    if (DATE_TOKEN.test(tokens[0])) {
        const [year, month, day] = tokens[0].split("-").map(Number);
        let idx = 1;
        let time = DEFAULT_TIME;
        const second = tokens[1];
        if (
            second !== undefined &&
            looksLikeTime(second) &&
            second.toLowerCase() !== "at"
        ) {
            const parsed = parseTimeToken(second);
            if (parsed === null) {
                return null;
            }
            time = parsed;
            idx = 2;
        }
        if (
            year === undefined ||
            month === undefined ||
            day === undefined ||
            month < 1 ||
            month > 12 ||
            day < 1 ||
            day > 31
        ) {
            return null;
        }
        const at = futureCivilEpoch({ year, month, day }, time, now);
        if (at === null) {
            return null;
        }
        return { at, rest: tokens.slice(idx).join(" ") };
    }

    let dayOffset: number | null = null;
    let dayOfWeek: number | null = null;
    let idx = 1;

    if (first === "tomorrow") {
        dayOffset = 1;
    } else if (first === "next") {
        const name = tokens[1]?.toLowerCase();
        dayOfWeek = name === undefined ? null : dayOfWeekFor(name);
        if (dayOfWeek === null) {
            return null;
        }
        idx = 2;
    } else {
        const weekday = dayOfWeekFor(first);
        if (weekday === null) {
            return null;
        }
        dayOfWeek = weekday;
    }

    if (tokens[idx]?.toLowerCase() === "at") {
        idx += 1;
    }

    let time = DEFAULT_TIME;
    const timeToken = tokens[idx];
    if (timeToken !== undefined && looksLikeTime(timeToken)) {
        const parsed = parseTimeToken(timeToken);
        if (parsed === null) {
            return null;
        }
        time = parsed;
        idx += 1;
    }

    let at: number | null;
    if (dayOffset !== null) {
        at = futureCivilEpoch(addDays(localDate(DEFAULT_TIME_ZONE, now), dayOffset), time, now);
    } else {
        at = nextFireAt(
            weekly({ dayOfWeek: dayOfWeek ?? 0, time: formatClock(time) }),
            now,
        );
    }
    if (at === null) {
        return null;
    }
    return { at, rest: tokens.slice(idx).join(" ") };
};
