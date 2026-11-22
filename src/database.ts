import Dexie, { type EntityTable, type Table } from "dexie";
import type { ActiveSessionSnapshot } from "./features/practice/types";
import type {
  AttemptResult,
  Cause,
  SlipSubtype,
} from "./lib/causes";
import type {
  FactCard,
  FactReviewRecord,
  QuestionCard,
  QuestionFactLink,
} from "./features/cards/types";

export type AttemptRecord = {
  id: string;
  ownerUserId?: string;
  syncStatus: "local" | "pending" | "synced";
  sessionId: string;
  questionId?: string;
  timeMs: number;
  result: AttemptResult;
  cause?: Cause;
  slipSubtype?: SlipSubtype;
  topicIds: string[];
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type SessionRecord = {
  id: string;
  ownerUserId?: string;
  syncStatus?: "local" | "pending" | "synced";
  sessionKind?: "practice" | "question_revision";
  subject: string;
  subjectId?: string;
  chapter: string;
  chapterId?: string;
  syllabusExam?: string;
  startedAt: string;
  endedAt: string;
  plannedDurationMinutes: number;
  status: "completed" | "ended_early";
  rightCount: number;
  wrongCount: number;
  couldntSolveCount: number;
  timedQuestionCount: number;
  activeTimeMs: number;
  avgTimePerQuestionMs: number | null;
  weakTopics: Array<{
    topic: string;
    topicId?: string;
    questionCount: number;
  }>;
};

export type LocalImageRecord = {
  id: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  status: "pending" | "uploading" | "uploaded" | "failed";
  remoteId?: string;
  ownerUserId?: string;
  syncStatus?: "local" | "pending" | "synced";
  attempts?: number;
  lastError?: string;
  createdAt: string;
};

class PracticeDatabase extends Dexie {
  sessions!: EntityTable<SessionRecord, "id">;
  activeSession!: EntityTable<ActiveSessionSnapshot, "id">;
  attempts!: EntityTable<AttemptRecord, "id">;
  questions!: EntityTable<QuestionCard, "id">;
  factCards!: EntityTable<FactCard, "id">;
  questionFactLinks!: Table<QuestionFactLink, [string, string]>;
  factReviews!: EntityTable<FactReviewRecord, "id">;
  localImages!: EntityTable<LocalImageRecord, "id">;
  localImageBlobs!: EntityTable<{ id: string; blob: Blob }, "id">;

  constructor() {
    super("jee-practice");
    this.version(2).stores({
      sessions: "&id, endedAt, subject, chapter, subjectId, chapterId",
    });
    this.version(3)
      .stores({
        sessions:
          "&id, endedAt, subject, chapter, subjectId, chapterId, ownerUserId, syncStatus",
      })
      .upgrade(async (transaction) => {
        await transaction.table("sessions").toCollection().modify((record) => {
          record.syncStatus = "local";
          const timedQuestionCount =
            record.timedQuestionCount ??
            record.rightCount + record.wrongCount + record.couldntSolveCount;
          record.timedQuestionCount = timedQuestionCount;
          record.avgTimePerQuestionMs =
            record.avgTimePerQuestionMs ??
            (timedQuestionCount > 0
              ? Math.round(record.activeTimeMs / timedQuestionCount)
              : null);
        });
      });
    this.version(4).stores({
      sessions:
        "&id, endedAt, subject, chapter, subjectId, chapterId, ownerUserId, syncStatus",
      activeSession: "&id",
    });
    this.version(5).stores({
      sessions:
        "&id, endedAt, subject, chapter, subjectId, chapterId, ownerUserId, syncStatus, sessionKind",
      activeSession: "&id",
      attempts:
        "&id, sessionId, questionId, result, cause, ownerUserId, syncStatus, updatedAt, *topicIds",
    });
    this.version(6).stores({
      sessions:
        "&id, endedAt, subject, chapter, subjectId, chapterId, ownerUserId, syncStatus, sessionKind",
      activeSession: "&id",
      attempts:
        "&id, sessionId, questionId, result, cause, ownerUserId, syncStatus, updatedAt, *topicIds",
      questions:
        "&id, ownerUserId, syncStatus, subjectId, chapterId, updatedAt, createdFromAttemptId, *topicIds",
      factCards:
        "&id, ownerUserId, syncStatus, subjectId, chapterId, kind, dueAt, updatedAt, createdFromAttemptId, *topicIds",
      questionFactLinks:
        "&[questionId+factId], questionId, factId, ownerUserId, syncStatus, updatedAt, deletedAt",
      factReviews:
        "&id, ownerUserId, syncStatus, factId, reviewedAt, updatedAt",
    });
    this.version(7)
      .stores({
        sessions:
          "&id, endedAt, subject, chapter, subjectId, chapterId, ownerUserId, syncStatus, sessionKind",
        activeSession: "&id",
        attempts:
          "&id, sessionId, questionId, result, cause, ownerUserId, syncStatus, updatedAt, *topicIds",
        questions:
          "&id, ownerUserId, syncStatus, subjectId, chapterId, updatedAt, createdFromAttemptId, *topicIds",
        factCards:
          "&id, ownerUserId, syncStatus, subjectId, chapterId, kind, dueAt, updatedAt, createdFromAttemptId, *topicIds",
        questionFactLinks:
          "&[questionId+factId], questionId, factId, ownerUserId, syncStatus, updatedAt, deletedAt",
        factReviews:
          "&id, ownerUserId, syncStatus, factId, reviewedAt, updatedAt",
        localImages: "&id, createdAt",
        localImageBlobs: "&id",
      })
      .upgrade(async (transaction) => {
        await transaction.table("activeSession").toCollection().modify((row) => {
          row.session.sessionKind ??= "practice";
        });
      });
    this.version(8)
      .stores({
        sessions:
          "&id, endedAt, subject, chapter, subjectId, chapterId, ownerUserId, syncStatus, sessionKind",
        activeSession: "&id",
        attempts:
          "&id, sessionId, questionId, result, cause, ownerUserId, syncStatus, updatedAt, *topicIds",
        questions:
          "&id, ownerUserId, syncStatus, subjectId, chapterId, updatedAt, createdFromAttemptId, *topicIds",
        factCards:
          "&id, ownerUserId, syncStatus, subjectId, chapterId, kind, dueAt, updatedAt, createdFromAttemptId, *topicIds",
        questionFactLinks:
          "&[questionId+factId], questionId, factId, ownerUserId, syncStatus, updatedAt, deletedAt",
        factReviews:
          "&id, ownerUserId, syncStatus, factId, reviewedAt, updatedAt",
        localImages:
          "&id, status, syncStatus, ownerUserId, remoteId, createdAt",
        localImageBlobs: "&id",
        meta: "&id",
      })
      .upgrade(async (transaction) => {
        await transaction.table("localImages").toCollection().modify((row) => {
          row.status = (row as LocalImageRecord).status ?? "uploaded";
          row.ownerUserId = (row as LocalImageRecord).ownerUserId ?? undefined;
          row.syncStatus = (row as LocalImageRecord).syncStatus ?? "synced";
          row.remoteId = (row as LocalImageRecord).remoteId ?? undefined;
          row.attempts = (row as LocalImageRecord).attempts ?? 0;
          row.lastError = (row as LocalImageRecord).lastError ?? undefined;
        });
      });
    this.version(9)
      .stores({
        sessions:
          "&id, endedAt, subject, chapter, subjectId, chapterId, ownerUserId, syncStatus, sessionKind",
        activeSession: "&id",
        attempts:
          "&id, sessionId, questionId, result, cause, ownerUserId, syncStatus, updatedAt, *topicIds",
        questions:
          "&id, ownerUserId, syncStatus, subjectId, chapterId, updatedAt, createdFromAttemptId, *topicIds",
        factCards:
          "&id, ownerUserId, syncStatus, subjectId, chapterId, kind, dueAt, updatedAt, createdFromAttemptId, *topicIds",
        questionFactLinks:
          "&[questionId+factId], questionId, factId, ownerUserId, syncStatus, updatedAt, deletedAt",
        factReviews:
          "&id, ownerUserId, syncStatus, factId, reviewedAt, updatedAt",
        localImages:
          "&id, status, syncStatus, ownerUserId, remoteId, createdAt",
        localImageBlobs: "&id",
        meta: "&id",
      })
      .upgrade(async (transaction) => {
        await transaction.table("localImages").toCollection().modify((row) => {
          row.status = (row as LocalImageRecord).status ?? "uploaded";
          row.ownerUserId = (row as LocalImageRecord).ownerUserId ?? undefined;
          row.syncStatus = (row as LocalImageRecord).syncStatus ?? "synced";
          row.remoteId = (row as LocalImageRecord).remoteId ?? undefined;
          row.attempts = (row as LocalImageRecord).attempts ?? 0;
          row.lastError = (row as LocalImageRecord).lastError ?? undefined;
        });
      });
  }
}

export const database = new PracticeDatabase();
