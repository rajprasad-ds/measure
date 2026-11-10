import { getChapter, getSubject } from "../../syllabus";
import type { ActiveSessionSnapshot } from "./types";

type Props = {
  snapshot: ActiveSessionSnapshot;
  error: string | null;
  onResume: () => void;
  onDiscard: () => void;
};

export default function SessionRecoveryScreen({
  snapshot,
  error,
  onResume,
  onDiscard,
}: Props) {
  const { session } = snapshot;
  const chapter = getChapter(session.subjectId, session.chapterId);
  const plannedTimePassed =
    session.phase === "active" && Date.now() >= session.endsAt;

  return (
    <main className="setup-shell">
      <section className="setup-card recovery-card" aria-labelledby="resume-title">
        <p className="eyebrow">SESSION RECOVERY</p>
        <h1 id="resume-title">An unfinished session was saved.</h1>
        <p className="intro">
          {getSubject(session.subjectId)?.name}
          {chapter ? ` · ${chapter.name}` : ""}
          {" · "}
          {session.duration} min
        </p>
        {plannedTimePassed && (
          <p className="storage-note">
            The planned session time has passed. Resuming will take you to
            feedback, with the running question closed at the planned end.
          </p>
        )}
        {session.phase === "feedback" && (
          <p className="storage-note">
            This session ended and is waiting for question feedback.
          </p>
        )}
        {error && (
          <p className="database-error" role="alert">
            {error}
          </p>
        )}
        <div className="recovery-actions">
          <button
            className="start-button"
            type="button"
            onClick={onResume}
          >
            Resume session
          </button>
          <button
            className="account-secondary-button"
            type="button"
            onClick={onDiscard}
          >
            Discard session
          </button>
        </div>
      </section>
    </main>
  );
}
