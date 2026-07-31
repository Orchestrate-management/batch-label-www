import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { useAuth } from '../../lib/auth';
import { AuthShell } from '../../components/auth/AuthShell';
import { Field, Alert } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';

export function ResetPassword() {
  const navigate = useNavigate();
  const { updatePassword, session, loading, configured } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * A reset link only works once and only for an hour. Clicking a stale one used to
   * land here on a form that looked perfectly usable — you typed a new password twice,
   * pressed the button, and Supabase's own words came back at you: "Auth session
   * missing!". No explanation, and no way forward but the browser's back button.
   *
   * `loading` is false only once getSession has resolved, and getSession waits for
   * supabase-js to finish reading the recovery token out of the URL. So a false
   * `loading` with no session means the link genuinely did not work, rather than that
   * we asked too early.
   */
  const linkFailed = configured && !loading && !session;

  // The title is what RouteAnnouncer reads out, so it has to say which of these two
  // screens the maker is actually on.
  usePageMeta({
    title: linkFailed ? 'That link has expired' : 'Set a new password',
    description: 'Choose a new password for your Batchlabel account.',
    noIndex: true
  });

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
    navigate('/dashboard');
  };

  if (loading) {
    return (
      <AuthShell title="Set a new password" intro="Checking your link.">
        <p className="text-sm text-ink-muted" role="status">
          One moment.
        </p>
      </AuthShell>);

  }

  if (linkFailed) {
    return (
      <AuthShell
        title="That link has expired"
        intro="Reset links last an hour and work once. This one has been used already, or it has run out."
        footer={
        <p>
            <Link to="/log-in" className="text-teal-700 underline decoration-teal-700/40 underline-offset-2">
              Back to log in
            </Link>
          </p>
        }>

        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-ink-soft">
            Nothing has changed about your account and your old password still works. Ask for a
            fresh link and it will be in your inbox in a minute.
          </p>
          <Button to="/forgot-password" fullWidth>
            Send me a new link
          </Button>
        </div>
      </AuthShell>);

  }

  return (
    <AuthShell
      title="Set a new password"
      intro="Pick something you will remember. A short phrase is stronger than a clever word."
      footer={
      <p>
          <Link to="/log-in" className="text-teal-700 underline decoration-teal-700/40 underline-offset-2">
            Back to log in
          </Link>
        </p>
      }>

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