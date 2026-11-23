import { useMemo, useState } from "react";
import { getChapter, jeeSyllabus } from "../../syllabus";
import { getCauseLabel, type Cause } from "../../lib/causes";
import CardPicker from "./CardPicker";
import ImageInput from "../images/ImageInput";
import SearchSelect from "../../SearchSelect";
import CardImage from "../images/CardImage";
import FactCardCreator from "./FactCardCreator";
import MainNavigation from "../navigation/MainNavigation";
import type { AttemptRecord } from "../../database";
import type {
  FactCard,
  FactCardInput,
  FactCardKind,
  FactReviewRecord,
  QuestionCard,
  QuestionCardInput,
  QuestionFactLink,
} from "./types";

type Props = {
  questions: QuestionCard[];
  facts: FactCard[];
  links: QuestionFactLink[];
  reviews: FactReviewRecord[];
  attempts: AttemptRecord[];
  userId?: string;
  syncError: string | null;
  onCreateFact: (input: FactCardInput) => Promise<FactCard>;
  onCreateLinkedFact: (input: FactCardInput, questionId: string) => Promise<FactCard>;
  onUpdateQuestion: (card: QuestionCard, input: QuestionCardInput) => Promise<QuestionCard>;
  onUpdateFact: (card: FactCard, input: FactCardInput) => Promise<FactCard>;
  onDeleteQuestion: (id: string) => Promise<void>;
  onDeleteFact: (id: string) => Promise<void>;
  onLink: (questionId: string, factId: string) => Promise<void>;
  onUnlink: (questionId: string, factId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  activeTab: "practice" | "cards" | "history";
  onNavigate: (tab: "practice" | "cards" | "history") => void;
};

type EditorState =
  | { kind: "question"; card?: QuestionCard }
  | { kind: "fact"; card?: FactCard }
  | null;

type SelectedCard =
  | { type: "question"; card: QuestionCard }
  | { type: "fact"; card: FactCard }
  | null;

const cardKinds: FactCardKind[] = ["fact", "formula", "reaction", "misconception", "trap"];

export default function CardsScreen(props: Props) {
  const {
    questions, facts, links, reviews, attempts, userId,
    onCreateFact, onCreateLinkedFact, onUpdateQuestion, onUpdateFact,
    onDeleteQuestion, onDeleteFact, onLink, onUnlink, onRefresh,
    activeTab, onNavigate,
  } = props;

  const [editor, setEditor] = useState<EditorState>(null);
  const [mode, setMode] = useState<"search" | "create">("search");
  const [selectedCard, setSelectedCard] = useState<SelectedCard>(null);
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [chapterFilter, setChapterFilter] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [searchStep, setSearchStep] = useState<"type" | "subject" | "chapter" | "topic" | "keyword" | "results">("type");
  const [searchDirection, setSearchDirection] = useState<"forward" | "back">("forward");
  const [editorSubjectId, setEditorSubjectId] = useState(jeeSyllabus.subjects[0].id);
  const [editorChapterId, setEditorChapterId] = useState("");
  const [editorTopicIds, setEditorTopicIds] = useState<string[]>([]);
  const [solutionImageCount, setSolutionImageCount] = useState(1);
  const [typeFilter, setTypeFilter] = useState<"all" | "question" | "fact">("all");

  const [error, setError] = useState<string | null>(null);

  function openEditor(nextEditor: Exclude<EditorState, null>) {
    const card = nextEditor.card;
    setEditor(nextEditor);
    setEditorSubjectId(card?.subjectId || subjectFilter || jeeSyllabus.subjects[0].id);
    setEditorChapterId(card?.chapterId ?? chapterFilter);
    setEditorTopicIds(card?.topicIds ?? []);
    setSolutionImageCount(nextEditor.kind === "question" ? Math.max(1, nextEditor.card?.solutionImageIds?.length ?? (nextEditor.card?.solutionImageId ? 1 : 0)) : 1);
  }

  const activeQuestions = questions.filter((card) => !card.deletedAt);
  const activeFacts = facts.filter((card) => !card.deletedAt);
  const chapterEntries = jeeSyllabus.subjects.flatMap((subject) =>
    subject.chapters.map((chapter) => ({ subject, chapter })),
  );
  const selectedChapterEntry = chapterEntries.find(
    ({ chapter }) => chapter.id === chapterFilter,
  );
  const searchTopics =
    selectedChapterEntry?.chapter.topics ??
    (subjectFilter
      ? jeeSyllabus.subjects.find((subject) => subject.id === subjectFilter)
          ?.chapters.flatMap((chapter) => chapter.topics) ?? []
      : []);

  const currentQuestion = selectedCard?.type === "question" ? selectedCard.card : null;
  const currentFact = selectedCard?.type === "fact" ? selectedCard.card : null;

  const questionCause = useMemo(() => {
    const causeById = new Map(attempts.filter((a) => a.cause).map((a) => [a.id, a.cause as Cause]));
    return (question: QuestionCard) => {
      const latest = attempts.filter((a) => a.questionId === question.id).sort((l, r) => r.createdAt.localeCompare(l.createdAt))[0];
      return latest?.cause ?? (question.createdFromAttemptId ? causeById.get(question.createdFromAttemptId) : undefined);
    };
  }, [attempts]);

  const matches = [
    ...(typeFilter === "fact" ? [] : activeQuestions).map((card) => ({
      type: "question" as const, card, text: card.promptText,
      searchText: `${card.promptText} ${card.solutionText ?? ""} ${card.smarterApproachText ?? ""} ${card.keyInsight ?? ""}`,
      kind: "Question", cause: questionCause(card),
    })),
    ...(typeFilter === "question" ? [] : activeFacts).map((card) => ({
      type: "fact" as const, card, text: card.promptText,
      searchText: `${card.promptText} ${card.contentText}`,
      kind: card.kind, cause: undefined,
    })),
  ].filter(({ card, searchText }) => {
    const subjectMatches = !subjectFilter || card.subjectId === subjectFilter;
    const chapterMatches = !chapterFilter || card.chapterId === chapterFilter;
    const topicMatches = !topicFilter || card.topicIds.includes(topicFilter);
    const textMatches = (searchText ?? "").toLowerCase().includes(search.trim().toLowerCase());
    return subjectMatches && chapterMatches && topicMatches && textMatches;
  });

  async function submitQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const topicIds = form.getAll("topicIds").map(String);
    const linkedFactId = String(form.get("linkedFactId") ?? "");
    const solutionImageIds = form.getAll("solutionImageIds").map(String).filter(Boolean);
    const input: QuestionCardInput = {
      subjectId: String(form.get("subjectId")),
      chapterId: String(form.get("chapterId")),
      topicIds,
      promptText: String(form.get("promptText") ?? ""),
      promptImageId: String(form.get("promptImageId") ?? "") || undefined,
      difficulty: String(form.get("difficulty") ?? editorQuestion?.difficulty ?? "") as QuestionCardInput["difficulty"],
      solutionText: String(form.get("solutionText") ?? ""),
      solutionImageId: solutionImageIds[0],
      solutionImageIds,
      smarterApproachText: String(form.get("smarterApproachText") ?? ""),
      smarterApproachImageId: String(form.get("smarterApproachImageId") ?? "") || undefined,
      keyInsight: String(form.get("keyInsight")),
    };
    try {
      setError(null);
      if (!editor?.card || editor.kind !== "question") throw new Error("New question cards can only be created from practice feedback.");
      const card = await onUpdateQuestion(editor.card, input);
      if (linkedFactId) await onLink(card.id, linkedFactId);
      await onRefresh();
      setEditor(null);
      setSelectedCard({ type: "question", card });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this question card.");
    }
  }

  async function submitFact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const topicIds = form.getAll("topicIds").map(String);
    const linkedQuestionId = String(form.get("linkedQuestionId") ?? "");
    const input: FactCardInput = {
      subjectId: String(form.get("subjectId")),
      chapterId: String(form.get("chapterId")),
      topicIds,
      kind: String(form.get("kind")) as FactCardKind,
      promptText: String(form.get("promptText") ?? ""),
      promptImageId: String(form.get("promptImageId") ?? "") || undefined,
      contentText: String(form.get("contentText") ?? ""),
      contentImageId: String(form.get("contentImageId") ?? "") || undefined,
      wrongBelief: String(form.get("wrongBelief") ?? ""),
    };
    try {
      setError(null);
      const card = editor?.kind === "fact" && editor.card
        ? await onUpdateFact(editor.card, input)
        : linkedQuestionId
          ? await props.onCreateLinkedFact(input, linkedQuestionId)
          : await onCreateFact(input);
      if (linkedQuestionId && editor?.kind === "fact" && editor.card) await onLink(linkedQuestionId, card.id);
      await onRefresh();
      setEditor(null);
      setSelectedCard({ type: "fact", card });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this fact card.");
    }
  }

  async function deleteSelected() {
    if (!selectedCard) return;
    if (!window.confirm("Move this card to the deleted items?")) return;
    try {
      if (selectedCard.type === "question") await onDeleteQuestion(selectedCard.card.id);
      else await onDeleteFact(selectedCard.card.id);
      await onRefresh();
      setSelectedCard(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the card.");
    }
  }

  async function linkFromDetail(factId: string) {
    if (!currentQuestion) return;
    try { await onLink(currentQuestion.id, factId); await onRefresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not link cards."); }
  }

  async function linkQuestionFromFactDetail(questionId: string) {
    if (!currentFact) return;
    try { await onLink(questionId, currentFact.id); await onRefresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not link cards."); }
  }

  async function unlinkFromDetail(questionId: string, factId: string) {
    try { await onUnlink(questionId, factId); await onRefresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not unlink these cards."); }
  }

  const editorQuestion = editor?.kind === "question" ? editor.card : undefined;
  const editorFact = editor?.kind === "fact" ? editor.card : undefined;

  if (mode === "create") {
    return (
      <main className="cards-shell">
        <header className="cards-header">
          <div>
            <p className="eyebrow">YOUR STUDY LIBRARY</p>
            <h1>Cards</h1>
            <p className="cards-intro">Create a new fact card, one step at a time.</p>
          </div>
          <div className="cards-create-actions">
            <button type="button" onClick={() => setMode("search")}>← Back to search</button>
          </div>
        </header>
        <section className="card-creator-panel">
          <FactCardCreator
            userId={userId}
            initialSubjectId={subjectFilter || undefined}
            initialChapterId={chapterFilter || undefined}
            activeQuestions={activeQuestions.map((card) => ({ id: card.id, promptText: card.promptText, chapterId: card.chapterId }))}
            onCreate={onCreateFact}
            onCreateLinked={onCreateLinkedFact}
            onDone={async (card) => { setMode("search"); await onRefresh(); setSelectedCard({ type: "fact", card }); }}
            onError={setError}
          />
        </section>
        <MainNavigation activeTab={activeTab} onNavigate={onNavigate} />
      </main>
    );
  }

  return (
    <main className="cards-shell">
      <header className="cards-header">
        <div>
          <p className="eyebrow">YOUR STUDY LIBRARY</p>
          <h1>Cards</h1>
          <p className="cards-intro">Review saved questions and the ideas they exposed.</p>
        </div>
        <div className="cards-create-actions">
          <button type="button" className="is-active" onClick={() => setMode("search")}>Search cards</button>
          <button type="button" onClick={() => setMode("create")}>Create fact card</button>
        </div>
      </header>

      {props.syncError && <p className="database-error" role="alert">{props.syncError}</p>}
      {error && !editor && <p className="database-error" role="alert">{error}</p>}

      <section className="card-creator-panel" aria-label="Search cards">
        <div className="feedback-step-panel" key={searchStep} data-direction={searchDirection}>
          {searchStep === "type" && (
            <div className="feedback-step">
              <h3>What are you looking for?</h3>
              <div className="result-options" role="group">
                {(["all", "question", "fact"] as const).map((t) => (
                  <button key={t} type="button" className={typeFilter === t ? "result-option selected" : "result-option"} onClick={() => { setTypeFilter(t); setSearchDirection("forward"); setSearchStep("subject"); }}>
                    {t === "all" ? "All cards" : t === "question" ? "Question cards" : "Fact cards"}
                  </button>
                ))}
              </div>
            </div>
          )}
          {searchStep === "subject" && (
            <div className="feedback-step">
              <h3>Which subject?</h3>
              <SearchSelect label="Subject" value={subjectFilter} options={jeeSyllabus.subjects.map((s) => ({ id: s.id, label: s.name }))} placeholder="Search subjects" emptyMessage="No subjects match." onChange={(id) => { setSubjectFilter(id); setChapterFilter(""); setTopicFilter(""); setSearchDirection("forward"); setSearchStep("chapter"); }} />
              <button className="account-secondary-button" type="button" onClick={() => { setSubjectFilter(""); setChapterFilter(""); setTopicFilter(""); setSearchDirection("back"); setSearchStep("type"); }}>← Back</button>
              <button className="account-secondary-button" type="button" onClick={() => { setSubjectFilter(""); setChapterFilter(""); setTopicFilter(""); setSearchDirection("forward"); setSearchStep("chapter"); }}>Skip subject →</button>
            </div>
          )}
          {searchStep === "chapter" && (
            <div className="feedback-step">
              <h3>Which chapter?</h3>
              <SearchSelect label="Chapter" value={chapterFilter} options={(subjectFilter ? jeeSyllabus.subjects.find((s) => s.id === subjectFilter)?.chapters ?? [] : jeeSyllabus.subjects.flatMap((s) => s.chapters)).map((c) => ({ id: c.id, label: c.name }))} placeholder="Search chapters" emptyMessage="No chapters match." onChange={(id) => { const entry = chapterEntries.find(({ chapter }) => chapter.id === id); setChapterFilter(id); setSubjectFilter(entry?.subject.id ?? subjectFilter); setTopicFilter(""); setSearchDirection("forward"); setSearchStep("topic"); }} />
              <button className="account-secondary-button" type="button" onClick={() => { setChapterFilter(""); setTopicFilter(""); setSearchDirection("back"); setSearchStep("subject"); }}>← Back</button>
              <button className="account-secondary-button" type="button" onClick={() => { setChapterFilter(""); setTopicFilter(""); setSearchDirection("forward"); setSearchStep("topic"); }}>Skip chapter →</button>
            </div>
          )}
          {searchStep === "topic" && (
            <div className="feedback-step">
              <h3>Which topic?</h3>
              <SearchSelect label="Topic" value={topicFilter} options={searchTopics.map((t) => ({ id: t.id, label: t.name }))} placeholder="Search topics" emptyMessage="Choose a subject or chapter first, or skip this filter." onChange={(id) => { setTopicFilter(id); setSearchDirection("forward"); setSearchStep("keyword"); }} />
              <button className="account-secondary-button" type="button" onClick={() => { setTopicFilter(""); setSearchDirection("back"); setSearchStep("chapter"); }}>← Back</button>
              <button className="account-secondary-button" type="button" onClick={() => { setSearchDirection("forward"); setSearchStep("keyword"); }}>Skip topic →</button>
            </div>
          )}
          {searchStep === "keyword" && (
            <div className="feedback-step">
              <h3>Keyword search</h3>
              <label>Search text<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search card text" /></label>
              <button className="account-action-button" type="button" onClick={() => { setSearchDirection("forward"); setSearchStep("results"); }}>Show results →</button>
              <button className="account-secondary-button" type="button" onClick={() => { setSearchDirection("back"); setSearchStep("topic"); }}>← Back</button>
            </div>
          )}
          {searchStep === "results" && (
            <div className="feedback-step">
              <h3>Results</h3>
              <button className="account-secondary-button" type="button" onClick={() => { setSearch(""); setSubjectFilter(""); setChapterFilter(""); setTopicFilter(""); setTypeFilter("all"); setSearchDirection("back"); setSearchStep("type"); }}>Reset search</button>
            </div>
          )}
        </div>
      </section>

      {selectedCard ? (
        <section className="card-detail">
          <button className="card-back-button" type="button" onClick={() => setSelectedCard(null)}>← All cards</button>
          <article className="card-detail-content">
            <p className="eyebrow">{selectedCard.type === "question" ? "QUESTION CARD" : selectedCard.card.kind.toUpperCase()}</p>
            <h2>{selectedCard.card.promptText || "Photo card"}</h2>
            {"promptImageId" in selectedCard.card && selectedCard.card.promptImageId && <CardImage imageId={selectedCard.card.promptImageId} alt="Question or card prompt" />}
            <p className="card-context">{jeeSyllabus.subjects.find((s) => s.id === selectedCard.card.subjectId)?.name} · {getChapter(selectedCard.card.subjectId, selectedCard.card.chapterId)?.name}</p>
            {currentQuestion && (
              <>
                {currentQuestion.difficulty && <p><strong>Intrinsic difficulty:</strong> {currentQuestion.difficulty[0].toUpperCase() + currentQuestion.difficulty.slice(1)}</p>}
                {currentQuestion.solutionText && <p>{currentQuestion.solutionText}</p>}
                {(currentQuestion.solutionImageIds ?? (currentQuestion.solutionImageId ? [currentQuestion.solutionImageId] : [])).map((imageId, index) => <CardImage key={imageId} imageId={imageId} alt={`Saved solution ${index + 1}`} />)}
                {(currentQuestion.smarterApproachText || currentQuestion.smarterApproachImageId) && (
                  <section className="card-approach">
                    <h3>Smarter approach</h3>
                    {currentQuestion.smarterApproachText && <p>{currentQuestion.smarterApproachText}</p>}
                    {currentQuestion.smarterApproachImageId && <CardImage imageId={currentQuestion.smarterApproachImageId} alt="Smarter solution approach" />}
                  </section>
                )}
                {currentQuestion.keyInsight && <p><strong>Key insight:</strong> {currentQuestion.keyInsight}</p>}
              </>
            )}
            {currentFact && (
              <>
                {currentFact.contentText && <p>{currentFact.contentText}</p>}
                {currentFact.contentImageId && <CardImage imageId={currentFact.contentImageId} alt="Fact card answer" />}
                {currentFact.wrongBelief && <p><strong>What I believed:</strong> {currentFact.wrongBelief}</p>}
              </>
            )}
            <p className="card-topic-list">{selectedCard.card.topicIds.map((id) => getChapter(selectedCard.card.subjectId, selectedCard.card.chapterId)?.topics.find((t) => t.id === id)?.name).filter(Boolean).join(" · ") || "No topics tagged"}</p>
            {currentQuestion && (
              <section className="card-linked-section">
                <h3>Linked fact cards</h3>
                {links.filter((l) => l.questionId === currentQuestion.id && !l.deletedAt).map((l) => {
                  const fact = activeFacts.find((f) => f.id === l.factId);
                  return fact ? <article className="card-linked-item" key={fact.id}><button type="button" onClick={() => setSelectedCard({ type: "fact", card: fact })}>{fact.promptText || "Photo fact card"}</button><button type="button" aria-label="Unlink fact card" onClick={() => void unlinkFromDetail(currentQuestion.id, fact.id)}>Unlink</button></article> : null;
                })}
                <CardPicker label="Link existing fact card" options={[...activeFacts.filter((f) => f.chapterId === currentQuestion.chapterId).map((f) => ({ id: f.id, label: f.promptText || "Photo fact card", detail: "This chapter" })), ...activeFacts.filter((f) => f.chapterId !== currentQuestion.chapterId).map((f) => ({ id: f.id, label: f.promptText || "Photo fact card", detail: f.chapterId }))]} onSelect={(o) => { const f = facts.find((x) => x.id === o.id); if (f) void linkFromDetail(f.id); }} />
              </section>
            )}
            {currentQuestion && (
              <section className="card-linked-section">
                <h3>Attempt history</h3>
                {attempts.filter((a) => a.questionId === currentQuestion.id || a.id === currentQuestion.createdFromAttemptId).sort((l, r) => r.createdAt.localeCompare(l.createdAt)).map((a) => <p className="card-history-item" key={a.id}>{a.result.replace("_", " ")} · {a.cause ? getCauseLabel(a.cause) : "No cause"} · {Math.floor(a.timeMs / 60000)}:{String(Math.floor(a.timeMs / 1000) % 60).padStart(2, "0")}</p>)}
                {attempts.every((a) => a.questionId !== currentQuestion.id && a.id !== currentQuestion.createdFromAttemptId) && <p>No saved attempts yet.</p>}
              </section>
            )}
            {currentFact && (
              <section className="card-linked-section">
                <h3>Review history</h3>
                {reviews.filter((r) => r.factId === currentFact.id).sort((l, r) => r.reviewedAt.localeCompare(l.reviewedAt)).map((r) => <p className="card-history-item" key={r.id}>{r.outcome} · {new Date(r.reviewedAt).toLocaleDateString()}</p>)}
                {reviews.every((r) => r.factId !== currentFact.id) && <p>No reviews yet.</p>}
              </section>
            )}
            {currentFact && (
              <section className="card-linked-section">
                <h3>Linked question cards</h3>
                {links.filter((l) => l.factId === currentFact.id && !l.deletedAt).map((l) => {
                  const q = activeQuestions.find((x) => x.id === l.questionId);
                  return q ? <article className="card-linked-item" key={q.id}><button type="button" onClick={() => setSelectedCard({ type: "question", card: q })}>{q.promptText || "Photo question"}</button><button type="button" aria-label="Unlink question card" onClick={() => void unlinkFromDetail(q.id, currentFact.id)}>Unlink</button></article> : null;
                })}
                {links.filter((l) => l.factId === currentFact.id && !l.deletedAt).length === 0 && <p>No question cards linked yet.</p>}
                <CardPicker label="Link existing question card" options={[...activeQuestions.filter((q) => q.chapterId === currentFact.chapterId).map((q) => ({ id: q.id, label: q.promptText || "Photo question", detail: "This chapter" })), ...activeQuestions.filter((q) => q.chapterId !== currentFact.chapterId).map((q) => ({ id: q.id, label: q.promptText || "Photo question", detail: q.chapterId }))]} onSelect={(o) => { const q = questions.find((x) => x.id === o.id); if (q) void linkQuestionFromFactDetail(q.id); }} />
              </section>
            )}
            <div className="card-detail-actions">
              <button type="button" onClick={() => openEditor(selectedCard.type === "question" ? { kind: "question", card: selectedCard.card } : { kind: "fact", card: selectedCard.card })}>Edit</button>
              <button type="button" className="card-delete-button" onClick={() => void deleteSelected()}>Delete</button>
            </div>
          </article>
        </section>
      ) : searchStep === "results" ? (
        <section className="card-list" aria-live="polite">
          {matches.length === 0 ? <p className="cards-empty">No cards match these filters. Create a card from this screen or from question feedback.</p> : matches.map(({ type, card, text, kind, cause }) => (
            <button className="card-list-item" type="button" key={`${type}-${card.id}`} onClick={() => setSelectedCard(type === "question" ? { type, card: card as QuestionCard } : { type, card: card as FactCard })}>
              <span className="card-list-meta">{kind}{cause ? ` · ${getCauseLabel(cause)}` : ""}</span>
              <strong>{text || "Photo card"}</strong>
              <span>{getChapter(card.subjectId, card.chapterId)?.name ?? card.chapterId}</span>
            </button>
          ))}
        </section>
      ) : (
        <p className="cards-empty">Complete the search steps above to see results.</p>
      )}

      {editor && (
        <div className="card-modal-backdrop" role="presentation">
          <section className="card-editor" role="dialog" aria-modal="true" aria-labelledby="card-editor-title">
            <button className="card-modal-close" type="button" aria-label="Close" onClick={() => { setEditor(null); setError(null); }}>×</button>
            <p className="eyebrow">{editor.card ? "EDIT CARD" : "NEW CARD"}</p>
            <h2 id="card-editor-title">{editor.kind === "question" ? "Question card" : "Fact card"}</h2>
            {editor.kind === "question" ? (
              <form className="card-form" onSubmit={(e) => void submitQuestion(e)}>
                <label>Subject<select name="subjectId" value={editorSubjectId} onChange={(e) => { setEditorSubjectId(e.target.value); setEditorChapterId(""); setEditorTopicIds([]); }} required>{jeeSyllabus.subjects.map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
                <label>Chapter<select name="chapterId" value={editorChapterId} onChange={(e) => { setEditorChapterId(e.target.value); setEditorTopicIds([]); }} required><option value="" disabled>Choose chapter</option>{jeeSyllabus.subjects.find((s) => s.id === editorSubjectId)?.chapters.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
                <ImageInput label="Question photo" name="promptImageId" value={editorQuestion?.promptImageId} ownerUserId={userId} required />
                <label>Question label (optional)<textarea name="promptText" rows={3} defaultValue={editorQuestion?.promptText} /></label>{editorQuestion?.difficulty ? <p className="card-context"><strong>Intrinsic difficulty:</strong> {editorQuestion.difficulty[0].toUpperCase() + editorQuestion.difficulty.slice(1)} · fixed</p> : <label>Intrinsic difficulty<select name="difficulty" defaultValue="" required><option value="" disabled>Choose difficulty</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>}
                {Array.from({ length: solutionImageCount }, (_, index) => <ImageInput key={`editor-solution-${index}`} label={`Solution image ${index + 1}`} name="solutionImageIds" ownerUserId={userId} value={editorQuestion?.solutionImageIds?.[index] ?? (index === 0 ? editorQuestion?.solutionImageId : undefined)} />)}<button className="account-secondary-button" type="button" onClick={() => setSolutionImageCount((count) => count + 1)}>Add another solution image</button>
                <label>Solution or approach <span className="optional-label">optional</span><textarea name="solutionText" rows={4} defaultValue={editorQuestion?.solutionText} /></label>
                <ImageInput label="Smarter approach photo" name="smarterApproachImageId" value={editorQuestion?.smarterApproachImageId} ownerUserId={userId} />
                <label>Smarter approach note <span className="optional-label">optional</span><textarea name="smarterApproachText" rows={3} defaultValue={editorQuestion?.smarterApproachText} /></label>
                <label>Key insight (optional)<input name="keyInsight" defaultValue={editorQuestion?.keyInsight} /></label>
                <label>Topics (Ctrl/Cmd-click to select multiple)<select name="topicIds" multiple value={editorTopicIds} onChange={(e) => setEditorTopicIds(Array.from(e.target.selectedOptions, (o) => o.value))}>{jeeSyllabus.subjects.find((s) => s.id === editorSubjectId)?.chapters.find((c) => c.id === editorChapterId)?.topics.map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
                {activeFacts.length > 0 && <CardPicker label="Link existing fact card (optional)" name="linkedFactId" options={[...activeFacts.filter((f) => f.chapterId === editorChapterId).map((f) => ({ id: f.id, label: f.promptText || "Photo fact card", detail: "This chapter" })), ...activeFacts.filter((f) => f.chapterId !== editorChapterId).map((f) => ({ id: f.id, label: f.promptText || "Photo fact card", detail: f.chapterId }))]} />}
                <button className="start-button" type="submit">{editor.card ? "Save changes" : "Save question card"}</button>
              </form>
            ) : (
              <form className="card-form" onSubmit={(e) => void submitFact(e)}>
                <label>Subject<select name="subjectId" value={editorSubjectId} onChange={(e) => { setEditorSubjectId(e.target.value); setEditorChapterId(""); setEditorTopicIds([]); }} required>{jeeSyllabus.subjects.map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
                <label>Chapter<select name="chapterId" value={editorChapterId} onChange={(e) => { setEditorChapterId(e.target.value); setEditorTopicIds([]); }} required><option value="" disabled>Choose chapter</option>{jeeSyllabus.subjects.find((s) => s.id === editorSubjectId)?.chapters.map((c) => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
                <label>Card type<select name="kind" defaultValue={editorFact?.kind ?? "fact"}>{cardKinds.map((k) => <option value={k} key={k}>{k}</option>)}</select></label>
                <ImageInput label="Recall prompt photo" name="promptImageId" value={editorFact?.promptImageId} ownerUserId={userId} required />
                <label>Prompt text<textarea name="promptText" rows={2} defaultValue={editorFact?.promptText} required /></label>
                <ImageInput label="Answer / fact photo" name="contentImageId" value={editorFact?.contentImageId} ownerUserId={userId} required />
                <label>Answer / fact text <span className="optional-label">optional</span><textarea name="contentText" rows={3} defaultValue={editorFact?.contentText} /></label>
                <label>What I wrongly believed (optional)<textarea name="wrongBelief" rows={2} defaultValue={editorFact?.wrongBelief} /></label>
                <label>Topics (Ctrl/Cmd-click to select multiple)<select name="topicIds" multiple value={editorTopicIds} onChange={(e) => setEditorTopicIds(Array.from(e.target.selectedOptions, (o) => o.value))}>{jeeSyllabus.subjects.find((s) => s.id === editorSubjectId)?.chapters.find((c) => c.id === editorChapterId)?.topics.map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
                {activeQuestions.length > 0 && <CardPicker label="Link existing question card (optional)" name="linkedQuestionId" options={[...activeQuestions.filter((q) => q.chapterId === editorChapterId).map((q) => ({ id: q.id, label: q.promptText || "Photo question", detail: "This chapter" })), ...activeQuestions.filter((q) => q.chapterId !== editorChapterId).map((q) => ({ id: q.id, label: q.promptText || "Photo question", detail: q.chapterId }))]} />}
                <button className="start-button" type="submit">{editor.card ? "Save changes" : "Save fact card"}</button>
              </form>
            )}
            {error && <p className="database-error" role="alert">{error}</p>}
          </section>
        </div>
      )}

      <MainNavigation activeTab={activeTab} onNavigate={onNavigate} />
    </main>
  );
}