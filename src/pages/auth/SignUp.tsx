import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { useAuth } from '../../lib/auth';
import { AuthShell } from '../../components/auth/AuthShell';
import { Field, Alert } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';

type Mode = 'password' | 'magic_link';

export function SignUp() {
  usePageMeta({
    title: 'Make a label free',
    description:
    'Create a free Batchlabel account and make your first CLP label. No payment card needed.',
    noIndex: false
  });

  const navigate = useNavigate();
  const { signUpWithPassword, sendMagicLink, configured } = useAuth();
  const [mode, setMode] = useState<Mode>('password');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const result =
    mode === 'password' ?
    await signUpWithPassword({ email, password, businessName }) :
    await sendMagicLink(email);

    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate(`/check-your-email?email=${encodeURIComponent(email)}&mode=${mode}`);
  };

  return (
    <AuthShell
      title="Make your first label, free"
      intro="One label, no payment card, about ten minutes. You need the safety data sheet from your fragrance supplier to hand."
      footer={
      <p>
          Already have an account?{' '}
          <Link to="/log-in" className="text-teal-700 underline decoration-teal-700/40 underline-offset-2">
            Log in
          </Link>
        </p>
      }>
      
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {!configured ?
        <Alert tone="info">
            Sign in is not connected in this environment yet. The form below is complete and will
            work as soon as the Supabase keys are set.
          </Alert> :
        null}

        <Field
          label="Business or shop name"
          name="businessName"
          value={businessName}
          onChange={setBusinessName}
          required
          autoComplete="organization"
          placeholder="Willow & Wick" />
        
        <Field
          label="Email"
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          required
          autoComplete="email" />
        

        {mode === 'password' ?
        <Field
          label="Password"
          name="password"
          type="password"
          value={password}
          onChange={setPassword}
          required
          autoComplete="new-password"
          hint="At least eight characters. A short phrase works well." /> :

        null}

        {error ? <Alert tone="error">{error}</Alert> : null}

        <Button type="submit" fullWidth disabled={busy} track={{ label: 'Create account', location: 'sign_up' }}>
          {busy ? 'Setting up your account...' : mode === 'password' ? 'Create my account' : 'Email me a sign in link'}
        </Button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'password' ? 'magic_link' : 'password');
            setError(null);
          }}
          className="w-full text-center text-sm text-teal-700 underline decoration-teal-700/30 underline-offset-4">
          
          {mode === 'password' ? 'Rather not set a password? Email me a link' : 'Set a password instead'}
        </button>

        <p className="text-xs leading-relaxed text-ink-muted">
          By creating an account you agree to our terms of service. We do not send marketing email
          unless you ask us to.
        </p>
      </form>
    </AuthShell>);

}