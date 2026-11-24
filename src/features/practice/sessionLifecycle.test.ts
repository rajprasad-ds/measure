import { describe, expect, it } from "vitest";
import {
  finishSessionAt,
  getInactivityPrompt,
  recoverSessionSnapshot,
  stopQuestionAtInactivityPrompt,
} from "./sessionLifecycle";
import type { ActiveSession, ActiveSessionSnapshot } from "./types";

const session: ActiveSession = {
  subjectId: "maths",
  chapterId: "maths-u11",
  duration: 30,
  startingQuestion: 1,
  sessionKind: "practice",
  phase: "active",
  startedAt: 0,
  endsAt: 100_000,
  endedAt: null,
  questionNumber: 1,
  questionNumberText: "1",
  questionElapsedMs: 0,
  questionStartedAt: null,
  questionTimesMs: {},
  longQuestionPromptedNumbers: [],
  feedback: {},
  record: null,
};

const snapshot: ActiveSessionSnapshot = {
  id: "current",
  session,
  lastInteractionAt: 0,
  pendingWarning: null,
  savedAt: 0,
};

describe("getInactivityPrompt", () => {
  const limits = {
    runningQuestionMs: 8_000,
    stoppedSessionMs: 10_000,
  };

  it("prompts at the running-question threshold and reports its exact start time", () => {
    const runningSession = {
      ...session,
      questionElapsedMs: 3_000,
      questionStartedAt: 5_000,
    };

    expect(
      getInactivityPrompt(runningSession, 10_000, 5_000, limits),
    ).toEqual({
      warning: { kind: "running_question", startedAt: 10_000 },
      questionElapsedMs: 8_000,
    });
  });

  it("does not repeatedly prompt for the same question after confirmation", () => {
    const promptedSession = {
      ...session,
      questionElapsedMs: 8_000,
      questionStartedAt: 12_000,
      longQuestionPromptedNumbers: [1],
    };

    expect(
      getInactivityPrompt(promptedSession, 30_000, 12_000, limits),
    ).toBeNull();
  });

  it("warns after the stopped-session idle threshold", () => {
    expect(getInactivityPrompt(session, 10_000, 0, limits)).toEqual({
      warning: { kind: "stopped_session", startedAt: 10_000 },
    });
  });

  it("does not warn before the stopped-session idle threshold", () => {
    expect(getInactivityPrompt(session, 9_999, 0, limits)).toBeNull();
  });
});

describe("session recovery", () => {
  it("continues an active session when it is still within its planned duration", () => {
    const recovered = recoverSessionSnapshot(snapshot, 50_000);
    expect(recovered.session).toEqual(session);
  });

  it("moves an expired session to feedback and closes a running question at endsAt", () => {
    const runningSnapshot = {
      ...snapshot,
      session: {
        ...session,
        questionStartedAt: 90_000,
        questionElapsedMs: 4_000,
      },
    };

    const recovered = recoverSessionSnapshot(runningSnapshot, 120_000);
    expect(recovered.session.phase).toBe("feedback");
    expect(recovered.session.endedAt).toBe(100_000);
    expect(recovered.session.questionStartedAt).toBeNull();
    expect(recovered.session.questionTimesMs[1]).toBe(14_000);
  });

  it("keeps an active session and its warning after a long period without confirmation", () => {
    const warnedSnapshot = {
      ...snapshot,
      pendingWarning: { kind: "stopped_session" as const, startedAt: 20_000 },
    };

    const recovered = recoverSessionSnapshot(warnedSnapshot, 90_000);
    expect(recovered.session.phase).toBe("active");
    expect(recovered.session.endedAt).toBeNull();
    expect(recovered.pendingWarning).toEqual(warnedSnapshot.pendingWarning);
  });

  it("stops a long-running question at the prompt without adding time afterward", () => {
    const runningSession = {
      ...session,
      questionStartedAt: 1_000,
      questionElapsedMs: 2_000,
    };

    const stopped = stopQuestionAtInactivityPrompt(runningSession, 8_000);
    expect(stopped.questionStartedAt).toBeNull();
    expect(stopped.questionTimesMs[1]).toBe(8_000);
    expect(stopped.longQuestionPromptedNumbers).toEqual([1]);
  });

  it("records elapsed time only through the session end timestamp", () => {
    const runningSession = {
      ...session,
      questionStartedAt: 50_000,
      questionElapsedMs: 2_000,
    };

    const finished = finishSessionAt(runningSession, 55_000);
    expect(finished.questionTimesMs[1]).toBe(7_000);
  });
});
