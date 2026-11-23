import { useMemo, useState } from "react";
import { getChapter, jeeSyllabus } from "../../syllabus";
import SearchSelect from "../../SearchSelect";
import ImageInput from "../images/ImageInput";
import CardPicker from "./CardPicker";
import type { FactCard, FactCardInput, FactCardKind } from "./types";

type Props = {
  userId?: string;
  onImageUploadComplete: () => void;
  initialSubjectId?: string;
  initialChapterId?: string;
  activeQuestions: Array<{ id: string; promptText: string; chapterId: string }>;
  onCreate: (input: FactCardInput) => Promise<FactCard>;
  onCreateLinked: (
    input: FactCardInput,
    questionId: string,
  ) => Promise<FactCard>;
  onDone: (card: FactCard) => void;
  onError: (message: string) => void;
};

const KINDS: FactCardKind[] = ["fact", "formula", "reaction", "misconception", "trap"];

type Step =
  | "subject"
  | "chapter"
  | "topics"
  | "kind"
  | "prompt"
  | "answer"
  | "belief"
  | "link";

export default function FactCardCreator({
  userId,
  onImageUploadComplete,
  initialSubjectId,
  initialChapterId,
  activeQuestions,
  onCreate,
  onCreateLinked,
  onDone,
  onError,
}: Props) {
  const [step, setStep] = useState<Step>("subject");
  const [subjectId, setSubjectId] = useState(
    initialSubjectId || jeeSyllabus.subjects[0].id,
  );
  const [chapterId, setChapterId] = useState(initialChapterId || "");
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [kind, setKind] = useState<FactCardKind>("fact");
  const [promptImageId, setPromptImageId] = useState<string | undefined>();
  const [promptText, setPromptText] = useState("");
  const [contentImageId, setContentImageId] = useState<string | undefined>();
  const [contentText, setContentText] = useState("");
  const [wrongBelief, setWrongBelief] = useState("");
  const [linkedQuestionId, setLinkedQuestionId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  const chapter = getChapter(subjectId, chapterId);
  const topics = chapter?.topics ?? [];
  const wizardSteps: Step[] = [
    "subject",
    "chapter",
    "topics",
    "kind",
    "prompt",
    "answer",
    ...(kind === "misconception" ? ["belief" as const] : []),
    "link",
  ];
  const stepNumber = Math.max(1, wizardSteps.indexOf(step) + 1);

  const candidateQuestions = useMemo(
    () => {
      const inChapter = activeQuestions.filter(
        (question) => question.chapterId === chapterId,
      );
      return (inChapter.length > 0 ? inChapter : activeQuestions).map((question) => ({
          id: question.id,
          label: question.promptText || "Photo question",
          detail: question.chapterId === chapterId ? "This chapter" : question.chapterId,
        }));
    },
    [activeQuestions, chapterId],
  );

  const allQuestionOptions = useMemo(
    () =>
      activeQuestions.map((question) => ({
        id: question.id,
        label: question.promptText || "Photo question",
        detail: question.chapterId === chapterId ? "This chapter" : question.chapterId,
      })),
    [activeQuestions, chapterId],
  );

  function go(next: Step, dir: "forward" | "back" = "forward") {
    setDirection(dir);
    setStep(next);
  }

  async function submit() {
    setIsSaving(true);
    try {
      const input: FactCardInput = {
        subjectId,
        chapterId,
        topicIds,
        kind,
        promptText: promptText.trim(),
        promptImageId,
        contentText: contentText.trim(),
        contentImageId,
        wrongBelief: wrongBelief.trim() || undefined,
      };
      const card = linkedQuestionId
        ? await onCreateLinked(input, linkedQuestionId)
        : await onCreate(input);
      onDone(card);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save this fact card.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fact-wizard">
      <p className="eyebrow">
        NEW FACT CARD · STEP {stepNumber} OF {wizardSteps.length}
      </p>
      <div
        className="fact-wizard-progress"
        role="progressbar"
        aria-label="Fact card creation progress"
        aria-valuemin={1}
        aria-valuemax={wizardSteps.length}
        aria-valuenow={stepNumber}
      >
        <span style={{ width: `${(stepNumber / wizardSteps.length) * 100}%` }} />
      </div>
      <div className="feedback-step-panel" key={step} data-direction={direction}>
      {step === "subject" && (
        <section className="feedback-step">
          <h3>Which subject?</h3>
          <SearchSelect
            label="Subject"
            value={subjectId}
            options={jeeSyllabus.subjects.map((subject) => ({ id: subject.id, label: subject.name }))}
            placeholder="Search subjects"
            emptyMessage="No subjects match."
            onChange={(id) => {
              setSubjectId(id);
              setChapterId("");
              setTopicIds([]);
            }}
          />
          <button
            className="account-action-button"
            type="button"
            onClick={() => go("chapter")}
          >
            Continue →
          </button>
        </section>
      )}

      {step === "chapter" && (
        <section className="feedback-step">
          <h3>Which chapter?</h3>
          <SearchSelect
            label="Chapter"
            value={chapterId}
            options={(jeeSyllabus.subjects.find((s) => s.id === subjectId)?.chapters ?? []).map((ch) => ({ id: ch.id, label: ch.name }))}
            placeholder="Search chapters"
            emptyMessage="No chapters match."
            onChange={(id) => {
              setChapterId(id);
              setTopicIds([]);
            }}
          />
          <div className="form-button-row">
            <button
              className="account-secondary-button"
              type="button"
              onClick={() => go("subject", "back")}
            >
              ← Back
            </button>
            <button
              className="account-action-button"
              type="button"
              disabled={!chapterId}
              onClick={() => go("topics")}
            >
              Continue →
            </button>
          </div>
        </section>
      )}

      {step === "topics" && (
        <section className="feedback-step">
          <h3>Which topics does this fact cover?</h3>
          <p>Optional. Add any topics that will help you find this card later.</p>
          {chapter && (
            <div className="topic-chips-picker">
              <SearchSelect
                label="Add topic"
                value=""
                options={topics
                  .filter((t) => !topicIds.includes(t.id))
                  .map((t) => ({ id: t.id, label: t.name }))}
                placeholder="Search topics"
                emptyMessage="No topics match."
                onChange={(id) => {
                  if (id && !topicIds.includes(id)) setTopicIds([...topicIds, id]);
                }}
              />
              {topicIds.length > 0 && (
                <ul className="topic-chips">
                  {topicIds.map((id) => {
                    const topic = topics.find((t) => t.id === id);
                    return (
                      <li key={id}>
                        {topic?.name ?? id}
                        <button type="button" aria-label={`Remove ${topic?.name ?? id}`} onClick={() => setTopicIds(topicIds.filter((t) => t !== id))}>×</button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          <div className="form-button-row">
            <button
              className="account-secondary-button"
              type="button"
              onClick={() => go("chapter", "back")}
            >
              ← Back
            </button>
            <button
              className="account-action-button"
              type="button"
              onClick={() => go("kind")}
            >
              Continue →
            </button>
          </div>
        </section>
      )}

      {step === "kind" && (
        <section className="feedback-step">
          <h3>What kind of card is this?</h3>
          <div className="result-options" role="group" aria-label="Card type">
            {KINDS.map((value) => (
              <button
                key={value}
                type="button"
                className={kind === value ? "result-option selected" : "result-option"}
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="form-button-row">
            <button
              className="account-secondary-button"
              type="button"
              onClick={() => go("topics", "back")}
            >
              ← Back
            </button>
            <button
              className="account-action-button"
              type="button"
              onClick={() => go("prompt")}
            >
              Continue →
            </button>
          </div>
        </section>
      )}

      {step === "prompt" && (
        <section className="feedback-step">
          <h3>What should you recall?</h3>
          <p>Add a photo of the prompt. A text label is optional.</p>
          <ImageInput
            label="Recall prompt photo"
            name="promptImageId"
            value={promptImageId}
            ownerUserId={userId}
            onUploadComplete={onImageUploadComplete}
            onChange={(id) => setPromptImageId(id)}
            required
          />
          <label>
            Prompt label <span className="optional-label">optional</span>
            <input
              type="text"
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              placeholder="Short label for searching this fact"
            />
          </label>
          <div className="form-button-row">
            <button
              className="account-secondary-button"
              type="button"
              onClick={() => go("kind", "back")}
            >
              ← Back
            </button>
            <button
              className="account-action-button"
              type="button"
              disabled={!promptImageId}
              onClick={() => go("answer")}
            >
              Continue →
            </button>
          </div>
        </section>
      )}

      {step === "answer" && (
        <section className="feedback-step">
          <h3>What is the answer?</h3>
          <p>Upload a photo of the answer or fact, and optional notes.</p>
          <ImageInput
            label="Answer / fact photo"
            name="contentImageId"
            value={contentImageId}
            ownerUserId={userId}
            onChange={(id) => setContentImageId(id)}
            required
          />
          <label>
            Answer text <span className="optional-label">optional</span>
            <textarea
              rows={3}
              value={contentText}
              onChange={(event) => setContentText(event.target.value)}
              placeholder="The fact, formula, or correction"
            />
          </label>
          <div className="form-button-row">
            <button
              className="account-secondary-button"
              type="button"
              onClick={() => go("prompt", "back")}
            >
              ← Back
            </button>
            <button
              className="account-action-button"
              type="button"
              disabled={!contentImageId}
              onClick={() =>
                go(kind === "misconception" ? "belief" : "link")
              }
            >
              Continue →
            </button>
          </div>
        </section>
      )}

      {step === "belief" && (
        <section className="feedback-step">
          <h3>What did you wrongly believe? (optional)</h3>
          <label>
            Wrong belief
            <textarea
              rows={2}
              value={wrongBelief}
              onChange={(event) => setWrongBelief(event.target.value)}
              placeholder="What you thought before learning this"
            />
          </label>
          <div className="form-button-row">
            <button
              className="account-secondary-button"
              type="button"
              onClick={() => go("answer", "back")}
            >
              ← Back
            </button>
            <button
              className="account-action-button"
              type="button"
              onClick={() => go("link")}
            >
              Continue →
            </button>
          </div>
        </section>
      )}

      {step === "link" && (
        <section className="feedback-step">
          <h3>Link to a question card? (optional)</h3>
          <p>Pre-filtered to this chapter first. Search by label.</p>
          <CardPicker
            label="Link existing question card"
            options={
              candidateQuestions.length > 0
                ? candidateQuestions
                : allQuestionOptions
            }
            placeholder="Search question cards"
            onSelect={(option) => setLinkedQuestionId(option.id)}
          />
          {linkedQuestionId && (
            <p className="attempt-card-status">
              Selected:{" "}
              {allQuestionOptions.find((q) => q.id === linkedQuestionId)?.label}
            </p>
          )}
          <div className="form-button-row">
            <button
              className="account-secondary-button"
              type="button"
              onClick={() => go(kind === "misconception" ? "belief" : "answer", "back")}
            >
              ← Back
            </button>
            <button
              className="account-action-button"
              type="button"
              disabled={isSaving}
              onClick={() => void submit()}
            >
              {isSaving ? "Saving…" : "Save fact card ✓"}
            </button>
          </div>
          <button
            className="account-secondary-button"
            type="button"
            style={{ marginTop: "0.5rem", width: "100%" }}
            onClick={() => {
              setLinkedQuestionId("");
              void submit();
            }}
            disabled={isSaving}
          >
            Skip linking and save
          </button>
        </section>
      )}
      </div>
    </div>
  );
}
