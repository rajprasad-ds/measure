import { resolveDayIntervals, type WeekdayStudySchedule } from "./studyInterval";

/** The configurable grace window is captured with the local day's schedule. */
export const DEFAULT_FEEDBACK_GRACE_HOURS = 6;
export const FEEDBACK_GRACE_HOUR_OPTIONS = [2, 6, 12] as const;
export type FeedbackGraceHours = (typeof FEEDBACK_GRACE_HOUR_OPTIONS)[number];

export function isFeedbackGraceHours(value: unknown): value is FeedbackGraceHours {
  return FEEDBACK_GRACE_HOUR_OPTIONS.some((option) => option === value);
}

/** Deadline is measured from the final scheduled interval, not the session end. */
export function getFeedbackDeadlineAt(
  day: Date,
  schedule: WeekdayStudySchedule,
  graceHours: number = DEFAULT_FEEDBACK_GRACE_HOURS,
): number | null {
  const intervals = resolveDayIntervals(day, schedule, day.getTime());
  if (intervals.length === 0 || !Number.isFinite(graceHours) || graceHours < 0) return null;
  const finalIntervalEnd = Math.max(...intervals.map((interval) => interval.endAt));
  return finalIntervalEnd + graceHours * 60 * 60 * 1000;
}

export function isFeedbackExpired(deadlineAt: number | null | undefined, now: number): boolean {
  return typeof deadlineAt !== "number" || !Number.isFinite(deadlineAt) || now > deadlineAt;
}
