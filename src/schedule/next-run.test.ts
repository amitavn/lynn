import { describe, expect, test } from "vitest";
import { nextFireAt } from "./next-run.ts";
import { daily, onceAt, weekly } from "./spec.ts";

describe("once", () => {
    const at = Date.UTC(2026, 8, 1, 15, 0);

    test("future instant fires as-is", () => {
        expect(nextFireAt(onceAt(at), at - 1)).toBe(at);
    });

    test("past instant never fires", () => {
        expect(nextFireAt(onceAt(at), at + 1)).toBeNull();
    });

    test("instant exactly at the cutoff does not fire", () => {
        expect(nextFireAt(onceAt(at), at)).toBeNull();
    });
});

describe("daily", () => {
    test("fires later on the same day", () => {
        const after = Date.UTC(2025, 0, 15, 9, 0);
        expect(nextFireAt(daily("22:00", "UTC"), after)).toBe(
            Date.UTC(2025, 0, 15, 22, 0),
        );
    });

    test("crosses midnight", () => {
        const after = Date.UTC(2025, 0, 15, 23, 50);
        expect(nextFireAt(daily("00:05", "UTC"), after)).toBe(
            Date.UTC(2025, 0, 16, 0, 5),
        );
    });

    test("crosses month boundary", () => {
        const after = Date.UTC(2025, 0, 31, 20, 0);
        expect(nextFireAt(daily("09:00", "UTC"), after)).toBe(
            Date.UTC(2025, 1, 1, 9, 0),
        );
    });

    test("crosses year boundary", () => {
        const after = Date.UTC(2024, 11, 31, 18, 0);
        expect(nextFireAt(daily("12:00", "UTC"), after)).toBe(
            Date.UTC(2025, 0, 1, 12, 0),
        );
    });

    test("crosses leap-day boundary", () => {
        const after = Date.UTC(2024, 1, 29, 10, 0);
        expect(nextFireAt(daily("08:00", "UTC"), after)).toBe(
            Date.UTC(2024, 2, 1, 8, 0),
        );
    });

    test("is strictly after the cutoff", () => {
        const fireInstant = Date.UTC(2025, 5, 1, 10, 0);
        expect(nextFireAt(daily("10:00", "UTC"), fireInstant)).toBe(
            Date.UTC(2025, 5, 2, 10, 0),
        );
    });
});

describe("weekly", () => {
    test("dayOfWeek 0 lands on Sunday", () => {
        const after = Date.UTC(2025, 5, 6, 12, 0);
        expect(
            nextFireAt(weekly({ dayOfWeek: 0, time: "09:30", timeZone: "UTC" }), after),
        ).toBe(Date.UTC(2025, 5, 8, 9, 30));
    });

    test("dayOfWeek 3 lands on Wednesday", () => {
        const after = Date.UTC(2025, 5, 3, 12, 0);
        expect(
            nextFireAt(weekly({ dayOfWeek: 3, time: "22:00", timeZone: "UTC" }), after),
        ).toBe(Date.UTC(2025, 5, 4, 22, 0));
    });

    test("rolls over to the next week past the fire instant", () => {
        const fireInstant = Date.UTC(2025, 5, 8, 9, 30);
        expect(
            nextFireAt(weekly({ dayOfWeek: 0, time: "09:30", timeZone: "UTC" }), fireInstant),
        ).toBe(Date.UTC(2025, 5, 15, 9, 30));
    });
});

describe("America/New_York daylight saving", () => {
    test("nonexistent 02:30 during spring-forward fires when the gap ends", () => {
        const after = Date.UTC(2025, 2, 8, 17, 0);
        expect(nextFireAt(daily("02:30"), after)).toBe(Date.UTC(2025, 2, 9, 7, 0));
    });

    test("01:45 before the gap keeps standard offset", () => {
        const after = Date.UTC(2025, 2, 8, 17, 0);
        expect(nextFireAt(daily("01:45"), after)).toBe(Date.UTC(2025, 2, 9, 6, 45));
    });

    test("03:15 after the gap keeps daylight offset", () => {
        const after = Date.UTC(2025, 2, 8, 17, 0);
        expect(nextFireAt(daily("03:15"), after)).toBe(Date.UTC(2025, 2, 9, 7, 15));
    });

    test("ambiguous 01:30 during fall-back picks the earlier instant", () => {
        const after = Date.UTC(2025, 10, 1, 16, 0);
        expect(nextFireAt(daily("01:30"), after)).toBe(Date.UTC(2025, 10, 2, 5, 30));
    });

    test("ambiguous 01:30 resolves to the later instant once the earlier passed", () => {
        const after = Date.UTC(2025, 10, 2, 6, 0);
        expect(nextFireAt(daily("01:30"), after)).toBe(Date.UTC(2025, 10, 2, 6, 30));
    });

    test("weekly keeps 10:00 local across spring-forward", () => {
        const spec = weekly({ dayOfWeek: 1, time: "10:00" });
        expect(nextFireAt(spec, Date.UTC(2025, 2, 3, 12, 0))).toBe(
            Date.UTC(2025, 2, 3, 15, 0),
        );
        expect(nextFireAt(spec, Date.UTC(2025, 2, 10, 12, 0))).toBe(
            Date.UTC(2025, 2, 10, 14, 0),
        );
    });

    test("weekly keeps 10:00 local across fall-back", () => {
        const spec = weekly({ dayOfWeek: 1, time: "10:00" });
        expect(nextFireAt(spec, Date.UTC(2025, 9, 27, 12, 0))).toBe(
            Date.UTC(2025, 9, 27, 14, 0),
        );
        expect(nextFireAt(spec, Date.UTC(2025, 10, 3, 12, 0))).toBe(
            Date.UTC(2025, 10, 3, 15, 0),
        );
    });
});

describe("default timezone", () => {
    test("constructors fill America/New_York when omitted", () => {
        expect(daily("10:00")).toEqual(daily("10:00", "America/New_York"));
        expect(weekly({ dayOfWeek: 0, time: "09:30" })).toEqual(
            weekly({ dayOfWeek: 0, time: "09:30", timeZone: "America/New_York" }),
        );
        expect(onceAt(new Date("2026-09-01T15:00:00Z"))).toEqual({
            kind: "once",
            at: Date.UTC(2026, 8, 1, 15, 0),
        });
    });
});
