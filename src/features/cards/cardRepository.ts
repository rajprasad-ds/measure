import { database } from "../../database";
import { getChapter } from "../../syllabus";
import type {
  FactCard,
  FactCardInput,
  QuestionCard,
  QuestionCardInput,
  QuestionFactLink,
} from "./types";

type UserOptions = { userId?: string };

function validateLocation(
  subjectId: string,
  chapterId: string,
  topicIds: string[],
) {
  const chapter = getChapter(subjectId, chapterId);
  if (!chapter) {
    throw new Error("Choose a chapter within the selected subject.");
  }
  const validTopicIds = new Set(chapter.topics.map((topic) => topic.id));
  if (topicIds.some((topicId) => !validTopicIds.has(topicId))) {
    throw new Error("Choose topics from the selected chapter.");
  }
}

function syncFields({ userId }: UserOptions, timestamp: string) {
  return {
    ...(userId ? { ownerUserId: userId } : {}),
    syncStatus: userId ? ("pending" as const) : ("local" as const),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export async function createQuestionCard(
  input: QuestionCardInput,
  options: UserOptions = {},
): Promise<QuestionCard> {
  const promptText = input.promptText?.trim() ?? "";
  const solutionText = input.solutionText?.trim() ?? "";
  const keyInsight = input.keyInsight?.trim() ?? "";
  if (!input.promptImageId) {
    throw new Error("Add a photo of the question to the question bank.");
  }
  validateLocation(input.subjectId, input.chapterId, input.topicIds);

  const now = new Date().toISOString();
  const card: QuestionCard = {
    id: globalThis.crypto.randomUUID(),
    ...syncFields(options, now),
    subjectId: input.subjectId,
    chapterId: input.chapterId,
    topicIds: [...new Set(input.topicIds)],
    promptText,
    ...(input.promptImageId ? { promptImageId: input.promptImageId } : {}),
    ...(solutionText ? { solutionText } : {}),
    ...(input.solutionImageId ? { solutionImageId: input.solutionImageId } : {}),
    ...(keyInsight ? { keyInsight } : {}),
    timesSeen: 1,
    lastSeenAt: now,
    priorityBoost: 0,
    ...(input.createdFromAttemptId
      ? { createdFromAttemptId: input.createdFromAttemptId }
      : {}),
  };
  await database.questions.add(card);
  return card;
}

export async function createFactCard(
  input: FactCardInput,
  options: UserOptions = {},
): Promise<FactCard> {
  const card = buildFactCard(input, options);
  await database.factCards.add(card);
  return card;
}

function buildFactCard(input: FactCardInput, options: UserOptions): FactCard {
  const promptText = input.promptText?.trim() ?? "";
  const contentText = input.contentText?.trim() ?? "";
  if (!promptText && !input.promptImageId) {
    throw new Error("Add text or an image for the fact-card front.");
  }
  if (!contentText && !input.contentImageId) {
    throw new Error("Add text or an image for the fact-card back.");
  }
  validateLocation(input.subjectId, input.chapterId, input.topicIds);

  const now = new Date().toISOString();
  return {
    id: globalThis.crypto.randomUUID(),
    ...syncFields(options, now),
    subjectId: input.subjectId,
    chapterId: input.chapterId,
    topicIds: [...new Set(input.topicIds)],
    kind: input.kind,
    promptText,
    ...(input.promptImageId ? { promptImageId: input.promptImageId } : {}),
    contentText,
    ...(input.contentImageId ? { contentImageId: input.contentImageId } : {}),
    ...(input.wrongBelief?.trim()
      ? { wrongBelief: input.wrongBelief.trim() }
      : {}),
    stage: 0,
    dueAt: now,
    reps: 0,
    lapses: 0,
    ...(input.createdFromAttemptId
      ? { createdFromAttemptId: input.createdFromAttemptId }
      : {}),
  };
}

async function linkCardsInTransaction(
  questionId: string,
  factId: string,
  options: UserOptions,
) {
  const [question, fact] = await Promise.all([
    database.questions.get(questionId),
    database.factCards.get(factId),
  ]);
  if (!question || question.deletedAt) {
    throw new Error("The selected question card is unavailable.");
  }
  if (!fact || fact.deletedAt) {
    throw new Error("The selected fact card is unavailable.");
  }
  if (
    (question.ownerUserId && question.ownerUserId !== options.userId) ||
    (fact.ownerUserId && fact.ownerUserId !== options.userId)
  ) {
    throw new Error("Cards must belong to your account before linking.");
  }
  if (!options.userId && question.ownerUserId !== fact.ownerUserId) {
    throw new Error("Cards must belong to the same local account.");
  }

  const now = new Date().toISOString();
  if (options.userId) {
    if (!question.ownerUserId) {
      await database.questions.put({
        ...question,
        ownerUserId: options.userId,
        syncStatus: "pending",
        updatedAt: now,
      });
    }
    if (!fact.ownerUserId) {
      await database.factCards.put({
        ...fact,
        ownerUserId: options.userId,
        syncStatus: "pending",
        updatedAt: now,
      });
    }
  }
  const link: QuestionFactLink = {
    questionId,
    factId,
    ...syncFields(options, now),
  };
  await database.questionFactLinks.put(link);
}

export async function createFactCardAndLink(
  input: FactCardInput,
  questionId: string,
  options: UserOptions = {},
): Promise<FactCard> {
  if (!questionId) throw new Error("Choose a question card to link.");
  const card = buildFactCard(input, options);
  await database.transaction(
    "rw",
    database.questions,
    database.factCards,
    database.questionFactLinks,
    async () => {
      await database.factCards.add(card);
      await linkCardsInTransaction(questionId, card.id, options);
    },
  );
  return card;
}

export async function linkQuestionAndFact(
  questionId: string,
  factId: string,
  options: UserOptions = {},
): Promise<void> {
  if (questionId === "" || factId === "") {
    throw new Error("Choose both a question and a fact card.");
  }
  await database.transaction(
    "rw",
    database.questions,
    database.factCards,
    database.questionFactLinks,
    async () => {
      await linkCardsInTransaction(questionId, factId, options);
    },
  );
}

export async function recordQuestionSeen(
  questionId: string,
  userId?: string,
): Promise<void> {
  const card = await database.questions.get(questionId);
  if (!card || card.deletedAt) {
    throw new Error("The selected question card is unavailable.");
  }
  if (userId && card.ownerUserId && card.ownerUserId !== userId) {
    throw new Error("This question card belongs to another account.");
  }
  const now = new Date().toISOString();
  await database.questions.update(questionId, {
    timesSeen: card.timesSeen + 1,
    lastSeenAt: now,
    updatedAt: now,
    ...(userId && !card.ownerUserId ? { ownerUserId: userId } : {}),
    syncStatus: userId || card.ownerUserId ? "pending" : "local",
  });
}

export async function updateQuestionCard(
  card: QuestionCard,
  updates: QuestionCardInput,
): Promise<QuestionCard> {
  const promptText = updates.promptText?.trim() ?? "";
  const solutionText = updates.solutionText?.trim() ?? "";
  const keyInsight = updates.keyInsight?.trim() ?? "";
  if (!updates.promptImageId) {
    throw new Error("Add a photo of the question.");
  }
  validateLocation(updates.subjectId, updates.chapterId, updates.topicIds);
  const updated: QuestionCard = {
    ...card,
    ...updates,
    promptText,
    topicIds: [...new Set(updates.topicIds)],
    ...(solutionText ? { solutionText } : { solutionText: undefined }),
    ...(keyInsight ? { keyInsight } : { keyInsight: undefined }),
    ...(updates.promptImageId
      ? { promptImageId: updates.promptImageId }
      : { promptImageId: undefined }),
    ...(updates.solutionImageId
      ? { solutionImageId: updates.solutionImageId }
      : { solutionImageId: undefined }),
    ...(updates.smarterApproachText?.trim()
      ? { smarterApproachText: updates.smarterApproachText.trim() }
      : { smarterApproachText: undefined }),
    ...(updates.smarterApproachImageId
      ? { smarterApproachImageId: updates.smarterApproachImageId }
      : { smarterApproachImageId: undefined }),
    updatedAt: new Date().toISOString(),
    syncStatus: card.ownerUserId ? "pending" : "local",
  };
  await database.questions.put(updated);
  return updated;
}

export async function updateFactCard(
  card: FactCard,
  updates: FactCardInput,
): Promise<FactCard> {
  const promptText = updates.promptText?.trim() ?? "";
  const contentText = updates.contentText?.trim() ?? "";
  if (!promptText && !updates.promptImageId) {
    throw new Error("Add text or an image for the fact-card front.");
  }
  if (!contentText && !updates.contentImageId) {
    throw new Error("Add text or an image for the fact-card back.");
  }
  validateLocation(updates.subjectId, updates.chapterId, updates.topicIds);
  const updated: FactCard = {
    ...card,
    ...updates,
    promptText,
    contentText,
    ...(updates.promptImageId
      ? { promptImageId: updates.promptImageId }
      : { promptImageId: undefined }),
    ...(updates.contentImageId
      ? { contentImageId: updates.contentImageId }
      : { contentImageId: undefined }),
    topicIds: [...new Set(updates.topicIds)],
    ...(updates.wrongBelief?.trim()
      ? { wrongBelief: updates.wrongBelief.trim() }
      : { wrongBelief: undefined }),
    updatedAt: new Date().toISOString(),
    syncStatus: card.ownerUserId ? "pending" : "local",
  };
  await database.factCards.put(updated);
  return updated;
}

export async function softDeleteQuestionCard(questionId: string) {
  const now = new Date().toISOString();
  await database.transaction(
    "rw",
    database.questions,
    database.questionFactLinks,
    async () => {
      const card = await database.questions.get(questionId);
      if (!card) return;
      await database.questions.update(questionId, {
        deletedAt: now,
        updatedAt: now,
        syncStatus: card.ownerUserId ? "pending" : "local",
      });
      await database.questionFactLinks
        .where("questionId")
        .equals(questionId)
        .modify((link) => {
          link.deletedAt = now;
          link.updatedAt = now;
          link.syncStatus = link.ownerUserId ? "pending" : "local";
        });
    },
  );
}

export async function softDeleteFactCard(factId: string) {
  const now = new Date().toISOString();
  await database.transaction(
    "rw",
    database.factCards,
    database.questionFactLinks,
    async () => {
      const card = await database.factCards.get(factId);
      if (!card) return;
      await database.factCards.update(factId, {
        deletedAt: now,
        updatedAt: now,
        syncStatus: card.ownerUserId ? "pending" : "local",
      });
      await database.questionFactLinks
        .where("factId")
        .equals(factId)
        .modify((link) => {
          link.deletedAt = now;
          link.updatedAt = now;
          link.syncStatus = link.ownerUserId ? "pending" : "local";
        });
    },
  );
}

export async function unlinkQuestionAndFact(
  questionId: string,
  factId: string,
) {
  const link = await database.questionFactLinks.get([questionId, factId]);
  if (!link) return;
  const now = new Date().toISOString();
  await database.questionFactLinks.put({
    ...link,
    deletedAt: now,
    updatedAt: now,
    syncStatus: link.ownerUserId ? "pending" : "local",
  });
}

export function getSimilarCards<T extends {
  id: string;
  chapterId: string;
  topicIds: string[];
  deletedAt?: string;
}>(
  source: Pick<T, "chapterId" | "topicIds">,
  cards: T[],
  limit = 5,
): T[] {
  return cards
    .filter(
      (card) =>
        !card.deletedAt &&
        (card.chapterId === source.chapterId ||
          card.topicIds.some((topicId) => source.topicIds.includes(topicId))),
    )
    .sort(
      (left, right) =>
        Number(right.chapterId === source.chapterId) -
        Number(left.chapterId === source.chapterId),
    )
    .slice(0, limit);
}
