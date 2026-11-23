import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  database,
  type AttemptRecord,
  type SessionRecord,
} from "./database";
import type {
  FactCard,
  FactCardInput,
  FactReviewRecord,
  QuestionCard,
  QuestionCardInput,
  QuestionDifficulty,
  QuestionFactLink,
} from "./features/cards/types";
import {
  createFactCard,
  createFactCardAndLink,
  createQuestionCard,
  linkQuestionAndFact,
  recordQuestionSeen,
  softDeleteFactCard,
  softDeleteQuestionCard,
  unlinkQuestionAndFact,
  updateFactCard,
  updateQuestionCard,
} from "./features/cards/cardRepository";
import {
  assignLocalSessionsToUser,
  syncAccountSessions,
} from "./cloudSync";
import SearchSelect from "./SearchSelect";
import { supabase, supabaseConfigured } from "./supabase";
import {
  getChapter,
  getSubject,
  jeeSyllabus,
  type SyllabusSubjectId,
} from "./syllabus";
import {
  finishSessionAt,
  getInactivityPrompt,
  recoverSessionSnapshot,
  stopQuestionAtInactivityPrompt,
} from "./features/practice/sessionLifecycle";
import type {
  ActiveSession,
  ActiveSessionSnapshot,
  InactivityWarning,
  QuestionResult,
  SessionSetup,
} from "./features/practice/types";
import { SMARTER_APPROACH_THRESHOLD_MS } from "./features/practice/feedbackFlow";
import {
  formatStopwatch,
} from "./features/practice/TimerDisplay";
import { processUploadQueue } from "./features/images/driveImageStore";
import { queueImagesForUpload } from "./features/images/imageRepository";
import { validateAttempt } from "./lib/causes";
import type { Cause, SlipSubtype } from "./lib/causes";
import SessionRecoveryScreen from "./features/practice/SessionRecoveryScreen";
import PracticeSessionScreen from "./features/practice/PracticeSessionScreen";
import SessionFeedbackScreen from "./features/practice/SessionFeedbackScreen";
import SessionSummaryScreen from "./features/practice/SessionSummaryScreen";
import AccountPanel from "./features/account/AccountPanel";
import CardsScreen from "./features/cards/CardsScreen";
import MainNavigation from "./features/navigation/MainNavigation";

const DURATIONS = [30, 45, 60, 90, 120];
const ACTIVE_SESSION_SAVE_DEBOUNCE_MS = 300;

