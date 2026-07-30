import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { useAuth } from '../../lib/auth';
import { AuthShell } from '../../components/auth/AuthShell';
import { Field, Alert } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';

export function LogIn() {
  usePageMeta({
    title: 'Log in',
    description: 'Log in to Batchlabel to make and download your CLP labels.',
    noIndex: true
  });

  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithPassword, sendMagicLink, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destination = (location.state as {from?: string;} | null)?.from ?? '/dashboard';

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
    navigate(destination);
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
      intro="Log in to pick up a saved recipe or make a new label."
      footer={
      <p>
          No account yet?{' '}
          <Link to="/sign-up" className="text-teal-700 underline decoration-teal-700/40 underline-offset-2">
            Make a label free
          </Link>
        </p>
      }>
      
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {!configured ?
        <Alert tone="info">
            Sign in is not connected in this environment yet. Add the Supabase keys to switch it on.
          </Alert> :
        null}

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