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
  buildFactCardRecord,
  buildQuestionCardRecord,
  createFactCard,
  createFactCardAndLink,
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
import { clearDriveAuthorization, driveImageStore, hasDriveAccessToken, prepareDriveConnection, processUploadQueue, retryFailedUploads } from "./features/images/driveImageStore";
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
import SyncScreen from "./features/sync/SyncScreen";
import StudyIntervalPanel from "./features/study-interval/StudyIntervalPanel";
import { getActiveStudyInterval, getPracticeSessionEndAt, resolveDayIntervals } from "./features/study-interval/studyInterval";
import { getOrCreateStudyDaySnapshot } from "./features/study-interval/studyIntervalRepository";
import { getFeedbackDeadlineAt, isFeedbackExpired } from "./features/study-interval/feedbackDeadline";

const DURATIONS = [30, 45, 60, 90, 120];
const ACTIVE_SESSION_SAVE_DEBOUNCE_MS = 300;

function App() {
  const [activeTab, setActiveTab] = useState<"practice" | "cards" | "history" | "sync">(
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
  const [studyIntervalError, setStudyIntervalError] = useState<string | null>(null);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "synced" | "offline" | "error"
  >("idle");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [driveConnectionStatus, setDriveConnectionStatus] = useState<"loading" | "idle" | "connecting" | "connected" | "error">("loading");
  const [driveConnectionError, setDriveConnectionError] = useState<string | null>(null);
  const [unassignedSessionCount, setUnassignedSessionCount] = useState(0);
  const [unassignedCardCount, setUnassignedCardCount] = useState(0);
  const [pendingPhotoCount, setPendingPhotoCount] = useState(0);
  const [syncPhase, setSyncPhase] = useState<"sessions" | "photos" | "finalizing" | null>(null);
  const [syncingSessionId, setSyncingSessionId] = useState<string | null>(null);
  const [syncingFactCardId, setSyncingFactCardId] = useState<string | null>(null);
  const [photoUploadProgress, setPhotoUploadProgress] = useState({ completed: 0, total: 0, failed: 0, currentImageId: null as string | null });
  const [syncDriveProgress, setSyncDriveProgress] = useState<Record<string, { completed: number; total: number; failed: number }>>({});
  const syncInProgress = useRef(false);
  const syncRequestedAgain = useRef(false);
  const sessionRef = useRef<ActiveSession | null>(null);
  const recoveryCandidateRef = useRef<ActiveSessionSnapshot | null>(null);
  const lastInteractionAtRef = useRef(Date.now());
  const pendingWarningRef = useRef<InactivityWarning | null>(null);
  const activeSessionWriteTimeout = useRef<number | null>(null);
  const activeSessionWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const previousAuthUserId = useRef<string | null>(null);
  const accountDataLoadVersion = useRef(0);
  const expiredSessionCleanupInProgress = useRef(false);

  useEffect(() => {
    const nextUserId = authUser?.id ?? null;
    if (previousAuthUserId.current && previousAuthUserId.current !== nextUserId) {
      clearDriveAuthorization();
      setDriveConnectionStatus("idle");
      setDriveConnectionError(null);
    }
    previousAuthUserId.current = nextUserId;
  }, [authUser?.id]);

  async function refreshCardData(expectedVersion?: number) {
    const [questions, facts, links, attempts, reviews] = await Promise.all([
      database.questions.toArray(),
      database.factCards.toArray(),
      database.questionFactLinks.toArray(),
      database.attempts.toArray(),
      database.factReviews.toArray(),
    ]);
    if (
      expectedVersion !== undefined &&
      expectedVersion !== accountDataLoadVersion.current
    ) {
      return;
    }
    // Signed-in accounts must never see unassigned records or records owned
    // by another account. Anonymous mode is limited to unassigned local data.
    const belongsToCurrentAccount = (ownerUserId?: string) =>
      authUser ? ownerUserId === authUser.id : !ownerUserId;
    setQuestionCards(questions.filter((card) => belongsToCurrentAccount(card.ownerUserId)));
    setFactCards(facts.filter((card) => belongsToCurrentAccount(card.ownerUserId)));
    setQuestionFactLinks(links.filter((link) => belongsToCurrentAccount(link.ownerUserId)));
    setAttemptRecords(attempts.filter((attempt) => belongsToCurrentAccount(attempt.ownerUserId)));
    setFactReviews(reviews.filter((review) => belongsToCurrentAccount(review.ownerUserId)));
    setUnassignedCardCount(
      questions.filter((card) => !card.ownerUserId).length +
        facts.filter((card) => !card.ownerUserId).length +
        links.filter((link) => !link.ownerUserId).length,
    );
  }

  function navigate(tab: "practice" | "cards" | "history" | "sync") {
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
  async function discardExpiredPendingSession(pendingSession: ActiveSession) {
    // Remove the pending session snapshot, then clean only its unreferenced,
    // account-owned local image drafts. Never cascade into independently saved cards.
    await clearActiveSessionSnapshot();
    const candidateImageIds = new Set<string>();
    Object.values(pendingSession.feedback).forEach((feedback) => {
      const questionDraft = feedback.questionDraft;
      const smarterDraft = feedback.smarterApproachDraft;
      const factDraft = feedback.factDraft;
      [
        questionDraft?.promptImageId,
        questionDraft?.solutionImageId,
        ...(questionDraft?.solutionImageIds ?? []),
        smarterDraft?.solutionImageId,
        ...(smarterDraft?.solutionImageIds ?? []),
        factDraft?.promptImageId,
        factDraft?.contentImageId,
      ].forEach((id) => { if (id) candidateImageIds.add(id); });
    });
    if (candidateImageIds.size === 0) return;
    const [questions, facts] = await Promise.all([
      database.questions.toArray(),
      database.factCards.toArray(),
    ]);
    const referencedImageIds = new Set<string>();
    questions.forEach((card) => [
      card.promptImageId, card.solutionImageId, card.smarterApproachImageId,
      ...(card.solutionImageIds ?? []),
    ].forEach((id) => { if (id) referencedImageIds.add(id); }));
    facts.forEach((card) => [card.promptImageId, card.contentImageId]
      .forEach((id) => { if (id) referencedImageIds.add(id); }));
    const candidateIds = Array.from(candidateImageIds).filter((id) => !referencedImageIds.has(id));
    if (candidateIds.length === 0) return;
    const rows = await database.localImages.bulkGet(candidateIds);
    const deletableIds = candidateIds.filter((id, index) =>
      rows[index]?.ownerUserId === authUser?.id &&
      ["local", "pending", "failed"].includes(rows[index]!.status),
    );
    if (deletableIds.length === 0) return;
    await database.transaction("rw", database.localImages, database.localImageBlobs, async () => {
      await database.localImages.bulkDelete(deletableIds);
      await database.localImageBlobs.bulkDelete(deletableIds);
    });
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
    if (!recoveryCandidate || !authUser || recoveryCandidate.session.feedbackDeadlineAt !== undefined) return;
    let cancelled = false;
    void (async () => {
      try {
        const daySnapshot = await getOrCreateStudyDaySnapshot(authUser.id, new Date(recoveryCandidate.session.startedAt));
        const deadlineAt = daySnapshot
          ? getFeedbackDeadlineAt(new Date(recoveryCandidate.session.startedAt), daySnapshot.schedule, daySnapshot.feedbackGraceHours ?? 6)
          : null;
        if (cancelled) return;
        if (isFeedbackExpired(deadlineAt, Date.now())) {
          await discardExpiredPendingSession(recoveryCandidate.session);
          if (!cancelled) {
            setRecoveryCandidate(null);
            setStudyIntervalError("The feedback deadline has passed. The unfinished practice session was discarded. Independently saved fact cards were kept.");
          }
          return;
        }
        setRecoveryCandidate((current) => current ? {
          ...current,
          session: { ...current.session, feedbackDeadlineAt: deadlineAt ?? undefined },
        } : current);
      } catch (error) {
        if (!cancelled) setPersistenceError(error instanceof Error ? error.message : "Could not check the feedback deadline.");
      }
    })();
    return () => { cancelled = true; };
  }, [recoveryCandidate, authUser]);

  useEffect(() => {
    let cancelled = false;
    void prepareDriveConnection()
      .then(() => { if (!cancelled) setDriveConnectionStatus("idle"); })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDriveConnectionStatus("error");
          setDriveConnectionError(error instanceof Error ? error.message : "Could not load Google Drive authorization.");
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, authSession) => {
      // A Supabase sign-in starts a new app account session. Never carry a
      // Google Drive access token across that boundary, even in the same tab.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        // Clear account-scoped UI immediately so the previous account's local
        // records are never visible while the next account's records load.
        setSavedSessions([]);
        setQuestionCards([]);
        setFactCards([]);
        setQuestionFactLinks([]);
        setAttemptRecords([]);
        setFactReviews([]);
      }
      // Drive authorization belongs to the current app account, not to an
      // individual Supabase auth event. SIGNED_IN can fire again for the same
      // user (including during Drive OAuth); clearing here would erase the
      // freshly returned Google token. The authUser identity-change effect
      // above handles actual account switches and sign-outs.
      if (event === "SIGNED_OUT") {
        clearDriveAuthorization();
        setDriveConnectionStatus("idle");
        setDriveConnectionError(null);
      }
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
    // Do not treat records as anonymous while Supabase is still restoring the
    // signed-in account. That can briefly expose another account's local view.
    setSavedSessions([]);
    setIsLoadingSessions(true);
    if (isAuthLoading) {
      return () => {
        cancelled = true;
      };
    }

    const requestedUserId = authUser?.id ?? null;
    database.sessions
      .toArray()
      .then((records) => {
        if (cancelled) return;
        const unassigned = records.filter((record) => !record.ownerUserId);
        setUnassignedSessionCount(unassigned.length);
        setSavedSessions(
          requestedUserId
            ? records.filter((record) => record.ownerUserId === requestedUserId)
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
  }, [authUser, isAuthLoading]);

  useEffect(() => {
    const requestVersion = ++accountDataLoadVersion.current;
    setQuestionCards([]);
    setFactCards([]);
    setQuestionFactLinks([]);
    setAttemptRecords([]);
    setFactReviews([]);
    if (isAuthLoading) return;
    void refreshCardData(requestVersion).catch((error: unknown) => {
      setDatabaseError(
        error instanceof Error
          ? `Could not load cards: ${error.message}`
          : "Could not load cards.",
      );
    });
  }, [authUser, isAuthLoading]);

  async function refreshSyncDriveProgress() {
    const ownerFilter = (ownerUserId?: string) => authUser
      ? ownerUserId === authUser.id
      : !ownerUserId;
    const [attempts, questions, facts, images] = await Promise.all([
      database.attempts.filter((row) => ownerFilter(row.ownerUserId)).toArray(),
      database.questions.filter((row) => ownerFilter(row.ownerUserId)).toArray(),
      database.factCards.filter((row) => ownerFilter(row.ownerUserId)).toArray(),
      database.localImages.filter((row) => ownerFilter(row.ownerUserId)).toArray(),
    ]);
    const sessionByAttempt = new Map(attempts.map((attempt) => [attempt.id, attempt.sessionId]));
    const imageById = new Map(images.map((image) => [image.id, image]));
    const sessionImageIds = new Map<string, Set<string>>();
    const next: Record<string, { completed: number; total: number; failed: number }> = {};
    const addSessionImages = (attemptId: string | undefined, ids: Array<string | undefined>) => {
      if (!attemptId) return;
      const sessionId = sessionByAttempt.get(attemptId);
      if (!sessionId) return;
      const set = sessionImageIds.get(sessionId) ?? new Set<string>();
      ids.forEach((id) => { if (id) set.add(id); });
      sessionImageIds.set(sessionId, set);
    };
    questions.forEach((card) => addSessionImages(card.createdFromAttemptId, [
      card.promptImageId, card.solutionImageId, ...(card.solutionImageIds ?? []), card.smarterApproachImageId,
    ]));
    facts.forEach((card) => addSessionImages(card.createdFromAttemptId, [card.promptImageId, card.contentImageId]));
    const summarize = (ids: Set<string>) => {
      const rows = Array.from(ids).map((id) => imageById.get(id));
      return {
        total: ids.size,
        completed: rows.filter((image) => image?.status === "uploaded" && Boolean(image.remoteId)).length,
        failed: rows.filter((image) => image?.status === "failed").length,
      };
    };
    savedSessions.forEach((record) => {
      next[record.id] = summarize(sessionImageIds.get(record.id) ?? new Set<string>());
    });
    facts.filter((card) => !card.createdFromAttemptId).forEach((card) => {
      next[card.id] = summarize(new Set([card.promptImageId, card.contentImageId].filter((id): id is string => Boolean(id))));
    });
    setSyncDriveProgress(next);
  }

  function handleSessionSyncProgress(record: SessionRecord, status: "syncing" | "synced") {
    if (status === "syncing") {
      setSyncingSessionId(record.id);
      return;
    }
    setSyncingSessionId(null);
    setSavedSessions((current) => {
      const next = [...current.filter((item) => item.id !== record.id), record];
      return next.sort((left, right) => right.endedAt.localeCompare(left.endedAt));
    });
  }

  function handleFactCardSyncProgress(card: FactCard, status: "syncing" | "synced") {
    if (status === "syncing") {
      setSyncingFactCardId(card.id);
      return;
    }
    setSyncingFactCardId(null);
    setFactCards((current) => current.map((item) => item.id === card.id ? card : item));
  }

  async function performSync(user: User, afterSessionSubmission = false) {
    if (session?.phase === "feedback" && !afterSessionSubmission) return;
    if (syncInProgress.current) {
      syncRequestedAgain.current = true;
      return;
    }
    if (!navigator.onLine) {
      setSyncStatus("offline");
      setSyncError(null);
      return;
    }

    syncInProgress.current = true;
    setSyncStatus("syncing");
    setSyncError(null);
    try {
      // Practice metadata is independent of Google Drive. Sync it first so a
      // missing/expired Drive token can never block session backup.
      setSyncPhase("sessions");
      await syncAccountSessions(user, handleSessionSyncProgress, handleFactCardSyncProgress);

      // Older fact cards may already contain image IDs whose image records were
      // left in the initial "local" state. Enqueue those existing attachments
      // as part of sync too, so this fix also recovers cards created previously.
      const ownedFacts = await database.factCards.where("ownerUserId").equals(user.id).toArray();
      const attachedFactImageIds = Array.from(new Set(ownedFacts.flatMap((card) =>
        [card.promptImageId, card.contentImageId].filter((id): id is string => Boolean(id)),
      )));
      const attachedFactImages = await database.localImages.bulkGet(attachedFactImageIds);
      const locallySavedFactImageIds = attachedFactImages.flatMap((image) =>
        image?.ownerUserId === user.id && image.status === "local" ? [image.id] : [],
      );
      await queueImagesForUpload(user.id, locallySavedFactImageIds);

      // Upload photos only when the user has explicitly connected Drive in
      // this browser session. A Drive failure is isolated from metadata sync.
      if (hasDriveAccessToken(user.id)) {
        setSyncPhase("photos");
        setPhotoUploadProgress({ completed: 0, total: 0, failed: 0, currentImageId: null });
        setDriveConnectionError(null);
        try {
          await processUploadQueue(user.id, driveImageStore, (progress) => {
            setPhotoUploadProgress(progress);
            if (progress.failed > 0) {
              setDriveConnectionError("Some photos could not be uploaded yet. They remain on this device and can be retried.");
            }
          });
          if (hasDriveAccessToken(user.id)) {
            setDriveConnectionStatus("connected");
          } else {
            setDriveConnectionStatus("error");
            setDriveConnectionError("Google Drive authorization expired. Reconnect Drive to continue photo backup. Your practice data is safe.");
          }
        } catch (photoError) {
          setDriveConnectionStatus("error");
          setDriveConnectionError(
            photoError instanceof Error ? photoError.message : "Photo backup could not run.",
          );
        }
        // New Drive IDs are now available when uploads succeeded. This second
        // metadata pass is deliberately outside the Drive error handler so a
        // Supabase failure is reported as a cloud-sync failure, not a Drive one.
        setSyncPhase("finalizing");
        await syncAccountSessions(user, handleSessionSyncProgress, handleFactCardSyncProgress);
      } else if (driveConnectionStatus === "connected") {
        setDriveConnectionStatus("idle");
        setDriveConnectionError(null);
      }

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
      const remainingPhotos = await database.localImages
        .where("ownerUserId")
        .equals(user.id)
        .filter((image) => ["pending", "uploading", "failed"].includes(image.status))
        .count();
      setPendingPhotoCount(remainingPhotos);
      const [
        pendingQuestions,
        pendingFacts,
        pendingLinks,
        pendingReviews,
        pendingAttempts,
      ] = await Promise.all([
        database.questions.where("ownerUserId").equals(user.id)
          .filter((row) => row.syncStatus !== "synced").count(),
        database.factCards.where("ownerUserId").equals(user.id)
          .filter((row) => row.syncStatus !== "synced").count(),
        database.questionFactLinks.where("ownerUserId").equals(user.id)
          .filter((row) => row.syncStatus !== "synced").count(),
        database.factReviews.where("ownerUserId").equals(user.id)
          .filter((row) => row.syncStatus !== "synced").count(),
        database.attempts.where("ownerUserId").equals(user.id)
          .filter((row) => row.syncStatus !== "synced").count(),
      ]);
      if (pendingQuestions + pendingFacts + pendingLinks + pendingReviews + pendingAttempts > 0) {
        setSyncStatus("error");
        setSyncError(
          "Your practice sessions are backed up. Some cards are still waiting for their photos or linked records. They will sync when those are available.",
        );
      } else {
        setSyncStatus("synced");
      }
    } catch (error) {
      setSyncStatus("error");
      setSyncError(
        error instanceof Error
          ? error.message
          : "Could not sync sessions. Please try again.",
      );
    } finally {
      setSyncPhase(null);
      setSyncingSessionId(null);
      setSyncingFactCardId(null);
      syncInProgress.current = false;
      if (syncRequestedAgain.current) {
        syncRequestedAgain.current = false;
        void performSync(user, afterSessionSubmission);
      }
    }
  }

  useEffect(() => {
    void refreshSyncDriveProgress();
  }, [savedSessions, questionCards, factCards, photoUploadProgress, authUser]);

  useEffect(() => {
    let cancelled = false;
    const pendingQuery = authUser
      ? database.localImages.where("ownerUserId").equals(authUser.id)
          .filter((image) => ["pending", "uploading", "failed"].includes(image.status))
      : database.localImages.filter((image) =>
          !image.ownerUserId && ["pending", "uploading", "failed"].includes(image.status));
    void pendingQuery.count()
      .then((count) => { if (!cancelled) setPendingPhotoCount(count); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [syncStatus, driveConnectionStatus, authUser]);

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
    if (!session || session.phase !== "feedback") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [session?.phase]);

  useEffect(() => {
    if (!session || session.phase !== "feedback" || !isFeedbackExpired(session.feedbackDeadlineAt, now)) return;
    if (expiredSessionCleanupInProgress.current) return;
    expiredSessionCleanupInProgress.current = true;
    void discardExpiredPendingSession(session).then(() => {
      setSession(null);
      setStudyIntervalError("The feedback deadline has passed. This unfinished practice session was discarded; independently saved fact cards were kept.");
    }).catch((error: unknown) => {
      expiredSessionCleanupInProgress.current = false;
      setPersistenceError(error instanceof Error ? error.message : "Could not discard expired feedback.");
    });
  }, [session, now]);

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

  async function connectGoogleDrive() {
    if (!authUser || driveConnectionStatus === "connecting") return;
    setDriveConnectionStatus("connecting");
    setDriveConnectionError(null);
    setSyncStatus("syncing");
    setSyncError(null);
    try {
      await driveImageStore.reconnect(authUser.id);
      setDriveConnectionStatus("connected");
      await retryFailedUploads(authUser.id);
      await performSync(authUser);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not connect Google Drive.";
      setDriveConnectionStatus("error");
      setDriveConnectionError(message);
      setSyncStatus("error");
      setSyncError(message);
    }
  }

  async function signOut() {
    if (!supabase) return;
    if (syncInProgress.current || driveConnectionStatus === "connecting") {
      setAuthError("Wait for the current backup or Google Drive connection to finish before signing out.");
      return;
    }
    setAuthError(null);
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthError(`Could not sign out: ${error.message}`);
      return;
    }
    clearDriveAuthorization();
    setDriveConnectionStatus("idle");
    setDriveConnectionError(null);
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

  async function startSession(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authUser || isStartingSession) return;
    setIsStartingSession(true);
    setStudyIntervalError(null);
    const startedAt = Date.now();
    expiredSessionCleanupInProgress.current = false;
    try {
      const daySnapshot = await getOrCreateStudyDaySnapshot(authUser.id, new Date(startedAt));
      if (!daySnapshot) {
        setStudyIntervalError("Set your weekly Study Intervals before starting a practice session.");
        return;
      }
      const resolved = resolveDayIntervals(new Date(startedAt), daySnapshot.schedule, startedAt);
      const activeInterval = getActiveStudyInterval(resolved, startedAt);
      if (!activeInterval) {
        setStudyIntervalError(daySnapshot.schedule.off
          ? "Today is marked as a day off. You can start practice during your next scheduled interval."
          : "You are outside today's scheduled study intervals. You can start practice when the next interval begins.");
        return;
      }
      lastInteractionAtRef.current = startedAt;
      pendingWarningRef.current = null;
      setPendingWarning(null);
      setNow(startedAt);
      setSession({
        ...setup,
        sessionKind: "practice",
        phase: "active",
        startedAt,
        // The scheduled boundary takes precedence over the chosen session duration.
        endsAt: getPracticeSessionEndAt(startedAt, startedAt + setup.duration * 60_000, activeInterval.endAt),
        endedAt: null,
        feedbackDeadlineAt: getFeedbackDeadlineAt(new Date(startedAt), daySnapshot.schedule, daySnapshot.feedbackGraceHours ?? 6) ?? undefined,
        questionNumber: setup.startingQuestion,
        questionNumberText: String(setup.startingQuestion),
        questionElapsedMs: 0,
        questionStartedAt: null,
        questionTimesMs: {},
        longQuestionPromptedNumbers: [],
        feedback: {},
        record: null,
      });
    } catch (error) {
      setStudyIntervalError(error instanceof Error ? error.message : "Could not check today's Study Interval.");
    } finally {
      setIsStartingSession(false);
    }
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
    const current = session?.feedback[questionNumber] ?? {
      result: null,
      cause: null,
      slipSubtype: null,
      topics: [],
    };
    const resultChanged = current.result !== result;

    // A result change invalidates every result-dependent capture. Clear the
    // attempt's card reference synchronously so a later session save cannot
    // attach a card from the previous outcome.
    if (resultChanged && current.questionId) {
      const previousQuestion = questionCards.find((card) => card.id === current.questionId);
      if (previousQuestion && previousQuestion.createdFromAttemptId === current.attemptId) {
        const previousQuestionId = previousQuestion.id;
        // Discard the attempt-created question, but never cascade-delete fact
        // cards: they are independent records even when their link is removed.
        void (async () => {
          await softDeleteQuestionCard(previousQuestionId);
          await refreshCardData();
        })().catch((error: unknown) => {
          setPersistenceError(error instanceof Error ? error.message : "Could not discard the previous feedback draft.");
        });
      }
    }

    updateFeedbackForQuestion(questionNumber, (latest) => ({
      ...latest,
      result,
      ...(resultChanged
        ? {
            cause: null,
            slipSubtype: null,
            topics: [],
            questionId: undefined,
            questionDraft: undefined,
            smarterApproachDraft: undefined,
            factDraft: undefined,
            linkedFactIds: [],
            solutionSaved: undefined,
            smarterApproach: undefined,
            smarterApproachSaved: undefined,
            difficulty: undefined,
          }
        : {}),
      ...(result === "right" || result === "wrong_question"
        ? { cause: null, slipSubtype: null, topics: [] }
        : {}),
      ...(result !== "right" && !latest.attemptId
        ? { attemptId: globalThis.crypto.randomUUID() }
        : {}),
    }));
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
    if (current.cause === "missing_fact" && cause !== "missing_fact" && current.questionId) {
      const obsoleteLinks = questionFactLinks.filter(
        (link) => link.questionId === current.questionId && !link.deletedAt,
      );
      void (async () => {
        for (const link of obsoleteLinks) {
          // Removing a relationship must not remove the independent fact card.
          await unlinkQuestionAndFact(current.questionId!, link.factId);
        }
        await refreshCardData();
      })().catch((error: unknown) => {
        setPersistenceError(error instanceof Error ? error.message : "Could not update the fact-card link.");
      });
    }
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
    input: Pick<QuestionCardInput, "promptText" | "promptImageId">,
  ) {
    if (!session || session.sessionKind !== "practice") {
      throw new Error("New question cards can only be saved from practice feedback.");
    }
    if (!input.promptImageId) throw new Error("Add a photo of the question.");
    const feedback = session.feedback[questionNumber];
    if (!feedback) throw new Error("The attempt is no longer available.");

    // Question capture remains a session draft. Replacing its photo or text
    // therefore never mutates a persisted question card before session save.
    const attemptId = feedback.attemptId ?? globalThis.crypto.randomUUID();
    updateFeedbackForQuestion(questionNumber, (current) => ({
      ...current,
      attemptId,
      questionDraft: { ...current.questionDraft, ...input },
    }));
  }

  async function saveSmarterApproach(
    questionNumber: number,
    input: Pick<QuestionCardInput, "solutionText" | "solutionImageId" | "solutionImageIds">,
  ) {
    if (!session || session.sessionKind !== "practice") {
      throw new Error("Smarter approaches can only be drafted from practice feedback.");
    }
    if (!(input.solutionImageIds?.length || input.solutionImageId) && !input.solutionText) {
      throw new Error("Add the smarter method as text or an image.");
    }
    updateFeedbackForQuestion(questionNumber, (current) => ({
      ...current,
      smarterApproachDraft: input,
      smarterApproachSaved: true,
      questionDraft: { ...current.questionDraft, ...input },
    }));
  }

  async function saveSolution(
    questionNumber: number,
    input: Pick<QuestionCardInput, "solutionText" | "solutionImageId" | "solutionImageIds">,
  ) {
    if (!session || session.sessionKind !== "practice") {
      throw new Error("Solutions can only be drafted during practice feedback.");
    }
    if (!(input.solutionImageIds?.length || input.solutionImageId) && !input.solutionText) {
      throw new Error("Add the solution as text or an image.");
    }
    updateFeedbackForQuestion(questionNumber, (current) => ({
      ...current,
      solutionSaved: true,
      questionDraft: { ...current.questionDraft, ...input },
    }));
  }

  async function saveQuestionDifficulty(questionNumber: number, difficulty: QuestionDifficulty) {
    if (!session || session.sessionKind !== "practice") {
      throw new Error("Question difficulty can only be set during practice feedback.");
    }
    updateFeedbackForQuestion(questionNumber, (current) => ({
      ...current,
      difficulty,
      questionDraft: { ...current.questionDraft, difficulty },
    }));
  }

  async function useQuestionCardForAttempt(
    questionNumber: number,
    card: QuestionCard,
  ) {
    const feedback = session?.feedback[questionNumber];
    if (!session || !feedback) throw new Error("The attempt is no longer available.");
    // Existing-card use remains a reference to an already-persisted card.
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
  }

  async function saveFeedbackFactCard(
    questionNumber: number,
    input: Pick<FactCardInput, "kind" | "promptText" | "promptImageId" | "contentText" | "contentImageId" | "wrongBelief">,
  ) {
    if (!session) throw new Error("The session is no longer available.");
    const frontPresent = Boolean(input.promptText?.trim() || input.promptImageId);
    const backPresent = Boolean(input.contentText?.trim() || input.contentImageId);
    if (!frontPresent || !backPresent) {
      throw new Error("Add text or an image to both sides of the fact card.");
    }
    const feedback = session.feedback[questionNumber];
    if (!feedback) throw new Error("The attempt is no longer available.");
    const attemptId = feedback.attemptId ?? globalThis.crypto.randomUUID();

    // A fact is a first-class card: persist it independently, regardless of
    // whether this attempt's question is still a draft or already exists.
    const card = await createFactCard(
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
      factDraft: undefined,
      linkedFactIds: Array.from(new Set([...(current.linkedFactIds ?? []), card.id])),
    }));

    // Existing questions can be linked now. For a draft question, linkedFactIds
    // records the intended relationship and saveSession creates it atomically
    // when it creates the question card.
    if (authUser) await queueImagesForUpload(authUser.id, [input.promptImageId, input.contentImageId].filter((id): id is string => Boolean(id)));
    if (feedback.questionId) {
      await linkQuestionAndFact(feedback.questionId, card.id, { userId: authUser?.id });
    }
    await refreshCardData();
  }

  async function useFactCardForAttempt(questionNumber: number, card: FactCard) {
    const feedback = session?.feedback[questionNumber];
    if (!session || !feedback) throw new Error("The attempt is no longer available.");
    updateFeedbackForQuestion(questionNumber, (current) => ({
      ...current,
      linkedFactIds: Array.from(new Set([...(current.linkedFactIds ?? []), card.id])),
    }));
  }

  async function unlinkFactCardForAttempt(questionNumber: number, factId: string) {
    const feedback = session?.feedback[questionNumber];
    if (!session || !feedback) throw new Error("The attempt is no longer available.");

    // Remove only the relationship. The fact card remains in the independent
    // fact library and remains searchable.
    if (feedback.questionId) {
      await unlinkQuestionAndFact(feedback.questionId, factId);
    }
    updateFeedbackForQuestion(questionNumber, (current) => ({
      ...current,
      linkedFactIds: (current.linkedFactIds ?? []).filter((id) => id !== factId),
    }));
    await refreshCardData();
  }

  async function saveSession() {
    if (!session) return;
    if (isFeedbackExpired(session.feedbackDeadlineAt, Date.now())) {
      await discardExpiredPendingSession(session);
      setSession(null);
      setStudyIntervalError("The feedback deadline has passed. This unfinished practice session was discarded; independently saved fact cards were kept.");
      return;
    }
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
    const feedbackWithCards = new Map<number, ActiveSession["feedback"][number]>();
    const draftQuestions: QuestionCard[] = [];
    const draftFacts: FactCard[] = [];
    const draftLinks: QuestionFactLink[] = [];
    const linkKeys = new Set(
      questionFactLinks
        .filter((link) => !link.deletedAt)
        .map((link) => `${link.questionId}::${link.factId}`),
    );

    // Prepare all card records without writing them. They are inserted with the
    // session and attempts in one IndexedDB transaction below.
    for (const { questionNumber } of timedQuestions) {
      const feedback = session.feedback[questionNumber];
      if (!feedback) continue;
      const attemptId = feedback.attemptId ?? globalThis.crypto.randomUUID();
      let questionId = feedback.questionId;
      if (!questionId && feedback.questionDraft?.promptImageId) {
        const card = buildQuestionCardRecord(
          {
            ...feedback.questionDraft,
            subjectId: session.subjectId,
            chapterId: session.chapterId,
            topicIds: feedback.topics.map((topic) => topic.id),
            createdFromAttemptId: attemptId,
          },
          { userId: authUser?.id },
        );
        draftQuestions.push(card);
        questionId = card.id;
      }
      const nextFeedback = {
        ...feedback,
        ...(questionId ? { questionId } : {}),
        attemptId,
      };
      feedbackWithCards.set(questionNumber, nextFeedback);

      if (!questionId) continue;
      const addLink = (factId: string) => {
        const key = `${questionId}::${factId}`;
        if (linkKeys.has(key)) return;
        linkKeys.add(key);
        const now = timestamp;
        draftLinks.push({
          questionId: questionId as string,
          factId,
          ...(authUser ? { ownerUserId: authUser.id } : {}),
          syncStatus: authUser ? "pending" : "local",
          createdAt: now,
          updatedAt: now,
        });
      };
      if (feedback.factDraft) {
        const fact = buildFactCardRecord(
          {
            ...feedback.factDraft,
            subjectId: session.subjectId,
            chapterId: session.chapterId,
            topicIds: feedback.topics.map((topic) => topic.id),
            createdFromAttemptId: nextFeedback.attemptId,
          },
          { userId: authUser?.id },
        );
        draftFacts.push(fact);
        addLink(fact.id);
      }
      for (const factId of feedback.linkedFactIds ?? []) {
        const fact = factCards.find((item) => item.id === factId && !item.deletedAt);
        if (!fact) throw new Error("A selected fact card is no longer available. Choose it again.");
        if (authUser && fact.ownerUserId && fact.ownerUserId !== authUser.id) {
          throw new Error("The selected fact card does not belong to this account.");
        }
        addLink(factId);
      }
    }
    timedQuestions.forEach(({ questionNumber, timeMs }) => {
      const feedback = feedbackWithCards.get(questionNumber) ?? session.feedback[questionNumber] ?? {
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
        if (!feedback.questionId) attemptValidationErrors.push("Q" + questionNumber + ": Add a question photo.");
        if (!feedback.solutionSaved) attemptValidationErrors.push("Q" + questionNumber + ": Save a text or image solution.");
        if (!feedback.difficulty) attemptValidationErrors.push("Q" + questionNumber + ": Choose intrinsic question difficulty.");
        if (feedback.cause === "missing_fact" && !questionFactLinks.some((link) => link.questionId === feedback.questionId && !link.deletedAt) && !(feedback.linkedFactIds?.length) && !feedback.factDraft) {
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
    const finalizedFactIds = new Set([
      ...questionFactLinks
        .filter((link) => finalizedQuestionIds.has(link.questionId) && !link.deletedAt)
        .map((link) => link.factId),
      ...draftLinks.filter((link) => finalizedQuestionIds.has(link.questionId)).map((link) => link.factId),
    ]);
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
    draftQuestions.forEach((card) => {
      [card.promptImageId, card.solutionImageId, card.smarterApproachImageId,
        ...(card.solutionImageIds ?? [])].forEach((id) => {
        if (id) finalizedImageIds.add(id);
      });
    });
    draftFacts.forEach((card) => {
      [card.promptImageId, card.contentImageId].forEach((id) => {
        if (id) finalizedImageIds.add(id);
      });
    });
    // Include replacement images staged on an already-existing question card.
    for (const feedback of feedbackWithCards.values()) {
      const draft = feedback.questionDraft;
      if (!draft) continue;
      [draft.promptImageId, draft.solutionImageId,
        ...(draft.solutionImageIds ?? [])].forEach((id) => {
        if (id) finalizedImageIds.add(id);
      });
    }

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

    // "Wrong question" attempts remain in attempt history, but are excluded
    // from valid-question counts, accuracy, and average solving time.
    const validAttempts = attempts.filter(
      (attempt) => attempt.result !== "wrong_question",
    );
    const timedQuestionCount = validAttempts.length;
    const activeTimeMs = validAttempts.reduce(
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
        [database.sessions, database.attempts, database.activeSession, database.questions, database.factCards, database.questionFactLinks],
        async () => {
          // Re-check inside the same local transaction as the complete feedback write.
          if (isFeedbackExpired(session.feedbackDeadlineAt, Date.now())) {
            throw new Error("The feedback deadline passed before the session could be committed.");
          }
          record.feedbackSubmittedAt = new Date().toISOString();
          await database.sessions.add(record);
          if (draftQuestions.length) await database.questions.bulkAdd(draftQuestions);
          if (draftFacts.length) await database.factCards.bulkAdd(draftFacts);
          if (authUser) {
            for (const factId of new Set(draftLinks.map((link) => link.factId))) {
              const fact = await database.factCards.get(factId);
              if (fact && !fact.ownerUserId) {
                await database.factCards.put({
                  ...fact,
                  ownerUserId: authUser.id,
                  syncStatus: "pending",
                  updatedAt: timestamp,
                });
              }
            }
          }
          if (draftLinks.length) await database.questionFactLinks.bulkPut(draftLinks);
          await database.attempts.bulkPut(attempts);
          for (const feedback of feedbackWithCards.values()) {
            if (!feedback.questionId || !feedback.questionDraft) continue;
            const card = await database.questions.get(feedback.questionId);
            if (!card) continue;
            const updated: QuestionCard = {
              ...card,
              ...feedback.questionDraft,
              updatedAt: timestamp,
              syncStatus: card.ownerUserId ? "pending" : "local",
            };
            await database.questions.put(updated);
            updatedQuestionCards.set(updated.id, updated);
          }
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
      if (updatedQuestionCards.size > 0 || draftQuestions.length > 0) {
        setQuestionCards((cards) =>
          [...cards.map((card) => updatedQuestionCards.get(card.id) ?? card), ...draftQuestions],
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
      // Everything below is post-commit housekeeping. A refresh, Drive or
      // cloud failure must not make a committed session look unsaved.
      try {
        if (draftFacts.length || draftLinks.length) await refreshCardData();
      } catch (refreshError) {
        setPersistenceError(
          refreshError instanceof Error ? refreshError.message : "Cards were saved, but the view could not refresh.",
        );
      }
      try {
        if (authUser) await queueImagesForUpload(authUser.id, Array.from(finalizedImageIds));
      } catch (imageQueueError) {
        setSyncError(
          imageQueueError instanceof Error
            ? imageQueueError.message
            : "Your session is saved, but photo uploads are pending.",
        );
      }
      // The local transaction above is the save operation. Show the summary
      // immediately; cloud backup continues independently and must never keep
      // the Save session button in a loading state.
      setSession({ ...session, phase: "summary", record });
      if (authUser) {
        void performSync(authUser, true);
      }
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
    if (!recoveryCandidate || !authUser) return;
    const resumedAt = Date.now();
    let candidate = recoveryCandidate;
    const daySnapshot = candidate.session.sessionKind === "practice"
      ? await getOrCreateStudyDaySnapshot(authUser.id, new Date(candidate.session.startedAt))
      : null;
    if (candidate.session.sessionKind === "practice") {
      const deadlineAt = daySnapshot
        ? getFeedbackDeadlineAt(new Date(candidate.session.startedAt), daySnapshot.schedule, daySnapshot.feedbackGraceHours ?? 6)
        : null;
      if (isFeedbackExpired(deadlineAt, resumedAt)) {
        await discardExpiredPendingSession(candidate.session);
        setRecoveryCandidate(null);
        setStudyIntervalError("The feedback deadline has passed. The unfinished practice session was discarded. Independently saved fact cards were kept.");
        return;
      }
      candidate = {
        ...candidate,
        session: { ...candidate.session, feedbackDeadlineAt: deadlineAt ?? undefined },
      };
    }
    if (candidate.session.sessionKind === "practice" && candidate.session.phase === "active") {
      const intervals = daySnapshot
        ? resolveDayIntervals(new Date(candidate.session.startedAt), daySnapshot.schedule, candidate.session.startedAt)
        : [];
      const containingInterval = intervals.find((interval) =>
        candidate.session.startedAt >= interval.startAt && candidate.session.startedAt < interval.endAt
      );
      if (containingInterval) {
        candidate = {
          ...candidate,
          session: {
            ...candidate.session,
            endsAt: getPracticeSessionEndAt(candidate.session.startedAt, candidate.session.endsAt, containingInterval.endAt),
          },
        };
      } else {
        // A legacy/recovered practice session that did not begin in an allowed
        // interval is ended at its start rather than being allowed to continue.
        candidate = {
          ...candidate,
          session: {
            ...candidate.session,
            endsAt: getPracticeSessionEndAt(candidate.session.startedAt, candidate.session.endsAt, null),
          },
        };
      }
    }
    const recovered = recoverSessionSnapshot(candidate, resumedAt);
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
            unassignedSessionCount={unassignedSessionCount}
            unassignedCardCount={unassignedCardCount}
            onGoogleSignIn={() => void signInWithGoogle()}
            onSignOut={() => undefined}
            onImportLocalSessions={() => undefined}
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

  if (!session && activeTab === "sync") {
    return (
      <SyncScreen
        email={authUser?.email}
        configured={supabaseConfigured}
        syncStatus={syncStatus}
        syncError={syncError}
        driveStatus={driveConnectionStatus}
        driveError={driveConnectionError}
        sessions={savedSessions}
        facts={factCards}
        pendingPhotoCount={pendingPhotoCount}
        syncPhase={syncPhase}
        photoUploadProgress={photoUploadProgress}
        syncingSessionId={syncingSessionId}
        syncingFactCardId={syncingFactCardId}
        driveProgress={syncDriveProgress}
        onBack={() => setActiveTab("practice")}
        onNavigate={navigate}
        onSyncNow={() => {
          if (authUser) {
            void retryFailedUploads(authUser.id)
              .then(() => performSync(authUser))
              .catch((error: unknown) => {
                setSyncStatus("error");
                setSyncError(error instanceof Error ? error.message : "Could not retry backup.");
              });
          }
        }}
        onConnectDrive={() => void connectGoogleDrive()}
        onSignIn={() => void signInWithGoogle()}
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
        syncError={syncError}
        onRetrySync={() => { if (!authUser) return; void (async () => { const pending = await database.localImages.where("ownerUserId").equals(authUser.id)
            .filter((image) => ["pending", "uploading", "failed"].includes(image.status)).count(); if (pending > 0 && !hasDriveAccessToken(authUser.id)) { await connectGoogleDrive(); return; } await performSync(authUser, true); })().catch((error: unknown) => { setSyncStatus("error"); setSyncError(error instanceof Error ? error.message : "Could not retry sync."); }); }}
        onNewSession={() => void startNewSession()}
      />
    );
  }

  if (session?.phase === "feedback") {
    return (
      <SessionFeedbackScreen
        session={session}
        feedbackDeadlineAt={session.feedbackDeadlineAt ?? Date.now()}
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
        onUnlinkFactCard={unlinkFactCardForAttempt}
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

        <StudyIntervalPanel userId={authUser.id} sessions={savedSessions} />

        <section className="home-sync-card" aria-label="Sync status">
          <button type="button" className="home-sync-open" onClick={() => setActiveTab("sync")}>
            <span className="home-sync-icon" aria-hidden="true">↻</span>
            <span className="home-sync-copy">
              <strong>{!authUser ? "Back up your practice" : syncStatus === "syncing" ? "Syncing your data…" : syncStatus === "error" ? "Sync needs attention" : pendingPhotoCount > 0 ? "Photos waiting for backup" : syncStatus === "synced" ? "Everything is backed up" : "Check your backup"}</strong>
              <span>{!authUser ? "See what stays on this device and how to back it up" : pendingPhotoCount > 0 ? `${pendingPhotoCount} photo${pendingPhotoCount === 1 ? "" : "s"} waiting · View sync details` : "View sessions, cards and photo backup"}</span>
            </span>
            <span className="home-sync-chevron" aria-hidden="true">›</span>
          </button>
        </section>
        <AccountPanel
          configured={supabaseConfigured}
          email={authUser?.email}
          authMessage={authMessage}
          authError={authError}
          isSubmittingAuth={isSubmittingAuth}
          unassignedSessionCount={unassignedSessionCount}
          unassignedCardCount={unassignedCardCount}
          onGoogleSignIn={() => void signInWithGoogle()}
          onSignOut={() => void signOut()}
          onImportLocalSessions={() => void importLocalSessions()}
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
          {studyIntervalError && <p className="database-error" role="alert">{studyIntervalError}</p>}
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
            disabled={!setup.chapterId || setup.startingQuestion < 1 || isStartingSession}
          >
            {isStartingSession ? "Checking schedule…" : "Start session"}
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
