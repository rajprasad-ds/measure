import { useEffect, useState } from "react";
import { formatStopwatch } from "./TimerDisplay";
import { database, type SessionRecord } from "../../database";
import type { ActiveSession } from "./types";
import { getCauseLabel, type Cause } from "../../lib/causes";

type Props = {
  record: SessionRecord;
  feedback: ActiveSession["feedback"];
  syncStatus: "idle" | "syncing" | "synced" | "offline" | "error";
  onNewSession: () => void;
};

export default function SessionSummaryScreen({
  record,
  feedback,
  syncStatus,
  onNewSession,
}: Props) {
  const [pendingImageCount, setPendingImageCount] = useState(0);

  useEffect(() => {
    database.localImages
      .where("status")
      .anyOf(["pending", "uploading", "failed"])
      .count()
      .then(setPendingImageCount);
  }, []);
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
  const causeCounts = Object.values(feedback).reduce(
    (counts, attempt) => {
      if (attempt.result !== "right" && attempt.cause) {
        counts[attempt.cause] = (counts[attempt.cause] ?? 0) + 1;
      }
      return counts;
    },
    {} as Partial<Record<Cause, number>>,
  );

  return (
    <main className="setup-shell">
      <section className="setup-card" aria-labelledby="summary-title">
        <p className="eyebrow">SESSION SUMMARY</p>
        <h1 id="summary-title">{record.chapter}</h1>
        <p className="intro">
          {record.subject} ·{" "}
          {record.status === "completed" ? "Duration completed" : "Ended early"}
        </p>
        <div className="summary-grid">
          <p>
            <span>Questions timed</span>
            <strong>{totalQuestions}</strong>
          </p>
          <p>
            <span>Right</span>
            <strong>{record.rightCount}</strong>
          </p>
          <p>
            <span>Wrong</span>
            <strong>{record.wrongCount}</strong>
          </p>
          <p>
            <span>Couldn’t solve</span>
            <strong>{record.couldntSolveCount}</strong>
          </p>
          <p>
            <span>Active time</span>
            <strong>{formatStopwatch(record.activeTimeMs)}</strong>
          </p>
          <p>
            <span>Average / question</span>
            <strong>{formatStopwatch(averageTime)}</strong>
          </p>
          <p>
            <span>Accuracy</span>
            <strong>{accuracy === null ? "—" : `${accuracy}%`}</strong>
          </p>
        </div>
        <p className="storage-note">
          {record.ownerUserId
            ? syncStatus === "synced"
              ? "Saved on this device and synced to your account."
              : "Saved on this device. Cloud sync is pending."
            : "Saved on this device only. Sign in to sync it to your account."}
        </p>
        {pendingImageCount > 0 && (
          <p className="storage-note">
            {pendingImageCount} photo{pendingImageCount === 1 ? "" : "s"}
            awaiting upload to Google Drive.
          </p>
        )}
        {Object.keys(causeCounts).length > 0 && (
          <div className="summary-topics">
            <h2>Why questions were missed</h2>
            <ul>
              {(Object.entries(causeCounts) as [Cause, number][]).map(
                ([cause, count]) => (
                  <li key={cause}>
                    {getCauseLabel(cause)}
                    <span>{count}</span>
                  </li>
                ),
              )}
            </ul>
          </div>
        )}
        {record.weakTopics.length > 0 && (
          <div className="summary-topics">
            <h2>Topics to revisit</h2>
            <ul>
              {record.weakTopics.map(({ topic, questionCount }) => (
                <li key={topic}>
                  {topic}
                  <span>{questionCount}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button className="start-button" onClick={onNewSession}>
          New session
        </button>
      </section>
    </main>
  );
}
