import Dexie, { type EntityTable } from "dexie";

export type SessionRecord = {
  id: string;
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
  activeTimeMs: number;
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
  }
}

export const database = new PracticeDatabase();
