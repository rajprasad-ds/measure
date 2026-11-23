import { formatStopwatch, TimerDigits } from "./TimerDisplay";
import type { ActiveSession, InactivityWarning } from "./types";

type Props = {
  session: ActiveSession;
  remaining: number;
  stopwatchElapsed: number;
  isOverAverage: boolean;
  warning: InactivityWarning | null;
  persistenceError: string | null;
  onEnd: () => void;
  onToggleStopwatch: () => void;
  onSkipQuestion: () => void;
  onUpdateQuestionNumber: (value: string) => void;
  onCommitQuestionNumber: () => void;
  onConfirmStillHere: () => void;
};

export default function PracticeSessionScreen({
  session,
  remaining,
  stopwatchElapsed,
  isOverAverage,
  warning,
  persistenceError,
  onEnd,
  onToggleStopwatch,
  onSkipQuestion,
  onUpdateQuestionNumber,
  onCommitQuestionNumber,
  onConfirmStillHere,
}: Props) {
  return (
    <main className="session-shell">
      {persistenceError && (
        <p className="session-persistence-error" role="alert">
          {persistenceError}
        </p>
      )}
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
          <button className="end-button" onClick={onEnd}>
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
                onChange={(event) => onUpdateQuestionNumber(event.target.value)}
                onBlur={onCommitQuestionNumber}
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
                  String(Math.floor(stopwatchElapsed / 60_000)).padStart(2, "0"),
                  String(
                    Math.floor((stopwatchElapsed % 60_000) / 1_000),
                  ).padStart(2, "0"),
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
                onClick={onToggleStopwatch}
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
                  onClick={onSkipQuestion}
                >
                  Skip Q{session.questionNumber}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
      {warning && (
        <div className="inactivity-backdrop">
          <section
            className="inactivity-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inactivity-title"
            aria-describedby="inactivity-description"
          >
            <p className="eyebrow">SESSION CHECK</p>
            <h2 id="inactivity-title">
              {warning.kind === "running_question"
                ? "Still solving this question?"
                : "Still practicing?"}
            </h2>
            <p id="inactivity-description">
              {warning.kind === "running_question"
                ? "The question timer has paused at 8 minutes. Confirm when you are ready; press Start to resume timing."
                : "Take your time. Confirm when you’re ready to dismiss this reminder."}
            </p>
            <button
              className="start-button"
              type="button"
              onClick={onConfirmStillHere}
            >
              I’m here
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
