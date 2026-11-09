import type { User } from "@supabase/supabase-js";
import { database, type SessionRecord } from "./database";
import { supabase } from "./supabase";

const LOCAL_CLOUD_CACHE_LIMIT = 50;

type CloudSession = {
  id: string;
  user_id: string;
  subject_id: string | null;
  subject_name: string;
  chapter_id: string | null;
  chapter_name: string;
  syllabus_exam: string | null;
  started_at: string;
  ended_at: string;
  planned_duration_minutes: number;
  status: "completed" | "ended_early";
  right_count: number;
  wrong_count: number;
  couldnt_solve_count: number;
  timed_question_count: number;
  active_time_ms: number | string;
  avg_time_per_question_ms: number | string | null;
};

type CloudWeakTopic = {
  session_id: string;
  topic_id: string;
  topic_name: string;
  question_count: number;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add the project URL and publishable key to .env.local, then restart the dev server.",
    );
  }
  return supabase;
}

function toCloudSession(record: SessionRecord) {
  const timedQuestionCount =
    record.timedQuestionCount ??
    record.rightCount + record.wrongCount + record.couldntSolveCount;
  return {
    id: record.id,
    subject_id: record.subjectId ?? null,
    subject_name: record.subject,
    chapter_id: record.chapterId ?? null,
    chapter_name: record.chapter,
    syllabus_exam: record.syllabusExam ?? null,
    started_at: record.startedAt,
    ended_at: record.endedAt,
    planned_duration_minutes: record.plannedDurationMinutes,
    status: record.status,
    right_count: record.rightCount,
    wrong_count: record.wrongCount,
    couldnt_solve_count: record.couldntSolveCount,
    timed_question_count: timedQuestionCount,
    active_time_ms: record.activeTimeMs,
    avg_time_per_question_ms:
      record.avgTimePerQuestionMs ??
      (timedQuestionCount > 0
        ? Math.round(record.activeTimeMs / timedQuestionCount)
        : null),
  };
}

function fromCloudSession(
  row: CloudSession,
  topics: CloudWeakTopic[],
): SessionRecord {
  return {
    id: row.id,
    ownerUserId: row.user_id,
    syncStatus: "synced",
    subject: row.subject_name,
    subjectId: row.subject_id ?? undefined,
    chapter: row.chapter_name,
    chapterId: row.chapter_id ?? undefined,
    syllabusExam: row.syllabus_exam ?? undefined,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    plannedDurationMinutes: row.planned_duration_minutes,
    status: row.status,
    rightCount: row.right_count,
    wrongCount: row.wrong_count,
    couldntSolveCount: row.couldnt_solve_count,
    timedQuestionCount: row.timed_question_count,
    activeTimeMs: Number(row.active_time_ms),
    avgTimePerQuestionMs:
      row.avg_time_per_question_ms === null
        ? null
        : Number(row.avg_time_per_question_ms),
    weakTopics: topics
      .filter((topic) => topic.session_id === row.id)
      .map((topic) => ({
        topicId: topic.topic_id,
        topic: topic.topic_name,
        questionCount: topic.question_count,
      })),
  };
}

export async function syncAccountSessions(user: User): Promise<SessionRecord[]> {
  const client = requireSupabase();
  const localRecords = await database.sessions.toArray();
  const pendingRecords = localRecords.filter(
    (record) =>
      record.ownerUserId === user.id && record.syncStatus !== "synced",
  );

  for (const record of pendingRecords) {
    const weakTopics = record.weakTopics.map((topic) => ({
      topic_id: topic.topicId,
      topic_name: topic.topic,
      question_count: topic.questionCount,
    }));
    const { error } = await client.rpc("upsert_session_with_topics", {
      p_session: toCloudSession(record),
      p_weak_topics: weakTopics,
    });
    if (error) {
      throw new Error(`Could not sync a session: ${error.message}`);
    }
    await database.sessions.update(record.id, { syncStatus: "synced" });
  }

  const { data: sessionData, error: sessionError } = await client
    .from("sessions")
    .select(
      "id,user_id,subject_id,subject_name,chapter_id,chapter_name,syllabus_exam,started_at,ended_at,planned_duration_minutes,status,right_count,wrong_count,couldnt_solve_count,timed_question_count,active_time_ms,avg_time_per_question_ms",
    )
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(LOCAL_CLOUD_CACHE_LIMIT);
  if (sessionError) {
    throw new Error(`Could not load cloud sessions: ${sessionError.message}`);
  }
  const cloudSessions = (sessionData ?? []) as CloudSession[];

  const cloudTopics: CloudWeakTopic[] = [];
  for (let offset = 0; offset < cloudSessions.length; offset += 100) {
    const sessionIds = cloudSessions
      .slice(offset, offset + 100)
      .map((record) => record.id);
    const { data, error } = await client
      .from("session_weak_topics")
      .select("session_id,topic_id,topic_name,question_count")
      .in("session_id", sessionIds);
    if (error) {
      throw new Error(`Could not load cloud weak topics: ${error.message}`);
    }
    cloudTopics.push(...((data ?? []) as CloudWeakTopic[]));
  }

  const records = cloudSessions.map((row) => fromCloudSession(row, cloudTopics));
  if (records.length > 0) {
    await database.sessions.bulkPut(records);
  }

  const retainedIds = new Set(records.map((record) => record.id));
  await database.sessions
    .where("ownerUserId")
    .equals(user.id)
    .filter(
      (record) =>
        record.syncStatus === "synced" && !retainedIds.has(record.id),
    )
    .delete();
  return records;
}

export async function assignLocalSessionsToUser(userId: string) {
  await database.sessions.toCollection().modify((record) => {
    if (!record.ownerUserId) {
      record.ownerUserId = userId;
      record.syncStatus = "pending";
    }
  });
}
