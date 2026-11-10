import { describe, expect, it } from "vitest";
import { createQuestionCard, getSimilarCards } from "./cardRepository";
import type { QuestionCard } from "./types";

const cards = Array.from({ length: 7 }, (_, index) => ({
  id: String(index),
  chapterId: index < 6 ? "chapter-a" : "chapter-b",
  topicIds: index === 6 ? ["topic-x"] : [],
  deletedAt: index === 1 ? "deleted" : undefined,
})) as QuestionCard[];

describe("getSimilarCards", () => {
  it("finds same-chapter or shared-topic cards and excludes deleted cards", () => {
    expect(
      getSimilarCards(
        { chapterId: "chapter-a", topicIds: ["topic-x"] },
        cards,
      ).map((card) => card.id),
    ).toEqual(["0", "2", "3", "4", "5"]);
  });

  it("caps duplicate suggestions at five", () => {
    expect(
      getSimilarCards(
        { chapterId: "chapter-a", topicIds: [] },
        cards,
        5,
      ),
    ).toHaveLength(5);
  });
});

describe("card location validation", () => {
  it("rejects a chapter that does not belong to the selected subject", async () => {
    await expect(
      createQuestionCard({
        subjectId: "maths",
        chapterId: "physics-u01",
        topicIds: [],
        promptText: "Question",
        promptImageId: "local-image-id",
        keyInsight: "Insight",
      }),
    ).rejects.toThrow("Choose a chapter within the selected subject.");
  });
});
