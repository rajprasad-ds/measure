import { useEffect, useState } from "react";
import { formatStopwatch } from "./TimerDisplay";
import { database, type SessionRecord } from "../../database";
import type { ActiveSession } from "./types";
import { getCauseLabel, type Cause } from "../../lib/causes";
import { SMARTER_APPROACH_THRESHOLD_MS } from "./feedbackFlow";
import type { QuestionCard, QuestionFactLink } from "../cards/types";

type Props = {
  record: SessionRecord;
  feedback: ActiveSession["feedback"];
  questionTimesMs: ActiveSession["questionTimesMs"];
  questionCards: QuestionCard[];
  questionFactLinks: QuestionFactLink[];
  syncStatus: "idle" | "syncing" | "synced" | "offline" | "error";
  onRetrySync: () => void;
  onNewSession: () => void;
};

export default function SessionSummaryScreen({
  record,
  feedback,
  questionTimesMs,
  questionCards,
  questionFactLinks,
  syncStatus,
  onRetrySync,
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

  const timedEntries = Object.entries(questionTimesMs)
    .map(([questionNumber, timeMs]) => ({
      questionNumber: Number(questionNumber),
      timeMs,
      attempt: feedback[Number(questionNumber)],
    }))
    .sort((left, right) => left.questionNumber - right.questionNumber);
  const totalQuestions = record.timedQuestionCount ?? timedEntries.length;
  const rightFastCount = timedEntries.filter(({ attempt, timeMs }) =>
    attempt?.result === "right" && timeMs <= SMARTER_APPROACH_THRESHOLD_MS,
  ).length;
  const rightSlowCount = timedEntries.filter(({ attempt, timeMs }) =>
    attempt?.result === "right" && timeMs > SMARTER_APPROACH_THRESHOLD_MS,
  ).length;
  const wrongQuestionCount = timedEntries.filter(({ attempt }) =>
    attempt?.result === "wrong_question",
  ).length;
  const questionIds = new Set(
    timedEntries
      .map(({ attempt }) => attempt?.questionId)
      .filter((id): id is string => Boolean(id)),
  );
  const cardsCreatedCount = questionIds.size;
  const linkedFactIds = new Set(
    questionFactLinks
      .filter((link) => questionIds.has(link.questionId) && !link.deletedAt)
      .map((link) => link.factId),
  );
  const questionById = new Map(questionCards.map((card) => [card.id, card]));
  const averageTime = totalQuestions > 0
    ? (record.avgTimePerQuestionMs ?? Math.round(record.activeTimeMs / totalQuestions))
    : 0;
  const accuracyDenominator = record.rightCount + record.wrongCount;
  const accuracy = accuracyDenominator > 0
    ? Math.round((record.rightCount / accuracyDenominator) * 100)
    : null;
  const causeCounts = Object.values(feedback).reduce(
    (counts, attempt) => {
      if (attempt.result !== "right" && attempt.result !== "wrong_question" && attempt.cause) {
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
          {record.subject} · {record.status === "completed" ? "Duration completed" : "Ended early"}
        </p>
        <div className="summary-grid">
          <p><span>Questions timed</span><strong>{totalQuestions}</strong></p>
          <p><span>Right and fast</span><strong>{rightFastCount}</strong></p>
          <p><span>Right but slow</span><strong>{rightSlowCount}</strong></p>
          <p><span>Wrong</span><strong>{record.wrongCount}</strong></p>
          <p><span>Couldn’t solve</span><strong>{record.couldntSolveCount}</strong></p>
          <p><span>Wrong question</span><strong>{wrongQuestionCount}</strong></p>
          <p><span>Active time</span><strong>{formatStopwatch(record.activeTimeMs)}</strong></p>
          <p><span>Average / question</span><strong>{formatStopwatch(averageTime)}</strong></p>
          <p><span>Accuracy</span><strong>{accuracy === null ? "—" : `${accuracy}%`}</strong></p>
          <p><span>Question cards created</span><strong>{cardsCreatedCount}</strong></p>
          <p><span>Fact cards linked / created</span><strong>{linkedFactIds.size}</strong></p>
        </div>
        <p className="storage-note">
          {record.ownerUserId
            ? syncStatus === "synced"
              ? "Saved on this device and synced to your account."
              : "Saved on this device. Cloud sync is pending."
            : "Saved on this device only. Sign in to sync it to your account."}
        </p>
        {(pendingImageCount > 0 || syncStatus === "error" || syncStatus === "offline") && (
          <div className="summary-sync-pending">
            <p>
              {pendingImageCount > 0
                ? `${pendingImageCount} photo${pendingImageCount === 1 ? "" : "s"} still need to upload to Google Drive. Your session and photos remain saved on this device.`
                : "Cloud sync needs attention. Your session and photos remain saved on this device."}
            </p>
            <button
              className="account-secondary-button"
              type="button"
              onClick={onRetrySync}
              disabled={syncStatus === "syncing"}
            >
              {syncStatus === "syncing" ? "Retrying upload…" : "Retry sync"}
            </button>
          </div>
        )}
        {Object.keys(causeCounts).length > 0 && (
          <div className="summary-topics">
            <h2>Why questions were missed</h2>
            <ul>
              {(Object.entries(causeCounts) as [Cause, number][]).map(([cause, count]) => (
                <li key={cause}>{getCauseLabel(cause)}<span>{count}</span></li>
              ))}
            </ul>
          </div>
        )}
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
        <details className="summary-details">
          <summary>View question details</summary>
          <ol className="summary-question-list">
            {timedEntries.map(({ questionNumber, timeMs, attempt }) => {
              const questionCard = attempt?.questionId ? questionById.get(attempt.questionId) : undefined;
              const outcome = attempt?.result === "right"
                ? timeMs > SMARTER_APPROACH_THRESHOLD_MS ? "Right but slow" : "Right and fast"
                : attempt?.result === "wrong" ? "Wrong"
                : attempt?.result === "couldnt_solve" ? "Couldn’t solve"
                : attempt?.result === "wrong_question" ? "Wrong question"
                : "No result";
              const factCount = questionFactLinks.filter((link) =>
                link.questionId === attempt?.questionId && !link.deletedAt,
              ).length;
              return (
                <li key={questionNumber}>
                  <div><strong>Q{questionNumber}</strong> · {outcome} · {formatStopwatch(timeMs)}</div>
                  {questionCard?.promptText && <p>{questionCard.promptText}</p>}
                  {attempt?.cause && <p>Cause: {getCauseLabel(attempt.cause)}</p>}
                  {attempt?.topics.length ? <p>Topics: {attempt.topics.map((topic) => topic.name).join(", ")}</p> : null}
                  {questionCard?.difficulty && <p>Intrinsic difficulty: {questionCard.difficulty}</p>}
                  {factCount > 0 && <p>{factCount} linked fact card{factCount === 1 ? "" : "s"}</p>}
                </li>
              );
            })}
          </ol>
        </details>
        <button className="start-button" onClick={onNewSession}>New session</button>
      </section>
    </main>
  );
}
