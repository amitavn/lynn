import type { Schedule } from "./spec.ts";

interface LocalDate {
    readonly year: number;
    readonly month: number;
    readonly day: number;
}

interface LocalDateTime extends LocalDate {
    readonly hour: number;
    readonly minute: number;
}

const HOUR_MS = 3_600_000;
const SCAN_WINDOW_HOURS = 26;

const partFormatters = new Map<string, Intl.DateTimeFormat>();
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

const partFormatter = (timeZone: string): Intl.DateTimeFormat => {
    const cached = partFormatters.get(timeZone);
    if (cached !== undefined) {
        return cached;
    }
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
    partFormatters.set(timeZone, formatter);
    return formatter;
};

const offsetFormatter = (timeZone: string): Intl.DateTimeFormat => {
    const cached = offsetFormatters.get(timeZone);
    if (cached !== undefined) {
        return cached;
    }
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "longOffset",
    });
    offsetFormatters.set(timeZone, formatter);
    return formatter;
};

const zoneOffsetMinutes = (timeZone: string, epochMs: number): number => {
    const value =
        offsetFormatter(timeZone)
            .formatToParts(new Date(epochMs))
            .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
    const match = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(value);
    if (match === null || match[1] === undefined) {
        return 0;
    }
    const magnitude = Number(match[2]) * 60 + Number(match[3]);
    return match[1] === "-" ? -magnitude : magnitude;
};

const localDateTime = (
    timeZone: string,
    epochMs: number,
): LocalDateTime => {
    const values: Record<string, string> = {};
    for (const part of partFormatter(timeZone).formatToParts(
        new Date(epochMs),
    )) {
        values[part.type] = part.value;
    }
    return {
        year: Number(values["year"]),
        month: Number(values["month"]),
        day: Number(values["day"]),
        hour: Number(values["hour"]),
        minute: Number(values["minute"]),
    };
};

const addDays = (date: LocalDate, days: number): LocalDate & {
    weekday: number;
} => {
    const utc = Date.UTC(date.year, date.month - 1, date.day + days);
    const shifted = new Date(utc);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        weekday: shifted.getUTCDay(),
    };
};

const binarySearchTransition = (
    timeZone: string,
    beforeMs: number,
    afterMs: number,
): number => {
    let lo = beforeMs;
    let hi = afterMs;
    while (hi - lo > 1) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if (zoneOffsetMinutes(timeZone, mid) === zoneOffsetMinutes(timeZone, lo)) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return hi;
};

const gapTransition = (
    timeZone: string,
    naiveMs: number,
): number | null => {
    let prevSample = naiveMs - SCAN_WINDOW_HOURS * HOUR_MS;
    let prevOffset = zoneOffsetMinutes(timeZone, prevSample);
    for (
        let sample = prevSample + HOUR_MS;
        sample <= naiveMs + SCAN_WINDOW_HOURS * HOUR_MS;
        sample += HOUR_MS
    ) {
        const offset = zoneOffsetMinutes(timeZone, sample);
        if (offset !== prevOffset) {
            return binarySearchTransition(timeZone, sample - HOUR_MS, sample);
        }
        prevOffset = offset;
        prevSample = sample;
    }
    return null;
};

const wallClockToEpoch = (
    timeZone: string,
    date: LocalDate,
    hour: number,
    minute: number,
): readonly number[] => {
    const naive = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
    const offsets = new Set<number>();
    for (
        let deltaHours = -SCAN_WINDOW_HOURS;
        deltaHours <= SCAN_WINDOW_HOURS;
        deltaHours += 1
    ) {
        offsets.add(zoneOffsetMinutes(timeZone, naive + deltaHours * HOUR_MS));
    }

    const matches: number[] = [];
    for (const offset of offsets) {
        const candidate = naive - offset * 60_000;
        const local = localDateTime(timeZone, candidate);
        if (
            local.year === date.year &&
            local.month === date.month &&
            local.day === date.day &&
            local.hour === hour &&
            local.minute === minute
        ) {
            matches.push(candidate);
        }
    }
    if (matches.length > 0) {
        return matches.sort((a, b) => a - b);
    }
    const gap = gapTransition(timeZone, naive);
    return gap === null ? [] : [gap];
};

export const nextFireAt = (
    spec: Schedule,
    after: number,
): number | null => {
    if (spec.kind === "once") {
        return spec.at > after ? spec.at : null;
    }

    const zone = spec.timeZone;
    const hour = Number(spec.time.slice(0, 2));
    const minute = Number(spec.time.slice(3, 5));
    const start = localDateTime(zone, after);

    let best: number | null = null;
    for (let dayOffset = 0; dayOffset <= 7; dayOffset += 1) {
        const date = addDays(start, dayOffset);
        if (spec.kind === "weekly" && date.weekday !== spec.dayOfWeek) {
            continue;
        }
        for (const fireAt of wallClockToEpoch(zone, date, hour, minute)) {
            if (fireAt > after && (best === null || fireAt < best)) {
                best = fireAt;
            }
        }
    }
    return best;
};
