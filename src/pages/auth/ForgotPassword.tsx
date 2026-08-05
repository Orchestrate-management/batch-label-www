import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { useAuth } from '../../lib/auth';
import { AuthShell } from '../../components/auth/AuthShell';
import { Field, Alert } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';

export function ForgotPassword() {
  usePageMeta({
    title: 'Reset your password',
    description: 'Send yourself a password reset link for your Batchlabel account.',
    noIndex: true
  });

  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await sendPasswordReset(email);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSent(true);
  };

  return (
    <AuthShell
      title="Forgotten your password?"
      intro="Happens to all of us. Put in your email and we will send you a link to set a new one."
      footer={
      <p>
          <Link to="/log-in" className="text-teal-700 underline decoration-teal-700/40 underline-offset-2">
            Back to log in
          </Link>
        </p>
      }>
      
      {sent ?
      <div className="space-y-4">
          <Alert tone="success">
            If we have an account for {email}, a reset link is on its way. It is valid for one hour.
          </Alert>
          <p className="text-sm text-ink-soft">
            Nothing in a few minutes? Check your spam folder, then email hello@batchlabel.xyz and we
            will sort it out.
          </p>
        </div> :

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Field
          label="Email"
          name="email"
          type="email"
          value={email}
          onChange={setEmail}
          required
          autoComplete="email" />
        
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Button type="submit" fullWidth disabled={busy}>
            {busy ? 'Sending...' : 'Send me a reset link'}
          </Button>
        </form>
      }
    </AuthShell>);

}