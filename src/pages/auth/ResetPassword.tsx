import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { useAuth } from '../../lib/auth';
import { goToApp, APP_URL } from '../../lib/app-handoff';
import { AuthShell } from '../../components/auth/AuthShell';
import { Field, Alert } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { clearRecoveryEntry, recoveryEntry } from '../../lib/recovery-entry';

/**
 * The end of the reset-by-email flow, and where a maker with no password sets
 * their first one.
 *
 * WHAT GUARDS THIS PAGE
 *
 * `updateUser({ password })` changes the password of whoever the current session
 * belongs to and asks for nothing else — no current password, no email. So the
 * question this page has to answer is not "is someone signed in" but "did this
 * page load come from a link we emailed".
 *
 * Those are very different questions here. The session cookie is shared across
 * `.batchlabel.xyz` for 400 days, so on this site an ordinary signed-in maker is
 * signed in essentially always. Gating on the session would have meant anyone
 * with an unlocked laptop, or a replayed cookie, could open this URL and take
 * the account — which is exactly the attack the product app's change-password
 * screen asks for the current password to prevent. A guard on one of two
 * stacked sites is not a guard.
 *
 * `lib/recovery-entry.ts` answers the real question, and explains why it has to
 * be read before the Supabase client is constructed.
 *
 * FOUR WAYS PEOPLE GET HERE
 *
 *  - A working link           → the form.
 *  - An expired or used link  → "that link has expired". This is the one that
 *                               used to be invisible: Supabase keeps an existing
 *                               session when a link fails, so a signed-in maker
 *                               with a dead link saw a form that looked fine.
 *  - No link at all           → "this page needs the emailed link", with the two
 *                               routes that actually work.
 *  - Still resolving          → wait. Deciding early shows the expiry screen to
 *                               people whose link is perfectly good.
 */
export function ResetPassword() {
  usePageMeta({
    title: 'Set a new password',
    description: 'Choose a new password for your Batchlabel account.',
    noIndex: true
  });

  const { updatePassword, revokeOtherSessions, session, loading, configured } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entry = recoveryEntry();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError('Please use at least eight characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await updatePassword(password);
    if (result.error) {
      setBusy(false);
      setError(result.error);
      return;
    }
    // A reset is what someone does when they think another person has their
    // account, so every other session goes. The recovery session doing the
    // asking is the current one and survives. Its own failure is not surfaced:
    // the password has changed either way, and a failed revoke must never read
    // as a failed reset.
    await revokeOtherSessions();
    // The marker has done its job. Leaving it set would leave a standing
    // permission to change the password again for as long as this tab is open.
    clearRecoveryEntry();
    goToApp();
  };

  const backToLogIn =
  <p>
      <Link to="/log-in" className="text-teal-700 underline decoration-teal-700/40 underline-offset-2">
        Back to log in
      </Link>
    </p>;


  // While Supabase is not configured there is no session to read and no link to
  // verify, so the form renders for review. Nothing can be submitted anyway.
  if (configured) {
    if (loading) {
      return (
        <AuthShell title="Set a new password" intro="One moment." footer={backToLogIn}>
          <p className="text-sm text-ink-soft" role="status">
            Checking your link...
          </p>
        </AuthShell>);

    }

    if (entry.kind === 'link_failed' || entry.kind === 'recovery' && !session) {
      return <ExpiredLink />;
    }

    if (entry.kind === 'none') {
      return <NoLink signedIn={Boolean(session)} />;
    }
  }

  return (
    <AuthShell
      title="Set a new password"
      intro="Pick something you will remember. A short phrase is stronger than a clever word."
      footer={backToLogIn}>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field
          label="New password"
          name="password"
          type="password"
          value={password}
          onChange={setPassword}
          required
          autoComplete="new-password"
          hint="At least eight characters." />

        <Field
          label="Confirm new password"
          name="confirm"
          type="password"
          value={confirm}
          onChange={setConfirm}
          required
          autoComplete="new-password" />

        {error ? <Alert tone="error">{error}</Alert> : null}
        <Button type="submit" fullWidth disabled={busy}>
          {busy ? 'Saving...' : 'Save my new password'}
        </Button>
        <p className="text-xs leading-relaxed text-ink-muted">
          Saving signs you out on every other device. If someone else has been in your account,
          this ends it.
        </p>
      </form>
    </AuthShell>);

}

function ExpiredLink() {
  return (
    <AuthShell
      title="That link has expired"
      intro="Reset links last one hour and work once. This one has done its job, or it was opened in a different browser from the one that asked for it."
      footer={
      <p>
          <Link to="/log-in" className="text-teal-700 underline decoration-teal-700/40 underline-offset-2">
            Back to log in
          </Link>
        </p>
      }>

      <p className="text-sm leading-relaxed text-ink-soft">
        Ask for a new one and open it in this browser. The link is what proves it is you, so we
        cannot set a password without one.
      </p>
      <div className="mt-5">
        <Button
          fullWidth
          to="/forgot-password"
          track={{ label: 'Send me a new link', location: 'reset_password_expired' }}>

          Send me a new link
        </Button>
      </div>
    </AuthShell>);

}

/**
 * Arrived with no link at all: a bookmark, a typed URL, or someone poking at it.
 *
 * The important half is what this does NOT do, which is show a password form to
 * whoever happens to be signed in on this browser. Being signed in is not
 * permission to change a password, because staying signed in is the normal state
 * here for over a year at a time.
 *
 * Both routes that really work are offered, because someone who genuinely wants
 * a new password is far more likely to land here than an attacker is.
 */
function NoLink({ signedIn }: {signedIn: boolean;}) {
  return (
    <AuthShell
      title="This page needs the link we email you"
      intro="Setting a password here only works through a link sent to your email address. That link is what proves the account is yours."
      footer={
      <p>
          <Link to="/log-in" className="text-teal-700 underline decoration-teal-700/40 underline-offset-2">
            Back to log in
          </Link>
        </p>
      }>

      {signedIn ?
      <p className="text-sm leading-relaxed text-ink-soft">
          You are signed in, which is not the same as having proved it is you. To change your
          password without waiting for an email, use the app. It asks for your current password
          first.
        </p> :

      <p className="text-sm leading-relaxed text-ink-soft">
          Ask for a link and open it in this browser.
        </p>
      }
      <div className="mt-5 flex flex-col gap-3">
        {signedIn ?
        <Button href={`${APP_URL}/settings/account`}>Change it in the app</Button> :
        null}
        <Button
          variant={signedIn ? 'secondary' : 'primary'}
          fullWidth={!signedIn}
          to="/forgot-password"
          track={{ label: 'Email me a reset link', location: 'reset_password_no_link' }}>

          Email me a reset link
        </Button>
      </div>
    </AuthShell>);

}