function App() {
  const [activeTab, setActiveTab] = useState<"practice" | "cards" | "history">(
    "practice",
  );
  const [setup, setSetup] = useState<SessionSetup>({
    subjectId: "maths",
    chapterId: "",
    duration: 60,
    startingQuestion: 1,
  });
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [now, setNow] = useState(Date.now());
  const [recoveryCandidate, setRecoveryCandidate] =
    useState<ActiveSessionSnapshot | null>(null);
  const [isLoadingActiveSession, setIsLoadingActiveSession] = useState(true);
  const [pendingWarning, setPendingWarning] =
    useState<InactivityWarning | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);
  const [savedSessions, setSavedSessions] = useState<SessionRecord[]>([]);
  const [questionCards, setQuestionCards] = useState<QuestionCard[]>([]);
  const [factCards, setFactCards] = useState<FactCard[]>([]);
  const [questionFactLinks, setQuestionFactLinks] = useState<QuestionFactLink[]>([]);
  const [factReviews, setFactReviews] = useState<FactReviewRecord[]>([]);
  const [attemptRecords, setAttemptRecords] = useState<AttemptRecord[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "synced" | "offline" | "error"
  >("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [unassignedSessionCount, setUnassignedSessionCount] = useState(0);
  const [unassignedCardCount, setUnassignedCardCount] = useState(0);
  const syncInProgress = useRef(false);
  const sessionRef = useRef<ActiveSession | null>(null);
  const recoveryCandidateRef = useRef<ActiveSessionSnapshot | null>(null);
  const lastInteractionAtRef = useRef(Date.now());
  const pendingWarningRef = useRef<InactivityWarning | null>(null);
  const activeSessionWriteTimeout = useRef<number | null>(null);
  const activeSessionWriteQueue = useRef<Promise<void>>(Promise.resolve());

  async function refreshCardData() {
    const [questions, facts, links, attempts, reviews] = await Promise.all([
      database.questions.toArray(),
      database.factCards.toArray(),
      database.questionFactLinks.toArray(),
      database.attempts.toArray(),
      database.factReviews.toArray(),
    ]);
    setQuestionCards(
      questions.filter(
        (card) => !authUser || !card.ownerUserId || card.ownerUserId === authUser.id,
      ),
    );
    setFactCards(
      facts.filter(
        (card) => !authUser || !card.ownerUserId || card.ownerUserId === authUser.id,
      ),
    );
    setQuestionFactLinks(
      links.filter(
        (link) => !authUser || !link.ownerUserId || link.ownerUserId === authUser.id,
      ),
    );
    setAttemptRecords(
      attempts.filter(
        (attempt) => !authUser || !attempt.ownerUserId || attempt.ownerUserId === authUser.id,
      ),
    );
    setFactReviews(
      reviews.filter(
        (review) => !authUser || !review.ownerUserId || review.ownerUserId === authUser.id,
      ),
    );
    setUnassignedCardCount(
      questions.filter((card) => !card.ownerUserId).length +
        facts.filter((card) => !card.ownerUserId).length +
        links.filter((link) => !link.ownerUserId).length,
    );
  }

  function navigate(tab: "practice" | "cards" | "history") {
    setActiveTab(tab);
  }

  sessionRef.current = session;
  recoveryCandidateRef.current = recoveryCandidate;
  pendingWarningRef.current = pendingWarning;

  function persistActiveSessionSnapshot() {
    const currentSession = sessionRef.current;
    if (!currentSession || currentSession.phase === "summary") {
      return Promise.resolve();
    }

    const snapshot: ActiveSessionSnapshot = {
      id: "current",
      session: currentSession,
      lastInteractionAt: lastInteractionAtRef.current,
      pendingWarning: pendingWarningRef.current,
      savedAt: Date.now(),
    };
    const write = activeSessionWriteQueue.current
      .catch(() => undefined)
      .then(() => database.activeSession.put(snapshot))
      .then(() => {
        setPersistenceError(null);
      })
      .catch((error: unknown) => {
        setPersistenceError(
          error instanceof Error
            ? `Could not preserve the active session: ${error.message}`
            : "Could not preserve the active session.",
        );
      });
    activeSessionWriteQueue.current = write;
    return write;
  }

  function scheduleActiveSessionSave() {
    if (activeSessionWriteTimeout.current !== null) {
      window.clearTimeout(activeSessionWriteTimeout.current);
    }
    activeSessionWriteTimeout.current = window.setTimeout(() => {
      activeSessionWriteTimeout.current = null;
      void persistActiveSessionSnapshot();
    }, ACTIVE_SESSION_SAVE_DEBOUNCE_MS);
  }

  async function clearActiveSessionSnapshot() {
    if (activeSessionWriteTimeout.current !== null) {
      window.clearTimeout(activeSessionWriteTimeout.current);
      activeSessionWriteTimeout.current = null;
    }
    await activeSessionWriteQueue.current;
    await database.activeSession.delete("current");
    setPersistenceError(null);
  }

  useEffect(() => {
    let cancelled = false;
    database.activeSession
      .get("current")
      .then((snapshot) => {
        if (cancelled || !snapshot) return;
        const normalized: ActiveSessionSnapshot = {
          ...snapshot,
          session: {
            ...snapshot.session,
            feedback: Object.fromEntries(
              Object.entries(snapshot.session.feedback ?? {}).map(
                ([questionNumber, feedback]) => [
                  questionNumber,
                  {
                    ...feedback,
                    cause: feedback.cause ?? null,
                    slipSubtype: feedback.slipSubtype ?? null,
                  },
                ],
              ),
            ),
            longQuestionPromptedNumbers:
              snapshot.session.longQuestionPromptedNumbers ?? [],
          },
        };
        lastInteractionAtRef.current = normalized.lastInteractionAt;
        setRecoveryCandidate(normalized);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPersistenceError(
            error instanceof Error
              ? `Could not recover the active session: ${error.message}`
              : "Could not recover the active session.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingActiveSession(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session || session.phase === "summary") return;
    scheduleActiveSessionSave();
  }, [session, pendingWarning]);

  useEffect(() => {
    const flushSession = () => {
      if (activeSessionWriteTimeout.current !== null) {
        window.clearTimeout(activeSessionWriteTimeout.current);
        activeSessionWriteTimeout.current = null;
      }
      void persistActiveSessionSnapshot();
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushSession();
    };

    window.addEventListener("pagehide", flushSession);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushSession);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, []);

  useEffect(() => {
    if (!session || session.phase !== "active") return;

    const markInteraction = () => {
      if (pendingWarningRef.current) return;
      lastInteractionAtRef.current = Date.now();
      scheduleActiveSessionSave();
    };
    document.addEventListener("pointerdown", markInteraction);
    document.addEventListener("keydown", markInteraction);
    return () => {
      document.removeEventListener("pointerdown", markInteraction);
      document.removeEventListener("keydown", markInteraction);
    };
  }, [session?.phase]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, authSession) => {
      setAuthUser(authSession?.user ?? null);
      setIsAuthLoading(false);
      setAuthError(null);
      setAuthMessage(null);
    });

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setAuthError(`Could not restore sign-in: ${error.message}`);
          return;
        }
        setAuthUser(data.session?.user ?? null);
        setIsAuthLoading(false);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setAuthError(
            error instanceof Error
              ? `Could not restore sign-in: ${error.message}`
              : "Could not restore sign-in.",
          );
        }
      });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    database.sessions
      .toArray()
      .then((records) => {
        if (cancelled) return;
        const unassigned = records.filter((record) => !record.ownerUserId);
        setUnassignedSessionCount(unassigned.length);
        setSavedSessions(
          authUser
            ? records.filter((record) => record.ownerUserId === authUser.id)
            : unassigned,
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDatabaseError(
            error instanceof Error
              ? `Could not load saved sessions: ${error.message}`
              : "Could not load saved sessions.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSessions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authUser]);

  useEffect(() => {
    void refreshCardData().catch((error: unknown) => {
      setDatabaseError(
        error instanceof Error
          ? `Could not load cards: ${error.message}`
          : "Could not load cards.",
      );
    });
  }, [authUser]);

  async function performSync(user: User) {
    if (syncInProgress.current) return;
    if (!navigator.onLine) {
      setSyncStatus("offline");
      setSyncError(null);
      return;
    }

    syncInProgress.current = true;
    setSyncStatus("syncing");
    setSyncError(null);
    try {
      // Upload local photo blobs to Drive first. Only then can their remote IDs
      // be written to the Supabase images table (remote_id is NOT NULL).
      await processUploadQueue();
      await syncAccountSessions(user);
      const localRecords = await database.sessions.toArray();
      setSavedSessions(
        localRecords
          .filter((record) => record.ownerUserId === user.id)
          .sort((left, right) => right.endedAt.localeCompare(left.endedAt)),
      );
      setUnassignedSessionCount(
        localRecords.filter((record) => !record.ownerUserId).length,
      );
      await refreshCardData();
      setSyncStatus("synced");
    } catch (error) {
      setSyncStatus("error");
      setSyncError(
        error instanceof Error
          ? error.message
          : "Could not sync sessions. Please try again.",
      );
    } finally {
      syncInProgress.current = false;
    }
  }

  useEffect(() => {
    if (!authUser) {
      setSyncStatus("idle");
      return;
    }

    void performSync(authUser);
    const retryWhenOnline = () => void performSync(authUser);
    window.addEventListener("online", retryWhenOnline);
    return () => window.removeEventListener("online", retryWhenOnline);
  }, [authUser]);

  useEffect(() => {
    if (!session || session.phase !== "active") return;

    const timer = window.setInterval(() => setNow(Date.now()), 30);
    return () => window.clearInterval(timer);
  }, [session]);

  useEffect(() => {
    if (!session || session.phase !== "active" || pendingWarning) return;

    const prompt = getInactivityPrompt(
      session,
      now,
      lastInteractionAtRef.current,
    );
    if (!prompt) return;

    if (
      prompt.warning.kind === "running_question" &&
      prompt.questionElapsedMs !== undefined
    ) {
      const questionElapsedMs = prompt.questionElapsedMs;
      setSession((current) =>
        current?.phase === "active" &&
        current.questionStartedAt !== null &&
        current.questionNumber === session.questionNumber
          ? stopQuestionAtInactivityPrompt(
              current,
              questionElapsedMs,
            )
          : current,
      );
    }
    setPendingWarning(prompt.warning);
  }, [session, now, pendingWarning]);

  useEffect(() => {
    if (!session || session.phase !== "active" || now < session.endsAt) return;
    endSession(session.endsAt);
  }, [session, now]);

  const remaining = session
    ? Math.max(0, Math.ceil((session.endsAt - now) / 1000))
    : 0;
  const stopwatchElapsed = session
    ? session.questionElapsedMs +
      (session.questionStartedAt === null ? 0 : now - session.questionStartedAt)
    : 0;
  const setupSubject = getSubject(setup.subjectId);
  const savedQuestionCount = savedSessions.reduce(
    (total, record) =>
      total +
      (record.timedQuestionCount ??
        record.rightCount + record.wrongCount + record.couldntSolveCount),
    0,
  );
  const savedActiveTimeMs = savedSessions.reduce(
    (total, record) => total + record.activeTimeMs,
    0,
  );
  const activeSessionQuestionTimes = Object.values(
    session?.phase === "active" ? session.questionTimesMs : {},
  );
  const thresholdQuestionCount =
    savedQuestionCount + activeSessionQuestionTimes.length;
  const thresholdActiveTimeMs =
    savedActiveTimeMs +
    activeSessionQuestionTimes.reduce((total, duration) => total + duration, 0);
  const averageQuestionTimeMs =
    thresholdQuestionCount > 0
      ? thresholdActiveTimeMs / thresholdQuestionCount
      : null;
  const isOverAverage =
    averageQuestionTimeMs !== null && stopwatchElapsed > averageQuestionTimeMs;

  function updateSetup<K extends keyof SessionSetup>(
    key: K,
    value: SessionSetup[K],
  ) {
    setSetup((current) => ({ ...current, [key]: value }));
  }

  async function signInWithGoogle() {
    if (!supabase) {
      setAuthError("Sign-in is not configured for this app.");
      return;
    }

    setIsSubmittingAuth(true);
    setAuthError(null);
    setAuthMessage(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) throw error;
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Google sign-in failed.",
      );
      setIsSubmittingAuth(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    setAuthError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthError(`Could not sign out: ${error.message}`);
      return;
    }
    setAuthUser(null);
    setSavedSessions(
      (await database.sessions.toArray()).filter(
        (record) => !record.ownerUserId,
      ),
    );
  }

  async function importLocalSessions() {
    if (!authUser) return;
    try {
      await assignLocalSessionsToUser(authUser.id);
      const localRecords = await database.sessions.toArray();
      setUnassignedSessionCount(
        localRecords.filter((record) => !record.ownerUserId).length,
      );
      await performSync(authUser);
    } catch (error) {
      setSyncStatus("error");
      setSyncError(
        error instanceof Error
          ? error.message
          : "Could not import local sessions.",
      );
    }
  }

  function startSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startedAt = Date.now();
    lastInteractionAtRef.current = startedAt;
    pendingWarningRef.current = null;
    setPendingWarning(null);
    setNow(startedAt);
    setSession({
      ...setup,
      sessionKind: "practice",
      phase: "active",
      startedAt,
      endsAt: startedAt + setup.duration * 60_000,
      endedAt: null,
      questionNumber: setup.startingQuestion,
      questionNumberText: String(setup.startingQuestion),
      questionElapsedMs: 0,
      questionStartedAt: null,
      questionTimesMs: {},
      longQuestionPromptedNumbers: [],
      feedback: {},
      record: null,
    });
  }

  function toggleStopwatch() {
    if (!session) return;

    const timestamp = Date.now();
    setNow(timestamp);
    if (session.questionStartedAt === null) {
      setSession({ ...session, questionStartedAt: timestamp });
      return;
    }

    const elapsedMs =
      session.questionElapsedMs + timestamp - session.questionStartedAt;
    const questionTimesMs = {
      ...session.questionTimesMs,
      [session.questionNumber]: elapsedMs,
    };
    const nextQuestionNumber = session.questionNumber + 1;

    setSession({
      ...session,
      questionNumber: nextQuestionNumber,
      questionNumberText: String(nextQuestionNumber),
      questionElapsedMs: questionTimesMs[nextQuestionNumber] ?? 0,
      questionStartedAt: null,
      questionTimesMs,
    });
  }

  function skipNextQuestion() {
    if (!session || session.questionStartedAt !== null) return;
    const nextQuestionNumber = session.questionNumber + 1;
    setSession({
      ...session,
      questionNumber: nextQuestionNumber,
      questionNumberText: String(nextQuestionNumber),
      questionElapsedMs: session.questionTimesMs[nextQuestionNumber] ?? 0,
    });
  }

  function updateQuestionNumberText(value: string) {
    if (!session || session.questionStartedAt !== null) return;
    if (!/^\d*$/.test(value)) return;
    const parsed = Number(value);
    setSession({
      ...session,
      questionNumberText: value,
      ...(Number.isSafeInteger(parsed) && parsed > 0
        ? {
            questionNumber: parsed,
            questionElapsedMs: session.questionTimesMs[parsed] ?? 0,
          }
        : {}),
    });
  }

  function commitQuestionNumberText() {
    if (!session || session.questionStartedAt !== null) return;
    const parsed = Number(session.questionNumberText);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        setSession({
          ...session,
          questionNumberText: String(session.questionNumber),
        });
    } else {
        setSession({
          ...session,
          questionNumber: parsed,
          questionNumberText: String(parsed),
        });
    }
  }

  function endSession(endedAt = Date.now()) {
    if (!session || session.phase !== "active") return;

    const finishedSession = finishSessionAt(session, endedAt);
    pendingWarningRef.current = null;
    setPendingWarning(null);
    setNow(endedAt);
    setSession(finishedSession);
  }

  function confirmStillHere() {
    const confirmedAt = Date.now();
    pendingWarningRef.current = null;
    lastInteractionAtRef.current = confirmedAt;
    setPendingWarning(null);
    setNow(confirmedAt);
    scheduleActiveSessionSave();
  }

  function setQuestionResult(questionNumber: number, result: QuestionResult) {
    if (!session) return;
    const current = session.feedback[questionNumber] ?? {
      result: null,
      cause: null,
      slipSubtype: null,
      topics: [],
    };
    const resultChanged = current.result !== result;
    if (resultChanged && current.questionId) {
      const previousQuestion = questionCards.find((card) => card.id === current.questionId);
      if (previousQuestion?.createdFromAttemptId === current.attemptId) {
        const createdFactIds = questionFactLinks
          .filter((link) => link.questionId === current.questionId && !link.deletedAt)
          .map((link) => link.factId)
          .filter((factId) => {
            const fact = factCards.find((card) => card.id === factId);
            const linkedElsewhere = questionFactLinks.some(
              (link) => link.factId === factId && link.questionId !== current.questionId && !link.deletedAt,
            );
            return fact?.createdFromAttemptId === current.attemptId && !linkedElsewhere;
          });
        void (async () => {
          await softDeleteQuestionCard(previousQuestion.id);
          for (const factId of createdFactIds) await softDeleteFactCard(factId);
          await refreshCardData();
        })().catch((error: unknown) => {
          setPersistenceError(error instanceof Error ? error.message : "Could not discard the previous feedback draft.");
        });
      }
    }
    setSession({
      ...session,
      feedback: {
        ...session.feedback,
        [questionNumber]: {
          ...current,
          result,
          ...(resultChanged
            ? {
                cause: null,
                slipSubtype: null,
                topics: [],
                questionId: undefined,
                solutionSaved: undefined,
                difficulty: undefined,
              }
            : {}),
          smarterApproach: undefined,
          smarterApproachSaved: undefined,
          ...(result !== "right" && !current.attemptId
            ? { attemptId: globalThis.crypto.randomUUID() }
            : {}),
          ...(result === "right" || result === "wrong_question"
            ? { cause: null, slipSubtype: null, topics: [] }
            : {}),
        },
      },
    });
  }

  function setSmarterApproach(
    questionNumber: number,
    answer: "found" | "not_found",
  ) {
    updateFeedbackForQuestion(questionNumber, (current) => ({
      ...current,
      smarterApproach: answer,
      smarterApproachSaved: undefined,
    }));
  }

  function setQuestionCause(questionNumber: number, cause: Cause) {
    if (!session) return;
    const current = session.feedback[questionNumber] ?? {
      result: null,
      cause: null,
      slipSubtype: null,
      topics: [],
    };
    setSession({
      ...session,
      feedback: {
        ...session.feedback,
        [questionNumber]: {
          ...current,
          cause,
          slipSubtype: cause === "slip" ? current.slipSubtype : null,
        },
      },
    });
  }

  function setQuestionSlipSubtype(
    questionNumber: number,
    subtype: SlipSubtype | null,
  ) {
    if (!session) return;
    const current = session.feedback[questionNumber] ?? {
      result: null,
      cause: null,
      slipSubtype: null,
      topics: [],
    };
    setSession({
      ...session,
      feedback: {
        ...session.feedback,
        [questionNumber]: { ...current, slipSubtype: subtype },
      },
    });
  }

  function addTopic(questionNumber: number, topicId: string) {
    if (!session) return;
    const current = session.feedback[questionNumber] ?? {
      result: null,
      cause: null,
      slipSubtype: null,
      topics: [],
    };
    const topic = getChapter(session.subjectId, session.chapterId)?.topics.find(
      (candidate) => candidate.id === topicId,
    );
    if (!topic || current.topics.some((existing) => existing.id === topic.id)) {
      return;
    }

    const updatedTopics = [...current.topics, { id: topic.id, name: topic.name }];
    setSession({
      ...session,
      feedback: {
        ...session.feedback,
        [questionNumber]: {
          ...current,
          topics: updatedTopics,
        },
      },
    });

    if (current.questionId) {
      const card = questionCards.find((c) => c.id === current.questionId);
      if (card && !card.topicIds.includes(topic.id)) {
        void updateQuestionCard(card, {
          subjectId: card.subjectId,
          chapterId: card.chapterId,
          topicIds: [...card.topicIds, topic.id],
          promptText: card.promptText,
          promptImageId: card.promptImageId,
          solutionText: card.solutionText,
          solutionImageId: card.solutionImageId,
          smarterApproachText: card.smarterApproachText,
          smarterApproachImageId: card.smarterApproachImageId,
          keyInsight: card.keyInsight,
        }).then((updated) => {
          setQuestionCards((cards) =>
            cards.map((item) => (item.id === updated.id ? updated : item)),
          );
        });
      }
    }
  }

  function removeTopic(questionNumber: number, topicToRemove: string) {
    if (!session) return;
    const current = session.feedback[questionNumber];
    if (!current) return;
    const updatedTopics = current.topics.filter((topic) => topic.id !== topicToRemove);
    setSession({
      ...session,
      feedback: {
        ...session.feedback,
        [questionNumber]: {
          ...current,
          topics: updatedTopics,
        },
      },
    });

    if (current.questionId) {
      const card = questionCards.find((c) => c.id === current.questionId);
      if (card && card.topicIds.includes(topicToRemove)) {
        void updateQuestionCard(card, {
          subjectId: card.subjectId,
          chapterId: card.chapterId,
          topicIds: card.topicIds.filter((id) => id !== topicToRemove),
          promptText: card.promptText,
          promptImageId: card.promptImageId,
          solutionText: card.solutionText,
          solutionImageId: card.solutionImageId,
          smarterApproachText: card.smarterApproachText,
          smarterApproachImageId: card.smarterApproachImageId,
          keyInsight: card.keyInsight,
        }).then((updated) => {
          setQuestionCards((cards) =>
            cards.map((item) => (item.id === updated.id ? updated : item)),
          );
        });
      }
    }
  }

  function updateFeedbackForQuestion(
    questionNumber: number,
    update: (current: NonNullable<ActiveSession["feedback"][number]>) => ActiveSession["feedback"][number],
  ) {
    setSession((current) => {
      if (!current) return current;
      const feedback = current.feedback[questionNumber] ?? {
        result: null,
        cause: null,
        slipSubtype: null,
        topics: [],
      };
      return {
        ...current,
        feedback: {
          ...current.feedback,
          [questionNumber]: update(feedback),
        },
      };
    });
  }

  async function saveFeedbackQuestionCard(
    questionNumber: number,
    input: Pick<
      QuestionCardInput,
      | "promptText"
      | "promptImageId"
      | "solutionText"
      | "solutionImageId"
    >,
  ) {
    if (!session) throw new Error("The session is no longer available.");
    if (session.sessionKind !== "practice") {
      throw new Error("New question cards can only be created from practice feedback.");
    }
    const feedback = session.feedback[questionNumber];
    if (!feedback || feedback.result === null) {
      throw new Error("Record the result before saving this question.");
    }
    if (
      feedback.result === "right" &&
      (!feedback.smarterApproach ||
        session.questionTimesMs[questionNumber] <= SMARTER_APPROACH_THRESHOLD_MS)
    ) {
      throw new Error("Only a slow practice question can be saved from a right answer.");
    }
    if (feedback.questionId) {
      const existing = questionCards.find((card) => card.id === feedback.questionId);
      if (existing) return existing;
    }
    const attemptId = feedback.attemptId ?? globalThis.crypto.randomUUID();
    const card = await createQuestionCard(
      {
        ...input,
        subjectId: session.subjectId,
        chapterId: session.chapterId,
        topicIds: feedback.topics.map((topic) => topic.id),
        createdFromAttemptId: attemptId,
      },
      { userId: authUser?.id },
    );
    updateFeedbackForQuestion(questionNumber, (current) => ({
      ...current,
      attemptId,
      questionId: card.id,
    }));
    await refreshCardData();
    if (authUser) void performSync(authUser);
    return card;
  }

  async function saveSmarterApproach(
    questionNumber: number,
    input: Pick<QuestionCardInput, "solutionText" | "solutionImageId" | "solutionImageIds">,
  ) {
    if (!session || session.sessionKind !== "practice") {
      throw new Error("Smarter approaches can only be saved from practice feedback.");
    }
    const feedback = session.feedback[questionNumber];
    if (
      !feedback?.questionId ||
      feedback.smarterApproach !== "found" ||
      session.questionTimesMs[questionNumber] <= SMARTER_APPROACH_THRESHOLD_MS
    ) {
      throw new Error("Save the slow question before adding its shorter approach.");
    }
    if (!(input.solutionImageIds?.length || input.solutionImageId) && !input.solutionText) {
      throw new Error("Add the smarter method as text or an image.");
    }
    const card = questionCards.find((item) => item.id === feedback.questionId);
    if (!card) throw new Error("The saved question could not be found.");
    await updateQuestionCard(card, {
      subjectId: card.subjectId,
      chapterId: card.chapterId,
      topicIds: Array.from(
        new Set([...card.topicIds, ...feedback.topics.map((t) => t.id)]),
      ),
      promptText: card.promptText,
      promptImageId: card.promptImageId,
      solutionText: input.solutionText,
      solutionImageId: input.solutionImageId,
      solutionImageIds: input.solutionImageIds,
      smarterApproachText: card.smarterApproachText,
      smarterApproachImageId: card.smarterApproachImageId,
      keyInsight: card.keyInsight,
    });
    updateFeedbackForQuestion(questionNumber, (current) => ({
      ...current,
      smarterApproachSaved: true,
    }));
    await refreshCardData();
    if (authUser) void performSync(authUser);
  }

  async function saveSolution(
    questionNumber: number,
    input: Pick<QuestionCardInput, "solutionText" | "solutionImageId" | "solutionImageIds">,
  ) {
    if (!session || session.sessionKind !== "practice") {
      throw new Error("Solutions can only be saved from practice feedback.");
    }
    const feedback = session.feedback[questionNumber];
    if (!feedback?.questionId) {
      throw new Error("Save the question before adding a solution.");
    }
    const card = questionCards.find((item) => item.id === feedback.questionId);
    if (!card) throw new Error("The saved question could not be found.");
    await updateQuestionCard(card, {
      subjectId: card.subjectId,
      chapterId: card.chapterId,
      topicIds: Array.from(
        new Set([...card.topicIds, ...feedback.topics.map((t) => t.id)]),
      ),
      promptText: card.promptText,
      promptImageId: card.promptImageId,
      solutionText: input.solutionText,
      solutionImageId: input.solutionImageId,
      solutionImageIds: input.solutionImageIds,
      smarterApproachText: card.smarterApproachText,
      smarterApproachImageId: card.smarterApproachImageId,
      keyInsight: card.keyInsight,
    });
    updateFeedbackForQuestion(questionNumber, (current) => ({
      ...current,
      solutionSaved: true,
    }));
    await refreshCardData();
    if (authUser) void performSync(authUser);
  }

  async function saveQuestionDifficulty(questionNumber: number, difficulty: QuestionDifficulty) {
    if (!session || session.sessionKind !== "practice") throw new Error("Question difficulty can only be set during practice feedback.");
    const feedback = session.feedback[questionNumber];
    if (!feedback?.questionId) throw new Error("Save the question before assigning its difficulty.");
    const card = questionCards.find((item) => item.id === feedback.questionId);
    if (!card) throw new Error("The saved question could not be found.");
    if (card.difficulty && card.difficulty !== difficulty) throw new Error("Intrinsic question difficulty cannot be changed after it is set.");
    await updateQuestionCard(card, {
      subjectId: card.subjectId,
      chapterId: card.chapterId,
      topicIds: Array.from(new Set([...card.topicIds, ...feedback.topics.map((topic) => topic.id)])),
      promptText: card.promptText,
      promptImageId: card.promptImageId,
      difficulty,
      solutionText: card.solutionText,
      solutionImageId: card.solutionImageId,
      solutionImageIds: card.solutionImageIds,
      smarterApproachText: card.smarterApproachText,
      smarterApproachImageId: card.smarterApproachImageId,
      keyInsight: card.keyInsight,
    });
    updateFeedbackForQuestion(questionNumber, (current) => ({ ...current, difficulty }));
    await refreshCardData();
    if (authUser) void performSync(authUser);
  }

  async function useQuestionCardForAttempt(
    questionNumber: number,
    card: QuestionCard,
  ) {
    const feedback = session?.feedback[questionNumber];
    if (!session || !feedback) throw new Error("The attempt is no longer available.");
    await recordQuestionSeen(card.id, authUser?.id);
    updateFeedbackForQuestion(questionNumber, (current) => ({
      ...current,
      attemptId: current.attemptId ?? globalThis.crypto.randomUUID(),
      questionId: card.id,
      topics: Array.from(
        new Map(
          [
            ...current.topics,
            ...(getChapter(session.subjectId, session.chapterId)?.topics ?? [])
              .filter((topic) => card.topicIds.includes(topic.id))
              .map(({ id, name }) => ({ id, name })),
          ].map((topic) => [topic.id, topic]),
        ).values(),
      ),
    }));
    await refreshCardData();
    if (authUser) void performSync(authUser);
  }

  async function saveFeedbackFactCard(
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
  ) {
    if (!session) throw new Error("The session is no longer available.");
    const feedback = session.feedback[questionNumber];
    if (!feedback?.questionId) {
      throw new Error("Save or link this attempt's question card first.");
    }
    const card = await createFactCardAndLink(
      {
        ...input,
        subjectId: session.subjectId,
        chapterId: session.chapterId,
        topicIds: feedback.topics.map((topic) => topic.id),
        createdFromAttemptId:
          feedback.attemptId ?? globalThis.crypto.randomUUID(),
      },
      feedback.questionId,
      { userId: authUser?.id },
    );
    await refreshCardData();
    if (authUser) void performSync(authUser);
    return card;
  }

  async function useFactCardForAttempt(questionNumber: number, card: FactCard) {
    const questionId = session?.feedback[questionNumber]?.questionId;
    if (!questionId) {
      throw new Error("Save or link this attempt's question card first.");
    }
    await linkQuestionAndFact(questionId, card.id, { userId: authUser?.id });
    await refreshCardData();
    if (authUser) void performSync(authUser);
  }

  async function saveSession() {
    if (!session) return;
    const recordId = globalThis.crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const timedQuestions = Object.entries(session.questionTimesMs)
      .map(([questionNumber, timeMs]) => ({
        questionNumber: Number(questionNumber),
        timeMs,
      }))
      .sort((left, right) => left.questionNumber - right.questionNumber);
    const attempts: AttemptRecord[] = [];
    const attemptValidationErrors: string[] = [];
    const topicsByQuestionId = new Map<string, Set<string>>();
    timedQuestions.forEach(({ questionNumber, timeMs }) => {
      const feedback = session.feedback[questionNumber] ?? {
        result: null,
        cause: null,
        slipSubtype: null,
        topics: [],
      };
      attemptValidationErrors.push(
        ...validateAttempt({
          result: feedback.result,
          cause: feedback.cause,
          slipSubtype: feedback.slipSubtype,
          topicIds: feedback.topics.map((topic) => topic.id),
        }).map((message) => `Q${questionNumber}: ${message}`),
      );
      if (feedback.result !== null && feedback.result !== "right" && feedback.result !== "wrong_question") {
        if (!feedback.questionId) attemptValidationErrors.push("Q" + questionNumber + ": Save the question card.");
        if (!feedback.solutionSaved) attemptValidationErrors.push("Q" + questionNumber + ": Save a text or image solution.");
        if (!feedback.difficulty) attemptValidationErrors.push("Q" + questionNumber + ": Choose intrinsic question difficulty.");
        if (feedback.cause === "missing_fact" && !questionFactLinks.some((link) => link.questionId === feedback.questionId && !link.deletedAt)) {
          attemptValidationErrors.push("Q" + questionNumber + ": Link or create the forgotten fact card.");
        }
      }
      if (timeMs > SMARTER_APPROACH_THRESHOLD_MS && feedback.result === "right" && feedback.smarterApproach === "found" && (!feedback.questionId || !feedback.smarterApproachSaved || !feedback.difficulty)) {
        attemptValidationErrors.push("Q" + questionNumber + ": Complete the faster-method card and difficulty.");
      }
      if (feedback.result === null) return;
      if (feedback.questionId && feedback.topics.length > 0) {
        const linkedTopics =
          topicsByQuestionId.get(feedback.questionId) ?? new Set<string>();
        feedback.topics.forEach((topic) => linkedTopics.add(topic.id));
        topicsByQuestionId.set(feedback.questionId, linkedTopics);
      }
      attempts.push({
        id: feedback.attemptId ?? globalThis.crypto.randomUUID(),
        ...(authUser ? { ownerUserId: authUser.id } : {}),
        syncStatus: authUser ? "pending" : "local",
        sessionId: recordId,
        ...(feedback.questionId ? { questionId: feedback.questionId } : {}),
        timeMs,
        result: feedback.result,
        ...(feedback.cause ? { cause: feedback.cause } : {}),
        ...(feedback.slipSubtype
          ? { slipSubtype: feedback.slipSubtype }
          : {}),
        topicIds: feedback.topics.map((topic) => topic.id),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });
    if (attemptValidationErrors.length > 0) {
      setSaveError(attemptValidationErrors.join(" "));
      return;
    }

    const finalizedQuestionIds = new Set(
      attempts.map((attempt) => attempt.questionId).filter((id): id is string => Boolean(id)),
    );
    const finalizedFactIds = new Set(
      questionFactLinks
        .filter((link) => finalizedQuestionIds.has(link.questionId) && !link.deletedAt)
        .map((link) => link.factId),
    );
    const finalizedImageIds = new Set<string>();
    questionCards
      .filter((card) => finalizedQuestionIds.has(card.id))
      .forEach((card) => {
        [card.promptImageId, card.solutionImageId, card.smarterApproachImageId,
          ...(card.solutionImageIds ?? [])].forEach((id) => {
          if (id) finalizedImageIds.add(id);
        });
      });
    factCards
      .filter((card) => finalizedFactIds.has(card.id))
      .forEach((card) => {
        [card.promptImageId, card.contentImageId].forEach((id) => {
          if (id) finalizedImageIds.add(id);
        });
      });

    const rightCount = attempts.filter(
      (attempt) => attempt.result === "right",
    ).length;
    const wrongCount = attempts.filter(
      (attempt) => attempt.result === "wrong",
    ).length;
    const couldntSolveCount = attempts.filter(
      (attempt) => attempt.result === "couldnt_solve",
    ).length;
    const topicCounts = new Map<
      string,
      { topic: string; questionCount: number }
    >();
    attempts.forEach((attempt, index) => {
      if (attempt.result === "right" || attempt.result === "wrong_question") return;
      const feedback = session.feedback[timedQuestions[index].questionNumber];
      feedback.topics.forEach((topic) => {
        const current = topicCounts.get(topic.id);
        topicCounts.set(topic.id, {
          topic: topic.name,
          questionCount: (current?.questionCount ?? 0) + 1,
        });
      });
    });
    const endedAt = session.endedAt ?? Date.now();
    const subject = getSubject(session.subjectId);
    const chapter = getChapter(session.subjectId, session.chapterId);
    if (!subject || !chapter) {
      setSaveError("The selected chapter is not present in the loaded syllabus.");
      return;
    }

    const timedQuestionCount = attempts.length;
    const activeTimeMs = attempts.reduce(
      (total, attempt) => total + attempt.timeMs,
      0,
    );
    const record: SessionRecord = {
      id: recordId,
      ...(authUser
        ? { ownerUserId: authUser.id, syncStatus: "pending" as const }
        : { syncStatus: "local" as const }),
      sessionKind: "practice",
      subject: subject.name,
      subjectId: subject.id,
      chapter: chapter.name,
      chapterId: chapter.id,
      syllabusExam: jeeSyllabus.exam,
      startedAt: new Date(session.startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      plannedDurationMinutes: session.duration,
      status: endedAt >= session.endsAt ? "completed" : "ended_early",
      rightCount,
      wrongCount,
      couldntSolveCount,
      timedQuestionCount,
      activeTimeMs,
      avgTimePerQuestionMs:
        timedQuestionCount > 0
          ? Math.round(activeTimeMs / timedQuestionCount)
          : null,
      weakTopics: Array.from(topicCounts, ([topicId, topic]) => ({
        topic: topic.topic,
        topicId,
        questionCount: topic.questionCount,
      })),
    };

    setIsSavingSession(true);
    setSaveError(null);
    try {
      if (activeSessionWriteTimeout.current !== null) {
        window.clearTimeout(activeSessionWriteTimeout.current);
        activeSessionWriteTimeout.current = null;
      }
      await activeSessionWriteQueue.current;
      const updatedQuestionCards = new Map<string, QuestionCard>();
      await database.transaction(
        "rw",
        database.sessions,
        database.attempts,
        database.activeSession,
        database.questions,
        async () => {
          await database.sessions.add(record);
          await database.attempts.bulkPut(attempts);
          for (const [questionId, topicIds] of topicsByQuestionId) {
            const card = await database.questions.get(questionId);
            if (!card) continue;
            const updated: QuestionCard = {
              ...card,
              topicIds: Array.from(new Set([...card.topicIds, ...topicIds])),
              updatedAt: timestamp,
              syncStatus: card.ownerUserId ? "pending" : "local",
            };
            await database.questions.put(updated);
            updatedQuestionCards.set(questionId, updated);
          }
          await database.activeSession.delete("current");
        },
      );
      if (updatedQuestionCards.size > 0) {
        setQuestionCards((cards) =>
          cards.map((card) => updatedQuestionCards.get(card.id) ?? card),
        );
      }
      setPersistenceError(null);
      setSavedSessions((current) =>
        [record, ...current].sort((left, right) =>
          right.endedAt.localeCompare(left.endedAt),
        ),
      );
      if (!authUser) {
        setUnassignedSessionCount((count) => count + 1);
      }
      await queueImagesForUpload(Array.from(finalizedImageIds));
      setSession({ ...session, phase: "summary", record });
      if (authUser) void performSync(authUser);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? `Could not save this session: ${error.message}`
          : "Could not save this session. Please try again.",
      );
    } finally {
      setIsSavingSession(false);
    }
  }

  async function resumeRecoveredSession() {
    if (!recoveryCandidate) return;
    const resumedAt = Date.now();
    const recovered = recoverSessionSnapshot(recoveryCandidate, resumedAt);
    lastInteractionAtRef.current = recovered.lastInteractionAt;
    pendingWarningRef.current = recovered.pendingWarning;
    setPendingWarning(recovered.pendingWarning);
    setNow(resumedAt);
    setRecoveryCandidate(null);
    setSession(recovered.session);
    setPersistenceError(null);
  }

  async function discardRecoveredSession() {
    try {
      await clearActiveSessionSnapshot();
      setRecoveryCandidate(null);
      setPendingWarning(null);
      pendingWarningRef.current = null;
      lastInteractionAtRef.current = Date.now();
    } catch (error) {
      setPersistenceError(
        error instanceof Error
          ? `Could not discard the recovered session: ${error.message}`
          : "Could not discard the recovered session.",
      );
    }
  }

  async function startNewSession() {
    try {
      await clearActiveSessionSnapshot();
      setSession(null);
      setActiveTab("practice");
      setPendingWarning(null);
      pendingWarningRef.current = null;
      lastInteractionAtRef.current = Date.now();
    } catch (error) {
      setPersistenceError(
        error instanceof Error
          ? `Could not clear the previous session: ${error.message}`
          : "Could not clear the previous session.",
      );
    }
  }

  if (isAuthLoading || isLoadingActiveSession) {
    return (
      <main className="setup-shell">
        <section className="setup-card" aria-live="polite">
          <p className="eyebrow">JEE PRACTICE</p>
          <h1>Checking for an active session.</h1>
        </section>
      </main>
    );
  }

  if (!authUser) {
    return (
      <main className="setup-shell">
        <section className="setup-card" aria-labelledby="app-title">
          <p className="eyebrow">MEASURE · JEE PRACTICE</p>
          <h1 id="app-title">Sign in to continue.</h1>
          <p className="intro">
            A Google account is required so every practice session, question
            card, fact card and image is associated with your account and can
            sync across devices.
          </p>
          <AccountPanel
            configured={supabaseConfigured}
            email={undefined}
            authMessage={authMessage}
            authError={authError}
            isSubmittingAuth={isSubmittingAuth}
            syncStatus={syncStatus}
            syncError={syncError}
            unassignedSessionCount={unassignedSessionCount}
            unassignedCardCount={unassignedCardCount}
            onGoogleSignIn={() => void signInWithGoogle()}
            onSignOut={() => undefined}
            onImportLocalSessions={() => undefined}
            onSyncNow={() => undefined}
          />
        </section>
      </main>
    );
  }

  if (recoveryCandidate) {
    return (
      <SessionRecoveryScreen
        snapshot={recoveryCandidate}
        error={persistenceError}
        onResume={() => void resumeRecoveredSession()}
        onDiscard={() => void discardRecoveredSession()}
      />
    );
  }

  if (!session && activeTab === "cards") {
    return (
      <CardsScreen
        questions={questionCards}
        facts={factCards}
        links={questionFactLinks}
        reviews={factReviews}
        attempts={attemptRecords}
        userId={authUser?.id}
        onImageUploadComplete={() => { if (authUser) void performSync(authUser); }}
        syncError={syncError}
        onCreateFact={(input) =>
          createFactCard(input, { userId: authUser?.id }).then(async (card) => {
            await refreshCardData();
            if (authUser) void performSync(authUser);
            return card;
          })
        }
        onCreateLinkedFact={(input, questionId) =>
          createFactCardAndLink(input, questionId, {
            userId: authUser?.id,
          }).then(async (card) => {
            await refreshCardData();
            if (authUser) void performSync(authUser);
            return card;
          })
        }
        onUpdateQuestion={(card, input) =>
          updateQuestionCard(card, input).then(async (updated) => {
            await refreshCardData();
            if (authUser) void performSync(authUser);
            return updated;
          })
        }
        onUpdateFact={(card, input) =>
          updateFactCard(card, input).then(async (updated) => {
            await refreshCardData();
            if (authUser) void performSync(authUser);
            return updated;
          })
        }
        onDeleteQuestion={(id) =>
          softDeleteQuestionCard(id).then(async () => {
            await refreshCardData();
            if (authUser) void performSync(authUser);
          })
        }
        onDeleteFact={(id) =>
          softDeleteFactCard(id).then(async () => {
            await refreshCardData();
            if (authUser) void performSync(authUser);
          })
        }
        onLink={async (questionId, factId) => {
          await linkQuestionAndFact(questionId, factId, {
            userId: authUser?.id,
          });
          await refreshCardData();
          if (authUser) void performSync(authUser);
        }}
        onUnlink={async (questionId, factId) => {
          await unlinkQuestionAndFact(questionId, factId);
          await refreshCardData();
          if (authUser) void performSync(authUser);
        }}
        onRefresh={refreshCardData}
        activeTab="cards"
        onNavigate={navigate}
      />
    );
  }

  if (!session && activeTab === "history") {
    return (
      <main className="cards-shell">
        <header className="cards-header">
          <div>
            <p className="eyebrow">YOUR PRACTICE</p>
            <h1>History</h1>
          </div>
        </header>
        <section className="saved-sessions history-page-list">
          <h2>Saved sessions</h2>
          {isLoadingSessions ? (
            <p className="history-empty">Loading saved sessions…</p>
          ) : savedSessions.length === 0 ? (
            <p className="history-empty">Your saved sessions will appear here.</p>
          ) : (
            <ul>
              {savedSessions.map((record) => (
                <li key={record.id}>
                  <div className="history-session-title">
                    <strong>{record.chapter}</strong>
                    <span>{record.subject} · {new Date(record.endedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="history-session-stats">
                    <span>{record.timedQuestionCount} timed</span>
                    <span>{record.rightCount} right</span>
                    <span>{record.wrongCount} wrong</span>
                    <span>{formatStopwatch(record.activeTimeMs)} active</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <MainNavigation activeTab={activeTab} onNavigate={navigate} />
      </main>
    );
  }

  if (session?.phase === "summary" && session.record) {
    return (
      <SessionSummaryScreen
        record={session.record}
        feedback={session.feedback}
        questionTimesMs={session.questionTimesMs}
        questionCards={questionCards}
        questionFactLinks={questionFactLinks}
        syncStatus={syncStatus}
        onNewSession={() => void startNewSession()}
      />
    );
  }

  if (session?.phase === "feedback") {
    return (
      <SessionFeedbackScreen
        session={session}
        userId={authUser.id}
        onImageUploadComplete={() => { if (authUser) void performSync(authUser); }}
        persistenceError={persistenceError}
        saveError={saveError}
        isSaving={isSavingSession}
        onSetQuestionResult={setQuestionResult}
        onSetCause={setQuestionCause}
        onSetSlipSubtype={setQuestionSlipSubtype}
        onSetSmarterApproach={setSmarterApproach}
        onAddTopic={addTopic}
        onRemoveTopic={removeTopic}
        questions={questionCards}
        facts={factCards}
        links={questionFactLinks}
        onCreateQuestionCard={saveFeedbackQuestionCard}
        onUseQuestionCard={useQuestionCardForAttempt}
        onSaveSmarterApproach={saveSmarterApproach}
        onSaveSolution={saveSolution}
        onSaveDifficulty={saveQuestionDifficulty}
        onCreateFactCard={saveFeedbackFactCard}
        onUseFactCard={useFactCardForAttempt}
        onSave={() => void saveSession()}
      />
    );
  }

  if (session) {
    return (
        <PracticeSessionScreen
          session={session}
          remaining={remaining}
          stopwatchElapsed={stopwatchElapsed}
          isOverAverage={isOverAverage}
          warning={pendingWarning}
          persistenceError={persistenceError}
          onEnd={() => endSession()}
          onToggleStopwatch={toggleStopwatch}
          onSkipQuestion={skipNextQuestion}
          onUpdateQuestionNumber={updateQuestionNumberText}
          onCommitQuestionNumber={commitQuestionNumberText}
          onConfirmStillHere={confirmStillHere}
        />
    );
  }

  return (
    <main className="setup-shell">
      <section className="setup-card" aria-labelledby="app-title">
        <p className="eyebrow">JEE PRACTICE</p>
        <h1 id="app-title">Set up your session.</h1>
        <p className="intro">
          Choose what you’re practicing. Your session opens in a landscape-style
          view.
        </p>

        <AccountPanel
          configured={supabaseConfigured}
          email={authUser?.email}
          authMessage={authMessage}
          authError={authError}
          isSubmittingAuth={isSubmittingAuth}
          syncStatus={syncStatus}
          syncError={syncError}
          unassignedSessionCount={unassignedSessionCount}
          unassignedCardCount={unassignedCardCount}
          onGoogleSignIn={() => void signInWithGoogle()}
          onSignOut={() => void signOut()}
          onImportLocalSessions={() => void importLocalSessions()}
          onSyncNow={() => {
            if (authUser) void performSync(authUser);
          }}
        />

        <p className="storage-note">
          {authUser
            ? "Sessions are stored locally first and synced securely when online."
            : "Sessions are saved on this device. Sign in to enable cloud backup and sync."}
        </p>
        {persistenceError && (
          <p className="database-error" role="alert">
            {persistenceError}
          </p>
        )}
        {databaseError && (
          <p className="database-error" role="alert">
            {databaseError}
          </p>
        )}

        <form className="setup-form" onSubmit={startSession}>
          <SearchSelect
            label="Subject"
            value={setup.subjectId}
            options={jeeSyllabus.subjects.map((subject) => ({
              id: subject.id,
              label: subject.name,
            }))}
            placeholder="Search subjects"
            emptyMessage="No subjects match."
            onChange={(subjectId) =>
              setSetup((current) => ({
                ...current,
                subjectId: subjectId as SyllabusSubjectId,
                chapterId: "",
              }))
            }
          />

          <SearchSelect
            label="Chapter"
            value={setup.chapterId}
            options={
              setupSubject?.chapters.map((chapter) => ({
                id: chapter.id,
                label: chapter.name,
                detail: `Unit ${chapter.unit}`,
              })) ?? []
            }
            placeholder="Search chapters"
            emptyMessage="No chapters match. Try another search."
            onChange={(chapterId) => updateSetup("chapterId", chapterId)}
          />

          <fieldset className="duration-field">
            <legend>Duration</legend>
            <div className="duration-options">
              {DURATIONS.map((duration) => (
                <button
                  className={
                    setup.duration === duration ? "duration-option selected" : "duration-option"
                  }
                  key={duration}
                  type="button"
                  aria-pressed={setup.duration === duration}
                  onClick={() => updateSetup("duration", duration)}
                >
                  {duration} min
                </button>
              ))}
            </div>
          </fieldset>

          <label>
            Starting question number
            <input
              type="number"
              min="1"
              step="1"
              value={setup.startingQuestion}
              onChange={(event) =>
                updateSetup(
                  "startingQuestion",
                  event.target.value === "" ? 0 : Number(event.target.value),
                )
              }
              required
            />
          </label>

          <button
            className="start-button"
            type="submit"
            disabled={!setup.chapterId || setup.startingQuestion < 1}
          >
            Start session
          </button>
        </form>

        <section
          className="saved-sessions"
          aria-labelledby="saved-sessions-title"
        >
          <h2 id="saved-sessions-title">Recent sessions</h2>
          {isLoadingSessions ? (
            <p className="history-empty">Loading saved sessions…</p>
          ) : savedSessions.length === 0 ? (
            <p className="history-empty">Your saved sessions will appear here.</p>
          ) : (
            <ul>
              {savedSessions.slice(0, 5).map((record) => {
                const questionCount =
                  record.rightCount +
                  record.wrongCount +
                  record.couldntSolveCount;
                return (
                  <li key={record.id}>
                    <div className="history-session-title">
                      <strong>{record.chapter}</strong>
                      <span>
                        {record.subject} ·{" "}
                        {new Date(record.endedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="history-session-stats">
                      <span>{questionCount} timed</span>
                      <span>{record.rightCount} right</span>
                      <span>{formatStopwatch(record.activeTimeMs)} active</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <MainNavigation activeTab={activeTab} onNavigate={navigate} />
      </section>
    </main>
  );
}

export default App;
