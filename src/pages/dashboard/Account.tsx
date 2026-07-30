import { useEffect, useState } from 'react';
import { usePageMeta } from '../../lib/seo';
import { useAuth } from '../../lib/auth';
import { openBillingPortal, startCheckout } from '../../lib/billing';
import { fetchEntitlement, summarisePlan, type Entitlement } from '../../lib/entitlements';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Field';
import { MarketingPreferences } from '../../components/dashboard/MarketingPreferences';

export function Account() {
  usePageMeta({
    title: 'Account and billing',
    description: 'Manage your Batchlabel account, plan and billing details.',
    noIndex: true
  });

  const { user } = useAuth();
  const [busy, setBusy] = useState<'portal' | 'checkout' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);

  // The real plan, from the same read surface the product app uses. This screen used to
  // hard-code "Free plan" and always offer "Upgrade to Maker", so a paying customer was
  // told they had nothing and invited to buy it a second time.
  useEffect(() => {
    let active = true;
    fetchEntitlement().then((result) => {
      if (!active) return;
      setEntitlement(result);
      setLoadingPlan(false);
    });
    return () => {
      active = false;
    };
  }, [user?.id]);

  const summary = summarisePlan(loadingPlan ? null : entitlement);

  const handlePortal = async () => {
    setBusy('portal');
    setError(null);
    // No user id: the endpoint resolves the Stripe customer from the access token, so a
    // billing-portal link can only ever be minted for the person who asked for it.
    const result = await openBillingPortal();
    if (result.error) setError(result.error);
    setBusy(null);
  };

  const handleUpgrade = async () => {
    setBusy('checkout');
    setError(null);
    const result = await startCheckout('monthly');
    if (result.error) setError(result.error);
    setBusy(null);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[1.5rem] font-semibold tracking-[-0.015em] text-ink sm:text-[1.8rem]">
          Account and billing
        </h1>
        <p className="mt-2 text-[0.98rem] text-ink-soft">
          Everything about your plan in one place. No hunting through menus.
        </p>
      </div>

      <section aria-labelledby="account-details" className="rounded-2xl border border-paper-edge bg-white p-5 sm:p-6">
        <h2 id="account-details" className="font-display text-[1.1rem] font-semibold text-ink">
          Your details
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Email</dt>
            <dd className="mt-1 text-sm text-ink">{user?.email ?? 'Not signed in'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Business name
            </dt>
            <dd className="mt-1 text-sm text-ink">
              {user?.user_metadata?.business_name as string | undefined ?? 'Not set yet'}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-ink-muted">
          Need to change your email or business name? Email hello@batchlabel.co.uk and we will do it
          for you while the self service settings are being built.
        </p>
      </section>

      <MarketingPreferences />

      <section aria-labelledby="plan" className="rounded-2xl border border-paper-edge bg-white p-5 sm:p-6">
        <h2 id="plan" className="font-display text-[1.1rem] font-semibold text-ink">
          Your plan
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-paper-edge bg-paper px-3 py-1 text-xs font-medium text-ink-soft">
            {summary.label}
          </span>
          <span className="text-sm text-ink-muted">{summary.detail}</span>
        </div>

        {summary.warning ?
        <div className="mt-4">
            <Alert tone="info">{summary.warning}</Alert>
          </div> :
        null}

        {summary.showUpgrade ?
        <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-soft">
            The Maker plan is £14 a month or £140 a year, VAT included. It gives you unlimited
            labels, print ready PDF and SVG with no watermark, UFI generation, batch code fields and
            saved recipes.
          </p> :
        null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          {/*
            The upgrade button is hidden once a plan is active. Offering it to a paying
            customer is how someone ends up with two subscriptions and two charges a month.
            The endpoint refuses a second subscription as well — this is so they are never
            invited to try.
           */}
          {summary.showUpgrade ?
          <Button
            disabled={busy === 'checkout'}
            onClick={handleUpgrade}
            track={{ label: 'Upgrade to Maker', location: 'dashboard_account' }}>

              {busy === 'checkout' ? 'Opening checkout...' : 'Upgrade to Maker'}
            </Button> :
          null}
          {summary.showManageBilling ?
          <Button
            variant={summary.showUpgrade ? 'secondary' : 'primary'}
            disabled={busy === 'portal'}
            onClick={handlePortal}>

              {busy === 'portal' ? 'Opening...' : 'Manage billing'}
            </Button> :
          null}
        </div>

        {error ?
        <div className="mt-4">
            <Alert tone="error">{error}</Alert>
          </div> :
        null}

        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          Manage billing opens the Stripe customer portal, where you can change your card, download
          invoices, switch between monthly and yearly, or cancel. Cancelling leaves your access in
          place until the end of the period you have paid for.
        </p>
      </section>

      <section aria-labelledby="data" className="rounded-2xl border border-paper-edge bg-white p-5 sm:p-6">
        <h2 id="data" className="font-display text-[1.1rem] font-semibold text-ink">
          Your data
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
          You can ask us for a copy of everything we hold, or ask us to delete your account and your
          uploaded safety data sheets. Email privacy@batchlabel.co.uk and we will reply within a
          month, usually the same week.
        </p>
      </section>
    </div>);

}