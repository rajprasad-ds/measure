import { useEffect, useMemo, useState } from "react";
import type { SessionRecord } from "../../database";
import {
  getLocalDateKey,
  getPracticeTimelineSegments,
  getWeekday,
  resolveDayIntervals,
  type WeeklyStudySchedule,
  type Weekday,
} from "./studyInterval";
import {
  getOrCreateStudyDaySnapshot,
  getWeeklyStudySchedule,
  saveWeeklyStudySchedule,
  syncStudySchedule,
} from "./studyIntervalRepository";

const WEEKDAYS: Array<{ id: Weekday; label: string }> = [
  { id: 1, label: "Monday" },
  { id: 2, label: "Tuesday" },
  { id: 3, label: "Wednesday" },
  { id: 4, label: "Thursday" },
  { id: 5, label: "Friday" },
  { id: 6, label: "Saturday" },
  { id: 0, label: "Sunday" },
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
  return globalThis.crypto?.randomUUID?.() ?? `interval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type Props = {
  userId: string;
  sessions: SessionRecord[];
};

export default function StudyIntervalPanel({ userId, sessions }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [schedule, setSchedule] = useState<WeeklyStudySchedule>(emptySchedule);
  const [hasSavedSchedule, setHasSavedSchedule] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
        const record = await getWeeklyStudySchedule(userId);
        if (cancelled) return;
        if (record) {
          setSchedule(record.schedule);
          setHasSavedSchedule(true);
          const day = await getOrCreateStudyDaySnapshot(userId, new Date());
          if (!cancelled) setSnapshot(day);
        } else {
          setSchedule(emptySchedule());
          setHasSavedSchedule(false);
          setSnapshot(null);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load your study schedule.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const today = useMemo(() => new Date(now), [now]);
  const todayKey = getLocalDateKey(today);
  const todayWeekday = getWeekday(today);
  const todayName = WEEKDAYS.find((day) => day.id === todayWeekday)?.label ?? "Today";
  const todaySchedule = snapshot?.schedule;
  const intervals = useMemo(
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
    () => getPracticeTimelineSegments(intervals, todaySessions),
    [intervals, todaySessions],
  );
  const practicedSessionCount = new Set(segments.map((segment) => `${segment.sessionStartAt}:${segment.sessionEndAt}`)).size;

  function updateDay(day: Weekday, updater: (current: WeeklyStudySchedule[Weekday]) => WeeklyStudySchedule[Weekday]) {
    setSchedule((current) => ({ ...current, [day]: updater(current[day]) }));
  }

  async function saveSchedule() {
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      await saveWeeklyStudySchedule(userId, schedule);
      // Cloud sync is best-effort; the local schedule is already committed.
      void syncStudySchedule(userId);
      setHasSavedSchedule(true);
      // If today's snapshot already exists, this returns it unchanged. A schedule
      // edited during the day therefore takes effect from the next day.
      const day = await getOrCreateStudyDaySnapshot(userId, new Date());
      setSnapshot(day);
      setIsEditing(false);
      setNotice("Schedule saved. Changes to today's schedule are not applied retroactively.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your schedule.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <section className="study-interval-panel"><p className="eyebrow">STUDY INTERVALS</p><p>Loading your schedule…</p></section>;
  }

  return (
    <section className="study-interval-panel" aria-labelledby="study-interval-title">
      <div className="study-interval-heading">
        <div>
          <p className="eyebrow">YOUR WEEKLY ROUTINE</p>
          <h2 id="study-interval-title">Study intervals</h2>
          <p className="study-interval-subtitle">{todayName}, {todayKey}</p>
        </div>
        <button type="button" className="study-interval-edit" onClick={() => { setIsEditing((value) => !value); setError(null); setNotice(null); }}>
          {isEditing ? "Close editor" : hasSavedSchedule ? "Edit schedule" : "Set schedule"}
        </button>
      </div>

      {!hasSavedSchedule && !isEditing && (
        <div className="study-interval-empty">
          <p>Set the times when you plan to study. Practice activity will appear on this timeline only after its feedback is saved.</p>
          <button type="button" className="study-interval-primary" onClick={() => setIsEditing(true)}>Create weekly schedule</button>
        </div>
      )}

      {hasSavedSchedule && !isEditing && (
        <>
          <div className="study-interval-summary">
            <strong>{todaySchedule?.off ? "Day off" : intervals.length ? `${practicedSessionCount} practice session${practicedSessionCount === 1 ? "" : "s"} recorded` : "No intervals scheduled"}</strong>
            <span>{todaySchedule?.off ? "No study interval is scheduled today." : "Green marks actual saved question-practice time. Empty space remains unused time."}</span>
          </div>
          {intervals.length === 0 ? (
            <div className="study-interval-off">No study time scheduled for today.</div>
          ) : (
            <div className="study-interval-timeline-list">
              {intervals.map((interval) => {
                const duration = interval.endAt - interval.startAt;
                const intervalSegments = segments.filter((segment) => segment.intervalId === interval.id);
                return (
                  <div className="study-interval-row" key={interval.id}>
                    <div className="study-interval-time-label"><strong>{interval.start}</strong><span>{interval.end}</span></div>
                    <div className="study-interval-track" role="img" aria-label={`${interval.start} to ${interval.end}, ${intervalSegments.length} saved practice segment(s)`}>
                      {intervalSegments.map((segment, index) => (
                        <span
                          className="study-interval-practice-segment"
                          key={`${segment.startAt}-${segment.endAt}-${index}`}
                          style={{
                            left: `${((segment.startAt - interval.startAt) / duration) * 100}%`,
                            width: `${((segment.endAt - segment.startAt) / duration) * 100}%`,
                          }}
                        />
                      ))}
                      {interval.status === "active" && <span className="study-interval-now-marker" style={{ left: `${Math.max(0, Math.min(100, ((now - interval.startAt) / duration) * 100))}%` }} />}
                    </div>
                    <span className={`study-interval-status status-${interval.status}`}>{interval.status === "active" ? "Now" : interval.status === "passed" ? "Ended" : "Later"}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {isEditing && (
        <div className="study-interval-editor">
          <p className="study-interval-help">Choose one or more same-day intervals for each weekday. Adjacent intervals are allowed; overlapping intervals are not.</p>
          {WEEKDAYS.map(({ id, label }) => {
            const day = schedule[id];
            return (
              <fieldset className="study-interval-day" key={id}>
                <div className="study-interval-day-heading">
                  <legend>{label}</legend>
                  <label className="study-interval-off-toggle">
                    <input
                      type="checkbox"
                      checked={day.off}
                      onChange={(event) => updateDay(id, (current) => ({
                        off: event.target.checked,
                        intervals: event.target.checked ? [] : current.intervals.length ? current.intervals : [{ id: makeIntervalId(), start: "09:00", end: "12:00" }],
                      }))}
                    />
                    Day off
                  </label>
                </div>
                {!day.off && (
                  <div className="study-interval-editor-rows">
                    {day.intervals.map((interval) => (
                      <div className="study-interval-editor-row" key={interval.id}>
                        <label>From<input type="time" value={interval.start} onChange={(event) => updateDay(id, (current) => ({ ...current, intervals: current.intervals.map((item) => item.id === interval.id ? { ...item, start: event.target.value } : item) }))} /></label>
                        <label>To<input type="time" value={interval.end} onChange={(event) => updateDay(id, (current) => ({ ...current, intervals: current.intervals.map((item) => item.id === interval.id ? { ...item, end: event.target.value } : item) }))} /></label>
                        <button type="button" className="study-interval-remove" aria-label={`Remove ${label} interval`} onClick={() => updateDay(id, (current) => ({ ...current, intervals: current.intervals.filter((item) => item.id !== interval.id), off: current.intervals.length === 1 }))}>Remove</button>
                      </div>
                    ))}
                    <button type="button" className="study-interval-add" onClick={() => updateDay(id, (current) => ({ ...current, intervals: [...current.intervals, { id: makeIntervalId(), start: "13:00", end: "17:00" }] }))}>+ Add interval</button>
                  </div>
                )}
              </fieldset>
            );
          })}
          {error && <p className="database-error" role="alert">{error}</p>}
          <div className="study-interval-editor-actions">
            <button type="button" className="study-interval-cancel" onClick={() => { setIsEditing(false); setError(null); }}>Cancel</button>
            <button type="button" className="study-interval-primary" disabled={isSaving} onClick={() => void saveSchedule()}>{isSaving ? "Saving…" : "Save weekly schedule"}</button>
          </div>
        </div>
      )}
      {!isEditing && error && <p className="database-error" role="alert">{error}</p>}
      {!isEditing && notice && <p className="study-interval-notice" role="status">{notice}</p>}
    </section>
  );
}
