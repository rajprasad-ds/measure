import { useEffect, useState } from "react";
import { database, type SessionRecord } from "./database";
import SearchSelect from "./SearchSelect";
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

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatStopwatch(milliseconds: number) {
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1_000);
  const remainingMilliseconds = milliseconds % 1_000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(remainingMilliseconds).padStart(3, "0")}`;
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

  useEffect(() => {
    let cancelled = false;
    database.sessions
      .orderBy("endedAt")
      .reverse()
      .toArray()
      .then((records) => {
        if (!cancelled) setSavedSessions(records);
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
  }, []);

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
      record.rightCount +
      record.wrongCount +
      record.couldntSolveCount,
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

    const record: SessionRecord = {
      id: globalThis.crypto.randomUUID(),
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
      activeTimeMs: Object.values(session.questionTimesMs).reduce(
        (total, duration) => total + duration,
        0,
      ),
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
      setSession({ ...session, phase: "summary", record });
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
      record.rightCount + record.wrongCount + record.couldntSolveCount;
    const averageTime =
      totalQuestions > 0
        ? Math.round(record.activeTimeMs / totalQuestions)
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
            Saved on this device in your browser. Cloud sync is not set up yet.
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
            <p className="global-timer" aria-live="off">
              {formatCountdown(remaining)}
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
                {formatStopwatch(stopwatchElapsed)}
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

        <p className="storage-note">
          Sessions are saved on this device and work offline. They do not sync
          to your other devices yet.
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
