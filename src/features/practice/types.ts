import type { SessionRecord } from "../../database";
import type { SyllabusSubjectId } from "../../syllabus";
import type { Cause, SlipSubtype } from "../../lib/causes";

export type SessionSetup = {
  subjectId: SyllabusSubjectId;
  chapterId: string;
  duration: number;
  startingQuestion: number;
};

export type QuestionResult = "right" | "wrong" | "couldnt_solve";

export type QuestionFeedback = {
  result: QuestionResult | null;
  cause: Cause | null;
  slipSubtype: SlipSubtype | null;
  topics: Array<{ id: string; name: string }>;
  smarterApproach?: "found" | "not_found";
  smarterApproachSaved?: boolean;
  solutionSaved?: boolean;
  attemptId?: string;
  questionId?: string;
};

export type SessionPhase = "active" | "feedback" | "summary";

export type ActiveSession = SessionSetup & {
  sessionKind: "practice" | "question_revision";
  phase: SessionPhase;
  startedAt: number;
  endsAt: number;
  endedAt: number | null;
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
