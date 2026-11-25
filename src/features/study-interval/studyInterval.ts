export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type StudyInterval = {
  id: string;
  start: string;
  end: string;
};

export type WeekdayStudySchedule = {
  off: boolean;
  intervals: StudyInterval[];
};

export type WeeklyStudySchedule = Record<Weekday, WeekdayStudySchedule>;

export type IntervalStatus = "passed" | "active" | "upcoming";

export type ResolvedStudyInterval = StudyInterval & {
  startAt: number;
  endAt: number;
  status: IntervalStatus;
};

export type PracticeSessionTime = {
  sessionKind?: "practice" | "question_revision";
  startedAt: string;
  endedAt: string;
};

export type PracticeTimelineSegment = {
  sessionStartAt: number;
  sessionEndAt: number;
  startAt: number;
  endAt: number;
  intervalId: string;
};

const MINUTES_PER_DAY = 24 * 60;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getWeekday(date: Date): Weekday {
  return date.getDay() as Weekday;
}

export function timeToMinutes(value: string): number | null {
  if (!TIME_PATTERN.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function validateStudyIntervals(
  intervals: StudyInterval[],
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const normalized = intervals.map((interval, index) => {
    if (!interval.id.trim()) errors.push(`Interval ${index + 1} needs an ID.`);
    if (ids.has(interval.id)) errors.push("Interval IDs must be unique.");
    ids.add(interval.id);

    const start = timeToMinutes(interval.start);
    const end = timeToMinutes(interval.end);
    if (start === null || end === null) {
      errors.push(`Interval ${index + 1} must use valid 24-hour times.`);
    } else if (start >= end) {
      errors.push(`Interval ${index + 1} must end after it starts on the same day.`);
    }
    return { index, start, end };
  });

  const valid = normalized
    .filter(
      (item): item is { index: number; start: number; end: number } =>
        item.start !== null && item.end !== null && item.start < item.end,
    )
    .sort((left, right) => left.start - right.start);

  for (let index = 1; index < valid.length; index += 1) {
    if (valid[index].start < valid[index - 1].end) {
      errors.push(
        `Intervals ${valid[index - 1].index + 1} and ${valid[index].index + 1} overlap.`,
      );
    }
  }

  return errors;
}

function atLocalMinute(date: Date, minuteOfDay: number): number {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
    0,
    0,
  ).getTime();
}

export function resolveDayIntervals(
  day: Date,
  daySchedule: WeekdayStudySchedule,
  now: number,
): ResolvedStudyInterval[] {
  if (daySchedule.off) return [];

  return [...daySchedule.intervals]
    .sort(
      (left, right) =>
        (timeToMinutes(left.start) ?? MINUTES_PER_DAY) -
        (timeToMinutes(right.start) ?? MINUTES_PER_DAY),
    )
    .flatMap((interval) => {
      const startMinutes = timeToMinutes(interval.start);
      const endMinutes = timeToMinutes(interval.end);
      if (
        startMinutes === null ||
        endMinutes === null ||
        startMinutes >= endMinutes
      ) {
        return [];
      }

      const startAt = atLocalMinute(day, startMinutes);
      const endAt = atLocalMinute(day, endMinutes);
      const status: IntervalStatus =
        now < startAt ? "upcoming" : now < endAt ? "active" : "passed";

      return [{ ...interval, startAt, endAt, status }];
    });
}

export function getScheduledAvailabilityMs(
  intervals: ResolvedStudyInterval[],
): number {
  return intervals.reduce(
    (total, interval) => total + interval.endAt - interval.startAt,
    0,
  );
}

export function getActiveStudyInterval(
  intervals: ResolvedStudyInterval[],
  now: number,
): ResolvedStudyInterval | null {
  return (
    intervals.find(
      (interval) => now >= interval.startAt && now < interval.endAt,
    ) ?? null
  );
}

/**
 * Maps committed normal-practice session timestamps onto the day's scheduled
 * intervals. Each session produces its own clipped segment, so unused gaps
 * remain empty instead of being filled by a cumulative duration.
 *
 * Session rows are only created after feedback submission. Legacy rows without
 * sessionKind are treated as normal practice because question revision was
 * introduced after the original practice-only session format.
 */
export function getPracticeTimelineSegments(
  intervals: ResolvedStudyInterval[],
  sessions: PracticeSessionTime[],
): PracticeTimelineSegment[] {
  const segments: PracticeTimelineSegment[] = [];

  for (const session of sessions) {
    if (
      session.sessionKind !== undefined &&
      session.sessionKind !== "practice"
    ) {
      continue;
    }

    const sessionStartAt = Date.parse(session.startedAt);
    const sessionEndAt = Date.parse(session.endedAt);
    if (
      !Number.isFinite(sessionStartAt) ||
      !Number.isFinite(sessionEndAt) ||
      sessionEndAt <= sessionStartAt
    ) {
      continue;
    }

    for (const interval of intervals) {
      const startAt = Math.max(sessionStartAt, interval.startAt);
      const endAt = Math.min(sessionEndAt, interval.endAt);
      if (endAt > startAt) {
        segments.push({
          sessionStartAt,
          sessionEndAt,
          startAt,
          endAt,
          intervalId: interval.id,
        });
      }
    }
  }

  return segments.sort(
    (left, right) =>
      left.startAt - right.startAt || left.endAt - right.endAt,
  );
}
