import type { SessionRecord } from "../../database";
import type { FactCard } from "../cards/types";
import MainNavigation from "../navigation/MainNavigation";

type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "error";
type DriveStatus = "loading" | "idle" | "connecting" | "connected" | "error";

type Props = {
  email?: string;
  configured: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  driveStatus: DriveStatus;
  driveError: string | null;
  sessions: SessionRecord[];
  facts: FactCard[];
  pendingPhotoCount: number;
  onBack: () => void;
  onNavigate: (tab: "practice" | "cards" | "history" | "sync") => void;
  onSyncNow: () => void;
  onConnectDrive: () => void;
  onSignIn: () => void;
};

function Ring({ complete, label }: { complete: boolean; label: string }) {
  const circumference = 2 * Math.PI * 17;
  return (
    <svg className={complete ? "sync-ring is-complete" : "sync-ring"} viewBox="0 0 40 40" role="img" aria-label={label}>
      <circle className="sync-ring-track" cx="20" cy="20" r="17" />
      <circle
        className="sync-ring-progress"
        cx="20"
        cy="20"
        r="17"
        strokeDasharray={circumference}
        strokeDashoffset={complete ? 0 : circumference}
      />
      {complete ? <path className="sync-ring-check" d="m13 20 4.5 4.5L27 15" /> : <circle className="sync-ring-dot" cx="20" cy="20" r="2.4" />}
    </svg>
  );
}

function ItemRow({ title, detail, complete, waitingLabel = "Waiting" }: { title: string; detail: string; complete: boolean; waitingLabel?: string }) {
  return (
    <li className="sync-item">
      <Ring complete={complete} label={complete ? "Backed up" : waitingLabel} />
      <span className="sync-item-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
      <span className={complete ? "sync-item-state is-complete" : "sync-item-state"}>
        {complete ? "Backed up" : waitingLabel}
      </span>
    </li>
  );
}

function statusCopy(status: SyncStatus, signedIn: boolean, configured: boolean) {
  if (!configured) return ["On this device", "Cloud backup isn't configured in this app right now. Your practice data remains stored on this device."];
  if (!signedIn) return ["On this device", "Sign in to back up your practice data across devices."];
  if (status === "syncing") return ["Syncing your data", "Measure is updating your cloud backup."];
  if (status === "synced") return ["Everything is up to date", "Your available practice data is backed up."];
  if (status === "offline") return ["You're offline", "Your data stays on this device and will sync when you're back online."];
  if (status === "error") return ["Some items need attention", "Your local data is safe. Check the details below."];
  return ["Checking your backup", "Measure is checking which items need to be synced."];
}

