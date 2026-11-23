export type AuthMode = "sign_in" | "sign_up";

type Props = {
  configured: boolean;
  email: string | undefined;
  authMode: AuthMode;
  authEmail: string;
  authPassword: string;
  authMessage: string | null;
  authError: string | null;
  isSubmittingAuth: boolean;
  syncStatus: "idle" | "syncing" | "synced" | "offline" | "error";
  syncError: string | null;
  unassignedSessionCount: number;
  unassignedCardCount: number;
  onAuthEmailChange: (email: string) => void;
  onAuthPasswordChange: (password: string) => void;
  onSubmitAuth: (event: React.FormEvent<HTMLFormElement>) => void;
  onGoogleSignIn: () => void;
  onToggleAuthMode: () => void;
  onSignOut: () => void;
  onImportLocalSessions: () => void;
  onSyncNow: () => void;
};

export default function AccountPanel({
  configured,
  email,
  authMode,
  authEmail,
  authPassword,
  authMessage,
  authError,
  isSubmittingAuth,
  syncStatus,
  syncError,
  unassignedSessionCount,
  unassignedCardCount,
  onAuthEmailChange,
  onAuthPasswordChange,
  onSubmitAuth,
  onGoogleSignIn,
  onToggleAuthMode,
  onSignOut,
  onImportLocalSessions,
  onSyncNow,
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
