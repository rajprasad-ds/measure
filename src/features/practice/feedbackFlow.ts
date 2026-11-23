import type { Cause } from "../../lib/causes";
import type { QuestionFeedback, QuestionResult } from "./types";

export const SMARTER_APPROACH_THRESHOLD_MS = 60 * 1_000;

export type FeedbackStep =
  | "result"
  | "reflection"
  | "question"
  | "topics"
  | "solution"
  | "approach"
  | "cause"
  | "slip"
  | "fact"
  | "complete";

export function isSlowRightAttempt(result: QuestionResult | null, timeMs: number) {
  return result === "right" && timeMs > SMARTER_APPROACH_THRESHOLD_MS;
}

export function getInitialFeedbackStep(
  feedback: QuestionFeedback | undefined,
  slowRight: boolean,
  sessionKind: "practice" | "question_revision",
  linkedFactCount = 0,
): FeedbackStep {
  if (!feedback?.result) return "result";
  if (slowRight) {
    if (!feedback.smarterApproach) return "reflection";
    if (feedback.smarterApproach === "not_found") return "complete";
    if (!feedback.questionId) return "question";
    if (feedback.topics.length === 0 && !feedback.smarterApproachSaved) return "topics";
    return feedback.smarterApproachSaved ? "complete" : "approach";
  }
  if (feedback.result === "right" || feedback.result === "wrong_question") return "complete";
  if (sessionKind === "practice" && !feedback.questionId) return "question";
  if (feedback.topics.length === 0 && !feedback.cause) return "topics";
  if (!feedback.solutionSaved && !feedback.cause) return "solution";
  if (!feedback.cause) return "cause";
  if (feedback.cause === "slip" && !feedback.slipSubtype) return "slip";
  if (
    (feedback.cause === "missing_fact" || feedback.cause === "wrong_concept") &&
    feedback.topics.length === 0
  ) {
    return "topics";
  }
  if (
    (feedback.cause === "missing_fact" || feedback.cause === "wrong_concept") &&
    linkedFactCount === 0
  ) {
    return "fact";
  }
  return "complete";
}

export function getStepAfterResult(
  result: QuestionResult,
  slowRight: boolean,
  hasQuestion: boolean,
  sessionKind: "practice" | "question_revision",
): FeedbackStep {
  if (result === "right") return slowRight ? "reflection" : "complete";
  if (result === "wrong_question") return "complete";
  return sessionKind === "practice" && !hasQuestion ? "question" : "topics";
}

export function getStepAfterCause(
  cause: Cause,
  topicCount: number,
): FeedbackStep {
  if (cause === "slip") return "slip";
  if (cause === "missing_fact" || cause === "wrong_concept") {
    return topicCount > 0 ? "fact" : "topics";
  }
  return "complete";
}

export function canCompleteQuestionFeedback(
  feedback: QuestionFeedback | undefined,
  validationMessages: string[],
  timeMs: number,
  sessionKind: "practice" | "question_revision" = "practice",
) {
  if (!feedback?.result || validationMessages.length > 0) return false;
  if (feedback.result !== "right" && feedback.result !== "wrong_question" && !feedback.questionId) return false;
  if (
    sessionKind === "practice" &&
    isSlowRightAttempt(feedback.result, timeMs)
  ) {
    if (!feedback.smarterApproach) return false;
    if (
      feedback.smarterApproach === "found" &&
      (!feedback.questionId || !feedback.smarterApproachSaved)
    ) {
      return false;
    }
  }
  return true;
}
