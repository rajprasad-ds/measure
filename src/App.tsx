import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { database, type SessionRecord } from "./database";
import {
  assignLocalSessionsToUser,
  syncAccountSessions,
} from "./cloudSync";
import SearchSelect from "./SearchSelect";
import { supabase, supabaseConfigured } from "./supabase";
import {
  getChapter,
  getSubject,
  jeeSyllabus,
  type SyllabusSubjectId,
} from "./syllabus";

const DURATIONS = [30, 45, 60, 90, 120];

type SessionSetup = {
  subjectId: SyllabusSubjectId;
  chapterId: string;
  duration: number;
  startingQuestion: number;
};

type QuestionResult = "right" | "wrong" | "couldnt_solve";

type QuestionFeedback = {
  result: QuestionResult | null;
  topics: Array<{ id: string; name: string }>;
};

type SessionPhase = "active" | "feedback" | "summary";

type ActiveSession = SessionSetup & {
  phase: SessionPhase;
  startedAt: number;
  endsAt: number;
  endedAt: number | null;
  questionNumber: number;
  questionNumberText: string;
  questionElapsedMs: number;
  questionStartedAt: number | null;
  questionTimesMs: Record<number, number>;
  feedback: Record<number, QuestionFeedback>;
  record: SessionRecord | null;
};

