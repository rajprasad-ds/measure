import { useEffect, useMemo, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { SessionRecord } from "../../database";
import {
  getPracticeTimelineSegments,
  getWeekday,
  resolveDayIntervals,
  validateStudyIntervals,
  type WeeklyStudySchedule,
  type Weekday,
} from "./studyInterval";
import {
  DEFAULT_FEEDBACK_GRACE_HOURS,
  FEEDBACK_GRACE_HOUR_OPTIONS,
  isFeedbackGraceHours,
} from "./feedbackDeadline";
import {
  getOrCreateStudyDaySnapshot,
  getWeeklyStudySchedule,
  saveWeeklyStudySchedule,
  syncStudySchedule,
} from "./studyIntervalRepository";

const WEEKDAYS: Array<{ id: Weekday; short: string; label: string }> = [
  { id: 1, short: "M", label: "Monday" },
  { id: 2, short: "T", label: "Tuesday" },
  { id: 3, short: "W", label: "Wednesday" },
  { id: 4, short: "Th", label: "Thursday" },
  { id: 5, short: "F", label: "Friday" },
  { id: 6, short: "Sa", label: "Saturday" },
  { id: 0, short: "S", label: "Sunday" },
];

function emptySchedule(): WeeklyStudySchedule {
  return {
    0: { off: true, intervals: [] },
    1: { off: true, intervals: [] },
    2: { off: true, intervals: [] },
    3: { off: true, intervals: [] },
    4: { off: true, intervals: [] },
    5: { off: true, intervals: [] },
    6: { off: true, intervals: [] },
  };
}

function makeIntervalId(): string {
  return globalThis.crypto?.randomUUID?.() ??
    `interval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function toClock(value: number): string {
  const safe = Math.max(0, Math.min(1435, value));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function durationLabel(value: number): string {
  const safe = Math.max(0, Math.round(value));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return [hours ? `${hours}h` : "", minutes ? `${minutes}m` : ""].filter(Boolean).join(" ") || "0m";
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getDayErrors(day: WeeklyStudySchedule[Weekday]): Map<string, string> {
  const errors = new Map<string, string>();
  day.intervals.forEach((interval, index) => {
    const start = toMinutes(interval.start);
    const end = toMinutes(interval.end);
    if (end - start < 15) {
      errors.set(interval.id, "Intervals must be at least 15 minutes.");
      return;
    }
    const overlaps = day.intervals.some((other, otherIndex) =>
      otherIndex !== index && start < toMinutes(other.end) && toMinutes(other.start) < end,
    );
    if (overlaps) errors.set(interval.id, "This interval overlaps another interval.");
  });
  if (validateStudyIntervals(day.intervals).length > 0 && errors.size === 0 && day.intervals.length) {
    errors.set(day.intervals[0].id, "Check the interval times.");
  }
  return errors;
}

type Props = {
  userId: string;
  sessions: SessionRecord[];
};

export default function StudyIntervalPanel({ userId, sessions }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [schedule, setSchedule] = useState<WeeklyStudySchedule>(emptySchedule);
  const [feedbackGraceHours, setFeedbackGraceHours] = useState<2 | 6 | 12>(DEFAULT_FEEDBACK_GRACE_HOURS);
  const [hasSavedSchedule, setHasSavedSchedule] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<Weekday>(() => getWeekday(new Date()));
  const [selectedIntervalId, setSelectedIntervalId] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyDays, setCopyDays] = useState<Weekday[]>([]);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof getOrCreateStudyDaySnapshot>>>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void (async () => {
      try {
        await syncStudySchedule(userId);
        const record = await getWeeklyStudySchedule(userId);
        if (cancelled) return;
        if (record) {
          setSchedule(record.schedule);
          setFeedbackGraceHours(
            isFeedbackGraceHours(record.feedbackGraceHours)
              ? record.feedbackGraceHours
              : DEFAULT_FEEDBACK_GRACE_HOURS,
          );
          setHasSavedSchedule(true);
        } else {
          setSchedule(emptySchedule());
          setHasSavedSchedule(false);
        }
        const day = await getOrCreateStudyDaySnapshot(userId, new Date());
        if (!cancelled) setSnapshot(day);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load your study schedule.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const today = useMemo(() => new Date(now), [now]);
  const todayWeekday = getWeekday(today);
  const todaySchedule = snapshot?.schedule;
  const resolvedIntervals = useMemo(
    () => todaySchedule ? resolveDayIntervals(today, todaySchedule, now) : [],
    [today, todaySchedule, now],
  );
  const todaySessions = useMemo(
    () => sessions.filter((record) => {
      if (record.sessionKind === "question_revision") return false;
      return new Date(record.startedAt).toDateString() === today.toDateString() ||
        new Date(record.endedAt).toDateString() === today.toDateString();
    }),
    [sessions, today],
  );
  const segments = useMemo(
    () => getPracticeTimelineSegments(resolvedIntervals, todaySessions),
    [resolvedIntervals, todaySessions],
  );
  const spentMinutes = segments.reduce(
    (sum, segment) => sum + Math.max(0, segment.endAt - segment.startAt) / 60_000,
    0,
  );
  const activeInterval = resolvedIntervals.find((interval) => interval.status === "active");
  const leftMinutes = activeInterval
    ? Math.max(0, activeInterval.endAt - now) / 60_000
    : 0;

  const selected = schedule[selectedDay];
  const selectedErrors = getDayErrors(selected);
  const weeklyMinutes = Object.values(schedule).reduce((sum, day) =>
    sum + (day.off ? 0 : day.intervals.reduce((total, interval) =>
      total + Math.max(0, toMinutes(interval.end) - toMinutes(interval.start)), 0)), 0);
  const allDaysValid = WEEKDAYS.every(({ id }) => {
    const day = schedule[id];
    return day.off || (day.intervals.length > 0 && getDayErrors(day).size === 0);
  });

  function updateDay(
    day: Weekday,
    updater: (current: WeeklyStudySchedule[Weekday]) => WeeklyStudySchedule[Weekday],
  ) {
    setSchedule((current) => ({ ...current, [day]: updater(current[day]) }));
  }

  function openEditor() {
    setSelectedDay(todayWeekday);
    setSelectedIntervalId(null);
    setCopyOpen(false);
    setError(null);
    setNotice(null);
    setIsEditing(true);
  }

  function addInterval(start?: number, end?: number) {
    const existing = selected.intervals;
    let startAt = start ?? 360;
    let endAt = end ?? startAt + 60;
    if (start === undefined) {
      for (const interval of [...existing].sort((a, b) => toMinutes(a.start) - toMinutes(b.start))) {
        if (startAt < toMinutes(interval.end) && endAt > toMinutes(interval.start)) {
          startAt = toMinutes(interval.end);
          endAt = startAt + 60;
        }
      }
    }
    if (
      endAt > 1435 ||
      endAt - startAt < 15 ||
      existing.some((interval) =>
        startAt < toMinutes(interval.end) && endAt > toMinutes(interval.start),
      )
    ) {
      setError("That range is unavailable. Choose a free part of the timeline.");
      return;
    }
    const id = makeIntervalId();
    updateDay(selectedDay, (current) => ({
      off: false,
      intervals: [...current.intervals, { id, start: toClock(startAt), end: toClock(endAt) }]
        .sort((a, b) => toMinutes(a.start) - toMinutes(b.start)),
    }));
    setSelectedIntervalId(id);
    setError(null);
  }

  function updateInterval(id: string, key: "start" | "end", value: string) {
    updateDay(selectedDay, (current) => {
      const intervals = current.intervals.map((interval) =>
        interval.id === id ? { ...interval, [key]: value } : interval,
      );
      intervals.sort((left, right) => {
        const leftStart = toMinutes(left.start);
        const rightStart = toMinutes(right.start);
        return (Number.isFinite(leftStart) ? leftStart : 1440) -
          (Number.isFinite(rightStart) ? rightStart : 1440);
      });
      return { ...current, intervals };
    });
    setSelectedIntervalId(id);
    setError(null);
  }

  function timelineMinute(event: ReactPointerEvent<HTMLDivElement>): number {
    const rect = event.currentTarget.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(1435, Math.round(((event.clientX - rect.left) / rect.width * 1440) / 30) * 30),
    );
  }

  function finishDrag() {
    if (dragStart === null || dragEnd === null) {
      setDragStart(null);
      setDragEnd(null);
      return;
    }
    const start = Math.min(dragStart, dragEnd);
    const end = Math.min(1435, Math.max(dragStart, dragEnd));
    setDragStart(null);
    setDragEnd(null);
    if (end - start < 30) {
      setError("Drag for at least 30 minutes to add an interval.");
      return;
    }
    addInterval(start, end);
  }

  async function saveSchedule() {
    if (!allDaysValid) {
      setError("Each day must either be OFF or contain valid, non-overlapping intervals.");
      return;
    }
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveWeeklyStudySchedule(userId, schedule, undefined, new Date(), feedbackGraceHours);
      void syncStudySchedule(userId);
      setHasSavedSchedule(true);
      const day = await getOrCreateStudyDaySnapshot(userId, new Date());
      setSnapshot(day);
      setIsEditing(false);
      setNotice("Schedule saved. Changes start tomorrow; today's intervals stay as they are.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your study schedule.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <section className="study-interval-loading">
        <span className="study-interval-loading-dot" />
        Loading today's schedule…
      </section>
    );
  }

  if (isEditing) {
    const totalForDay = selected.off ? 0 : selected.intervals.reduce(
      (sum, interval) => sum + Math.max(0, toMinutes(interval.end) - toMinutes(interval.start)),
      0,
    );
    const dragLow = dragStart === null || dragEnd === null ? 0 : Math.min(dragStart, dragEnd);
    const dragHigh = dragStart === null || dragEnd === null ? 0 : Math.max(dragStart, dragEnd);

    return (
      <section className="study-schedule-screen measure-sheet-enter" aria-labelledby="study-schedule-title">
        <div className="study-schedule-topbar">
          <button type="button" onClick={() => { setIsEditing(false); setError(null); }}>
            Cancel
          </button>
          <button
            type="button"
            className="is-done"
            disabled={isSaving || !allDaysValid}
            onClick={() => void saveSchedule()}
          >
            {isSaving ? "Saving…" : "Done"}
          </button>
        </div>

        <h1 id="study-schedule-title">Study schedule</h1>
        <p className="study-schedule-intro">
          Your weekly routine. Changes start tomorrow; today's intervals stay as they are.
        </p>

        <div className="study-weekday-picker" role="group" aria-label="Day of the week">
          {WEEKDAYS.map(({ id, short, label }) => (
            <button
              key={id}
              type="button"
              className={`study-weekday${selectedDay === id ? " is-selected" : ""}${schedule[id].off ? " is-off" : ""}${id === todayWeekday ? " is-today" : ""}`}
              aria-label={label}
              aria-pressed={selectedDay === id}
              onClick={() => {
                setSelectedDay(id);
                setSelectedIntervalId(null);
                setError(null);
              }}
            >
              {short}
              {!schedule[id].off && schedule[id].intervals.length > 0 && <i />}
            </button>
          ))}
        </div>

        <div className="study-day-summary">
          <strong>
            {WEEKDAYS.find((day) => day.id === selectedDay)?.label}
            {selectedDay === todayWeekday ? " · today" : ""}
          </strong>
          <span>
            {selected.off ? "Day off" : `${selected.intervals.length} intervals · ${durationLabel(totalForDay)}`}
          </span>
        </div>

        <div className="study-day-off-row">
          <span>Day off</span>
          <label className="study-switch">
            <input
              type="checkbox"
              checked={selected.off}
              onChange={(event) => {
                const off = event.target.checked;
                updateDay(selectedDay, (current) => ({
                  off,
                  intervals: off
                    ? []
                    : current.intervals.length
                      ? current.intervals
                      : [{ id: makeIntervalId(), start: "09:00", end: "17:00" }],
                }));
                setSelectedIntervalId(null);
                setError(null);
              }}
            />
            <i />
          </label>
        </div>

        {!selected.off && (
          <>
            <div
              className="study-editor-timeline"
              role="group"
              aria-label="24-hour schedule. Drag across the timeline to add an interval."
              onPointerDown={(event) => {
                if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                const point = timelineMinute(event);
                setDragStart(point);
                setDragEnd(point);
                setError(null);
              }}
              onPointerMove={(event) => {
                if (dragStart !== null) setDragEnd(timelineMinute(event));
              }}
              onPointerUp={finishDrag}
              onPointerCancel={() => { setDragStart(null); setDragEnd(null); }}
            >
              {selected.intervals.map((interval) => (
                <button
                  key={interval.id}
                  type="button"
                  className={`study-editor-block${selectedIntervalId === interval.id ? " is-selected" : ""}${selectedErrors.has(interval.id) ? " has-error" : ""}`}
                  style={{
                    left: `${toMinutes(interval.start) / 14.4}%`,
                    width: `${(toMinutes(interval.end) - toMinutes(interval.start)) / 14.4}%`,
                  }}
                  aria-label={`Select interval ${interval.start} to ${interval.end}`}
                  aria-pressed={selectedIntervalId === interval.id}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => setSelectedIntervalId(interval.id)}
                />
              ))}
              {dragStart !== null && dragEnd !== null && dragHigh - dragLow >= 30 && (
                <span
                  className="study-editor-drag-range"
                  style={{ left: `${dragLow / 14.4}%`, width: `${(dragHigh - dragLow) / 14.4}%` }}
                />
              )}
            </div>
            <div className="study-editor-ticks">
              <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
            </div>
            <p className="study-schedule-hint">
              Drag across the line to add an interval, or use the list below.
            </p>

            <div className="study-interval-edit-list">
              {selected.intervals.length === 0 ? (
                <p className="study-interval-empty-row">Add an interval or mark this day off.</p>
              ) : selected.intervals.map((interval) => {
                const invalid = selectedErrors.get(interval.id);
                const duration = toMinutes(interval.end) - toMinutes(interval.start);
                return (
                  <div
                    className={`study-interval-edit-item${selectedIntervalId === interval.id ? " is-selected" : ""}`}
                    key={interval.id}
                    data-interval-row={interval.id}
                  >
                    <label className="study-time-input">
                      <span className="sr-only">Start time</span>
                      <input
                        type="time"
                        step={300}
                        value={interval.start}
                        onFocus={() => setSelectedIntervalId(interval.id)}
                        onChange={(event) => updateInterval(interval.id, "start", event.target.value)}
                      />
                    </label>
                    <span className="study-time-arrow">→</span>
                    <label className="study-time-input">
                      <span className="sr-only">End time</span>
                      <input
                        type="time"
                        step={300}
                        value={interval.end}
                        onFocus={() => setSelectedIntervalId(interval.id)}
                        onChange={(event) => updateInterval(interval.id, "end", event.target.value)}
                      />
                    </label>
                    <span className="study-interval-duration">{durationLabel(duration)}</span>
                    <button
                      type="button"
                      className="study-interval-delete"
                      aria-label={`Remove ${interval.start} to ${interval.end}`}
                      onClick={() => {
                        updateDay(selectedDay, (current) => ({
                          off: current.intervals.length === 1,
                          intervals: current.intervals.filter((item) => item.id !== interval.id),
                        }));
                        setSelectedIntervalId(null);
                        setError(null);
                      }}
                    >
                      −
                    </button>
                    {invalid && <span className="study-interval-validation">{invalid}</span>}
                  </div>
                );
              })}
            </div>

            <div className="study-schedule-actions">
              <button
                type="button"
                onClick={() => addInterval()}
              >
                + Add interval
              </button>
              <button
                type="button"
                onClick={() => { setCopyDays([]); setCopyOpen(true); }}
              >
                Copy to other days…
              </button>
            </div>
            <p className="study-schedule-weekly-total">Weekly total: {durationLabel(weeklyMinutes)}</p>
          </>
        )}

        {selected.off && (
          <p className="study-schedule-off-note">
            No studying on this day. Measure won't start sessions or record study time.
          </p>
        )}

        <details className="study-grace-setting">
          <summary>
            Feedback deadline <span>{feedbackGraceHours} hours after the final interval</span>
          </summary>
          <label htmlFor="study-feedback-grace">Grace period</label>
          <select
            id="study-feedback-grace"
            value={feedbackGraceHours}
            onChange={(event) => setFeedbackGraceHours(Number(event.target.value) as 2 | 6 | 12)}
          >
            {FEEDBACK_GRACE_HOUR_OPTIONS.map((hours) => (
              <option key={hours} value={hours}>{hours} hours</option>
            ))}
          </select>
          <p>Unsubmitted practice feedback is discarded after this grace period. Independently saved fact cards are kept.</p>
        </details>

        {error && <p className="study-schedule-error" role="alert">{error}</p>}
        {notice && <p className="study-schedule-notice" role="status">{notice}</p>}

        {copyOpen && (
          <div
            className="study-copy-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setCopyOpen(false);
            }}
          >
            <section className="study-copy-sheet" role="dialog" aria-modal="true" aria-labelledby="study-copy-title">
              <h2 id="study-copy-title">Copy {WEEKDAYS.find((day) => day.id === selectedDay)?.label} to…</h2>
              <p>Replaces the selected days' schedules with this day's intervals.</p>
              <div className="study-copy-days">
                {WEEKDAYS.filter((day) => day.id !== selectedDay).map(({ id, short, label }) => (
                  <button
                    key={id}
                    type="button"
                    className={copyDays.includes(id) ? "is-selected" : ""}
                    aria-pressed={copyDays.includes(id)}
                    onClick={() => setCopyDays((current) =>
                      current.includes(id)
                        ? current.filter((day) => day !== id)
                        : [...current, id],
                    )}
                  >
                    <span>{short}</span><small>{label}</small>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="study-copy-confirm"
                disabled={copyDays.length === 0}
                onClick={() => {
                  setSchedule((current) => {
                    const next = { ...current };
                    copyDays.forEach((day) => {
                      next[day] = structuredClone(next[selectedDay]);
                    });
                    return next;
                  });
                  setCopyOpen(false);
                  setCopyDays([]);
                }}
              >
                Copy to {copyDays.length || ""} day{copyDays.length === 1 ? "" : "s"}
              </button>
              <button type="button" className="study-copy-cancel" onClick={() => setCopyOpen(false)}>
                Cancel
              </button>
            </section>
          </div>
        )}
      </section>
    );
  }

  const homeIntervals = resolvedIntervals.filter((interval) => interval.endAt > interval.startAt);
  const spentLabel = durationLabel(spentMinutes);
  const leftLabel = durationLabel(leftMinutes);

  return (
    <section className="study-interval-home" aria-label="Today's study intervals">
      <button
        type="button"
        className="study-interval-home-open"
        onClick={openEditor}
        aria-label="Open study schedule editor"
      >
        <span className="study-interval-home-heading">
          <strong>{activeInterval ? `${leftLabel} left` : todaySchedule?.off ? "Day off" : "No active interval"}</strong>
          <span><b>{spentLabel}</b> spent <i aria-hidden="true">›</i></span>
        </span>
        <span className="study-interval-home-tracks">
          {homeIntervals.length === 0 ? (
            <span className="study-interval-no-tracks">
              {todaySchedule?.off
                ? "No study intervals today"
                : hasSavedSchedule
                  ? "No study intervals today"
                  : "Set your weekly study schedule"}
            </span>
          ) : homeIntervals.map((interval) => {
            const duration = interval.endAt - interval.startAt;
            const intervalSegments = segments.filter((segment) => segment.intervalId === interval.id);
            const current = interval.status === "active";
            return (
              <span className="study-interval-home-track-wrap" key={interval.id}>
                <span className={`study-interval-home-track${current ? " is-current" : ""}${interval.status === "upcoming" ? " is-future" : ""}`}>
                  {intervalSegments.map((segment, index) => (
                    <i
                      key={`${segment.startAt}-${segment.endAt}-${index}`}
                      style={{
                        left: `${((segment.startAt - interval.startAt) / duration) * 100}%`,
                        width: `${((segment.endAt - segment.startAt) / duration) * 100}%`,
                      }}
                    />
                  ))}
                  {current && (
                    <u style={{ left: `${Math.max(0, Math.min(100, ((now - interval.startAt) / duration) * 100))}%` }} />
                  )}
                </span>
                <span className={current ? "is-current-label" : ""}>
                  {formatTime(interval.startAt).slice(0, 5)}–{formatTime(interval.endAt).slice(0, 5)}
                </span>
              </span>
            );
          })}
        </span>
      </button>
      {notice && <p className="study-interval-home-notice" role="status">{notice}</p>}
      {error && <p className="study-interval-home-notice is-error" role="alert">{error}</p>}
    </section>
  );
}
