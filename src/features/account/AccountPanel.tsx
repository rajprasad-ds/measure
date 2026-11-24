type Props = {
  configured: boolean;
  email: string | undefined;
  authMessage: string | null;
  authError: string | null;
  isSubmittingAuth: boolean;
  unassignedSessionCount: number;
  unassignedCardCount: number;
  onGoogleSignIn: () => void;
  onSignOut: () => void;
  onImportLocalSessions: () => void;
};

export default function AccountPanel({
  configured,
  email,
  authMessage,
  authError,
  isSubmittingAuth,
  unassignedSessionCount,
  unassignedCardCount,
  onGoogleSignIn,
  onSignOut,
  onImportLocalSessions,
}: Props) {
  const signedIn = Boolean(email);

  return (
    <section className="account-card account-card-compact" aria-labelledby="account-title">
      <div className="account-heading">
        <div>
          <p className="eyebrow">MEASURE ACCOUNT</p>
          <h2 id="account-title">{signedIn ? "Your account" : "Sync across devices"}</h2>
        </div>
        {signedIn && (
          <button className="account-secondary-button" type="button" onClick={onSignOut}>
            Sign out
          </button>
        )}
      </div>
      {!configured ? (
        <p className="account-note">
          Cloud backup is not configured yet.
        </p>
      ) : signedIn ? (
        <>
          <p className="account-email">{email}</p>
          {unassignedSessionCount + unassignedCardCount > 0 && (
            <div className="account-note">
              <p>
                {unassignedSessionCount} session{unassignedSessionCount === 1 ? "" : "s"} and{" "}
                {unassignedCardCount} card item{unassignedCardCount === 1 ? "" : "s"} are not linked to an account.
              </p>
              <button className="account-action-button" type="button" onClick={onImportLocalSessions}>
                Import local data to this account
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="account-note">
            Sign in with Google to back up your sessions, question cards and fact cards across devices.
            Photo backup is handled separately and only asks for Google Drive access when needed.
          </p>
          <button className="account-action-button" type="button" onClick={onGoogleSignIn} disabled={isSubmittingAuth}>
            {isSubmittingAuth ? "Redirecting to Google…" : "Continue with Google"}
          </button>
          {authMessage && <p className="account-message" role="status">{authMessage}</p>}
          {authError && <p className="database-error" role="alert">{authError}</p>}
        </>
      )}
    </section>
  );
}
