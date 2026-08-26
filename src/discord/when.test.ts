import { describe, expect, test } from "vitest";
import { parseWhen } from "./when.ts";

// 2026-08-26 is a Wednesday; America/New_York is on EDT (UTC-4) in August.
const NOW = Date.UTC(2026, 7, 26, 12, 0);

describe("relative forms", () => {
    test("in N minutes carries the remaining message", () => {
        const parsed = parseWhen("in 30 minutes check the oven", NOW);
        expect(parsed?.at).toBe(NOW + 30 * 60_000);
        expect(parsed?.rest).toBe("check the oven");
    });

    test("singular units work", () => {
        expect(parseWhen("in 1 minute ping me", NOW)?.at).toBe(NOW + 60_000);
    });

    test("hours, days, and weeks convert", () => {
        expect(parseWhen("in 2 hours x", NOW)?.at).toBe(NOW + 7_200_000);
        expect(parseWhen("in 3 days y", NOW)?.at).toBe(NOW + 259_200_000);
        expect(parseWhen("in 1 week z", NOW)?.at).toBe(NOW + 604_800_000);
    });

    test("is case insensitive", () => {
        expect(parseWhen("IN 5 MINUTES", NOW)?.rest).toBe("");
    });

    test("zero and unknown units are rejected", () => {
        expect(parseWhen("in 0 minutes x", NOW)).toBeNull();
        expect(parseWhen("in 5 fortnights x", NOW)).toBeNull();
    });
});

describe("tomorrow form", () => {
    test("tomorrow 9am resolves in the default zone", () => {
        // 09:00 EDT on Aug 27 is 13:00 UTC.
        const parsed = parseWhen("tomorrow 9am take out trash", NOW);
        expect(parsed?.at).toBe(Date.UTC(2026, 7, 27, 13, 0));
        expect(parsed?.rest).toBe("take out trash");
    });

    test("bare tomorrow defaults to 09:00", () => {
        expect(parseWhen("tomorrow", NOW)?.at).toBe(Date.UTC(2026, 7, 27, 13, 0));
    });

    test("24h times and midnight/noon meridiem edge cases", () => {
        expect(parseWhen("tomorrow 14:30", NOW)?.at).toBe(Date.UTC(2026, 7, 27, 18, 30));
        expect(parseWhen("tomorrow 12am", NOW)?.at).toBe(Date.UTC(2026, 7, 27, 4, 0));
        expect(parseWhen("tomorrow 12pm", NOW)?.at).toBe(Date.UTC(2026, 7, 27, 16, 0));
    });
});

describe("weekday form", () => {
    test("same-day weekday fires later today", () => {
        // Bare weekday defaults to 09:00; Wed Aug 26 09:00 EDT is 13:00 UTC.
        expect(parseWhen("wednesday standup prep", NOW)?.at).toBe(Date.UTC(2026, 7, 26, 13, 0));
        expect(parseWhen("wednesday standup prep", NOW)?.rest).toBe("standup prep");
    });

    test("past same-day time rolls to next week", () => {
        // Wednesday 06:00 EDT already passed at 12:00 UTC; next is Sep 2.
        expect(parseWhen("wednesday 06:00", NOW)?.at).toBe(Date.UTC(2026, 8, 2, 10, 0));
    });

    test("abbreviations resolve", () => {
        expect(parseWhen("fri 17:00", NOW)?.at).toBe(Date.UTC(2026, 7, 28, 21, 0));
    });

    test("'next' prefix is accepted", () => {
        expect(parseWhen("next tuesday 9am", NOW)?.at).toBe(Date.UTC(2026, 8, 1, 13, 0));
    });
});

describe("absolute date form", () => {
    test("date and time resolve in the default zone", () => {
        const parsed = parseWhen("2026-09-01 15:00 file taxes", NOW);
        expect(parsed?.at).toBe(Date.UTC(2026, 8, 1, 19, 0));
        expect(parsed?.rest).toBe("file taxes");
    });

    test("missing time defaults to 09:00", () => {
        expect(parseWhen("2026-09-01", NOW)?.at).toBe(Date.UTC(2026, 8, 1, 13, 0));
    });

    test("meridiem times work", () => {
        expect(parseWhen("2026-09-01 9pm", NOW)?.at).toBe(Date.UTC(2026, 8, 2, 1, 0));
    });

    test("past dates are rejected", () => {
        expect(parseWhen("2020-01-01 09:00", NOW)).toBeNull();
    });
});

describe("invalid input", () => {
    test("unparseable text returns null", () => {
        expect(parseWhen("whenever okay", NOW)).toBeNull();
        expect(parseWhen("", NOW)).toBeNull();
    });

    test("out-of-range times return null", () => {
        expect(parseWhen("tomorrow 25:00", NOW)).toBeNull();
        expect(parseWhen("tomorrow 7pm:45", NOW)).toBeNull();
        expect(parseWhen("friday 12:99pm", NOW)).toBeNull();
    });
});
