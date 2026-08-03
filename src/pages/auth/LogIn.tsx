import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { useAuth } from '../../lib/auth';
import { goToApp } from '../../lib/app-handoff';
import { AuthShell } from '../../components/auth/AuthShell';
import { Field, Alert } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { GoogleButton, AuthDivider, isGoogleAuthEnabled } from '../../components/auth/GoogleButton';

export function LogIn() {
  usePageMeta({
    title: 'Log in',
    description: 'Log in to Batchlabel to pick up a SKU you were working on, or start a new one.',
    noIndex: true
  });

  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithPassword, sendMagicLink, signInWithGoogle, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  // The product lives on app.batchlabel.xyz, so a completed login ends there
  // rather than on this site. `next` is set when the app bounced someone here to
  // sign in; it is validated against an allowlist before being followed.
  const next = new URLSearchParams(location.search).get('next');

  // Google always returns to /dashboard, so a deep link the user was aiming at is lost
  // on this path. Losing it is better than trusting a redirect target through an
  // external provider, and the dashboard is one click from anywhere in the app.
  const handleGoogle = async () => {
    setGoogleBusy(true);
    setError(null);
    const result = await signInWithGoogle({ intent: 'log_in' });
    if (result.error) {
      setError(result.error);
      setGoogleBusy(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await signInWithPassword({ email, password });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    goToApp(next);
  };

  const handleMagicLink = async () => {
    if (!email) {
      setError('Add your email address first and we will send you a link.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await sendMagicLink({ email });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate(`/check-your-email?email=${encodeURIComponent(email)}&mode=magic_link`);
  };

  return (
    <AuthShell
      title="Welcome back"
      intro="Log in to pick up a SKU you were working on, or start a new one."
      footer={
      <p>
          No account yet?{' '}
          <Link to="/sign-up" className="text-teal-700 underline decoration-teal-700/40 underline-offset-2">
            Make a label free
          </Link>
        </p>
      }>
      
      {!configured ?
      <div className="mb-4">
          <Alert tone="info">
            Sign in is not connected in this environment yet. Add the Supabase keys to switch it on.
          </Alert>
        </div> :
      null}

      {isGoogleAuthEnabled() ?
      <>
          <GoogleButton disabled={googleBusy} location="log_in" onClick={handleGoogle} />

          <div className="my-5">
            <AuthDivider />
          </div>
        </> :
      null}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field
          label="Email"
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          required
          autoComplete="email" />
        
        <Field
          label="Password"
          name="password"
          type="password"
          value={password}
          onChange={setPassword}
          required
          autoComplete="current-password" />
        

        {error ? <Alert tone="error">{error}</Alert> : null}

        <Button type="submit" fullWidth disabled={busy} track={{ label: 'Log in', location: 'log_in' }}>
          {busy ? 'Checking...' : 'Log in'}
        </Button>

        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleMagicLink}
            className="text-left text-teal-700 underline decoration-teal-700/30 underline-offset-4">
            
            Email me a sign in link instead
          </button>
          <Link
            to="/forgot-password"
            className="text-ink-soft underline decoration-ink/20 underline-offset-4 hover:text-ink">
            
            Forgotten your password?
          </Link>
        </div>
      </form>
    </AuthShell>);

}