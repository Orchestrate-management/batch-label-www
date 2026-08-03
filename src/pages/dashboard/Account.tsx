import { useEffect, useState } from 'react';
import { usePageMeta } from '../../lib/seo';
import { useAuth } from '../../lib/auth';
import { openBillingPortal } from '../../lib/billing';
import { PUBLIC_PLANS, priceWithInterval, skuAllowance } from '../../lib/plans';
import { fetchEntitlement, summarisePlan, type Entitlement } from '../../lib/entitlements';
import { APP_URL } from '../../lib/app-handoff';
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
  const [busy, setBusy] = useState<'portal' | null>(null);
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

      {/*
        Password changes live in the app, not here. There is no form on this page
        on purpose: two places to change a password is two places to get the
        re-authentication rule wrong, and the app's version asks for the current
        password before it changes anything. This links rather than duplicates.
       */}
      <section aria-labelledby="password" className="rounded-2xl border border-paper-edge bg-white p-5 sm:p-6">
        <h2 id="password" className="font-display text-[1.1rem] font-semibold text-ink">
          Password
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">
          Change your password in the app, under Settings. It asks for your current password first,
          and it signs out every other device once the new one is saved.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Button href={`${APP_URL}/settings/account`} variant="secondary">
            Open account settings
          </Button>
          <Button href="/forgot-password" variant="quiet">
            Forgotten it? Reset by email
          </Button>
        </div>
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
        <div className="mt-4 max-w-prose text-sm leading-relaxed text-ink-soft">
            <p>
              Paid plans buy you room for more SKUs, and nothing else: every plan makes the same
              label.
            </p>
            <ul className="mt-3 space-y-1.5">
              {PUBLIC_PLANS.map((plan) =>
            plan.monthlyPence === null || plan.annualPence === null ?
            null :
            <li key={plan.slug}>
                    <span className="font-medium text-ink">{plan.label}</span>,{' '}
                    {skuAllowance(plan)}, {priceWithInterval(plan.monthlyPence, 'monthly')} or{' '}
                    {priceWithInterval(plan.annualPence, 'annual')}.
                  </li>
            )}
            </ul>
          </div> :
        null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          {/*
            The upgrade button is hidden once a plan is active. Offering it to a paying
            customer is how someone ends up with two subscriptions and two charges a month.
            The endpoint refuses a second subscription as well — this is so they are never
            invited to try.
           */}
          {/*
            The tier is chosen inside the app, not here. A single button that quietly bought
            one fixed plan out of four is a wrong-plan purchase with a refund attached.
           */}
          {summary.showUpgrade ?
          <Button
            href={`${APP_URL}/settings/billing`}
            track={{ label: 'Choose a plan', location: 'dashboard_account' }}>

              Choose a plan
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
          Manage billing opens the Stripe customer portal, where you can change your plan, switch
          between monthly and yearly, change your card, download invoices, or cancel. Cancelling
          leaves your access in place until the end of the period you have paid for, and no part of
          it is refunded.
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