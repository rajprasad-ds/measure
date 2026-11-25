import { describe, expect, it } from "vitest";
import { getFeedbackDeadlineAt, isFeedbackExpired } from "./feedbackDeadline";

const day = new Date(2026, 10, 25);
const schedule = {
  off: false,
  intervals: [
    { id: "morning", start: "07:00", end: "12:00" },
    { id: "evening", start: "18:00", end: "21:00" },
  ],
};

describe("practice feedback deadline", () => {
  it("starts the grace period after the final interval, not the first or practice end", () => {
    const deadline = getFeedbackDeadlineAt(day, schedule, 6);
    expect(deadline).toBe(new Date(2026, 10, 26, 3, 0, 0, 0).getTime());
  });

  it("uses the grace period captured for that day", () => {
    expect(getFeedbackDeadlineAt(day, schedule, 2)).toBe(
      new Date(2026, 10, 25, 23, 0, 0, 0).getTime(),
    );
    expect(getFeedbackDeadlineAt(day, schedule, 12)).toBe(
      new Date(2026, 10, 26, 9, 0, 0, 0).getTime(),
    );
  });

  it("has no deadline for an OFF day or a day without intervals", () => {
    expect(getFeedbackDeadlineAt(day, { off: true, intervals: [] }, 6)).toBeNull();
  });

  it("allows submission through the deadline and expires only afterwards", () => {
    const deadline = getFeedbackDeadlineAt(day, schedule, 2)!;
    expect(isFeedbackExpired(deadline, deadline - 1)).toBe(false);
    expect(isFeedbackExpired(deadline, deadline)).toBe(false);
    expect(isFeedbackExpired(deadline, deadline + 1)).toBe(true);
  });

  it("treats a missing deadline as expired rather than accepting an unbounded pending session", () => {
    expect(isFeedbackExpired(undefined, Date.now())).toBe(true);
    expect(isFeedbackExpired(null, Date.now())).toBe(true);
  });
});
