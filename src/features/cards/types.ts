import type { Cause } from "../../lib/causes";

export type SyncStatus = "local" | "pending" | "synced";

type SyncableCard = {
  id: string;
  ownerUserId?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  subjectId: string;
  chapterId: string;
  topicIds: string[];
  createdFromAttemptId?: string;
};

export type QuestionDifficulty = "easy" | "medium" | "hard";

export type QuestionCard = SyncableCard & {
  difficulty?: QuestionDifficulty;
  promptText: string;
  promptImageId?: string;
  solutionText?: string;
  solutionImageId?: string;
  smarterApproachText?: string;
  smarterApproachImageId?: string;
  keyInsight?: string;
  timesSeen: number;
  lastSeenAt?: string;
  priorityBoost: number;
  boostUpdatedAt?: string;
};

export type FactCardKind =
  | "fact"
  | "formula"
  | "reaction"
  | "misconception"
  | "trap";

export type FactCard = SyncableCard & {
  kind: FactCardKind;
  promptText: string;
  promptImageId?: string;
  contentText: string;
  contentImageId?: string;
  wrongBelief?: string;
  stage: number;
  dueAt: string;
  reps: number;
  lapses: number;
  lastReviewedAt?: string;
};

export type QuestionFactLink = {
  questionId: string;
  factId: string;
  ownerUserId?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

export type FactReviewRecord = {
  id: string;
  ownerUserId?: string;
  syncStatus: SyncStatus;
  factId: string;
  reviewedAt: string;
  outcome: "recalled" | "forgot";
  stageBefore: number;
  stageAfter: number;
  source: "fact_revision" | "question_revision";
  attemptId?: string;
  updatedAt: string;
};

export type QuestionCardInput = Pick<
  QuestionCard,
  "subjectId" | "chapterId" | "topicIds"
> & {
  promptText?: string;
  promptImageId?: string;
  difficulty?: QuestionDifficulty;
  solutionText?: string;
  solutionImageId?: string;
  smarterApproachText?: string;
  smarterApproachImageId?: string;
  keyInsight?: string;
  createdFromAttemptId?: string;
};

export type FactCardInput = Pick<
  FactCard,
  | "subjectId"
  | "chapterId"
  | "topicIds"
  | "kind"
  | "wrongBelief"
> & {
  promptText?: string;
  promptImageId?: string;
  contentText?: string;
  contentImageId?: string;
  createdFromAttemptId?: string;
};

export type CauseByAttemptId = Record<string, Cause | undefined>;
