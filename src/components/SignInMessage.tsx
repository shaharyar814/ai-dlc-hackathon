interface SignInMessageProps {
  kind: 'failed' | 'not-in-group'
  /** Restarts sign-in. Used by the "failed" message only. */
  onRestart?: () => void
  /** API mode: lets a user signed in with the wrong account sign out. */
  signOut?: { href: string; onSignOut: () => void }
}
export default function SignInMessage({ kind, onRestart, signOut }: SignInMessageProps) {
  if (kind === 'not-in-group') {
    return (
      <div>
        <h1 tabIndex={-1}>No access</h1>
        <p role="alert">
          Your account is not in the fulfillment-lead group, so you cannot see this queue.
        </p>
        {signOut && (
          <a href={signOut.href} onClick={signOut.onSignOut}>
            Sign out
          </a>
        )}
      </div>
    )
  }
  return (
    <div>
      <h1 tabIndex={-1}>Sign-in failed</h1>
      <p role="alert">Sign-in failed. No queue data is shown.</p>
      <button type="button" onClick={onRestart}>
        Sign in again
      </button>
    </div>
  )
}
