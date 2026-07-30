import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { useAuth } from '../../lib/auth';
import { AuthShell } from '../../components/auth/AuthShell';
import { Field, Alert, Checkbox, RequiredKey } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { GoogleButton, AuthDivider, isGoogleAuthEnabled } from '../../components/auth/GoogleButton';

/** Opens a legal doc in a new tab without toggling the checkbox it lives inside. */
function LegalLink({ to, children }: {to: string;children: React.ReactNode;}) {
  return (
    <Link
      to={to}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      className="text-teal-700 underline decoration-teal-700/40 underline-offset-2">
      {children}
    </Link>);

}

type Mode = 'password' | 'magic_link';

export function SignUp() {
  usePageMeta({
    title: 'Make a label free',
    description:
    'Create a free Batchlabel account and make your first CLP label. No payment card needed.',
    noIndex: false
  });

  const navigate = useNavigate();
  const { signUpWithPassword, sendMagicLink, signInWithGoogle, configured } = useAuth();
  const [mode, setMode] = useState<Mode>('password');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingEmailOptIn, setMarketingEmailOptIn] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  // Google cannot carry the consent boxes through its redirect, so this path collects
  // nothing here and asks for it on /finish-setup instead.
  const handleGoogle = async () => {
    setGoogleBusy(true);
    setGoogleError(null);
    const result = await signInWithGoogle({ intent: 'sign_up' });
    if (result.error) {
      setGoogleError(result.error);
      setGoogleBusy(false);
    }
    // On success the browser is already leaving for Google; leave the button disabled.
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // Accepting the terms is mandatory. Surface the error and move focus to the control
    // so assistive tech announces why submission was blocked.
    if (!termsAccepted) {
      setTermsError('Please accept the Terms of Service to create your account.');
      if (typeof document !== 'undefined') {
        document.getElementById('acceptTerms')?.focus();
      }
      return;
    }
    setTermsError(null);
    setBusy(true);
    setError(null);

    // Advertising is not on this form. useAuth derives it from the cookie banner choice,
    // which is the only place we ask about it.
    const result =
    mode === 'password' ?
    await signUpWithPassword({ email, password, businessName, marketingEmailOptIn }) :
    await sendMagicLink({ email, signUp: { businessName, marketingEmailOptIn } });

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
      
      {!configured ?
      <div className="mb-4">
          <Alert tone="info">
            Sign in is not connected in this environment yet. The form below is complete and will
            work as soon as the Supabase keys are set.
          </Alert>
        </div> :
      null}

      {isGoogleAuthEnabled() ?
      <>
          <div className="space-y-3">
            <GoogleButton
            disabled={googleBusy}
            location="sign_up"
            onClick={handleGoogle} />

            <p className="text-xs leading-relaxed text-ink-muted">
              We will ask for your shop name and the terms on the next screen.
            </p>
            {googleError ? <Alert tone="error">{googleError}</Alert> : null}
          </div>

          <div className="my-5">
            <AuthDivider />
          </div>
        </> :
      null}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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

        <div className="space-y-3 rounded-xl border border-paper-edge bg-paper-deep/40 p-4">
          <RequiredKey />

          <Checkbox
            name="acceptTerms"
            checked={termsAccepted}
            required
            error={termsError ?? undefined}
            onChange={(checked) => {
              setTermsAccepted(checked);
              if (checked) setTermsError(null);
            }}>
            I accept the <LegalLink to="/terms">Terms of Service</LegalLink>.
          </Checkbox>

          <Checkbox
            name="marketingEmailOptIn"
            checked={marketingEmailOptIn}
            onChange={setMarketingEmailOptIn}>
            Send me product tips and offers by email. Optional, unsubscribe any time.
          </Checkbox>
        </div>

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
          The email box is optional. Change it any time from your account settings, or
          unsubscribe using the link in any marketing email. Advertising and retargeting
          follows your cookie choice, which you can change from the footer of any page.
        </p>
      </form>
    </AuthShell>);

}