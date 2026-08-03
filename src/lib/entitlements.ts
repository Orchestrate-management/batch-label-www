/**
 * Reading the signed-in maker's entitlement.
 *
 * Goes through the `public.entitlements` view, which is the same read surface documented
 * for the separate product app in docs/ENTITLEMENTS.md. Using it here rather than reading
 * brand_memberships directly is the point: there is one definition of "currently entitled"
 * (public.entitlement_is_active) and both apps ask the database for it, so the account
 * screen and the product cannot disagree about whether somebody has paid.
 *
 * The view is `security_invoker`, so RLS applies and this can only ever return the caller's
 * own row. No user id is passed, and passing one would achieve nothing.
 */

import { supabase } from './supabase';
import { BRAND_SLUG } from './brand';
import { PLANS, skuAllowance, type PlanDisplay, type PublicPlanSlug } from './plans';

export interface Entitlement {
  brand: string;
  plan: string;
  /** The Stripe subscription status: active | trialing | past_due | canceled | ... */
  status: string | null;
  /** The account lifecycle: active | suspended | left. Not about Stripe. */
  membershipStatus: string | null;
  /** The only field that should gate a feature. */
  active: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
}

/**
 * The caller's entitlement for this brand, or null when it could not be read.
 *
 * Returns null rather than a fabricated free-plan record on failure, so the UI can say
 * "we could not check your plan" instead of telling a paying customer they are on the free
 * tier and inviting them to buy it again.
 */
export async function fetchEntitlement(): Promise<Entitlement | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.
  from('entitlements').
  select('brand, plan, status, membership_status, active, current_period_end, cancel_at_period_end, trial_end').
  eq('brand', BRAND_SLUG).
  maybeSingle();

  if (error || !data) return null;

  return {
    brand: String(data.brand),
    plan: String(data.plan ?? 'free'),
    status: (data.status as string | null) ?? null,
    membershipStatus: (data.membership_status as string | null) ?? null,
    active: Boolean(data.active),
    currentPeriodEnd: (data.current_period_end as string | null) ?? null,
    cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
    trialEnd: (data.trial_end as string | null) ?? null
  };
}

/** e.g. "14 August 2026". Returns null for a missing or unparseable date. */
export function formatPeriodEnd(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export interface PlanSummary {
  /** Short label for the badge, e.g. "Maker plan". */
  label: string;
  /** One sentence under it. */
  detail: string;
  /** Whether to offer checkout. False whenever they already have something to manage. */
  showUpgrade: boolean;
  /** Whether to offer the Stripe portal. */
  showManageBilling: boolean;
  /** Set when something needs the maker's attention. */
  warning: string | null;
}

/**
 * The plan the row names, or null when it names one this build does not know about.
 *
 * A slug we do not recognise is not an error to shout about on an account page — the
 * database CHECK constraint is what guarantees only legal slugs are ever written, and a
 * www deploy can legitimately lag a new tier. Returning null lets the caller fall back to
 * wording that is true of every plan rather than inventing one.
 */
function planFor(slug: string): PlanDisplay | null {
  return (PLANS as Record<string, PlanDisplay | undefined>)[slug as PublicPlanSlug] ?? null;
}

/**
 * What the account screen should say.
 *
 * Kept as a pure function so every branch is testable without rendering, and so the rule
 * "never offer to sell a plan to someone who already has one" is stated in one place. The
 * server refuses a second subscription regardless — this is what stops the customer being
 * invited to try.
 *
 * Every branch reads the plan off the row. It used to hard-code "Maker" in all five, so a
 * paying Studio or Consultant customer was shown a tier they had not bought and a lapsed
 * one was told the wrong plan had ended — with the slug already in hand at the select.
 */
export function summarisePlan(entitlement: Entitlement | null): PlanSummary {
  if (!entitlement) {
    // Unknown, not free. Offering "Upgrade" here is how a paying customer whose network
    // blipped ends up buying a second subscription.
    return {
      label: 'Checking your plan...',
      detail: 'We could not read your plan just now. Refresh in a moment.',
      showUpgrade: false,
      showManageBilling: true,
      warning: null
    };
  }

  if (entitlement.membershipStatus === 'suspended') {
    return {
      label: 'Account suspended',
      detail: 'Your account is suspended.',
      showUpgrade: false,
      showManageBilling: true,
      warning: 'Your account is suspended. Email hello@batchlabel.co.uk and we will sort it out.'
    };
  }

  // A lapsed account IS a Free account, with Free's allowance and Free's abilities.
  // Nothing about having once paid may leave someone worse off than a new signup.
  if (!entitlement.active) {
    return {
      label: `${PLANS.free.label} plan`,
      detail: `${skuAllowance(PLANS.free)}, the same label every paid plan makes, unlimited reprints.`,
      showUpgrade: true,
      // A former subscriber still has invoices to download, so the portal stays available.
      showManageBilling: true,
      warning:
      entitlement.status === 'canceled' ?
      'Your subscription has ended. Subscribe again whenever you are ready.' :
      null
    };
  }

  const plan = planFor(entitlement.plan);
  const label = plan ? `${plan.label} plan` : 'Your plan';
  // The allowance, and nothing about what happens at it. No SKU limit is enforced anywhere
  // in the product yet, so a sentence about being stopped would be a promise the software
  // cannot keep in either direction.
  const allowance = plan ?
  `${skuAllowance(plan)}, unlimited reprints.` :
  'Unlimited reprints, and the same label every plan makes.';
  const endsOn = formatPeriodEnd(entitlement.currentPeriodEnd);

  if (entitlement.status === 'trialing') {
    return {
      label: `${label} (trial)`,
      detail: endsOn ? `Your trial runs until ${endsOn}.` : 'You are on a trial.',
      showUpgrade: false,
      showManageBilling: true,
      warning: null
    };
  }

  if (entitlement.status === 'past_due') {
    return {
      label,
      detail: allowance,
      showUpgrade: false,
      showManageBilling: true,
      warning:
      'Your last payment did not go through. Update your card in Manage billing to keep your plan — nothing is switched off yet.'
    };
  }

  if (entitlement.cancelAtPeriodEnd) {
    return {
      label,
      detail: endsOn ?
      `Cancelled — your plan stays on until ${endsOn}.` :
      'Cancelled — your plan stays on until the end of the period you have paid for.',
      showUpgrade: false,
      showManageBilling: true,
      warning: null
    };
  }

  return {
    label,
    detail: endsOn ? `${allowance} Renews ${endsOn}.` : allowance,
    showUpgrade: false,
    showManageBilling: true,
    warning: null
  };
}
