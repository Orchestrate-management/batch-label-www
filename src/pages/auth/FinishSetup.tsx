import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePageMeta } from '../../lib/seo';
import { useAuth } from '../../lib/auth';
import { goToApp } from '../../lib/app-handoff';
import { completeOAuthSignup } from '../../lib/membership';
import { trackSignUpCompleted } from '../../lib/analytics';
import { AuthShell } from '../../components/auth/AuthShell';
import { Field, Alert, Checkbox } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';

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

/**
 * The completion step for a signup that came through Google.
 *
 * A Google redirect brings back a name, an email and nothing else. It cannot bring back
 * a business name or a Terms acceptance, so those are collected here and written by
 * complete_oauth_signup in one transaction with the membership. Until that happens the
 * dashboard gate keeps sending the user back to this screen.
 *
 * Someone logging back in never sees this: they already have a membership, so the gate
 * on this route bounces them straight to the dashboard.
 */
export function FinishSetup() {
  usePageMeta({
    title: 'Finish setting up your account',
    description: 'One more step before your first label.',
    noIndex: true
  });

  const navigate = useNavigate();
  const { user, signOut, configured } = useAuth();
  const [businessName, setBusinessName] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [marketingEmailOptIn, setMarketingEmailOptIn] = useState(false);
  const [advertisingOptIn, setAdvertisingOptIn] = useState(false);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    // Accepting the terms is mandatory, exactly as on the email signup form. The
    // database refuses an unaccepted submission too; this is the half that explains why.
    if (!termsAccepted) {
      setTermsError('Please accept the Terms of Service to finish setting up your account.');
      if (typeof document !== 'undefined') {
        document.getElementById('acceptTerms')?.focus();
      }
      return;
    }
    setTermsError(null);
    setBusy(true);
    setError(null);

    const result = await completeOAuthSignup({
      businessName,
      termsAccepted,
      marketingEmailOptIn,
      advertisingOptIn
    });

    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    // Only count it as a signup if this call is what created the account. A repeat
    // submit returns provisioned:false and must not inflate the conversion.
    if (result.provisioned && user?.email) {
      await trackSignUpCompleted(
        'google', user.email, user.id, marketingEmailOptIn, advertisingOptIn
      );
    }
    goToApp();
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <AuthShell
      title="One more thing before your first label"
      intro={
      user?.email ?
      `You are signed in as ${user.email}. We need your shop name and your agreement to the terms.` :
      'We need your shop name and your agreement to the terms.'
      }
      footer={
      <p>
          Wrong account?{' '}
          <button
          type="button"
          onClick={handleSignOut}
          className="text-teal-700 underline decoration-teal-700/40 underline-offset-2">

            Log out
          </button>
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

        <div className="space-y-3 rounded-xl border border-paper-edge bg-paper-deep/40 p-4">
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

          <Checkbox
            name="advertisingOptIn"
            checked={advertisingOptIn}
            onChange={setAdvertisingOptIn}>
            Use my email and account details for advertising and retargeting (shared with
            partners such as Meta and Google). Optional. See our{' '}
            <LegalLink to="/privacy">Privacy Policy</LegalLink>.
          </Checkbox>
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <Button type="submit" fullWidth disabled={busy} track={{ label: 'Finish setup', location: 'finish_setup' }}>
          {busy ? 'Setting up your account...' : 'Finish and start my label'}
        </Button>

        <p className="text-xs leading-relaxed text-ink-muted">
          Both optional boxes above can be changed any time from your account settings, or
          unsubscribe using the link in any marketing email.
        </p>
      </form>
    </AuthShell>);

}
