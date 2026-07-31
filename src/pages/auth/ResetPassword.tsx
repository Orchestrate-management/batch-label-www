import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { useAuth } from '../../lib/auth';
import { goToApp } from '../../lib/app-handoff';
import { AuthShell } from '../../components/auth/AuthShell';
import { Field, Alert } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';

/**
 * The end of the reset-by-email flow, and the screen where a Google-only maker
 * sets a password for the first time.
 *
 * Clicking the emailed link signs the person in with a recovery session, which
 * is what `updateUser` needs. That is the whole security model: possession of
 * the inbox stands in for the password they cannot supply.
 *
 * Someone can also arrive here with no session — an expired link, a link opened
 * in a different browser, a bookmark, a second click on a link already used. The
 * form used to render anyway and fail on submit with Supabase's own words
 * ("Auth session missing!"), after they had chosen and typed a password twice.
 * So the session is checked first and the dead end is explained before any work
 * is asked for.
 */
export function ResetPassword() {
  usePageMeta({
    title: 'Set a new password',
    description: 'Choose a new password for your Batchlabel account.',
    noIndex: true
  });

  const { updatePassword, session, loading, configured } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    // The product is on app.batchlabel.xyz and the session travels in a shared
    // cookie, so someone who has just proved who they are belongs there rather
    // than on the marketing dashboard. This used to land on /dashboard, which
    // was one more hop for everybody.
    goToApp();
  };

  const backToLogIn =
  <p>
      <Link to="/log-in" className="text-teal-700 underline decoration-teal-700/40 underline-offset-2">
        Back to log in
      </Link>
    </p>;


  // Reading the session is asynchronous. Deciding before it resolves would show
  // the "link has expired" screen to someone whose link is perfectly good.
  if (configured && loading) {
    return (
      <AuthShell title="Set a new password" intro="One moment." footer={backToLogIn}>
        <p className="text-sm text-ink-soft" role="status">
          Checking your link...
        </p>
      </AuthShell>);

  }

  if (configured && !session) {
    return (
      <AuthShell
        title="That link has expired"
        intro="Reset links last one hour and work once. This one has done its job, or it was opened in a different browser from the one that asked for it."
        footer={backToLogIn}>

        <p className="text-sm leading-relaxed text-ink-soft">
          Ask for a new one and open it in this browser. The link signs you in, which is how we
          know it is you.
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
      </form>
    </AuthShell>);

}
