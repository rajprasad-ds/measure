import type { SessionRecord } from "../../database";
import type { FactCard } from "../cards/types";
import MainNavigation from "../navigation/MainNavigation";
type SyncStatus = "idle" | "syncing" | "synced" | "offline" | "error";
type DriveStatus = "loading" | "idle" | "connecting" | "connected" | "error";
type SyncPhase = "sessions" | "photos" | "finalizing" | null;
type PhotoUploadProgress = { completed: number; total: number; failed: number; currentImageId: string | null };
type DriveProgress = { completed: number; total: number; failed: number };
type Props = {
  email?: string; configured: boolean; syncStatus: SyncStatus; syncError: string | null;
  driveStatus: DriveStatus; driveError: string | null; sessions: SessionRecord[]; facts: FactCard[];
  pendingPhotoCount: number; syncPhase: SyncPhase; photoUploadProgress: PhotoUploadProgress;
  syncingSessionId: string | null; syncingFactCardId: string | null;
  driveProgress: Record<string, DriveProgress>;
  onBack: () => void; onNavigate: (tab: "practice" | "cards" | "history" | "sync") => void;
  onSyncNow: () => void; onConnectDrive: () => void; onSignIn: () => void;
};

function RingPair({ cloudComplete, driveProgress, active, label }: {
  cloudComplete: boolean; driveProgress?: DriveProgress; active?: boolean; label: string;
}) {
  const outer = 2 * Math.PI * 17;
  const inner = 2 * Math.PI * 11.5;
  const hasDriveWork = Boolean(driveProgress && driveProgress.total > 0);
  const drivePercent = hasDriveWork ? Math.min(100, driveProgress!.completed / driveProgress!.total * 100) : 0;
  return (
    <svg className={active ? "sync-ring-pair is-active" : "sync-ring-pair"} viewBox="0 0 40 40" role="img" aria-label={label}>
      <circle className="sync-ring-track sync-ring-cloud-track" cx="20" cy="20" r="17" />
      <circle className="sync-ring-progress sync-ring-cloud-progress" cx="20" cy="20" r="17" strokeDasharray={outer} strokeDashoffset={cloudComplete ? 0 : outer} />
      <circle className="sync-ring-track sync-ring-drive-track" cx="20" cy="20" r="11.5" />
      <circle className={hasDriveWork ? "sync-ring-progress sync-ring-drive-progress" : "sync-ring-progress sync-ring-drive-progress is-not-needed"} cx="20" cy="20" r="11.5" strokeDasharray={inner} strokeDashoffset={inner * (1 - drivePercent / 100)} />
    </svg>
  );
}
function ItemRow({ title, detail, cloudComplete, driveProgress, active, driveActive, configured, driveConnected }: {
  title: string; detail: string; cloudComplete: boolean; driveProgress?: DriveProgress;
  active?: boolean; driveActive?: boolean; configured: boolean; driveConnected: boolean;
}) {
  const hasDriveWork = Boolean(driveProgress && driveProgress.total > 0);
  const driveComplete = !hasDriveWork || driveProgress!.completed === driveProgress!.total;
  const driveFailed = Boolean(driveProgress?.failed);
  let state = "Waiting";
  if (!configured) state = "On device";
  else if (!cloudComplete) state = active ? "Saving to Supabase" : "Waiting";
  else if (driveFailed) state = "Photos need attention";
  else if (!hasDriveWork) state = "Cloud data saved · No photos";
  else if (driveComplete) state = "Backed up";
  else if (driveActive) state = "Uploading photos";
  else state = driveConnected ? "Photos waiting" : "Waiting for Drive";
  const driveLabel = !hasDriveWork ? "not needed" : driveComplete ? "backed up" : (driveProgress!.completed + " of " + driveProgress!.total + " photos backed up");
  const ariaLabel = title + ": Supabase " + (cloudComplete ? "backed up" : "not backed up") + "; Google Drive " + driveLabel;
  return (
    <li className="sync-item">
      <RingPair cloudComplete={configured && cloudComplete} driveProgress={driveProgress} active={active || driveActive} label={ariaLabel} />
      <span className="sync-item-copy"><strong>{title}</strong><span>{detail}</span></span>
      <span className={cloudComplete && driveComplete && configured ? "sync-item-state is-complete" : driveFailed ? "sync-item-state is-error" : "sync-item-state"}>{state}</span>
    </li>
  );
}
function statusCopy(status: SyncStatus, signedIn: boolean, configured: boolean, pendingPhotoCount: number) {
  if (!configured) return ["On this device", "Cloud backup isn't configured in this app right now. Your practice data remains stored on this device."];
  if (!signedIn) return ["On this device", "Sign in to back up your practice data across devices."];
  if (status === "syncing") return ["Syncing your data", "Measure is updating your cloud backup and photo backup separately."];
  if (status === "synced" && pendingPhotoCount > 0) return ["Practice data backed up", "Your practice data is backed up. Some photos are still waiting for Google Drive."];
  if (status === "synced") return ["Everything is up to date", "Your available practice data is backed up."];
  if (status === "offline") return ["You're offline", "Your data stays on this device and will sync when you're back online."];
  if (status === "error") return ["Some items need attention", "Your local data is safe. Check the details below."];
  return ["Checking your backup", "Measure is checking which items need to be synced."];
}
export default function SyncScreen({
  email, configured, syncStatus, syncError, driveStatus, driveError, sessions, facts,
  pendingPhotoCount, syncPhase, photoUploadProgress, syncingSessionId, syncingFactCardId,
  driveProgress, onBack, onNavigate, onSyncNow, onConnectDrive, onSignIn,
}: Props) {
  const signedIn = Boolean(email);
  const [headline, description] = statusCopy(syncStatus, signedIn, configured, pendingPhotoCount);
  const orderedSessions = [...sessions].sort((a, b) => b.endedAt.localeCompare(a.endedAt));
  const independentFacts = facts.filter((item) => !item.createdFromAttemptId);
  const sessionIsComplete = (item: SessionRecord) => {
    const drive = driveProgress[item.id];
    const driveComplete = !drive || drive.total === 0 || drive.completed === drive.total;
    return configured && item.syncStatus === "synced" && driveComplete && !(drive?.failed);
  };
  const factIsComplete = (item: FactCard) => {
    const drive = driveProgress[item.id];
    const driveComplete = !drive || drive.total === 0 || drive.completed === drive.total;
    return configured && item.syncStatus === "synced" && driveComplete && !(drive?.failed);
  };
  const pendingSessions = orderedSessions.filter((item) => !sessionIsComplete(item));
  const completedSessions = orderedSessions.filter(sessionIsComplete);
  const pendingFacts = independentFacts.filter((item) => !factIsComplete(item));
  const completedFacts = independentFacts.filter(factIsComplete);
  const pendingCount = pendingSessions.length + pendingFacts.length;
  const totalCount = sessions.length + independentFacts.length;
  const allComplete = configured && signedIn && pendingCount === 0 && pendingPhotoCount === 0 && syncStatus === "synced";
  const renderItem = (item: SessionRecord | FactCard, isSession: boolean) => {
    const active = isSession ? item.id === syncingSessionId : item.id === syncingFactCardId;
    const drive = driveProgress[item.id];
    const detail = isSession
      ? new Date((item as SessionRecord).endedAt).toLocaleDateString() + " · " + ((item as SessionRecord).sessionKind === "question_revision" ? "Question revision" : "Practice session")
      : (item as FactCard).kind.charAt(0).toUpperCase() + (item as FactCard).kind.slice(1);
    const title = isSession
      ? (item as SessionRecord).subject + " · " + (item as SessionRecord).chapter
      : (item as FactCard).promptText || "Untitled fact";
    return <ItemRow key={item.id} title={title} detail={detail} cloudComplete={item.syncStatus === "synced"}
      driveProgress={drive} active={active}
      driveActive={syncPhase === "photos" && Boolean(drive?.total && drive.completed < drive.total)}
      configured={configured} driveConnected={driveStatus === "connected"} />;
  };
  return (
    <main className="sync-shell">
      <header className="sync-header">
        <button className="sync-back-button" type="button" onClick={onBack} aria-label="Back to practice">←</button>
        <div><p className="eyebrow">YOUR DATA</p><h1>Sync</h1></div>
      </header>
      <section className={allComplete ? "sync-overview is-complete" : "sync-overview"}>
        <div className="sync-overview-top">
          <div><p className="sync-overline">BACKUP STATUS</p><h2>{allComplete ? "All caught up" : headline}</h2><p>{description}</p></div>
          <div className="sync-overview-ring"><RingPair cloudComplete={allComplete}
            driveProgress={{ completed: photoUploadProgress.completed, total: pendingPhotoCount, failed: photoUploadProgress.failed }}
            label={allComplete ? "All data backed up" : "Backup not yet complete"} /></div>
        </div>
        {syncPhase && <div className="sync-live-progress" role="status" aria-live="polite">
          <div className="sync-live-progress-heading">
            <span>{syncPhase === "sessions" ? "Syncing practice data" : syncPhase === "photos" ? "Backing up photos" : "Finishing cloud backup"}</span>
            {syncPhase === "photos" && photoUploadProgress.total > 0 && <strong>{photoUploadProgress.completed} processed · {photoUploadProgress.failed} failed</strong>}
          </div>
          {syncPhase === "photos" && photoUploadProgress.total > 0 ? <>
            <progress value={photoUploadProgress.completed} max={photoUploadProgress.total} />
            <small>{photoUploadProgress.currentImageId ? "Uploading a photo…" : photoUploadProgress.completed === photoUploadProgress.total ? "Photo queue pass finished." : "Preparing next photo…"}</small>
          </> : <small>{syncPhase === "sessions" ? "Sessions, cards and their links are being checked and saved." : syncPhase === "photos" ? "No photos are ready to retry in this pass. They remain stored on this device." : "Photo references are being added to your backup."}</small>}
        </div>}
        <div className="sync-overview-stats">
          {totalCount > 0 ? (configured ? <span><strong>{totalCount - pendingCount}</strong> of <strong>{totalCount}</strong> items fully backed up</span> : <span><strong>{totalCount}</strong> items stored on this device</span>) : <span>No sessions or independent fact cards yet</span>}
          <span>{pendingPhotoCount} photos waiting</span>
        </div>
        {!configured ? <p className="sync-muted">Cloud backup is not configured yet. This is separate from Google Drive photo backup.</p>
          : signedIn && (syncStatus === "error" || (pendingPhotoCount > 0 && driveStatus === "connected"))
            ? <button className="sync-primary-button" type="button" onClick={onSyncNow} disabled={!navigator.onLine || syncStatus === "syncing"}>Retry backup</button>
            : !signedIn ? <button className="sync-primary-button" type="button" onClick={onSignIn}>Sign in to enable backup</button>
              : <p className="sync-muted">{syncStatus === "syncing" ? "Measure is updating your cloud backup." : "Cloud backup is available. Measure will keep your practice data in sync."}</p>}
        {syncError && <p className="sync-alert" role="alert">{syncError}</p>}
      </section>
      <section className="sync-section">
        <div className="sync-section-heading"><div><p className="sync-overline">PRACTICE HISTORY</p><h2>Sessions</h2></div><span>{pendingSessions.length} need backup</span></div>
        {sessions.length === 0 ? <p className="sync-empty">Your completed practice sessions will appear here.</p> : <>
          <ul className="sync-item-list">{pendingSessions.map((item) => renderItem(item, true))}</ul>
          {completedSessions.length > 0 && <details className="sync-completed"><summary>Completed · {completedSessions.length}</summary>
            <ul className="sync-item-list">{completedSessions.map((item) => renderItem(item, true))}</ul></details>}
        </>}
      </section>
      <section className="sync-section">
        <div className="sync-section-heading"><div><p className="sync-overline">INDEPENDENT NOTES</p><h2>Fact cards</h2></div><span>{pendingFacts.length} need backup</span></div>
        {independentFacts.length === 0 ? <p className="sync-empty">Independent fact cards you save will appear here.</p> : <>
          <ul className="sync-item-list">{pendingFacts.map((item) => renderItem(item, false))}</ul>
          {completedFacts.length > 0 && <details className="sync-completed"><summary>Completed · {completedFacts.length}</summary>
            <ul className="sync-item-list">{completedFacts.map((item) => renderItem(item, false))}</ul></details>}
        </>}
      </section>
      <section className="sync-section sync-drive-section">
        <div className="sync-section-heading"><div><p className="sync-overline">PHOTO BACKUP</p><h2>Google Drive</h2></div>
          <span>{driveStatus === "connected" ? "Connected" : driveStatus === "error" ? "Needs attention" : pendingPhotoCount > 0 ? "Waiting for connection" : "No action needed"}</span></div>
        {pendingPhotoCount === 0 ? <p className="sync-empty">No photos are waiting to upload. Google Drive access is not needed right now.</p>
          : driveStatus === "connected" ? <p className="sync-muted">{pendingPhotoCount} photo{pendingPhotoCount === 1 ? "" : "s"} waiting for backup. Drive is connected.</p>
            : <><p className="sync-muted">{driveStatus === "connecting" ? "Connecting to Google Drive…" : driveStatus === "error" ? "Photo backup needs attention. Your photos remain stored on this device." : "Photos are safely stored on this device. Connect Drive when you're ready to back them up."}</p>
              <button className="sync-secondary-button" type="button" onClick={onConnectDrive} disabled={driveStatus === "loading" || driveStatus === "connecting"}>{driveStatus === "connecting" ? "Connecting…" : "Connect Google Drive"}</button></>}
        {driveError && <p className="sync-alert" role="alert">{driveError}</p>}
      </section>
      <div className="sync-ring-legend" aria-label="Progress ring legend">
        <span><i className="sync-legend-cloud" /> Supabase practice data</span>
        <span><i className="sync-legend-drive" /> Google Drive photos</span>
      </div>
      <MainNavigation activeTab="sync" onNavigate={onNavigate} />
    </main>
  );
}
