import { describe, expect, it } from "vitest";
import {
  isWeeklyStudySchedule,
  validateWeeklyStudySchedule,
} from "./studyIntervalRepository";
import type { WeeklyStudySchedule } from "./studyInterval";

function makeSchedule(): WeeklyStudySchedule {
  return {
    0: { off: true, intervals: [] },
    1: { off: false, intervals: [{ id: "mon-1", start: "07:00", end: "12:00" }] },
    2: { off: false, intervals: [{ id: "tue-1", start: "08:00", end: "12:00" }] },
    3: { off: true, intervals: [] },
    4: { off: false, intervals: [{ id: "thu-1", start: "09:00", end: "13:00" }] },
    5: { off: false, intervals: [{ id: "fri-1", start: "07:00", end: "11:00" }] },
    6: { off: true, intervals: [] },
  };
}

describe("weekly Study Interval schedule validation", () => {
  it("accepts a complete seven-day schedule with OFF days and intervals", () => {
    const schedule = makeSchedule();
    expect(isWeeklyStudySchedule(schedule)).toBe(true);
    expect(validateWeeklyStudySchedule(schedule)).toEqual([]);
  });

  it("rejects missing weekdays and malformed day entries", () => {
    expect(isWeeklyStudySchedule({ 0: { off: true, intervals: [] } })).toBe(false);
  });

  it("rejects intervals on OFF days", () => {
    const schedule = makeSchedule();
    schedule[0] = {
      off: true,
      intervals: [{ id: "sun-1", start: "07:00", end: "08:00" }],
    };
    expect(validateWeeklyStudySchedule(schedule)).toContain(
      "Day 0: OFF days cannot contain intervals.",
    );
    expect(isWeeklyStudySchedule(schedule)).toBe(false);
  });

  it("requires every non-OFF day to have at least one interval", () => {
    const schedule = makeSchedule();
    schedule[1] = { off: false, intervals: [] };
    expect(validateWeeklyStudySchedule(schedule)).toContain(
      "Day 1: add an interval or mark the day OFF.",
    );
    expect(isWeeklyStudySchedule(schedule)).toBe(false);
  });

  it("rejects overlapping intervals in a weekday", () => {
    const schedule = makeSchedule();
    schedule[1] = {
      off: false,
      intervals: [
        { id: "mon-1", start: "07:00", end: "10:00" },
        { id: "mon-2", start: "09:30", end: "12:00" },
      ],
    };
    expect(isWeeklyStudySchedule(schedule)).toBe(false);
    expect(validateWeeklyStudySchedule(schedule).some((error) => error.includes("overlap"))).toBe(true);
  });
});
