import type {
  ActiveSession,
  ActiveSessionSnapshot,
  InactivityWarning,
} from "./types";

export type InactivityLimits = {
  runningQuestionMs: number;
  stoppedSessionMs: number;
  warningResponseMs: number;
};

export const INACTIVITY_LIMITS: InactivityLimits = {
  runningQuestionMs: 8 * 60_000,
  stoppedSessionMs: 10 * 60_000,
  warningResponseMs: 60_000,
};

export type InactivityPrompt = {
  warning: InactivityWarning;
  questionElapsedMs?: number;
};

export function getInactivityPrompt(
  session: ActiveSession,
  now: number,
  lastInteractionAt: number,
  limits: InactivityLimits = INACTIVITY_LIMITS,
): InactivityPrompt | null {
  if (session.phase !== "active") return null;

  if (session.questionStartedAt !== null) {
    if (session.longQuestionPromptedNumbers.includes(session.questionNumber)) {
      return null;
    }

    const elapsedMs =
      session.questionElapsedMs + now - session.questionStartedAt;
    if (elapsedMs < limits.runningQuestionMs) return null;

    const startedAt =
      session.questionStartedAt +
      Math.max(0, limits.runningQuestionMs - session.questionElapsedMs);
    return {
      warning: { kind: "running_question", startedAt },
      questionElapsedMs: limits.runningQuestionMs,
    };
  }

  const idleSince = now - lastInteractionAt;
  if (idleSince < limits.stoppedSessionMs) return null;

  return {
    warning: {
      kind: "stopped_session",
      startedAt: lastInteractionAt + limits.stoppedSessionMs,
    },
  };
}

export function finishSessionAt(
  session: ActiveSession,
  endedAt: number,
): ActiveSession {
  const questionTimesMs = { ...session.questionTimesMs };
  if (session.questionStartedAt !== null && endedAt > session.questionStartedAt) {
    questionTimesMs[session.questionNumber] =
      session.questionElapsedMs + endedAt - session.questionStartedAt;
  }

  return {
    ...session,
    phase: "feedback",
    endedAt,
    questionStartedAt: null,
    questionTimesMs,
    questionElapsedMs:
      questionTimesMs[session.questionNumber] ?? session.questionElapsedMs,
  };
}

export function recoverSessionSnapshot(
  snapshot: ActiveSessionSnapshot,
  now: number,
  warningResponseMs = INACTIVITY_LIMITS.warningResponseMs,
): ActiveSessionSnapshot {
  const endedAt = snapshot.session.endsAt;
  if (
    snapshot.session.phase === "active" &&
    now >= endedAt
  ) {
    return {
      ...snapshot,
      session: finishSessionAt(snapshot.session, endedAt),
      pendingWarning: null,
      savedAt: now,
    };
  }

  if (
    snapshot.pendingWarning &&
    now >= snapshot.pendingWarning.startedAt + warningResponseMs
  ) {
    return {
      ...snapshot,
      session: finishSessionAt(
        snapshot.session,
        snapshot.pendingWarning.startedAt + warningResponseMs,
      ),
      pendingWarning: null,
      savedAt: now,
    };
  }

  return snapshot;
}

export function stopQuestionAtInactivityPrompt(
  session: ActiveSession,
  questionElapsedMs: number,
): ActiveSession {
  const questionTimesMs = {
    ...session.questionTimesMs,
    [session.questionNumber]: questionElapsedMs,
  };

  return {
    ...session,
    questionElapsedMs,
    questionStartedAt: null,
    questionTimesMs,
    longQuestionPromptedNumbers: session.longQuestionPromptedNumbers.includes(
      session.questionNumber,
    )
      ? session.longQuestionPromptedNumbers
      : [...session.longQuestionPromptedNumbers, session.questionNumber],
  };
}
