type Props = {
  configured: boolean;
  email: string | undefined;
  authMessage: string | null;
  authError: string | null;
  isSubmittingAuth: boolean;
  syncStatus: "idle" | "syncing" | "synced" | "offline" | "error";
  syncError: string | null;
  unassignedSessionCount: number;
  unassignedCardCount: number;
  onGoogleSignIn: () => void;
  onSignOut: () => void;
  onImportLocalSessions: () => void;
  onSyncNow: () => void;
  driveConnectionStatus: "loading" | "idle" | "connecting" | "connected" | "error";
  driveConnectionError: string | null;
  onConnectGoogleDrive: () => void;
};

export default function AccountPanel({
  configured,
  email,
  authMessage,
  authError,
  isSubmittingAuth,
  syncStatus,
  syncError,
  unassignedSessionCount,
  unassignedCardCount,
  onGoogleSignIn,
  onSignOut,
  onImportLocalSessions,
  onSyncNow,
  driveConnectionStatus,
  driveConnectionError,
  onConnectGoogleDrive,
}: Props) {
  const signedIn = Boolean(email);

  return (
    <section className="account-card" aria-labelledby="account-title">
      <div className="account-heading">
        <div>
          <p className="eyebrow">CLOUD SYNC</p>
          <h2 id="account-title">
            {signedIn ? "Your account" : "Sync across devices"}
          </h2>
        </div>
        {signedIn && (
          <button
            className="account-secondary-button"
            type="button"
            onClick={onSignOut}
          >
            Sign out
          </button>
        )}
      </div>
      {!configured ? (
        <p className="account-note">
          Add your Supabase URL and publishable key to .env.local, then restart
          the development server to enable cloud sync.
        </p>
      ) : signedIn ? (
        <>
          <p className="account-email">{email}</p>
          <p className="sync-status" role="status">
            {syncStatus === "syncing" && "Syncing sessions…"}
            {syncStatus === "synced" && "Your sessions are synced."}
            {syncStatus === "offline" &&
              "You’re offline. Saved sessions will sync when reconnected."}
            {syncStatus === "error" &&
              "Sync needs attention. Your sessions remain saved on this device."}
            {syncStatus === "idle" && "Checking cloud sync…"}
          </p>
          {syncError && (
            <p className="database-error" role="alert">
              {syncError}
            </p>
          )}
          {unassignedSessionCount + unassignedCardCount > 0 && (
            <div className="account-note">
              <p>
                {unassignedSessionCount} session
                {unassignedSessionCount === 1 ? "" : "s"} and{" "}
                {unassignedCardCount} card item
                {unassignedCardCount === 1 ? "" : "s"} are not linked to an
                account.
              </p>
              <button
                className="account-action-button"
                type="button"
                onClick={onImportLocalSessions}
                disabled={syncStatus === "syncing"}
              >
                Import local data to this account
              </button>
            </div>
          )}
          <div className="account-note">
            <p>Photo backup uses Google Drive, which needs a separate authorization from Google sign-in.</p>
            {driveConnectionError && <p className="database-error" role="alert">{driveConnectionError}</p>}
            <button
              className="account-action-button"
              type="button"
              onClick={onConnectGoogleDrive}
              disabled={syncStatus === "syncing" || driveConnectionStatus === "loading" || driveConnectionStatus === "connecting"}
            >
              {driveConnectionStatus === "loading" ? "Preparing Google Drive…" : driveConnectionStatus === "connecting" ? "Connecting Google Drive…" : driveConnectionStatus === "connected" ? "Reconnect Google Drive" : "Connect Google Drive"}
            </button>
          </div>
          <button
            className="account-action-button"
            type="button"
            onClick={onSyncNow}
            disabled={syncStatus === "syncing"}
          >
            {syncStatus === "syncing" ? "Syncing…" : "Sync now"}
          </button>
        </>
      ) : (
        <>
          <p className="account-note">
            Sign in with Google to use Measure. Your account keeps your
            sessions, question cards, fact cards and related images associated
            with you across devices. Google Drive file access is requested
            separately when image backup is enabled.
          </p>
          <button
            className="account-action-button"
            type="button"
            onClick={onGoogleSignIn}
            disabled={isSubmittingAuth}
          >
            {isSubmittingAuth ? "Redirecting to Google…" : "Continue with Google"}
          </button>
          {authMessage && (
            <p className="account-message" role="status">{authMessage}</p>
          )}
          {authError && (
            <p className="database-error" role="alert">{authError}</p>
          )}
        </>
      )}
    </section>
  );
}
