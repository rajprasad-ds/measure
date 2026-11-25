import type { SessionRecord } from "../../database";
import type { SyllabusSubjectId } from "../../syllabus";
import type { Cause, SlipSubtype } from "../../lib/causes";
import type { FactCardInput, QuestionCardInput } from "../cards/types";

export type SessionSetup = {
  subjectId: SyllabusSubjectId;
  chapterId: string;
  duration: number;
  startingQuestion: number;
};

export type QuestionResult = "right" | "wrong" | "couldnt_solve" | "wrong_question";

export type QuestionFeedback = {
  result: QuestionResult | null;
  cause: Cause | null;
  slipSubtype: SlipSubtype | null;
  topics: Array<{ id: string; name: string }>;
  smarterApproach?: "found" | "not_found";
  smarterApproachSaved?: boolean;
  difficulty?: "easy" | "medium" | "hard";
  solutionSaved?: boolean;
  attemptId?: string;
  questionId?: string;
  /** Additional question-card fields captured during feedback and applied on session submission. */
  questionDraft?: Pick<QuestionCardInput, "promptText" | "promptImageId" | "solutionText" | "solutionImageId" | "solutionImageIds" | "difficulty">;
  smarterApproachDraft?: Pick<QuestionCardInput, "solutionText" | "solutionImageId" | "solutionImageIds">;
  /** Legacy snapshots may still contain a fact draft; new cards are persisted immediately. */
  factDraft?: Pick<FactCardInput, "kind" | "promptText" | "promptImageId" | "contentText" | "contentImageId" | "wrongBelief">;
  linkedFactIds?: string[];
};

export type SessionPhase = "active" | "feedback" | "summary";

export type ActiveSession = SessionSetup & {
  sessionKind: "practice" | "question_revision";
  phase: SessionPhase;
  startedAt: number;
  endsAt: number;
  endedAt: number | null;
  /** Absolute local timestamp after which unfinished feedback is discarded. */
  feedbackDeadlineAt?: number;
  questionNumber: number;
  questionNumberText: string;
  questionElapsedMs: number;
  questionStartedAt: number | null;
  questionTimesMs: Record<number, number>;
  longQuestionPromptedNumbers: number[];
  feedback: Record<number, QuestionFeedback>;
  record: SessionRecord | null;
};

export type InactivityWarning = {
  kind: "running_question" | "stopped_session";
  startedAt: number;
};

export type ActiveSessionSnapshot = {
  id: "current";
  session: ActiveSession;
  lastInteractionAt: number;
  pendingWarning: InactivityWarning | null;
  savedAt: number;
};
