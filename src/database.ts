import Dexie, { type EntityTable } from "dexie";

export type SessionRecord = {
  id: string;
  ownerUserId?: string;
  syncStatus?: "local" | "pending" | "synced";
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

class PracticeDatabase extends Dexie {
  sessions!: EntityTable<SessionRecord, "id">;

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
  }
}

export const database = new PracticeDatabase();