function formatStopwatch(milliseconds: number) {
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  const remainingMilliseconds = milliseconds % 1_000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(remainingMilliseconds).padStart(3, "0")}`;
}

function TimerDigits({
  values,
  units,
  className,
}: {
  values: string[];
  units: string[];
  className: string;
}) {
  return (
    <span className={`timer-digits ${className}`}>
      {values.map((value, index) => (
        <span className="timer-group" key={units[index]}>
          {index > 0 && <span className="timer-separator">:</span>}
          <span className="timer-unit">
            <span className="timer-value">{value}</span>
            <span className="timer-unit-label">{units[index]}</span>
          </span>
        </span>
      ))}
    </span>
  );
}

function App() {
  const [setup, setSetup] = useState<SessionSetup>({
    subjectId: "maths",
    chapterId: "",
    duration: 60,
    startingQuestion: 1,
  });
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [now, setNow] = useState(Date.now());
  const [savedSessions, setSavedSessions] = useState<SessionRecord[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "synced" | "offline" | "error"
  >("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [unassignedSessionCount, setUnassignedSessionCount] = useState(0);
  const syncInProgress = useRef(false);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, authSession) => {
      setAuthUser(authSession?.user ?? null);
      setAuthError(null);
      setAuthMessage(null);
    });

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setAuthError(`Could not restore sign-in: ${error.message}`);
          return;
        }
        setAuthUser(data.session?.user ?? null);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAuthError(
            error instanceof Error
              ? `Could not restore sign-in: ${error.message}`
              : "Could not restore sign-in.",
          );
        }
      });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    database.sessions
      .toArray()
      .then((records) => {
        if (cancelled) return;
        const unassigned = records.filter((record) => !record.ownerUserId);
        setUnassignedSessionCount(unassigned.length);
        setSavedSessions(
          authUser
            ? records.filter((record) => record.ownerUserId === authUser.id)
            : unassigned,
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDatabaseError(
            error instanceof Error
              ? `Could not load saved sessions: ${error.message}`
              : "Could not load saved sessions.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSessions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authUser]);

  async function performSync(user: User) {
    if (syncInProgress.current) return;
    if (!navigator.onLine) {
      setSyncStatus("offline");
      setSyncError(null);
      return;
    }

    syncInProgress.current = true;
    setSyncStatus("syncing");
    setSyncError(null);
    try {
      await syncAccountSessions(user);
      const localRecords = await database.sessions.toArray();
      setSavedSessions(
        localRecords
          .filter((record) => record.ownerUserId === user.id)
          .sort((left, right) => right.endedAt.localeCompare(left.endedAt)),
      );
      setUnassignedSessionCount(
        localRecords.filter((record) => !record.ownerUserId).length,
      );
      setSyncStatus("synced");
    } catch (error) {
      setSyncStatus("error");
      setSyncError(
        error instanceof Error
          ? error.message
          : "Could not sync sessions. Please try again.",
      );
    } finally {
      syncInProgress.current = false;
    }
  }

  useEffect(() => {
    if (!authUser) {
      setSyncStatus("idle");
      return;
    }

    void performSync(authUser);
    const retryWhenOnline = () => void performSync(authUser);
    window.addEventListener("online", retryWhenOnline);
    return () => window.removeEventListener("online", retryWhenOnline);
  }, [authUser]);

  useEffect(() => {
    if (!session || session.phase !== "active") return;

    const timer = window.setInterval(() => setNow(Date.now()), 30);
    return () => window.clearInterval(timer);
  }, [session]);

  const remaining = session
    ? Math.max(0, Math.ceil((session.endsAt - now) / 1000))
    : 0;
  const stopwatchElapsed = session
    ? session.questionElapsedMs +
      (session.questionStartedAt === null ? 0 : now - session.questionStartedAt)
    : 0;
  const setupSubject = getSubject(setup.subjectId);
  const activeChapter = session
    ? getChapter(session.subjectId, session.chapterId)
    : undefined;
  const savedQuestionCount = savedSessions.reduce(
    (total, record) =>
      total +
      (record.timedQuestionCount ??
        record.rightCount + record.wrongCount + record.couldntSolveCount),
    0,
  );
  const savedActiveTimeMs = savedSessions.reduce(
    (total, record) => total + record.activeTimeMs,
    0,
  );
  const activeSessionQuestionTimes = Object.values(
    session?.phase === "active" ? session.questionTimesMs : {},
  );
  const thresholdQuestionCount =
    savedQuestionCount + activeSessionQuestionTimes.length;
  const thresholdActiveTimeMs =
    savedActiveTimeMs +
    activeSessionQuestionTimes.reduce((total, duration) => total + duration, 0);
  const averageQuestionTimeMs =
    thresholdQuestionCount > 0
      ? thresholdActiveTimeMs / thresholdQuestionCount
      : null;
  const isOverAverage =
    averageQuestionTimeMs !== null && stopwatchElapsed > averageQuestionTimeMs;

  function updateSetup<K extends keyof SessionSetup>(
    key: K,
    value: SessionSetup[K],
  ) {
    setSetup((current) => ({ ...current, [key]: value }));
  }

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setAuthError("Supabase is not configured for this app.");
      return;
    }

    setIsSubmittingAuth(true);
    setAuthError(null);
    setAuthMessage(null);
    try {
      if (authMode === "sign_up") {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setAuthMessage(
            "Check your email to confirm your account, then sign in here.",
          );
        } else {
          setAuthUser(data.user);
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });
        if (error) throw error;
        setAuthUser(data.user);
      }
      setAuthPassword("");
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Authentication failed.",
      );
    } finally {
      setIsSubmittingAuth(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    setAuthError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthError(`Could not sign out: ${error.message}`);
      return;
    }
    setAuthUser(null);
    setSavedSessions(
      (await database.sessions.toArray()).filter(
        (record) => !record.ownerUserId,
      ),
    );
  }

  async function importLocalSessions() {
    if (!authUser) return;
    try {
      await assignLocalSessionsToUser(authUser.id);
      const localRecords = await database.sessions.toArray();
      setUnassignedSessionCount(
        localRecords.filter((record) => !record.ownerUserId).length,
      );
      await performSync(authUser);
    } catch (error) {
      setSyncStatus("error");
      setSyncError(
        error instanceof Error
          ? error.message
          : "Could not import local sessions.",
      );
    }
  }

  function startSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startedAt = Date.now();
    setNow(startedAt);
    setSession({
      ...setup,
      phase: "active",
      startedAt,
      endsAt: startedAt + setup.duration * 60_000,
      endedAt: null,
      questionNumber: setup.startingQuestion,
      questionNumberText: String(setup.startingQuestion),
      questionElapsedMs: 0,
      questionStartedAt: null,
      questionTimesMs: {},
      feedback: {},
      record: null,
    });
  }

  function toggleStopwatch() {
    if (!session) return;

    const timestamp = Date.now();
    setNow(timestamp);
    if (session.questionStartedAt === null) {
      setSession({ ...session, questionStartedAt: timestamp });
      return;
    }

    const elapsedMs =
      session.questionElapsedMs + timestamp - session.questionStartedAt;
    const questionTimesMs = {
      ...session.questionTimesMs,
      [session.questionNumber]: elapsedMs,
    };
    const nextQuestionNumber = session.questionNumber + 1;

    setSession({
      ...session,
      questionNumber: nextQuestionNumber,
      questionNumberText: String(nextQuestionNumber),
      questionElapsedMs: questionTimesMs[nextQuestionNumber] ?? 0,
      questionStartedAt: null,
      questionTimesMs,
    });
  }

  function skipNextQuestion() {
    if (!session || session.questionStartedAt !== null) return;
    const nextQuestionNumber = session.questionNumber + 1;
    setSession({
      ...session,
      questionNumber: nextQuestionNumber,
      questionNumberText: String(nextQuestionNumber),
      questionElapsedMs: session.questionTimesMs[nextQuestionNumber] ?? 0,
    });
  }

  function updateQuestionNumberText(value: string) {
    if (!session || session.questionStartedAt !== null) return;
    if (!/^\d*$/.test(value)) return;
    const parsed = Number(value);
    setSession({
      ...session,
      questionNumberText: value,
      ...(Number.isSafeInteger(parsed) && parsed > 0
        ? {
            questionNumber: parsed,
            questionElapsedMs: session.questionTimesMs[parsed] ?? 0,
          }
        : {}),
    });
  }

  function endSession() {
    if (!session) return;

    const endedAt = Date.now();
    const questionTimesMs = { ...session.questionTimesMs };
    if (session.questionStartedAt !== null) {
      questionTimesMs[session.questionNumber] =
        session.questionElapsedMs + endedAt - session.questionStartedAt;
    }

    setNow(endedAt);
    setSession({
      ...session,
      phase: "feedback",
      endedAt,
      questionStartedAt: null,
      questionTimesMs,
      questionElapsedMs: questionTimesMs[session.questionNumber] ?? 0,
    });
  }

  function setQuestionResult(questionNumber: number, result: QuestionResult) {
    if (!session) return;
    const current = session.feedback[questionNumber] ?? {
      result: null,
      topics: [],
    };
    setSession({
      ...session,
      feedback: {
        ...session.feedback,
        [questionNumber]: {
          ...current,
          result,
          ...(result === "couldnt_solve" ? {} : { topics: [] }),
        },
      },
    });
  }

  function addTopic(questionNumber: number, topicId: string) {
    if (!session) return;
    const current = session.feedback[questionNumber] ?? {
      result: null,
      topics: [],
    };
    const topic = getChapter(session.subjectId, session.chapterId)?.topics.find(
      (candidate) => candidate.id === topicId,
    );
    if (!topic || current.topics.some((existing) => existing.id === topic.id)) {
      return;
    }

    setSession({
      ...session,
      feedback: {
        ...session.feedback,
        [questionNumber]: {
          ...current,
          topics: [...current.topics, { id: topic.id, name: topic.name }],
        },
      },
    });
  }

  function removeTopic(questionNumber: number, topicToRemove: string) {
    if (!session) return;
    const current = session.feedback[questionNumber];
    if (!current) return;
    setSession({
      ...session,
      feedback: {
        ...session.feedback,
        [questionNumber]: {
          ...current,
          topics: current.topics.filter((topic) => topic.id !== topicToRemove),
        },
      },
    });
  }

  async function saveSession() {
    if (!session) return;
    const feedbackEntries = Object.entries(session.feedback);
    const rightCount = feedbackEntries.filter(
      ([, feedback]) => feedback.result === "right",
    ).length;
    const wrongCount = feedbackEntries.filter(
      ([, feedback]) => feedback.result === "wrong",
    ).length;
    const couldntSolveCount = feedbackEntries.filter(
      ([, feedback]) => feedback.result === "couldnt_solve",
    ).length;
    const topicCounts = new Map<
      string,
      { topic: string; questionCount: number }
    >();
    feedbackEntries.forEach(([, feedback]) => {
      if (feedback.result !== "couldnt_solve") return;
      feedback.topics.forEach((topic) => {
        const current = topicCounts.get(topic.id);
        topicCounts.set(topic.id, {
          topic: topic.name,
          questionCount: (current?.questionCount ?? 0) + 1,
        });
      });
    });
    const endedAt = session.endedAt ?? Date.now();
    const subject = getSubject(session.subjectId);
    const chapter = getChapter(session.subjectId, session.chapterId);
    if (!subject || !chapter) {
      setSaveError("The selected chapter is not present in the loaded syllabus.");
      return;
    }

    const timedQuestionCount = rightCount + wrongCount + couldntSolveCount;
    const activeTimeMs = Object.values(session.questionTimesMs).reduce(
      (total, duration) => total + duration,
      0,
    );
    const record: SessionRecord = {
      id: globalThis.crypto.randomUUID(),
      ...(authUser
        ? { ownerUserId: authUser.id, syncStatus: "pending" as const }
        : { syncStatus: "local" as const }),
      subject: subject.name,
      subjectId: subject.id,
      chapter: chapter.name,
      chapterId: chapter.id,
      syllabusExam: jeeSyllabus.exam,
      startedAt: new Date(session.startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      plannedDurationMinutes: session.duration,
      status: endedAt >= session.endsAt ? "completed" : "ended_early",
      rightCount,
      wrongCount,
      couldntSolveCount,
      timedQuestionCount,
      activeTimeMs,
      avgTimePerQuestionMs:
        timedQuestionCount > 0
          ? Math.round(activeTimeMs / timedQuestionCount)
          : null,
      weakTopics: Array.from(topicCounts, ([topicId, topic]) => ({
        topic: topic.topic,
        topicId,
        questionCount: topic.questionCount,
      })),
    };

    setIsSavingSession(true);
    setSaveError(null);
    try {
      await database.sessions.add(record);
      setSavedSessions((current) =>
        [record, ...current].sort((left, right) =>
          right.endedAt.localeCompare(left.endedAt),
        ),
      );
      if (!authUser) {
        setUnassignedSessionCount((count) => count + 1);
      }
      setSession({ ...session, phase: "summary", record });
      if (authUser) void performSync(authUser);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? `Could not save this session: ${error.message}`
          : "Could not save this session. Please try again.",
      );
    } finally {
      setIsSavingSession(false);
    }
  }

  function startNewSession() {
    setSession(null);
  }

  if (session?.phase === "summary" && session.record) {
    const { record } = session;
    const totalQuestions =
      record.timedQuestionCount ??
      record.rightCount + record.wrongCount + record.couldntSolveCount;
    const averageTime =
      totalQuestions > 0
        ? (record.avgTimePerQuestionMs ??
          Math.round(record.activeTimeMs / totalQuestions))
        : 0;
    const accuracyDenominator = record.rightCount + record.wrongCount;
    const accuracy =
      accuracyDenominator > 0
        ? Math.round((record.rightCount / accuracyDenominator) * 100)
        : null;

    return (
      <main className="setup-shell">
        <section className="setup-card" aria-labelledby="summary-title">
          <p className="eyebrow">SESSION SUMMARY</p>
          <h1 id="summary-title">{record.chapter}</h1>
          <p className="intro">
            {record.subject} · {record.status === "completed" ? "Duration completed" : "Ended early"}
          </p>
          <div className="summary-grid">
            <p><span>Questions timed</span><strong>{totalQuestions}</strong></p>
            <p><span>Right</span><strong>{record.rightCount}</strong></p>
            <p><span>Wrong</span><strong>{record.wrongCount}</strong></p>
            <p><span>Couldn’t solve</span><strong>{record.couldntSolveCount}</strong></p>
            <p><span>Active time</span><strong>{formatStopwatch(record.activeTimeMs)}</strong></p>
            <p><span>Average / question</span><strong>{formatStopwatch(averageTime)}</strong></p>
            <p><span>Accuracy</span><strong>{accuracy === null ? "—" : `${accuracy}%`}</strong></p>
          </div>
          <p className="storage-note">
            {record.ownerUserId
              ? syncStatus === "synced"
                ? "Saved on this device and synced to your account."
                : "Saved on this device. Cloud sync is pending."
              : "Saved on this device only. Sign in to sync it to your account."}
          </p>
          {record.weakTopics.length > 0 && (
            <div className="summary-topics">
              <h2>Topics to revisit</h2>
              <ul>
                {record.weakTopics.map(({ topic, questionCount }) => (
                  <li key={topic}>{topic}<span>{questionCount}</span></li>
                ))}
              </ul>
            </div>
          )}
          <button className="start-button" onClick={startNewSession}>
            New session
          </button>
        </section>
      </main>
    );
  }

  if (session?.phase === "feedback") {
    const questionNumbers = Object.keys(session.questionTimesMs)
      .map(Number)
      .sort((left, right) => left - right);
    const feedbackComplete = questionNumbers.every((questionNumber) => {
      const feedback = session.feedback[questionNumber];
      return (
        feedback?.result !== undefined &&
        feedback?.result !== null &&
        (feedback.result !== "couldnt_solve" || feedback.topics.length > 0)
      );
    });
    const activeTimeMs = Object.values(session.questionTimesMs).reduce(
      (total, duration) => total + duration,
      0,
    );

    return (
      <main className="feedback-shell">
        <section className="feedback-page" aria-labelledby="feedback-title">
          <header className="feedback-header">
            <div>
              <p className="eyebrow">SESSION FEEDBACK</p>
              <h1 id="feedback-title">{activeChapter?.name}</h1>
              <p className="feedback-subtitle">
                Mark each timed question. You can add multiple weak topics.
              </p>
            </div>
            <p className="feedback-active-time">
              Active time <strong>{formatStopwatch(activeTimeMs)}</strong>
            </p>
          </header>

          {questionNumbers.length === 0 ? (
            <p className="empty-feedback">
              No questions were timed in this session.
            </p>
          ) : (
            <div className="feedback-list">
              {questionNumbers.map((questionNumber) => {
                const feedback = session.feedback[questionNumber] ?? {
                  result: null,
                  topics: [],
                };
                const chapterTopics = activeChapter?.topics ?? [];
                return (
                  <article className="feedback-question" key={questionNumber}>
                    <div className="feedback-question-heading">
                      <h2>Q{questionNumber}</h2>
                      <span>
                        {formatStopwatch(session.questionTimesMs[questionNumber])}
                      </span>
                    </div>
                    <div className="result-options" role="group" aria-label={`Result for question ${questionNumber}`}>
                      {([
                        ["right", "Right"],
                        ["wrong", "Wrong"],
                        ["couldnt_solve", "Couldn’t solve"],
                      ] as const).map(([result, label]) => (
                        <button
                          className={feedback.result === result ? "result-option selected" : "result-option"}
                          key={result}
                          type="button"
                          aria-pressed={feedback.result === result}
                          onClick={() => setQuestionResult(questionNumber, result)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {feedback.result === "couldnt_solve" && (
                      <div className="topic-entry">
                        <SearchSelect
                          label="Weak topics (add one or more)"
                          value=""
                          options={chapterTopics
                            .filter(
                              (topic) =>
                                !feedback.topics.some(
                                  (selected) => selected.id === topic.id,
                                ),
                            )
                            .map((topic) => ({
                              id: topic.id,
                              label: topic.name,
                            }))}
                          placeholder="Search topics in this chapter"
                          emptyMessage="No topics match. Try another search."
                          onChange={(topicId) =>
                            addTopic(questionNumber, topicId)
                          }
                        />
                        {feedback.topics.length > 0 && (
                          <ul className="topic-chips">
                            {feedback.topics.map((topic) => (
                              <li key={topic.id}>
                                {topic.name}
                                <button
                                  type="button"
                                  aria-label={`Remove ${topic.name}`}
                                  onClick={() =>
                                    removeTopic(questionNumber, topic.id)
                                  }
                                >
                                  ×
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <footer className="feedback-footer">
            <p>
              Active time is the sum of all question-stopwatch durations.
            </p>
            <button
              className="start-button"
              onClick={saveSession}
              disabled={!feedbackComplete || isSavingSession}
            >
              {isSavingSession ? "Saving session…" : "Save session"}
            </button>
          </footer>
          {saveError && (
            <p className="database-error" role="alert">
              {saveError}
            </p>
          )}
        </section>
      </main>
    );
  }

  if (session) {
    return (
      <main className="session-shell">
        <section className="session-view" aria-label="Practice session controls">
          <header className="session-header">
            <p className="global-timer-label">SESSION TIME LEFT</p>
            <p
              className="global-timer"
              aria-label={`${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds remaining`}
              aria-live="off"
            >
              <TimerDigits
                className="global-timer-digits"
                values={[
                  String(Math.floor(remaining / 60)).padStart(2, "0"),
                  String(remaining % 60).padStart(2, "0"),
                ]}
                units={["MIN", "SEC"]}
              />
            </p>
            <button className="end-button" onClick={endSession}>
              End session
            </button>
          </header>

          <div className="practice-stage">
            <label className="question-control">
              <span className="question-display">
                <span className="question-prefix" aria-hidden="true">
                  Q
                </span>
                <input
                  aria-label="Question number"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  value={session.questionNumberText}
                  style={{
                    width: `${Math.max(1, session.questionNumberText.length)}ch`,
                  }}
                  disabled={session.questionStartedAt !== null}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) =>
                    updateQuestionNumberText(event.target.value)
                  }
                  onBlur={() => {
                    const parsed = Number(session.questionNumberText);
                    if (
                      !Number.isSafeInteger(parsed) ||
                      parsed < 1
                    ) {
                      setSession({
                        ...session,
                        questionNumberText: String(session.questionNumber),
                      });
                    } else {
                      setSession({
                        ...session,
                        questionNumber: parsed,
                        questionNumberText: String(parsed),
                      });
                    }
                  }}
                />
              </span>
            </label>

            <div className="stopwatch-control">
              <p className="control-label">QUESTION TIMER</p>
              <p
                className={isOverAverage ? "stopwatch over-average" : "stopwatch"}
                aria-label={`${formatStopwatch(stopwatchElapsed)} elapsed`}
                aria-live="off"
              >
                <TimerDigits
                  className="stopwatch-digits"
                  values={[
                    String(Math.floor(stopwatchElapsed / 60_000)).padStart(
                      2,
                      "0",
                    ),
                    String(Math.floor((stopwatchElapsed % 60_000) / 1_000)).padStart(
                      2,
                      "0",
                    ),
                    String(Math.floor(stopwatchElapsed % 1_000)).padStart(3, "0"),
                  ]}
                  units={["MIN", "SEC", "MS"]}
                />
              </p>
              <div className="stopwatch-actions">
                <button
                  className={
                    session.questionStartedAt === null
                      ? "stopwatch-button"
                      : "stopwatch-button is-running"
                  }
                  disabled={
                    session.questionStartedAt === null &&
                    (!/^[1-9]\d*$/.test(session.questionNumberText) ||
                      !Number.isSafeInteger(Number(session.questionNumberText)))
                  }
                  onClick={toggleStopwatch}
                >
                  {session.questionStartedAt === null ? "Start" : "Stop"}
                </button>
                {session.questionStartedAt === null && (
                  <button
                    className="skip-question-button"
                    disabled={
                      !/^[1-9]\d*$/.test(session.questionNumberText) ||
                      !Number.isSafeInteger(Number(session.questionNumberText))
                    }
                    onClick={skipNextQuestion}
                  >
                    Skip Q{session.questionNumber}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="setup-shell">
      <section className="setup-card" aria-labelledby="app-title">
        <p className="eyebrow">JEE PRACTICE</p>
        <h1 id="app-title">Set up your session.</h1>
        <p className="intro">
          Choose what you’re practicing. Your session opens in a landscape-style
          view.
        </p>

        <section className="account-card" aria-labelledby="account-title">
          <div className="account-heading">
            <div>
              <p className="eyebrow">CLOUD SYNC</p>
              <h2 id="account-title">
                {authUser ? "Your account" : "Sync across devices"}
              </h2>
            </div>
            {authUser && (
              <button
                className="account-secondary-button"
                type="button"
                onClick={signOut}
              >
                Sign out
              </button>
            )}
          </div>
          {!supabaseConfigured ? (
            <p className="account-note">
              Add your Supabase URL and publishable key to .env.local, then
              restart the development server to enable cloud sync.
            </p>
          ) : authUser ? (
            <>
              <p className="account-email">{authUser.email}</p>
              <p className="sync-status" role="status">
                {syncStatus === "syncing" && "Syncing sessions…"}
                {syncStatus === "synced" && "Your sessions are synced."}
                {syncStatus === "offline" &&
                  "You’re offline. Saved sessions will sync when reconnected."}
                {syncStatus === "error" &&
                  "Sync needs attention. Your sessions remain saved on this device."}
                {syncStatus === "idle" && "Checking cloud sync…"}
              </p>
              {syncError && (
                <p className="database-error" role="alert">
                  {syncError}
                </p>
              )}
              {unassignedSessionCount > 0 && (
                <div className="account-note">
                  <p>
                    {unassignedSessionCount} existing device{" "}
                    {unassignedSessionCount === 1 ? "session is" : "sessions are"}{" "}
                    not linked to an account.
                  </p>
                  <button
                    className="account-action-button"
                    type="button"
                    onClick={importLocalSessions}
                    disabled={syncStatus === "syncing"}
                  >
                    Import local sessions to this account
                  </button>
                </div>
              )}
              <button
                className="account-action-button"
                type="button"
                onClick={() => void performSync(authUser)}
                disabled={syncStatus === "syncing"}
              >
                {syncStatus === "syncing" ? "Syncing…" : "Sync now"}
              </button>
            </>
          ) : (
            <>
              <p className="account-note">
                Sign in to back up completed sessions and access them on your
                other devices. You can still practice offline.
              </p>
              <form className="auth-form" onSubmit={submitAuth}>
                <label>
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    autoComplete={
                      authMode === "sign_up"
                        ? "new-password"
                        : "current-password"
                    }
                    minLength={8}
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    required
                  />
                </label>
                <button
                  className="account-action-button"
                  type="submit"
                  disabled={isSubmittingAuth}
                >
                  {isSubmittingAuth
                    ? "Please wait…"
                    : authMode === "sign_in"
                      ? "Sign in"
                      : "Create account"}
                </button>
                <button
                  className="account-text-button"
                  type="button"
                  onClick={() => {
                    setAuthMode((mode) =>
                      mode === "sign_in" ? "sign_up" : "sign_in",
                    );
                    setAuthError(null);
                    setAuthMessage(null);
                  }}
                >
                  {authMode === "sign_in"
                    ? "New here? Create an account"
                    : "Already have an account? Sign in"}
                </button>
              </form>
              {authMessage && (
                <p className="account-message" role="status">
                  {authMessage}
                </p>
              )}
              {authError && (
                <p className="database-error" role="alert">
                  {authError}
                </p>
              )}
            </>
          )}
        </section>

        <p className="storage-note">
          {authUser
            ? "Sessions are stored locally first and synced securely when online."
            : "Sessions are saved on this device. Sign in to enable cloud backup and sync."}
        </p>
        {databaseError && (
          <p className="database-error" role="alert">
            {databaseError}
          </p>
        )}

        <form className="setup-form" onSubmit={startSession}>
          <SearchSelect
            label="Subject"
            value={setup.subjectId}
            options={jeeSyllabus.subjects.map((subject) => ({
              id: subject.id,
              label: subject.name,
            }))}
            placeholder="Search subjects"
            emptyMessage="No subjects match."
            onChange={(subjectId) =>
              setSetup((current) => ({
                ...current,
                subjectId: subjectId as SyllabusSubjectId,
                chapterId: "",
              }))
            }
          />

          <SearchSelect
            label="Chapter"
            value={setup.chapterId}
            options={
              setupSubject?.chapters.map((chapter) => ({
                id: chapter.id,
                label: chapter.name,
                detail: `Unit ${chapter.unit}`,
              })) ?? []
            }
            placeholder="Search chapters"
            emptyMessage="No chapters match. Try another search."
            onChange={(chapterId) => updateSetup("chapterId", chapterId)}
          />

          <fieldset className="duration-field">
            <legend>Duration</legend>
            <div className="duration-options">
              {DURATIONS.map((duration) => (
                <button
                  className={
                    setup.duration === duration ? "duration-option selected" : "duration-option"
                  }
                  key={duration}
                  type="button"
                  aria-pressed={setup.duration === duration}
                  onClick={() => updateSetup("duration", duration)}
                >
                  {duration} min
                </button>
              ))}
            </div>
          </fieldset>

          <label>
            Starting question number
            <input
              type="number"
              min="1"
              step="1"
              value={setup.startingQuestion}
              onChange={(event) =>
                updateSetup(
                  "startingQuestion",
                  event.target.value === "" ? 0 : Number(event.target.value),
                )
              }
              required
            />
          </label>

          <button
            className="start-button"
            type="submit"
            disabled={!setup.chapterId || setup.startingQuestion < 1}
          >
            Start session
          </button>
        </form>

        <section
          className="saved-sessions"
          aria-labelledby="saved-sessions-title"
        >
          <h2 id="saved-sessions-title">Recent sessions</h2>
          {isLoadingSessions ? (
            <p className="history-empty">Loading saved sessions…</p>
          ) : savedSessions.length === 0 ? (
            <p className="history-empty">Your saved sessions will appear here.</p>
          ) : (
            <ul>
              {savedSessions.slice(0, 5).map((record) => {
                const questionCount =
                  record.rightCount +
                  record.wrongCount +
                  record.couldntSolveCount;
                return (
                  <li key={record.id}>
                    <div className="history-session-title">
                      <strong>{record.chapter}</strong>
                      <span>
                        {record.subject} ·{" "}
                        {new Date(record.endedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="history-session-stats">
                      <span>{questionCount} timed</span>
                      <span>{record.rightCount} right</span>
                      <span>{formatStopwatch(record.activeTimeMs)} active</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </section>
    </main>
  );
}

export default App;
