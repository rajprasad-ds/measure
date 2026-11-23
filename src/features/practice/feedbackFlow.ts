import type { Cause } from "../../lib/causes";
import type { QuestionFeedback, QuestionResult } from "./types";

export const SMARTER_APPROACH_THRESHOLD_MS = 60 * 1_000;

export type FeedbackStep =
  | "result"
  | "reflection"
  | "question"
  | "topics"
  | "solution"
  | "difficulty"
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
    if (!feedback.smarterApproachSaved) return "approach";
    if (!feedback.difficulty) return "difficulty";
    if (feedback.topics.length === 0) return "topics";
    return "complete";
  }

  if (feedback.result === "right" || feedback.result === "wrong_question") {
    return "complete";
  }

  if (!feedback.cause) return "cause";
  if (sessionKind === "practice" && !feedback.questionId) return "question";
  if (!feedback.solutionSaved) return "solution";
  if (!feedback.difficulty) return "difficulty";
  if (feedback.topics.length === 0) return "topics";
  if (feedback.cause === "missing_fact" && linkedFactCount === 0) return "fact";
  return "complete";
}

export function getStepAfterResult(
  result: QuestionResult,
  slowRight: boolean,
  _hasQuestion: boolean,
  _sessionKind: "practice" | "question_revision",
): FeedbackStep {
  if (result === "right") return slowRight ? "reflection" : "complete";
  if (result === "wrong_question") return "complete";
  return "cause";
}

export function getStepAfterCause(
  _cause: Cause,
  _topicCount: number,
): FeedbackStep {
  return "question";
}

export function canCompleteQuestionFeedback(
  feedback: QuestionFeedback | undefined,
  validationMessages: string[],
  timeMs: number,
  sessionKind: "practice" | "question_revision" = "practice",
  linkedFactCount = 0,
) {
  if (!feedback?.result || validationMessages.length > 0) return false;
  if (feedback.result !== "right" && feedback.result !== "wrong_question" && !feedback.questionId) return false;
  if (sessionKind === "practice" && feedback.result !== "right" && feedback.result !== "wrong_question") {
    if (!feedback.cause || !feedback.solutionSaved || !feedback.difficulty) return false;
    if ((feedback.cause === "missing_fact" || feedback.cause === "wrong_concept") && feedback.topics.length === 0) return false;
    if (feedback.cause === "missing_fact" && linkedFactCount === 0) return false;
  }
  if (
    sessionKind === "practice" &&
    isSlowRightAttempt(feedback.result, timeMs)
  ) {
    if (!feedback.smarterApproach) return false;
    if (
      feedback.smarterApproach === "found" &&
      (!feedback.questionId || !feedback.smarterApproachSaved || !feedback.difficulty)
    ) {
      return false;
    }
  }
  return true;
}
