import { useEffect, useMemo, useState } from "react";
import SearchSelect from "../../SearchSelect";
import { getChapter } from "../../syllabus";
import {
  CAUSE_OPTIONS,
  SLIP_SUBTYPE_OPTIONS,
  getCauseLabel,
  validateAttempt,
} from "../../lib/causes";
import { formatStopwatch } from "./TimerDisplay";
import {
  canCompleteQuestionFeedback,
  getInitialFeedbackStep,
  getStepAfterCause,
  getStepAfterResult,
  isSlowRightAttempt,
  type FeedbackStep,
} from "./feedbackFlow";
import type { ActiveSession, QuestionResult } from "./types";
import type { Cause, SlipSubtype } from "../../lib/causes";
import type {
  FactCard,
  FactCardInput,
  QuestionCard,
  QuestionCardInput,
  QuestionFactLink,
  QuestionDifficulty,
} from "../cards/types";

import CardPicker from "../cards/CardPicker";
import ImageInput from "../images/ImageInput";
import CardImage from "../images/CardImage";

type Props = {
  session: ActiveSession;
  feedbackDeadlineAt?: number;
  userId?: string;
  onImageUploadComplete: () => void;
  persistenceError: string | null;
  saveError: string | null;
  isSaving: boolean;
  onSetQuestionResult: (questionNumber: number, result: QuestionResult) => void;
  onSetCause: (questionNumber: number, cause: Cause) => void;
  onSetSlipSubtype: (
    questionNumber: number,
    subtype: SlipSubtype | null,
  ) => void;
  onSetSmarterApproach: (
    questionNumber: number,
    answer: "found" | "not_found",
  ) => void;
  onAddTopic: (questionNumber: number, topicId: string) => void;
  onRemoveTopic: (questionNumber: number, topicId: string) => void;
  questions: QuestionCard[];
  facts: FactCard[];
  links: QuestionFactLink[];
  onCreateQuestionCard: (
    questionNumber: number,
    input: Pick<
      QuestionCardInput,
      | "promptText"
      | "promptImageId"
      | "solutionText"
      | "solutionImageId"
    >,
  ) => Promise<void>;
  onUseQuestionCard: (
    questionNumber: number,
    card: QuestionCard,
  ) => Promise<void>;
  onSaveSmarterApproach: (
    questionNumber: number,
    input: Pick<QuestionCardInput, "solutionText" | "solutionImageId" | "solutionImageIds">,
  ) => Promise<void>;
  onSaveSolution: (
    questionNumber: number,
    input: Pick<QuestionCardInput, "solutionText" | "solutionImageId" | "solutionImageIds">,
  ) => Promise<void>;
  onSaveDifficulty: (questionNumber: number, difficulty: QuestionDifficulty) => Promise<void>;
  onCreateFactCard: (
    questionNumber: number,
    input: Pick<
      FactCardInput,
      | "kind"
      | "promptText"
      | "promptImageId"
      | "contentText"
      | "contentImageId"
      | "wrongBelief"
    >,
  ) => Promise<void>;
  onUseFactCard: (questionNumber: number, card: FactCard) => Promise<void>;
  onUnlinkFactCard: (questionNumber: number, factId: string) => Promise<void>;
  onSave: () => void;
};

const emptyFeedback = {
  result: null,
  cause: null,
  slipSubtype: null,
  topics: [],
} as const;

function getFallbackPreviousStep(
  step: FeedbackStep,
  feedback: NonNullable<ActiveSession["feedback"][number]> | undefined,
  slowRight: boolean,
): FeedbackStep | undefined {
  if (step === "reflection") return "result";
  if (step === "question") {
    if (slowRight && feedback?.smarterApproach === "found") return "reflection";
    if (feedback?.cause) return "cause";
    return "result";
  }
  if (step === "solution") return "question";
  if (step === "difficulty") return slowRight ? "approach" : "solution";
  if (step === "topics") return "difficulty";
  if (step === "approach") return "question";
  if (step === "cause") return "result";
  if (step === "slip") return "cause";
  if (step === "fact") return "topics";
  if (step === "complete") {
    if (slowRight) return "topics";
    if (feedback?.result === "right" || feedback?.result === "wrong_question") return "result";
    if (feedback?.cause === "missing_fact") return "fact";
    return "topics";
  }
  return undefined;
}

function getStepTitle(
  step: FeedbackStep,
  slowRight: boolean,
  feedback?: NonNullable<ActiveSession["feedback"][number]>,
): string {
  if (step === "reflection") return "Reflect";
  if (step === "question") {
    return slowRight && feedback?.smarterApproach === "found"
      ? "Step 1 of 4: Question photo"
      : feedback?.result === "right" ? "Step 1 of 4: Question photo" : "Step 2 of 6: Question photo";
  }
  if (step === "topics") {
    return slowRight && feedback?.smarterApproach === "found"
      ? "Step 4 of 4: Attach topics"
      : feedback?.result === "right" ? "Step 2 of 4: Attach topics" : "Step 5 of 6: Attach topics";
  }
  if (step === "approach") return "Step 2 of 4: Smarter approach";
  if (step === "solution") return "Step 3 of 6: Solution";
  if (step === "difficulty") return slowRight ? "Step 3 of 4: Difficulty" : "Step 4 of 6: Difficulty";
  if (step === "cause") {
    return "Step 1 of 6: Primary cause";
  }
  if (step === "slip") {
    return "Step 2: Slip details";
  }
  if (step === "fact") {
    return "Step 6 of 6: Fact card";
  }
  if (step === "complete") return "Feedback complete";
  return "";
}

