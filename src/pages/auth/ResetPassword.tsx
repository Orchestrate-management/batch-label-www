import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { useAuth } from '../../lib/auth';
import { AuthShell } from '../../components/auth/AuthShell';
import { Field, Alert } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';

export function ResetPassword() {
  usePageMeta({
    title: 'Set a new password',
    description: 'Choose a new password for your Batchlabel account.',
    noIndex: true
  });

  const navigate = useNavigate();
  const { updatePassword } = useAuth();
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
    navigate('/dashboard');
  };

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