export default function SyncScreen({
  email,
  configured,
  syncStatus,
  syncError,
  driveStatus,
  driveError,
  sessions,
  facts,
  pendingPhotoCount,
  onBack,
  onNavigate,
  onSyncNow,
  onConnectDrive,
  onSignIn,
}: Props) {
  const signedIn = Boolean(email);
  const [headline, description] = statusCopy(syncStatus, signedIn, configured);
  const orderedSessions = [...sessions].sort((a, b) => b.endedAt.localeCompare(a.endedAt));
  const pendingSessions = orderedSessions.filter((item) => !configured || item.syncStatus !== "synced");
  const completedSessions = configured ? orderedSessions.filter((item) => item.syncStatus === "synced") : [];
  const independentFacts = facts.filter((item) => !item.createdFromAttemptId);
  const pendingFacts = independentFacts.filter((item) => !configured || item.syncStatus !== "synced");
  const completedFacts = configured ? independentFacts.filter((item) => item.syncStatus === "synced") : [];
  const pendingCount = pendingSessions.length + pendingFacts.length;
  const totalCount = sessions.length + independentFacts.length;
  const allComplete = configured && signedIn && pendingCount === 0 && pendingPhotoCount === 0 && syncStatus === "synced";

  return (
    <main className="sync-shell">
      <header className="sync-header">
        <button className="sync-back-button" type="button" onClick={onBack} aria-label="Back to practice">←</button>
        <div>
          <p className="eyebrow">YOUR DATA</p>
          <h1>Sync</h1>
        </div>
      </header>

      <section className={allComplete ? "sync-overview is-complete" : "sync-overview"}>
        <div className="sync-overview-top">
          <div>
            <p className="sync-overline">BACKUP STATUS</p>
            <h2>{allComplete ? "All caught up" : headline}</h2>
            <p>{description}</p>
          </div>
          <div className="sync-overview-ring">
            <Ring complete={allComplete} label={allComplete ? "All data backed up" : "Backup not yet complete"} />
          </div>
        </div>
        <div className="sync-overview-stats">
          {totalCount > 0 ? (configured ? <span><strong>{totalCount - pendingCount}</strong> of <strong>{totalCount}</strong> items backed up</span> : <span><strong>{totalCount}</strong> items stored on this device</span>) : <span>No sessions or independent fact cards yet</span>}
          <span>{pendingPhotoCount} photos waiting</span>
        </div>
        {!configured ? (
          <p className="sync-muted">Cloud backup is not configured yet. This is separate from Google Drive photo backup.</p>
        ) : signedIn && syncStatus === "error" ? (
          <button className="sync-primary-button" type="button" onClick={onSyncNow} disabled={!navigator.onLine}>
            Retry sync
          </button>
        ) : !signedIn ? (
          <button className="sync-primary-button" type="button" onClick={onSignIn}>Sign in to enable backup</button>
        ) : (
          <p className="sync-muted">{syncStatus === "syncing" ? "Measure is updating your cloud backup." : "Cloud backup is available. Measure will keep your practice data in sync."}</p>
        )}
        {syncError && <p className="sync-alert" role="alert">{syncError}</p>}
      </section>

      <section className="sync-section">
        <div className="sync-section-heading">
          <div><p className="sync-overline">PRACTICE HISTORY</p><h2>Sessions</h2></div>
          <span>{configured ? `${pendingSessions.length} waiting` : `${sessions.length} on device`}</span>
        </div>
        {sessions.length === 0 ? <p className="sync-empty">Your completed practice sessions will appear here.</p> : (
          <>
            <ul className="sync-item-list">
              {pendingSessions.map((item) => <ItemRow key={item.id} title={`${item.subject} · ${item.chapter}`} detail={`${new Date(item.endedAt).toLocaleDateString()} · ${item.sessionKind === "question_revision" ? "Question revision" : "Practice session"}`} complete={false} waitingLabel={configured ? "Waiting" : "On device"} />)}
            </ul>
            {completedSessions.length > 0 && <details className="sync-completed">
              <summary>Completed · {completedSessions.length}</summary>
              <ul className="sync-item-list">
                {completedSessions.map((item) => <ItemRow key={item.id} title={`${item.subject} · ${item.chapter}`} detail={`${new Date(item.endedAt).toLocaleDateString()} · Practice session`} complete />)}
              </ul>
            </details>}
          </>
        )}
      </section>

      <section className="sync-section">
        <div className="sync-section-heading">
          <div><p className="sync-overline">INDEPENDENT NOTES</p><h2>Fact cards</h2></div>
          <span>{configured ? `${pendingFacts.length} waiting` : `${independentFacts.length} on device`}</span>
        </div>
        {independentFacts.length === 0 ? <p className="sync-empty">Independent fact cards you save will appear here.</p> : (
          <>
            <ul className="sync-item-list">
              {pendingFacts.map((item) => <ItemRow key={item.id} title={item.promptText || "Untitled fact"} detail={item.kind.charAt(0).toUpperCase() + item.kind.slice(1)} complete={false} />)}
            </ul>
            {completedFacts.length > 0 && <details className="sync-completed">
              <summary>Completed · {completedFacts.length}</summary>
              <ul className="sync-item-list">
                {completedFacts.map((item) => <ItemRow key={item.id} title={item.promptText || "Untitled fact"} detail={item.kind.charAt(0).toUpperCase() + item.kind.slice(1)} complete />)}
              </ul>
            </details>}
          </>
        )}
      </section>

      <section className="sync-section sync-drive-section">
        <div className="sync-section-heading">
          <div><p className="sync-overline">PHOTO BACKUP</p><h2>Google Drive</h2></div>
          <span>{driveStatus === "connected" ? "Connected" : pendingPhotoCount > 0 ? "Action may be needed" : "No action needed"}</span>
        </div>
        {pendingPhotoCount === 0 ? (
          <p className="sync-empty">No photos are waiting to upload. Google Drive access is not needed right now.</p>
        ) : driveStatus === "connected" ? (
          <p className="sync-muted">{pendingPhotoCount} photo{pendingPhotoCount === 1 ? "" : "s"} waiting for backup. Drive is connected.</p>
        ) : (
          <>
            <p className="sync-muted">{driveStatus === "connecting" ? "Connecting to Google Drive…" : "Photos are safely stored on this device. Connect Drive when you're ready to back them up."}</p>
            <button className="sync-secondary-button" type="button" onClick={onConnectDrive} disabled={driveStatus === "loading" || driveStatus === "connecting"}>
              {driveStatus === "connecting" ? "Connecting…" : "Connect Google Drive"}
            </button>
          </>
        )}
        {driveError && <p className="sync-alert" role="alert">{driveError}</p>}
      </section>
      <MainNavigation activeTab="sync" onNavigate={onNavigate} />
    </main>
  );
}