export default function SessionFeedbackScreen({
  session,
  feedbackDeadlineAt,
  userId,
  onImageUploadComplete,
  persistenceError,
  saveError,
  isSaving,
  onSetQuestionResult,
  onSetCause,
  onSetSlipSubtype,
  onSetSmarterApproach,
  onAddTopic,
  onRemoveTopic,
  questions,
  facts,
  links,
  onCreateQuestionCard,
  onSaveSmarterApproach,
  onSaveSolution,
  onSaveDifficulty,
  onCreateFactCard,
  onUseFactCard,
  onUnlinkFactCard,
  onSave,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showFactForm, setShowFactForm] = useState(false);
  const [solutionImageCount, setSolutionImageCount] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const [flowSteps, setFlowSteps] = useState<
    Record<number, { current: FeedbackStep; previous: FeedbackStep[] }>
  >({});
  const [slideDirection, setSlideDirection] = useState<"forward" | "back">(
    "forward",
  );
  useEffect(() => {
    setShowFactForm(false);
    setActionError(null);
  }, [currentIndex]);
  const chapter = getChapter(session.subjectId, session.chapterId);
  const questionNumbers = useMemo(
    () =>
      Object.keys(session.questionTimesMs)
        .map(Number)
        .sort((left, right) => left - right),
    [session.questionTimesMs],
  );
  const questionNumber = questionNumbers[currentIndex];
  const feedback = questionNumber
    ? session.feedback[questionNumber] ?? emptyFeedback
    : undefined;
  const questionCard = feedback?.questionId
    ? questions.find((card) => card.id === feedback.questionId)
    : undefined;
  const hasQuestionCapture = Boolean(questionCard || feedback?.questionDraft?.promptImageId);
  useEffect(() => {
    const existingCount = questionCard?.solutionImageIds?.length ?? (questionCard?.solutionImageId ? 1 : 0);
    setSolutionImageCount(Math.max(1, existingCount));
  }, [questionNumber, questionCard?.id, questionCard?.solutionImageIds?.length]);
  const linkedFactIds = new Set([
    ...links
      .filter((link) => link.questionId === feedback?.questionId && !link.deletedAt && !feedback?.unlinkedFactIds?.includes(link.factId))
      .map((link) => link.factId),
    ...(feedback?.linkedFactIds ?? []),
  ]);
  const linkedFacts = facts.filter(
    (fact) => linkedFactIds.has(fact.id) && !fact.deletedAt,
  );
  const timeMs = questionNumber ? session.questionTimesMs[questionNumber] : 0;
  const slowRight =
    session.sessionKind === "practice" &&
    isSlowRightAttempt(feedback?.result ?? null, timeMs);
  const validationErrors = feedback
    ? validateAttempt({
        result: feedback.result,
        cause: feedback.cause,
        slipSubtype: feedback.slipSubtype,
        topicIds: feedback.topics.map((topic) => topic.id),
      })
    : [];
  const questionComplete =
    !!feedback &&
    canCompleteQuestionFeedback(
      feedback,
      validationErrors,
      timeMs,
      session.sessionKind,
      linkedFacts.length + (feedback?.linkedFactIds?.length ?? 0) + (feedback?.factDraft ? 1 : 0),
    );
  const allComplete = questionNumbers.every((number) => {
    const item = session.feedback[number] ?? emptyFeedback;
    return canCompleteQuestionFeedback(
      item,
      validateAttempt({
        result: item.result,
        cause: item.cause,
        slipSubtype: item.slipSubtype,
        topicIds: item.topics.map((topic) => topic.id),
      }),
      session.questionTimesMs[number],
      session.sessionKind,
      links.filter((link) => link.questionId === item.questionId && !link.deletedAt && !item.unlinkedFactIds?.includes(link.factId)).length +
        (item.linkedFactIds?.length ?? 0) + (item.factDraft ? 1 : 0),
    );
  });
  const activeTimeMs = Object.values(session.questionTimesMs).reduce(
    (total, duration) => total + duration,
    0,
  );
  const questionTopicIds = feedback?.topics.map((topic) => topic.id) ?? [];
  // Show every active fact so cross-chapter dependencies can be linked.
  // Put facts from this session's chapter and selected topics first; search
  // remains available across the user's complete fact library.
  const relatedFacts = facts
    .filter((fact) => !fact.deletedAt)
    .sort(
      (left, right) =>
        Number(right.subjectId === session.subjectId) -
          Number(left.subjectId === session.subjectId) ||
        Number(right.chapterId === session.chapterId) -
          Number(left.chapterId === session.chapterId) ||
        Number(
          right.topicIds.some((topicId) => questionTopicIds.includes(topicId)),
        ) -
          Number(
            left.topicIds.some((topicId) => questionTopicIds.includes(topicId)),
          ) ||
        left.promptText.localeCompare(right.promptText),
    );
  const step = questionNumber
    ? flowSteps[questionNumber]?.current ??
      getInitialFeedbackStep(
        feedback,
        slowRight,
        session.sessionKind,
        linkedFacts.length + (feedback?.linkedFactIds?.length ?? 0) + (feedback?.factDraft ? 1 : 0),
      )
    : "result";
  const previousStep = questionNumber
    ? flowSteps[questionNumber]?.previous.at(-1) ??
      getFallbackPreviousStep(step, feedback, slowRight)
    : undefined;

  function moveToStep(next: FeedbackStep) {
    if (!questionNumber) return;
    setSlideDirection("forward");
    setFlowSteps((current) => {
      const state = current[questionNumber] ?? {
        current: step,
        previous: [],
      };
      return {
        ...current,
        [questionNumber]: {
          current: next,
          previous:
            state.current === next
              ? state.previous
              : [...state.previous, state.current],
        },
      };
    });
  }

  function goBackOneStep() {
    if (!questionNumber || !previousStep) return;
    setSlideDirection("back");
    setFlowSteps((current) => {
      const state = current[questionNumber];
      if (!state?.previous.length) {
        return {
          ...current,
          [questionNumber]: { current: previousStep, previous: [] },
        };
      }
      return {
        ...current,
        [questionNumber]: {
          current: state.previous[state.previous.length - 1],
          previous: state.previous.slice(0, -1),
        },
      };
    });
    setActionError(null);
  }

  function showError(error: unknown, fallback: string) {
    setActionError(error instanceof Error ? error.message : fallback);
  }

  async function submitQuestionCapture(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!questionNumber || session.sessionKind !== "practice") return;
    const form = new FormData(event.currentTarget);
    const promptImageId = String(form.get("promptImageId") ?? "") || undefined;
    const promptText = String(form.get("promptText") ?? "").trim() || undefined;

    if (!promptImageId) {
      setActionError("Please upload a photo of the question.");
      return;
    }
    setActionError(null);
    try {
      await onCreateQuestionCard(questionNumber, {
        promptText,
        promptImageId,
      });
      moveToStep(slowRight ? "approach" : "solution");
    } catch (error) {
      showError(error, "Could not save this question.");
    }
  }

  async function submitApproach(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!questionNumber || !hasQuestionCapture) return;
    const form = new FormData(event.currentTarget);
    const solutionImageIds = form.getAll("solutionImageIds").map(String).filter(Boolean);
    const solutionText = String(form.get("solutionText") ?? "").trim() || undefined;

    if (solutionImageIds.length === 0 && !solutionText) {
      setActionError("Add the smarter method as text or an image.");
      return;
    }

    setActionError(null);
    try {
      await onSaveSmarterApproach(questionNumber, {
        solutionText,
        solutionImageId: solutionImageIds[0],
        solutionImageIds,
      });
      moveToStep("difficulty");
    } catch (error) {
      showError(error, "Could not save this approach.");
    }
  }

  async function submitSolution(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!questionNumber || !hasQuestionCapture) return;
    const form = new FormData(event.currentTarget);
    const solutionImageIds = form.getAll("solutionImageIds").map(String).filter(Boolean);
    const solutionText = String(form.get("solutionText") ?? "").trim() || undefined;

    if (solutionImageIds.length === 0 && !solutionText) {
      setActionError("Please upload a photo of the correct solution or add a note.");
      return;
    }

    setActionError(null);
    try {
      await onSaveSolution(questionNumber, {
        solutionText,
        solutionImageId: solutionImageIds[0],
        solutionImageIds,
      });
      moveToStep("difficulty");
    } catch (error) {
      showError(error, "Could not save the solution.");
    }
  }

  async function saveDifficulty(difficulty: QuestionDifficulty) {
    if (!questionNumber) return;
    if (feedback?.difficulty) {
      if (feedback.difficulty !== difficulty) {
        setActionError("Intrinsic difficulty is fixed once selected.");
        return;
      }
      moveToStep("topics");
      return;
    }
    setActionError(null);
    try {
      await onSaveDifficulty(questionNumber, difficulty);
      moveToStep("topics");
    } catch (error) {
      showError(error, "Could not save question difficulty.");
    }
  }

  async function submitFact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!questionNumber) return;
    const form = new FormData(event.currentTarget);
    const promptImageId = String(form.get("promptImageId") ?? "") || undefined;
    const contentImageId = String(form.get("contentImageId") ?? "") || undefined;
    const promptText = String(form.get("promptText") ?? "").trim();
    const contentText = String(form.get("contentText") ?? "").trim();
    if (!promptText && !promptImageId) {
      setActionError("Add text or an image for the fact-card front.");
      return;
    }
    if (!contentText && !contentImageId) {
      setActionError("Add text or an image for the fact-card back.");
      return;
    }
    setActionError(null);
    try {
      await onCreateFactCard(questionNumber, {
        kind: String(form.get("kind")) as FactCardInput["kind"],
        promptText: String(form.get("promptText") ?? ""),
        promptImageId: String(form.get("promptImageId") ?? "") || undefined,
        contentText: String(form.get("contentText") ?? ""),
        contentImageId: String(form.get("contentImageId") ?? "") || undefined,
        wrongBelief: String(form.get("wrongBelief") ?? ""),
      });
      setShowFactForm(false);
      moveToStep("complete");
    } catch (error) {
      showError(error, "Could not save the fact card.");
    }
  }

  async function useFact(card: FactCard) {
    if (!questionNumber) return;
    setActionError(null);
    try {
      await onUseFactCard(questionNumber, card);
      moveToStep("complete");
    } catch (error) {
      showError(error, "Could not link the fact card.");
    }
  }

  function renderTopicSelector(label: string) {
    if (!feedback || !questionNumber) return null;
    return (
      <div className="topic-entry">
        <SearchSelect
          label={label}
          value=""
          showAllOnFocus
          options={(chapter?.topics ?? [])
            .filter(
              (topic) =>
                !feedback.topics.some((selected) => selected.id === topic.id),
            )
            .map((topic) => ({ id: topic.id, label: topic.name }))}
          placeholder="Search topics in this chapter"
          emptyMessage="No topics match. Try another search."
          onChange={(topicId) => onAddTopic(questionNumber, topicId)}
        />
        {feedback.topics.length > 0 && (
          <ul className="topic-chips">
            {feedback.topics.map((topic) => (
              <li key={topic.id}>
                {topic.name}
                <button
                  type="button"
                  aria-label={`Remove ${topic.name}`}
                  onClick={() => onRemoveTopic(questionNumber, topic.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  function renderSolutionImageInputs(label: string) {
    return (
      <div className="solution-image-list">
        {Array.from({ length: solutionImageCount }, (_, index) => (
          <ImageInput
            key={`${questionNumber}-${label}-${index}`}
            label={`${label} ${index + 1}`}
            name="solutionImageIds"
            ownerUserId={userId}
            onUploadComplete={onImageUploadComplete}
            value={questionCard?.solutionImageIds?.[index] ?? feedback?.questionDraft?.solutionImageIds?.[index] ?? (index === 0 ? questionCard?.solutionImageId ?? feedback?.questionDraft?.solutionImageId : undefined)}
          />
        ))}
        <button className="account-secondary-button" type="button" onClick={() => setSolutionImageCount((count) => count + 1)}>
          Add another solution image
        </button>
      </div>
    );
  }
  const questionCaptureNeeded =
    session.sessionKind === "practice" &&
    !!feedback &&
    ((feedback.result !== null && feedback.result !== "right" && feedback.result !== "wrong_question" && !feedback.questionId) ||
      (slowRight &&
        feedback.smarterApproach === "found" &&
        !feedback.questionId));

  const approachCaptureNeeded =
    slowRight &&
    feedback?.smarterApproach === "found" &&
    hasQuestionCapture;

  return (
    <main className="feedback-shell">
      <section className="feedback-page" aria-labelledby="feedback-title">
        {persistenceError && <p className="database-error" role="alert">{persistenceError}</p>}
        <header className="feedback-header">
          <div>
            <p className="eyebrow">SESSION REVIEW</p>
            <h1 id="feedback-title">{chapter?.name}</h1>
            <p className="feedback-subtitle">
              One question at a time. One task at a time.
            </p>
          </div>
          <p className="feedback-active-time">
            Active time <strong>{formatStopwatch(activeTimeMs)}</strong>
          </p>
        </header>

        {questionNumbers.length === 0 || !feedback || !questionNumber ? (
          <>
            <p className="empty-feedback">No questions were timed in this session.</p>
            <section className="feedback-footer feedback-sequential-footer">
              <button
                className="account-secondary-button"
                type="button"
                onClick={() => void onSave()}
                disabled={isSaving}
              >
                Finish session
              </button>
              <button
                className="start-button"
                type="button"
                onClick={() => {
                  setActionError(null);
                  setShowFactForm(false);
                  setCurrentIndex(0);
                }}
                disabled={isSaving}
              >
                Discard session
              </button>
            </section>
          </>
        ) : (
          <>
            <div className="feedback-progress" aria-live="polite">
              <span>Question {currentIndex + 1} of {questionNumbers.length}</span>
              <span>{formatStopwatch(timeMs)} solving time</span>
              <div
                className="feedback-progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={questionNumbers.length}
                aria-valuenow={currentIndex + 1}
              >
                <span style={{ width: `${((currentIndex + 1) / questionNumbers.length) * 100}%` }} />
              </div>
            </div>

            <article className="feedback-question feedback-question-focused">
              <div className="feedback-question-heading">
                <h2>Q{questionNumber}</h2>
                <span>{formatStopwatch(timeMs)}</span>
              </div>

              <section
                className="feedback-step-panel"
                key={`${questionNumber}-${step}`}
                data-direction={slideDirection}
                aria-live="polite"
              >
                {step !== "result" && (
                  <div className="feedback-step-toolbar">
                    <button
                      className="feedback-back-button"
                      type="button"
                      onClick={goBackOneStep}
                      disabled={!previousStep}
                    >
                      <span aria-hidden="true">←</span> Back
                    </button>
                    <span className="feedback-step-badge">
                      {getStepTitle(step, slowRight, feedback)}
                    </span>
                  </div>
                )}

                {step === "result" && (
                  <fieldset className="feedback-step">
                    <legend>How did it go?</legend>
                    <div className="result-options" role="group" aria-label={`Result for question ${questionNumber}`}>
                      {(
                        [
                          ["right", "Got it right"],
                          ["wrong", "Got it wrong"],
                          ["couldnt_solve", "Couldn’t solve"],
                          ["wrong_question", "Wrong question"],
                        ] as const
                      ).map(([result, label]) => (
                        <button
                          className={feedback.result === result ? "result-option selected" : "result-option"}
                          key={result}
                          type="button"
                          aria-pressed={feedback.result === result}
                          onClick={() => {
                            setActionError(null);
                            onSetQuestionResult(questionNumber, result);
                            const nextStep = getStepAfterResult(
                              result,
                              result === "right" &&
                                isSlowRightAttempt(result, timeMs),
                              !!feedback.questionId,
                              session.sessionKind,
                            );
                            setSlideDirection("forward");
                            setFlowSteps((current) => ({
                              ...current,
                              [questionNumber]: {
                                current: nextStep,
                                previous: ["result"],
                              },
                            }));
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}

                {step === "reflection" && slowRight && (
                  <section className="feedback-step smarter-approach-prompt">
                    <p className="eyebrow">A MOMENT TO REFLECT</p>
                    <h3>You spent {formatStopwatch(timeMs)} on this question.</h3>
                    <p>
                      Try to find a smarter, shorter approach. Did you find one worth saving?
                    </p>
                    <div className="result-options" role="group" aria-label="Did you find a smarter approach?">
                      <button
                        className={feedback.smarterApproach === "found" ? "result-option selected" : "result-option"}
                        type="button"
                        aria-pressed={feedback.smarterApproach === "found"}
                        onClick={() => {
                          onSetSmarterApproach(questionNumber, "found");
                          moveToStep(
                            feedback.questionId ? "approach" : "question",
                          );
                        }}
                      >
                        Yes, save my approach
                      </button>
                      <button
                        className={feedback.smarterApproach === "not_found" ? "result-option selected" : "result-option"}
                        type="button"
                        aria-pressed={feedback.smarterApproach === "not_found"}
                        onClick={() => {
                          onSetSmarterApproach(questionNumber, "not_found");
                          moveToStep("complete");
                        }}
                      >
                        Not this time
                      </button>
                    </div>
                  </section>
                )}

                {step === "question" && questionCaptureNeeded && (
                  <section className="feedback-step question-capture-step">
                    <h3>Upload question photo</h3>
                    <p>
                      {slowRight && feedback.smarterApproach === "found"
                        ? "Take or choose a clear photo of the question. Next, you'll attach topics and your smarter solution."
                        : "Take or choose a clear photo of the question so you can review it later."}
                    </p>
                    <form className="inline-card-form" onSubmit={(event) => void submitQuestionCapture(event)}>
                      <ImageInput label="Question photo" name="promptImageId" ownerUserId={userId} onUploadComplete={onImageUploadComplete} value={feedback.questionDraft?.promptImageId} required />
                      <label>
                        Question label
                        <textarea
                          name="promptText"
                          rows={2}
                          defaultValue={feedback.questionDraft?.promptText ?? ""}
                          placeholder="Optional short label to help identify this question"
                        />
                      </label>
                      <button className="account-action-button" type="submit">
                        Save question photo & continue →
                      </button>
                    </form>
                    {session.sessionKind !== "practice" && (
                      <p className="account-note">New question cards can only be created from practice feedback.</p>
                    )}
                  </section>
                )}

                {step === "question" && feedback.questionId && (
                  <section className="feedback-step question-capture-step">
                    <h3>Question photo saved</h3>
                    {questionCard?.promptImageId && (
                      <CardImage imageId={questionCard.promptImageId} alt="Saved question" />
                    )}
                    {questionCard?.promptText && <p className="saved-prompt-text">{questionCard.promptText}</p>}
                    <button
                      className="account-action-button"
                      type="button"
                      onClick={() => moveToStep("topics")}
                    >
                      Continue to topics →
                    </button>
                  </section>
                )}

                {step === "topics" && (
                  <section className="feedback-step feedback-topics-step">
                    <h3>Attach topics</h3>
                    <p>
                      Which topics in <strong>{chapter?.name}</strong> does this question cover?
                    </p>

                    {(questionCard || feedback?.questionDraft) && (
                      <div className="feedback-mini-preview">
                        {(questionCard?.promptImageId ?? feedback?.questionDraft?.promptImageId) && (
                          <div className="mini-preview-thumb">
                            <CardImage imageId={(questionCard?.promptImageId ?? feedback?.questionDraft?.promptImageId)!} alt="Question preview" />
                          </div>
                        )}
                        <div className="mini-preview-info">
                          <span className="mini-preview-tag">Question saved</span>
                          {(questionCard?.promptText ?? feedback?.questionDraft?.promptText) && (
                            <span className="mini-preview-text">{questionCard?.promptText ?? feedback?.questionDraft?.promptText}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {renderTopicSelector("Select topics")}

                    <button
                      className="account-action-button"
                      type="button"
                      onClick={() => {
                        setActionError(null);
                        if (slowRight && feedback.smarterApproach === "found") {
                          moveToStep("complete");
                        } else if (feedback.result !== "right" && feedback.cause === "missing_fact") {
                          moveToStep("fact");
                        } else {
                          moveToStep("complete");
                        }
                      }}
                    >
                      {slowRight && feedback.smarterApproach === "found"
                        ? "Finish feedback →"
                        : feedback.result !== "right"
                          ? "Continue →"
                          : "Finish question feedback →"}
                    </button>
                  </section>
                )}

                {step === "approach" && approachCaptureNeeded && (
                  <section className="feedback-step approach-capture-step">
                    <h3>Upload smarter solution</h3>
                    <p>
                      Capture the shorter method, trick, or shortcut you found.
                    </p>
                    <form className="inline-card-form" onSubmit={(event) => void submitApproach(event)}>
                      {renderSolutionImageInputs("Smarter method image")}
                      <label>
                        Key trick or approach note <span className="optional-label">optional</span>
                        <textarea
                          name="solutionText"
                          rows={2}
                          placeholder="What makes this method shorter or smarter?"
                        />
                      </label>
                      <button className="account-action-button" type="submit">
                        Save smarter approach & finish ✓
                      </button>
                    </form>
                  </section>
                )}

                {step === "solution" && (
                  <section className="feedback-step solution-capture-step">
                    <h3>Upload correct solution</h3>
                    <p>
                      Capture the textbook, coaching, or handwritten solution so you can review how to solve it later.
                    </p>

                    {questionCard && (
                      <div className="feedback-mini-preview">
                        {questionCard.promptImageId && (
                          <div className="mini-preview-thumb">
                            <CardImage imageId={questionCard.promptImageId} alt="Question preview" />
                          </div>
                        )}
                        <div className="mini-preview-info">
                          <span className="mini-preview-tag">Question</span>
                          {questionCard.promptText && (
                            <span className="mini-preview-text">{questionCard.promptText}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {(questionCard?.solutionImageIds?.length || questionCard?.solutionImageId || feedback?.questionDraft?.solutionImageIds?.length || feedback?.questionDraft?.solutionImageId) && (
                      <div className="feedback-mini-preview" style={{ marginTop: "0.5rem" }}>
                        {(questionCard?.solutionImageIds ?? feedback?.questionDraft?.solutionImageIds ?? [questionCard?.solutionImageId ?? feedback?.questionDraft?.solutionImageId!]).map((imageId, index) => (
                          <div className="mini-preview-thumb" key={imageId}>
                            <CardImage imageId={imageId} alt={`Attached solution ${index + 1}`} />
                          </div>
                        ))}
                        <div className="mini-preview-info">
                          <span className="mini-preview-tag">Current solution images</span>
                          {(questionCard?.solutionText ?? feedback?.questionDraft?.solutionText) && <span className="mini-preview-text">{questionCard?.solutionText ?? feedback?.questionDraft?.solutionText}</span>}
                        </div>
                      </div>
                    )}

                    <form className="inline-card-form" onSubmit={(event) => void submitSolution(event)}>
                      {renderSolutionImageInputs("Solution image")}
                      <label>
                        Solution note <span className="optional-label">optional</span>
                        <textarea
                          name="solutionText"
                          rows={2}
                          defaultValue={questionCard?.solutionText ?? feedback?.questionDraft?.solutionText ?? ""}
                          placeholder="Key formula, formula steps, or method notes (optional)"
                        />
                      </label>
                      <button className="account-action-button" type="submit">
                        Save solution & continue →
                      </button>
                    </form>

                    
                  </section>
                )}

                {step === "difficulty" && (
                  <section className="feedback-step difficulty-step">
                    <h3>How difficult was this question intrinsically?</h3>
                    <p>Classify the question itself, not how difficult it felt to you today.</p>
                    <div className="result-options" role="group" aria-label="Intrinsic question difficulty">
                      {(["easy", "medium", "hard"] as const).map((difficulty) => (
                        <button
                          className={feedback.difficulty === difficulty ? "result-option selected" : "result-option"}
                          key={difficulty}
                          type="button"
                          aria-pressed={feedback.difficulty === difficulty}
                          onClick={() => void saveDifficulty(difficulty)}
                        >
                          {difficulty[0].toUpperCase() + difficulty.slice(1)}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {step === "cause" && (
                  <section className="feedback-step feedback-cause-fields">
                    <h3>What made it difficult?</h3>
                    <p>Choose the main reason for this attempt.</p>
                    <div className="cause-options" role="group" aria-label={`Cause for question ${questionNumber}`}>
                      {CAUSE_OPTIONS.filter(({ value }) => feedback.result !== "couldnt_solve" || value !== "slip").map(({ value, label }) => (
                        <button
                          className={feedback.cause === value ? "cause-option selected" : "cause-option"}
                          key={value}
                          type="button"
                          aria-pressed={feedback.cause === value}
                          onClick={() => {
                            setActionError(null);
                            onSetCause(questionNumber, value);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      className="account-action-button"
                      type="button"
                      disabled={!feedback.cause}
                      onClick={() => {
                        if (!feedback.cause) return;
                        moveToStep(getStepAfterCause(feedback.cause, feedback.topics.length));
                      }}
                    >
                      Continue →
                    </button>
                  </section>
                )}

                {step === "slip" && (
                  <section className="feedback-step">
                    <h3>What kind of slip happened?</h3>
                    <p>This is optional; choose one if it helps explain the mistake.</p>
                    <div className="cause-options slip-options" role="group" aria-label={`Slip type for question ${questionNumber}`}>
                      {SLIP_SUBTYPE_OPTIONS.map(({ value, label }) => (
                        <button
                          className={feedback.slipSubtype === value ? "cause-option selected" : "cause-option"}
                          key={value}
                          type="button"
                          aria-pressed={feedback.slipSubtype === value}
                          onClick={() =>
                            onSetSlipSubtype(
                              questionNumber,
                              feedback.slipSubtype === value ? null : value,
                            )
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      className="account-action-button"
                      type="button"
                      onClick={() => moveToStep("question")}
                    >
                      Continue to question photo →
                    </button>
                  </section>
                )}

                {step === "fact" && (
                  <section className="feedback-step feedback-fact-step">
                    <h3>Resolve the forgotten fact or formula</h3>
                    <p>This was caused by a forgotten fact or formula. Link an existing fact card or create one before finishing.</p>

                    {linkedFacts.length > 0 && (
                      <div className="linked-facts-list">
                        {linkedFacts.map((fact) => (
                          <p className="attempt-card-status linked-fact-item" key={fact.id}>
                            <span>Linked: <strong>{fact.promptText || fact.contentText || "Photo fact card"}</strong></span>
                            <button
                              className="account-secondary-button linked-fact-remove"
                              type="button"
                              aria-label={`Unlink ${fact.promptText || fact.contentText || "fact card"}`}
                              title="Unlink fact card"
                              onClick={() => {
                                void onUnlinkFactCard(questionNumber, fact.id).catch((error) =>
                                  showError(error, "Could not unlink this fact card."),
                                );
                              }}
                            >
                              ×
                            </button>
                          </p>
                        ))}
                      </div>
                    )}

                    <div className="fact-step-options">
                      <div className="fact-existing-choice">
                        <h4>Link an existing fact</h4>
                        <p>Search your saved fact cards, including cards from other chapters.</p>
                        <CardPicker
                          label="Search fact cards"
                          options={relatedFacts.map((fact) => ({
                            id: fact.id,
                            label: fact.promptText || fact.contentText || "Photo fact card",
                            detail: [
                              fact.kind,
                              fact.chapterId === session.chapterId ? "Current chapter" : fact.chapterId,
                            ].join(" · "),
                          }))}
                          placeholder="Type a formula, fact, or keyword"
                          onSelect={(option) => {
                            const fact = facts.find((item) => item.id === option.id);
                            if (fact) void useFact(fact);
                          }}
                        />
                      </div>
                      <button
                        className="account-secondary-button"
                        type="button"
                        aria-expanded={showFactForm}
                        onClick={() => setShowFactForm((visible) => !visible)}
                      >
                        {showFactForm
                          ? "Cancel creating a fact"
                          : linkedFacts.length > 0
                            ? "Or create another fact card"
                            : "Or create a new fact card"}
                      </button>
                    </div>

                    {showFactForm && (
                      <form className="inline-card-form" onSubmit={(event) => void submitFact(event)}>
                        <label>
                          Card type
                          <select name="kind" defaultValue={feedback.cause === "wrong_concept" ? "misconception" : "fact"}>
                            <option value="fact">Fact</option>
                            <option value="formula">Formula</option>
                            <option value="reaction">Reaction</option>
                            <option value="misconception">Misconception</option>
                            <option value="trap">Trap</option>
                          </select>
                        </label>
                        <ImageInput label="Recall prompt photo" name="promptImageId" ownerUserId={userId} onUploadComplete={onImageUploadComplete} />
                        <label>
                          Fact label
                          <textarea name="promptText" rows={2} placeholder="Optional text on the recall prompt" />
                        </label>
                        <ImageInput label="Answer / fact photo" name="contentImageId" ownerUserId={userId} onUploadComplete={onImageUploadComplete} />
                        <label>
                          Answer / fact text <span className="optional-label">optional</span>
                          <textarea name="contentText" rows={2} placeholder="The fact, formula, or correction" />
                        </label>
                        {feedback.cause === "wrong_concept" && (
                          <label>
                            What I wrongly believed <span className="optional-label">optional</span>
                            <textarea name="wrongBelief" rows={2} />
                          </label>
                        )}
                        <div className="form-button-row">
                          <button className="account-action-button" type="submit">
                            {feedback.questionId ? "Save and link fact card" : "Save fact card; link on session save"}
                          </button>
                          <button
                            className="account-secondary-button"
                            type="button"
                            onClick={() => setShowFactForm(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </section>
                )}

                {step === "complete" && (
                  <section className="feedback-step feedback-complete-step">
                    <div className="feedback-complete-header">
                      <span className="saved-step-check" aria-hidden="true">✓</span>
                      <div>
                        <h3>Question feedback complete</h3>
                        <p>
                          {feedback.result === "right"
                            ? feedback.smarterApproach === "found"
                              ? "Your question and smarter approach are saved."
                              : "Your result is recorded."
                            : feedback.result === "wrong_question"
                              ? "This question was invalid; no diagnosis or question card was created."
                              : "Your question, topics, and diagnosis are recorded."}
                        </p>
                      </div>
                    </div>

                    <div className="feedback-summary-badges">
                      <span className={`summary-result-badge result-${feedback.result}`}>
                        {feedback.result === "right" && "Got it right"}
                        {feedback.result === "wrong" && "Got it wrong"}
                        {feedback.result === "couldnt_solve" && "Couldn’t solve"}
                        {feedback.result === "wrong_question" && "Wrong question"}
                      </span>

                      {feedback.cause && (
                        <span className="summary-cause-badge">
                          Cause: {getCauseLabel(feedback.cause)}
                        </span>
                      )}

                      {feedback.slipSubtype && (
                        <span className="summary-slip-badge">
                          Slip: {feedback.slipSubtype}
                        </span>
                      )}

                      {feedback.smarterApproachSaved && (
                        <span className="summary-approach-badge">
                          Smarter approach saved
                        </span>
                      )}

                      {(feedback.solutionSaved || questionCard?.solutionImageId) && (
                        <span className="summary-approach-badge">
                          Solution saved
                        </span>
                      )}
                    </div>

                    {questionCard?.promptImageId && (
                      <div className="feedback-complete-previews">
                        <div className="complete-preview-item">
                          <span className="preview-label">Question:</span>
                          <CardImage imageId={questionCard.promptImageId} alt="Question" />
                        </div>
                        {questionCard.solutionImageId && (
                          <div className="complete-preview-item">
                            <span className="preview-label">Solution:</span>
                            <CardImage imageId={questionCard.solutionImageId} alt="Solution" />
                          </div>
                        )}
                        {questionCard.smarterApproachImageId && (
                          <div className="complete-preview-item">
                            <span className="preview-label">Smarter approach:</span>
                            <CardImage imageId={questionCard.smarterApproachImageId} alt="Smarter approach" />
                          </div>
                        )}
                      </div>
                    )}

                    {feedback.topics.length > 0 && (
                      <div className="feedback-complete-topics">
                        <strong>Topics:</strong>
                        <ul className="topic-chips">
                          {feedback.topics.map((topic) => (
                            <li key={topic.id}>{topic.name}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {linkedFacts.length > 0 && (
                      <div className="feedback-complete-facts">
                        <strong>Linked memory cue:</strong>
                        {linkedFacts.map((fact) => (
                          <p key={fact.id} className="attempt-card-status">
                            {fact.promptText || fact.contentText || "Fact card"}
                          </p>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {actionError && <p className="database-error" role="alert">{actionError}</p>}
                {validationErrors.length > 0 &&
                  step === "complete" && (
                    <p className="feedback-guidance">{validationErrors[0]}</p>
                  )}
              </section>
            </article>

            {feedbackDeadlineAt !== undefined && <p className="study-interval-help" role="note">Submit this feedback by {new Date(feedbackDeadlineAt).toLocaleString()}. Unsubmitted feedback is discarded after the deadline; independently saved fact cards are kept.</p>}
            <footer className="feedback-footer feedback-sequential-footer">
              <button
                className="account-secondary-button"
                type="button"
                disabled={currentIndex === 0 || !questionComplete || step !== "complete"}
                onClick={() => {
                  setActionError(null);
                  setShowFactForm(false);
                  setCurrentIndex((index) => Math.max(0, index - 1));
                }}
              >
                Previous
              </button>
              {currentIndex < questionNumbers.length - 1 ? (
                <button
                  className="start-button"
                  type="button"
                  disabled={!questionComplete || step !== "complete"}
                  onClick={() => {
                    setActionError(null);
                    setShowFactForm(false);
                    setCurrentIndex((index) => Math.min(questionNumbers.length - 1, index + 1));
                  }}
                >
                  Next question
                </button>
              ) : (
                <button
                  className="start-button"
                  type="button"
                  onClick={onSave}
                  disabled={!allComplete || step !== "complete" || isSaving}
                >
                  {isSaving ? "Saving session…" : "Save session"}
                </button>
              )}
            </footer>
          </>
        )}
        {saveError && <p className="database-error" role="alert">{saveError}</p>}
      </section>
    </main>
  );
}
