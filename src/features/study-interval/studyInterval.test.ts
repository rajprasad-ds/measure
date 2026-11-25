import { describe, expect, it } from "vitest";
import {
  getActiveStudyInterval,
  getLocalDateKey,
  getPracticeTimelineSegments,
  getPracticeSessionEndAt,
  getScheduledAvailabilityMs,
  getWeekday,
  resolveDayIntervals,
  timeToMinutes,
  validateStudyIntervals,
  type StudyInterval,
} from "./studyInterval";

const day = new Date(2026, 10, 25);
const schedule = {
  off: false,
  intervals: [
    { id: "morning", start: "07:00", end: "12:00" },
    { id: "afternoon", start: "13:00", end: "18:00" },
    { id: "evening", start: "19:00", end: "23:00" },
  ],
};

function timestamp(hour: number, minute = 0): number {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    hour,
    minute,
  ).getTime();
}

function iso(hour: number, minute = 0): string {
  return new Date(timestamp(hour, minute)).toISOString();
}

describe("study interval time helpers", () => {
  it("parses valid 24-hour wall-clock times", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("07:30")).toBe(450);
    expect(timeToMinutes("23:59")).toBe(1439);
  });

  it("rejects malformed and out-of-range times", () => {
    for (const value of ["24:00", "12:60", "7:00", "noon", ""]) {
      expect(timeToMinutes(value)).toBeNull();
    }
  });

  it("uses the local calendar date and JavaScript weekday convention", () => {
    expect(getLocalDateKey(day)).toBe("2026-11-25");
    expect(getWeekday(day)).toBe(day.getDay());
  });
});

describe("validateStudyIntervals", () => {
  it("accepts sorted, unsorted and adjacent non-overlapping intervals", () => {
    const intervals: StudyInterval[] = [
      { id: "later", start: "10:00", end: "12:00" },
      { id: "earlier", start: "07:00", end: "10:00" },
    ];
    expect(validateStudyIntervals(intervals)).toEqual([]);
  });

  it("rejects intervals that overlap", () => {
    expect(
      validateStudyIntervals([
        { id: "one", start: "07:00", end: "11:00" },
        { id: "two", start: "10:30", end: "12:00" },
      ]),
    ).toContain("Intervals 1 and 2 overlap.");
  });

  it("rejects overnight, zero-length and malformed intervals", () => {
    const errors = validateStudyIntervals([
      { id: "overnight", start: "22:00", end: "06:00" },
      { id: "zero", start: "09:00", end: "09:00" },
      { id: "invalid", start: "25:00", end: "26:00" },
    ]);
    expect(errors).toHaveLength(3);
  });

  it("requires non-empty unique IDs", () => {
    expect(
      validateStudyIntervals([
        { id: "", start: "07:00", end: "08:00" },
        { id: "", start: "09:00", end: "10:00" },
      ]),
    ).toEqual([
      "Interval 1 needs an ID.",
      "Interval 2 needs an ID.",
    ]);
  });
});

describe("resolveDayIntervals", () => {
  it("returns no intervals on an OFF day", () => {
    expect(
      resolveDayIntervals(day, { off: true, intervals: schedule.intervals }, timestamp(9)),
    ).toEqual([]);
  });

  it("sorts intervals and classifies upcoming, active and passed states", () => {
    const intervals = resolveDayIntervals(day, schedule, timestamp(14));
    expect(intervals.map(({ id, status }) => [id, status])).toEqual([
      ["morning", "passed"],
      ["afternoon", "active"],
      ["evening", "upcoming"],
    ]);
  });

  it("treats the start as inclusive and the end as exclusive", () => {
    const intervals = resolveDayIntervals(day, schedule, timestamp(13));
    expect(getActiveStudyInterval(intervals, timestamp(13))?.id).toBe("afternoon");
    expect(getActiveStudyInterval(intervals, timestamp(18))).toBeNull();
  });

  it("calculates total scheduled availability without counting gaps", () => {
    const intervals = resolveDayIntervals(day, schedule, timestamp(8));
    expect(getScheduledAvailabilityMs(intervals)).toBe(14 * 60 * 60 * 1000);
  });
});

describe("getPracticeTimelineSegments", () => {
  const intervals = resolveDayIntervals(day, schedule, timestamp(8));

  it("keeps grey gaps between separate practice sessions", () => {
    const segments = getPracticeTimelineSegments(intervals, [
      { startedAt: iso(7, 30), endedAt: iso(8, 15) },
      { startedAt: iso(10), endedAt: iso(11) },
    ]);

    expect(
      segments.map(({ intervalId, startAt, endAt }) => ({
        intervalId,
        start: new Date(startAt).getHours() + ":" + new Date(startAt).getMinutes(),
        end: new Date(endAt).getHours() + ":" + new Date(endAt).getMinutes(),
      })),
    ).toEqual([
      { intervalId: "morning", start: "7:30", end: "8:15" },
      { intervalId: "morning", start: "10:0", end: "11:0" },
    ]);
  });

  it("clips a session to scheduled intervals and leaves unscheduled gaps empty", () => {
    const segments = getPracticeTimelineSegments(intervals, [
      { startedAt: iso(11), endedAt: iso(14) },
    ]);
    expect(segments.map((segment) => [
      segment.intervalId,
      segment.startAt,
      segment.endAt,
    ])).toEqual([
      ["morning", timestamp(11), timestamp(12)],
      ["afternoon", timestamp(13), timestamp(14)],
    ]);
  });

  it("excludes question-revision sessions", () => {
    expect(
      getPracticeTimelineSegments(intervals, [
        {
          sessionKind: "question_revision",
          startedAt: iso(8),
          endedAt: iso(9),
        },
      ]),
    ).toEqual([]);
  });

  it("ignores invalid or zero-length session timestamps", () => {
    expect(
      getPracticeTimelineSegments(intervals, [
        { startedAt: "not-a-date", endedAt: iso(9) },
        { startedAt: iso(10), endedAt: iso(10) },
      ]),
    ).toEqual([]);
  });
});


describe("getPracticeSessionEndAt", () => {
  it("uses the earlier of the chosen duration and interval boundary", () => {
    expect(getPracticeSessionEndAt(1_000, 61_000, 31_000)).toBe(31_000);
    expect(getPracticeSessionEndAt(1_000, 21_000, 31_000)).toBe(21_000);
  });

  it("does not allow a session without a containing interval", () => {
    expect(getPracticeSessionEndAt(1_000, 61_000, null)).toBe(1_000);
  });
});
