import { describe, expect, it } from "vitest";
import {
  canCompleteQuestionFeedback,
  getInitialFeedbackStep,
  getStepAfterCause,
  getStepAfterResult,
  isSlowRightAttempt,
  SMARTER_APPROACH_THRESHOLD_MS,
} from "./feedbackFlow";
import type { QuestionFeedback } from "./types";

const right: QuestionFeedback = {
  result: "right",
  cause: null,
  slipSubtype: null,
  topics: [],
};

describe("slow-right feedback flow", () => {
  it("routes a slow correct answer through reflection before capturing anything", () => {
    expect(
      getStepAfterResult(
        "right",
        true,
        false,
        "practice",
      ),
    ).toBe("reflection");
    expect(
      getInitialFeedbackStep(
        { ...right, smarterApproach: "found" },
        true,
        "practice",
      ),
    ).toBe("question");
    expect(
      getInitialFeedbackStep(
        { ...right, smarterApproach: "found", questionId: "q-1" },
        true,
        "practice",
      ),
    ).toBe("topics");
    expect(
      getInitialFeedbackStep(
        {
          ...right,
          smarterApproach: "found",
          questionId: "q-1",
          topics: [{ id: "t-1", name: "Topic 1" }],
        },
        true,
        "practice",
      ),
    ).toBe("approach");
  });

  it("routes failed answers through cause, question, solution, and topics", () => {
    expect(
      getStepAfterResult("wrong", false, false, "practice"),
    ).toBe("cause");
    expect(
      getStepAfterResult("couldnt_solve", false, false, "practice"),
    ).toBe("cause");
    expect(
      getInitialFeedbackStep(
        {
          result: "wrong",
          cause: null,
          slipSubtype: null,
          topics: [{ id: "t-1", name: "Topic 1" }],
          questionId: "q-1",
        },
        false,
        "practice",
      ),
    ).toBe("solution");
    expect(
      getInitialFeedbackStep(
        {
          result: "wrong",
          cause: null,
          slipSubtype: null,
          topics: [{ id: "t-1", name: "Topic 1" }],
          questionId: "q-1",
          solutionSaved: true,
        },
        false,
        "practice",
      ),
    ).toBe("cause");
    expect(getStepAfterCause("missing_fact", 0)).toBe("question");
    expect(getStepAfterCause("missing_fact", 1)).toBe("question");
    expect(getStepAfterCause("slip", 0)).toBe("slip");
    expect(getStepAfterCause("stuck_no_approach", 0)).toBe("complete");
    expect(getStepAfterCause("didnt_understand", 0)).toBe("complete");
    expect(getStepAfterCause("not_sure", 0)).toBe("complete");
  });


  it("completes a wrong-question result without a card or diagnostic cause", () => {
    expect(
      getStepAfterResult("wrong_question", false, false, "practice"),
    ).toBe("complete");
    const invalidQuestion: QuestionFeedback = {
      result: "wrong_question",
      cause: null,
      slipSubtype: null,
      topics: [],
    };
    expect(
      getInitialFeedbackStep(invalidQuestion, false, "practice"),
    ).toBe("complete");
    expect(canCompleteQuestionFeedback(invalidQuestion, [], 45_000)).toBe(true);
  });

  it("uses a strict one-minute threshold", () => {
    expect(isSlowRightAttempt("right", SMARTER_APPROACH_THRESHOLD_MS)).toBe(false);
    expect(isSlowRightAttempt("right", SMARTER_APPROACH_THRESHOLD_MS + 1)).toBe(true);
    expect(isSlowRightAttempt("wrong", SMARTER_APPROACH_THRESHOLD_MS + 1)).toBe(false);
  });

  it("does not complete slow correct feedback before the reflection choice", () => {
    expect(canCompleteQuestionFeedback(right, [], SMARTER_APPROACH_THRESHOLD_MS + 1)).toBe(false);
    expect(
      canCompleteQuestionFeedback(
        { ...right, smarterApproach: "not_found" },
        [],
        SMARTER_APPROACH_THRESHOLD_MS + 1,
      ),
    ).toBe(true);
  });

  it("requires a saved question and approach when the student found a smarter method", () => {
    expect(
      canCompleteQuestionFeedback(
        { ...right, smarterApproach: "found" },
        [],
        SMARTER_APPROACH_THRESHOLD_MS + 1,
      ),
    ).toBe(false);
    expect(
      canCompleteQuestionFeedback(
        {
          ...right,
          smarterApproach: "found",
          questionId: "question-1",
          smarterApproachSaved: true,
        },
        [],
        SMARTER_APPROACH_THRESHOLD_MS + 1,
      ),
    ).toBe(true);
  });

  it("does not apply the practice-only slow-approach gate to revision feedback", () => {
    expect(
      canCompleteQuestionFeedback(
        right,
        [],
        SMARTER_APPROACH_THRESHOLD_MS + 1,
        "question_revision",
      ),
    ).toBe(true);
  });

  it("requires an identified question before finishing a non-right attempt", () => {
    const wrong: QuestionFeedback = {
      result: "wrong",
      cause: "not_sure",
      slipSubtype: null,
      topics: [],
    };
    expect(canCompleteQuestionFeedback(wrong, [], 30_000)).toBe(false);
    expect(
      canCompleteQuestionFeedback(
        { ...wrong, questionId: "question-1" },
        [],
        30_000,
      ),
    ).toBe(true);
  });
});
