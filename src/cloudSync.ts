import type { User } from "@supabase/supabase-js";
import {
  database,
  type AttemptRecord,
  type LocalImageRecord,
  type SessionRecord,
} from "./database";
import type {
  FactCard,
  FactReviewRecord,
  QuestionCard,
  QuestionFactLink,
} from "./features/cards/types";
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
  session_kind: "practice" | "question_revision";
  right_count: number;
  wrong_count: number;
  couldnt_solve_count: number;
  timed_question_count: number;
  active_time_ms: number | string;
  avg_time_per_question_ms: number | string | null;
};

type CloudAttempt = {
  id: string;
  user_id: string;
  session_id: string;
  question_id: string | null;
  time_ms: number | string;
  result: AttemptRecord["result"];
  cause: AttemptRecord["cause"] | null;
  slip_subtype: AttemptRecord["slipSubtype"] | null;
  topic_ids: string[];
  note: string | null;
  created_at: string;
  updated_at: string;
};

type CloudWeakTopic = {
  session_id: string;
  topic_id: string;
  topic_name: string;
  question_count: number;
};

type CloudQuestion = {
  id: string;
  user_id: string;
  subject_id: string;
  chapter_id: string;
  topic_ids: string[];
  difficulty: "easy" | "medium" | "hard" | null;
  prompt_text: string | null;
  prompt_image_id: string | null;
  solution_text: string | null;
  solution_image_id: string | null;
  solution_image_ids: string[];
  smarter_approach_text: string | null;
  smarter_approach_image_id: string | null;
  key_insight: string | null;
  times_seen: number;
  last_seen_at: string | null;
  priority_boost: number;
  boost_updated_at: string | null;
  created_from_attempt_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type CloudFactCard = {
  id: string;
  user_id: string;
  subject_id: string;
  chapter_id: string;
  topic_ids: string[];
  kind: FactCard["kind"];
  prompt_text: string | null;
  prompt_image_id: string | null;
  content_text: string | null;
  content_image_id: string | null;
  wrong_belief: string | null;
  stage: number;
  due_at: string;
  reps: number;
  lapses: number;
  last_reviewed_at: string | null;
  created_from_attempt_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type CloudQuestionFactLink = {
  question_id: string;
  fact_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type CloudFactReview = {
  id: string;
  user_id: string;
  fact_id: string;
  reviewed_at: string;
  outcome: FactReviewRecord["outcome"];
  stage_before: number;
  stage_after: number;
  source: FactReviewRecord["source"];
  attempt_id: string | null;
  updated_at: string;
};

type CloudImage = {
  id: string;
  user_id: string;
  provider: string;
  remote_id: string;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  status: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

function toCloudImage(record: LocalImageRecord) {
  return {
    id: record.id,
    user_id: record.ownerUserId ?? null,
    provider: "drive",
    remote_id: record.remoteId!,
    mime: record.mime,
    width: record.width,
    height: record.height,
    bytes: record.bytes,
    status: record.status,
    last_error: record.lastError ?? null,
    created_at: record.createdAt,
    updated_at: record.createdAt,
  };
}

function fromCloudImage(row: CloudImage): LocalImageRecord {
  return {
    id: row.id,
    ownerUserId: row.user_id,
    syncStatus: "synced",
    status: row.status as LocalImageRecord["status"],
    remoteId: row.remote_id ?? undefined,
    mime: row.mime,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    attempts: 0,
    lastError: row.last_error ?? undefined,
    createdAt: row.created_at,
  };
}

type CloudCardTable =
  | "attempts"
  | "questions"
  | "fact_cards"
  | "question_fact_links"
  | "fact_reviews"
  | "images";

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add the project URL and publishable key to .env.local, then restart the dev server.",
    );
  }
  return supabase;
}

async function pullCardRows<T>(
  table: CloudCardTable,
  userId: string,
): Promise<T[]> {
  const client = requireSupabase();
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .order("updated_at")
      .range(offset, offset + 499);
    if (error) {
      throw new Error(`Could not load ${table}: ${error.message}`);
    }
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

function toCloudSession(
  record: SessionRecord,
  attempts: AttemptRecord[] = [],
) {
  // Keep invalid-question attempts in the attempt history, but never include
  // them in the valid timed-question count or average-time calculation.
  const validAttempts = attempts.filter(
    (attempt) => attempt.result !== "wrong_question",
  );
  const hasAttemptDetails = attempts.length > 0;
  const timedQuestionCount =
    record.rightCount + record.wrongCount + record.couldntSolveCount;
  const activeTimeMs = hasAttemptDetails
    ? validAttempts.reduce((total, attempt) => total + attempt.timeMs, 0)
    : record.activeTimeMs;
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
    session_kind: record.sessionKind ?? "practice",
    right_count: record.rightCount,
    wrong_count: record.wrongCount,
    couldnt_solve_count: record.couldntSolveCount,
    timed_question_count: timedQuestionCount,
    active_time_ms: activeTimeMs,
    avg_time_per_question_ms:
      timedQuestionCount > 0
        ? Math.round(activeTimeMs / timedQuestionCount)
        : null,
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
    sessionKind: row.session_kind ?? "practice",
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

function toCloudAttempt(attempt: AttemptRecord) {
  return {
    id: attempt.id,
    session_id: attempt.sessionId,
    question_id: attempt.questionId ?? null,
    time_ms: attempt.timeMs,
    result: attempt.result,
    cause: attempt.cause ?? null,
    slip_subtype: attempt.slipSubtype ?? null,
    topic_ids: attempt.topicIds,
    note: attempt.note ?? null,
    created_at: attempt.createdAt,
    updated_at: attempt.updatedAt,
  };
}

function fromCloudAttempt(row: CloudAttempt): AttemptRecord {
  return {
    id: row.id,
    ownerUserId: row.user_id,
    sessionId: row.session_id,
    questionId: row.question_id ?? undefined,
    timeMs: Number(row.time_ms),
    result: row.result,
    cause: row.cause ?? undefined,
    slipSubtype: row.slip_subtype ?? undefined,
    topicIds: row.topic_ids,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncStatus: "synced",
  };
}

function toCloudQuestion(card: QuestionCard) {
  return {
    id: card.id,
    subject_id: card.subjectId,
    chapter_id: card.chapterId,
    topic_ids: card.topicIds,
    difficulty: card.difficulty ?? null,
    prompt_text: card.promptText,
    prompt_image_id: card.promptImageId ?? null,
    solution_text: card.solutionText ?? null,
    solution_image_id: card.solutionImageId ?? null,
    solution_image_ids: card.solutionImageIds ?? (card.solutionImageId ? [card.solutionImageId] : []),
    smarter_approach_text: card.smarterApproachText ?? null,
    smarter_approach_image_id: card.smarterApproachImageId ?? null,
    key_insight: card.keyInsight ?? null,
    times_seen: card.timesSeen,
    last_seen_at: card.lastSeenAt ?? null,
    priority_boost: card.priorityBoost,
    boost_updated_at: card.boostUpdatedAt ?? null,
    created_from_attempt_id: card.createdFromAttemptId ?? null,
    created_at: card.createdAt,
    updated_at: card.updatedAt,
    deleted_at: card.deletedAt ?? null,
  };
}

function fromCloudQuestion(row: CloudQuestion): QuestionCard {
  return {
    id: row.id,
    ownerUserId: row.user_id,
    syncStatus: "synced",
    subjectId: row.subject_id,
    chapterId: row.chapter_id,
    topicIds: row.topic_ids,
    ...(row.difficulty ? { difficulty: row.difficulty } : {}),
    promptText: row.prompt_text ?? "",
    ...(row.prompt_image_id ? { promptImageId: row.prompt_image_id } : {}),
    ...(row.solution_text ? { solutionText: row.solution_text } : {}),
    ...(row.solution_image_id ? { solutionImageId: row.solution_image_id } : {}),
    solutionImageIds: row.solution_image_ids ?? (row.solution_image_id ? [row.solution_image_id] : []),
    ...(row.smarter_approach_text
      ? { smarterApproachText: row.smarter_approach_text }
      : {}),
    ...(row.smarter_approach_image_id
      ? { smarterApproachImageId: row.smarter_approach_image_id }
      : {}),
    ...(row.key_insight ? { keyInsight: row.key_insight } : {}),
    timesSeen: row.times_seen,
    ...(row.last_seen_at ? { lastSeenAt: row.last_seen_at } : {}),
    priorityBoost: row.priority_boost,
    ...(row.boost_updated_at ? { boostUpdatedAt: row.boost_updated_at } : {}),
    ...(row.created_from_attempt_id
      ? { createdFromAttemptId: row.created_from_attempt_id }
      : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
  };
}

function toCloudFactCard(card: FactCard) {
  return {
    id: card.id,
    subject_id: card.subjectId,
    chapter_id: card.chapterId,
    topic_ids: card.topicIds,
    kind: card.kind,
    prompt_text: card.promptText,
    prompt_image_id: card.promptImageId ?? null,
    content_text: card.contentText,
    content_image_id: card.contentImageId ?? null,
    wrong_belief: card.wrongBelief ?? null,
    stage: card.stage,
    due_at: card.dueAt,
    reps: card.reps,
    lapses: card.lapses,
    last_reviewed_at: card.lastReviewedAt ?? null,
    created_from_attempt_id: card.createdFromAttemptId ?? null,
    created_at: card.createdAt,
    updated_at: card.updatedAt,
    deleted_at: card.deletedAt ?? null,
  };
}

function fromCloudFactCard(row: CloudFactCard): FactCard {
  return {
    id: row.id,
    ownerUserId: row.user_id,
    syncStatus: "synced",
    subjectId: row.subject_id,
    chapterId: row.chapter_id,
    topicIds: row.topic_ids,
    kind: row.kind,
    promptText: row.prompt_text ?? "",
    ...(row.prompt_image_id ? { promptImageId: row.prompt_image_id } : {}),
    contentText: row.content_text ?? "",
    ...(row.content_image_id ? { contentImageId: row.content_image_id } : {}),
    ...(row.wrong_belief ? { wrongBelief: row.wrong_belief } : {}),
    stage: row.stage,
    dueAt: row.due_at,
    reps: row.reps,
    lapses: row.lapses,
    ...(row.last_reviewed_at ? { lastReviewedAt: row.last_reviewed_at } : {}),
    ...(row.created_from_attempt_id
      ? { createdFromAttemptId: row.created_from_attempt_id }
      : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
  };
}

function toCloudQuestionFactLink(link: QuestionFactLink) {
  return {
    question_id: link.questionId,
    fact_id: link.factId,
    created_at: link.createdAt,
    updated_at: link.updatedAt,
    deleted_at: link.deletedAt ?? null,
  };
}

function fromCloudQuestionFactLink(
  row: CloudQuestionFactLink,
): QuestionFactLink {
  return {
    questionId: row.question_id,
    factId: row.fact_id,
    ownerUserId: row.user_id,
    syncStatus: "synced",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
  };
}

function toCloudFactReview(review: FactReviewRecord) {
  return {
    id: review.id,
    fact_id: review.factId,
    reviewed_at: review.reviewedAt,
    outcome: review.outcome,
    stage_before: review.stageBefore,
    stage_after: review.stageAfter,
    source: review.source,
    attempt_id: review.attemptId ?? null,
    updated_at: review.updatedAt,
  };
}

function fromCloudFactReview(row: CloudFactReview): FactReviewRecord {
  return {
    id: row.id,
    ownerUserId: row.user_id,
    syncStatus: "synced",
    factId: row.fact_id,
    reviewedAt: row.reviewed_at,
    outcome: row.outcome,
    stageBefore: row.stage_before,
    stageAfter: row.stage_after,
    source: row.source,
    ...(row.attempt_id ? { attemptId: row.attempt_id } : {}),
    updatedAt: row.updated_at,
  };
}

function questionCardImageIds(card: QuestionCard): string[] {
  return [
    card.promptImageId,
    card.solutionImageId,
    ...(card.solutionImageIds ?? []),
    card.smarterApproachImageId,
  ].filter((id): id is string => Boolean(id));
}

function factCardImageIds(card: FactCard): string[] {
  return [card.promptImageId, card.contentImageId].filter(
    (id): id is string => Boolean(id),
  );
}

async function syncPendingCards(
  userId: string,
  unresolvedImageIds: Set<string>,
) {
  const [questions, facts, links, reviews] = await Promise.all([
    database.questions.where("ownerUserId").equals(userId).toArray(),
    database.factCards.where("ownerUserId").equals(userId).toArray(),
    database.questionFactLinks.where("ownerUserId").equals(userId).toArray(),
    database.factReviews.where("ownerUserId").equals(userId).toArray(),
  ]);
  const client = requireSupabase();
  // A card may sync only after every image row it references exists in cloud.
  // Other cards remain independent and can proceed in the same pass.
  const pendingQuestions = questions.filter(
    (row) =>
      row.syncStatus !== "synced" &&
      !questionCardImageIds(row).some((id) => unresolvedImageIds.has(id)),
  );
  const pendingFacts = facts.filter(
    (row) =>
      row.syncStatus !== "synced" &&
      !factCardImageIds(row).some((id) => unresolvedImageIds.has(id)),
  );

  for (const batchStart of Array.from(
    { length: Math.ceil(pendingQuestions.length / 100) },
    (_, index) => index * 100,
  )) {
    const pending = pendingQuestions.slice(batchStart, batchStart + 100);
    const { error } = await client.from("questions").upsert(
      pending.map((row) => ({ ...toCloudQuestion(row), user_id: userId })),
      { onConflict: "id" },
    );
    if (error) throw new Error(`Could not sync question cards: ${error.message}`);
    await Promise.all(
      pending.map((row) =>
        database.questions.where("id").equals(row.id).modify((current) => {
          if (current.updatedAt === row.updatedAt) current.syncStatus = "synced";
        }),
      ),
    );
  }
  for (const batchStart of Array.from(
    { length: Math.ceil(pendingFacts.length / 100) },
    (_, index) => index * 100,
  )) {
    const pending = pendingFacts.slice(batchStart, batchStart + 100);
    const { error } = await client.from("fact_cards").upsert(
      pending.map((row) => ({ ...toCloudFactCard(row), user_id: userId })),
      { onConflict: "id" },
    );
    if (error) throw new Error(`Could not sync fact cards: ${error.message}`);
    await Promise.all(
      pending.map((row) =>
        database.factCards.where("id").equals(row.id).modify((current) => {
          if (current.updatedAt === row.updatedAt) current.syncStatus = "synced";
        }),
      ),
    );
  }
  const [syncedQuestions, syncedFacts] = await Promise.all([
    database.questions.where("ownerUserId").equals(userId)
      .filter((row) => row.syncStatus === "synced").toArray(),
    database.factCards.where("ownerUserId").equals(userId)
      .filter((row) => row.syncStatus === "synced").toArray(),
  ]);
  const syncedQuestionIds = new Set(syncedQuestions.map((row) => row.id));
  const syncedFactIds = new Set(syncedFacts.map((row) => row.id));
  const pendingLinks = links.filter(
    (row) =>
      row.syncStatus !== "synced" &&
      syncedQuestionIds.has(row.questionId) &&
      syncedFactIds.has(row.factId),
  );

  for (const batchStart of Array.from(
    { length: Math.ceil(pendingLinks.length / 100) },
    (_, index) => index * 100,
  )) {
    const pending = pendingLinks.slice(batchStart, batchStart + 100);
    const { error } = await client.from("question_fact_links").upsert(
      pending.map((row) => ({
        ...toCloudQuestionFactLink(row),
        user_id: userId,
      })),
      { onConflict: "question_id,fact_id" },
    );
    if (error) throw new Error(`Could not sync question/fact links: ${error.message}`);
    await Promise.all(
      pending.map((row) =>
        database.questionFactLinks
          .where("[questionId+factId]")
          .equals([row.questionId, row.factId])
          .modify((current) => {
            if (current.updatedAt === row.updatedAt) {
              current.syncStatus = "synced";
            }
          }),
      ),
    );
  }
  const pendingReviews = reviews.filter(
    (row) => row.syncStatus !== "synced" && syncedFactIds.has(row.factId),
  );
  for (const batchStart of Array.from(
    { length: Math.ceil(pendingReviews.length / 100) },
    (_, index) => index * 100,
  )) {
    const pending = pendingReviews.slice(batchStart, batchStart + 100);
    const { error } = await client.from("fact_reviews").upsert(
      pending.map((row) => ({ ...toCloudFactReview(row), user_id: userId })),
      { onConflict: "id" },
    );
    if (error) throw new Error(`Could not sync fact reviews: ${error.message}`);
    await Promise.all(
      pending.map((row) =>
        database.factReviews.where("id").equals(row.id).modify((current) => {
          if (current.updatedAt === row.updatedAt) current.syncStatus = "synced";
        }),
      ),
    );
  }
}

async function syncPendingImages(userId: string): Promise<Set<string>> {
  const [questions, facts] = await Promise.all([
    database.questions.where("ownerUserId").equals(userId).toArray(),
    database.factCards.where("ownerUserId").equals(userId).toArray(),
  ]);
  const referencedImageIds = new Set<string>();
  questions.forEach((card) => {
    if (card.promptImageId) referencedImageIds.add(card.promptImageId);
    if (card.solutionImageId) referencedImageIds.add(card.solutionImageId);
    card.solutionImageIds?.forEach((id) => referencedImageIds.add(id));
    if (card.smarterApproachImageId) referencedImageIds.add(card.smarterApproachImageId);
  });
  facts.forEach((card) => {
    if (card.promptImageId) referencedImageIds.add(card.promptImageId);
    if (card.contentImageId) referencedImageIds.add(card.contentImageId);
  });
  if (referencedImageIds.size > 0) {
    const imageRows = await database.localImages.bulkGet(Array.from(referencedImageIds));
    const newlyOwned = imageRows.filter((row): row is LocalImageRecord => Boolean(row && !row.ownerUserId)).map((row) => ({
      ...row,
      ownerUserId: userId,
      syncStatus: "pending" as const,
    }));
    if (newlyOwned.length > 0) await database.localImages.bulkPut(newlyOwned);
  }
  const pending = await database.localImages
    .where("ownerUserId")
    .equals(userId)
    .filter((row) => row.syncStatus !== "synced" && typeof row.remoteId === "string" && row.remoteId.trim().length > 0)
    .toArray();
  const client = requireSupabase();
  for (let offset = 0; offset < pending.length; offset += 100) {
    const batch = pending
      .slice(offset, offset + 100)
      .filter((row) => typeof row.remoteId === "string" && row.remoteId.trim().length > 0);
    if (batch.length === 0) continue;
    const { error } = await client
      .from("images")
      .upsert(batch.map((row) => ({ ...toCloudImage(row), user_id: userId })), {
        onConflict: "id",
      });
    // A metadata-write failure keeps these images unresolved, but must not
    // prevent independent sessions or cards from syncing in this pass.
    if (error) continue;
    await Promise.all(
      batch.map((row) =>
        database.localImages.where("id").equals(row.id).modify((current) => {
          if (current.createdAt === row.createdAt) current.syncStatus = "synced";
        }),
      ),
    );
  }
  // Report unresolved images to the card-sync stage instead of failing the
  // entire account sync. Sessions and unrelated cards do not depend on Drive.
  const referencedIds = Array.from(referencedImageIds);
  const finalRows = await database.localImages.bulkGet(referencedIds);
  const unresolvedImageIds = new Set<string>();
  finalRows.forEach((row, index) => {
    if (!row || row.syncStatus !== "synced" || !row.remoteId) {
      unresolvedImageIds.add(referencedIds[index]);
    }
  });
  return unresolvedImageIds;
}

export async function syncAccountSessions(
  user: User,
  onSessionProgress?: (record: SessionRecord, status: "syncing" | "synced") => void,
): Promise<SessionRecord[]> {
  const client = requireSupabase();
  const unresolvedImageIds = await syncPendingImages(user.id);
  await syncPendingCards(user.id, unresolvedImageIds);
  const localRecords = await database.sessions.toArray();
  const pendingRecords = localRecords.filter(
    (record) =>
      record.ownerUserId === user.id && record.syncStatus !== "synced",
  );

  for (const record of pendingRecords) {
    onSessionProgress?.(record, "syncing");
    const weakTopics = record.weakTopics.map((topic) => ({
      topic_id: topic.topicId,
      topic_name: topic.topic,
      question_count: topic.questionCount,
    }));
    // Session summaries are independent of question cards and photo uploads.
    // Attempts sync separately below, after their referenced question exists.
    const { error } = await client.rpc("upsert_session_with_attempts", {
      p_session: toCloudSession(record),
      p_attempts: [],
      p_weak_topics: weakTopics,
    });
    if (error) {
      throw new Error(`Could not sync a session: ${error.message}`);
    }
    await database.sessions.update(record.id, { syncStatus: "synced" });
    onSessionProgress?.({ ...record, syncStatus: "synced" }, "synced");
  }

  const allPendingAttempts = await database.attempts
    .where("ownerUserId")
    .equals(user.id)
    .filter((attempt) => attempt.syncStatus !== "synced")
    .toArray();
  // attempts.question_id has a foreign key to questions. Keep only attempts
  // whose linked question card is already present in cloud.
  const pendingAttempts = (await Promise.all(
    allPendingAttempts.map(async (attempt) => {
      if (!attempt.questionId) return attempt;
      const question = await database.questions.get(attempt.questionId);
      return question?.syncStatus === "synced" ? attempt : null;
    }),
  )).filter((attempt): attempt is AttemptRecord => Boolean(attempt));
  for (let offset = 0; offset < pendingAttempts.length; offset += 100) {
    const batch = pendingAttempts.slice(offset, offset + 100);
    const { error } = await client.from("attempts").upsert(
      batch.map((attempt) => ({
        ...toCloudAttempt(attempt),
        user_id: user.id,
      })),
      { onConflict: "id" },
    );
    if (error) throw new Error(`Could not sync attempts: ${error.message}`);
    await Promise.all(
      batch.map((attempt) =>
        database.attempts.where("id").equals(attempt.id).modify((current) => {
          if (current.updatedAt === attempt.updatedAt) {
            current.syncStatus = "synced";
          }
        }),
      ),
    );
  }

  const { data: sessionData, error: sessionError } = await client
    .from("sessions")
    .select(
      "id,user_id,subject_id,subject_name,chapter_id,chapter_name,syllabus_exam,started_at,ended_at,planned_duration_minutes,status,session_kind,right_count,wrong_count,couldnt_solve_count,timed_question_count,active_time_ms,avg_time_per_question_ms",
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

  const cloudAttempts = await pullCardRows<CloudAttempt>("attempts", user.id);
  if (cloudAttempts.length > 0) {
    const pulledAttempts = cloudAttempts.map(fromCloudAttempt);
    await database.transaction("rw", database.attempts, async () => {
      const localAttempts = await database.attempts.bulkGet(
        pulledAttempts.map((attempt) => attempt.id),
      );
      await database.attempts.bulkPut(
        pulledAttempts.filter(
          (_, index) =>
            !localAttempts[index] ||
            localAttempts[index].syncStatus === "synced",
        ),
      );
    });
  }

  const [questionRows, factRows, linkRows, reviewRows] = await Promise.all([
    pullCardRows<CloudQuestion>("questions", user.id),
    pullCardRows<CloudFactCard>("fact_cards", user.id),
    pullCardRows<CloudQuestionFactLink>("question_fact_links", user.id),
    pullCardRows<CloudFactReview>("fact_reviews", user.id),
  ]);

  const pulledQuestions = questionRows.map(fromCloudQuestion);
  const pulledFacts = factRows.map(fromCloudFactCard);
  const pulledLinks = linkRows.map(fromCloudQuestionFactLink);
  const pulledReviews = reviewRows.map(fromCloudFactReview);
  await Promise.all([
    database.transaction("rw", database.questions, async () => {
      const localRows = await database.questions.bulkGet(
        pulledQuestions.map((row) => row.id),
      );
      await database.questions.bulkPut(
        pulledQuestions.filter(
          (_, index) =>
            !localRows[index] || localRows[index].syncStatus === "synced",
        ),
      );
    }),
    database.transaction("rw", database.factCards, async () => {
      const localRows = await database.factCards.bulkGet(
        pulledFacts.map((row) => row.id),
      );
      await database.factCards.bulkPut(
        pulledFacts.filter(
          (_, index) =>
            !localRows[index] || localRows[index].syncStatus === "synced",
        ),
      );
    }),
    database.transaction("rw", database.questionFactLinks, async () => {
      const localRows = await database.questionFactLinks.bulkGet(
        pulledLinks.map((row) => [row.questionId, row.factId]),
      );
      await database.questionFactLinks.bulkPut(
        pulledLinks.filter(
          (_, index) =>
            !localRows[index] || localRows[index].syncStatus === "synced",
        ),
      );
    }),
    database.transaction("rw", database.factReviews, async () => {
      const localRows = await database.factReviews.bulkGet(
        pulledReviews.map((row) => row.id),
      );
      await database.factReviews.bulkPut(
        pulledReviews.filter(
          (_, index) =>
            !localRows[index] || localRows[index].syncStatus === "synced",
        ),
      );
    }),
  ]);

  const cloudImages = await pullCardRows<CloudImage>("images", user.id);
  if (cloudImages.length > 0) {
    const pulledImages = cloudImages.map(fromCloudImage);
    await database.transaction("rw", database.localImages, async () => {
      const localRows = await database.localImages.bulkGet(
        pulledImages.map((row) => row.id),
      );
      await database.localImages.bulkPut(
        pulledImages.filter(
          (_, index) =>
            !localRows[index] || localRows[index].syncStatus === "synced",
        ),
      );
    });
  }

  const retainedIds = new Set(records.map((record) => record.id));
  const expiredSessions = await database.sessions
    .where("ownerUserId")
    .equals(user.id)
    .filter(
      (record) =>
        record.syncStatus === "synced" && !retainedIds.has(record.id),
    )
    .toArray();
  if (expiredSessions.length > 0) {
    const expiredIds = expiredSessions.map((record) => record.id);
    await database.transaction("rw", database.sessions, database.attempts, async () => {
      await database.sessions.bulkDelete(expiredIds);
      await database.attempts.where("sessionId").anyOf(expiredIds).delete();
    });
  }
  return records;
}

export async function assignLocalSessionsToUser(userId: string) {
  await database.transaction(
    "rw",
    [
      database.sessions,
      database.attempts,
      database.questions,
      database.factCards,
      database.questionFactLinks,
      database.factReviews,
      database.localImages,
    ],
    async () => {
      await database.sessions.toCollection().modify((record) => {
        if (!record.ownerUserId) {
          record.ownerUserId = userId;
          record.syncStatus = "pending";
        }
      });
      await database.attempts.toCollection().modify((attempt) => {
        if (!attempt.ownerUserId) {
          attempt.ownerUserId = userId;
          attempt.syncStatus = "pending";
        }
      });
      await database.questions.toCollection().modify((card) => {
        if (!card.ownerUserId) {
          card.ownerUserId = userId;
          card.syncStatus = "pending";
        }
      });
      await database.factCards.toCollection().modify((card) => {
        if (!card.ownerUserId) {
          card.ownerUserId = userId;
          card.syncStatus = "pending";
        }
      });
      await database.questionFactLinks.toCollection().modify((link) => {
        if (!link.ownerUserId) {
          link.ownerUserId = userId;
          link.syncStatus = "pending";
        }
      });
      await database.factReviews.toCollection().modify((review) => {
        if (!review.ownerUserId) {
          review.ownerUserId = userId;
          review.syncStatus = "pending";
        }
      });
      await database.localImages.toCollection().modify((image) => {
        if (!image.ownerUserId) {
          image.ownerUserId = userId;
          image.syncStatus = "pending";
        }
      });
    },
  );
}
