/**
 * Stripe event -> the entitlement change it implies.
 *
 * One pure function, `intentFromEvent`, is the whole interpretation layer. Everything the
 * webhook writes goes through it, so "what does this event mean" is answerable by reading
 * one file and testable without a Stripe account.
 *
 * The design rule that matters: every field on an intent is nullable and `null` means
 * "this event says nothing about that". apply_stripe_entitlement() treats null as
 * leave-alone, so a partial event can never destroy a fact a different event established.
 * checkout.session.completed knows the customer id but not the billing period;
 * invoice.payment_failed knows neither the plan nor the price. Both are safe to apply.
 *
 * The security rule that matters: `plan` is only ever non-null on an event that Stripe
 * says represents a live subscription. invoice.* events pass `plan: null` unconditionally,
 * so no invoice can promote anybody.
 */

import type Stripe from 'stripe';
import type { PurchaseSignal } from './meta-capi';
import {
  FREE_PLAN,
  MAKER_PLAN,
  PAID_PLANS,
  idOf,
  invoiceSubscriptionId,
  invoiceSubscriptionMetadata,
  isRenewalFailure,
  planForPrice,
  planForStatus,
  subscriptionInterval,
  subscriptionPeriodEnd,
  subscriptionPriceId,
  subscriptionTrialEnd,
  toIso,
  type PriceMap } from
'./entitlements';

/**
 * What we ask the database to write. Mirrors apply_stripe_entitlement()'s arguments.
 */
export interface EntitlementIntent {
  eventId: string;
  eventType: string;
  /** Stripe's event.created, ISO. The clock the ordering guard runs on. */
  eventAt: string;
  brand: string;
  userId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  email: string | null;
  plan: string | null;
  planStatus: string | null;
  priceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  trialEnd: string | null;
  /** Merged into brand_memberships.data->'billing'. Brand-specific extras live here. */
  billing: Record<string, unknown>;
}

export interface IntentConfig {
  /** The brand this deployment sells for. A server constant, never a request parameter. */
  brand: string;
  prices: PriceMap;
}

/** Event types this endpoint acts on. Anything else is acknowledged and ignored. */
export const HANDLED_EVENT_TYPES: readonly string[] = [
'checkout.session.completed',
'customer.subscription.created',
'customer.subscription.updated',
'customer.subscription.deleted',
'invoice.payment_failed'];


const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Supabase user id out of Stripe metadata.
 *
 * We wrote this metadata ourselves at checkout, and it arrives inside a signature-verified
 * event, so it is trustworthy — but it is still a string that has round-tripped through a
 * third party. A non-uuid would blow up the RPC's uuid cast and turn one bad subscription
 * into a webhook that 500s forever, so it is validated rather than assumed.
 */
export function readUserId(metadata: Stripe.Metadata | null | undefined): string | null {
  const raw = metadata?.supabase_user_id;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return UUID_RE.test(trimmed) ? trimmed : null;
}

/**
 * Is this event about a product THIS deployment sells?
 *
 * It has to be asked, because the Stripe account is shared across Orchestrate brands — it
 * already carries Starter (£480/mo) and Scale (£1,800/mo) alongside Batchlabel Maker — and a
 * webhook endpoint receives every event for the whole account, not just the ones for the
 * product it was set up for. Without this check, somebody buying Starter would be handed a
 * Batchlabel Maker entitlement, because the mapping below happily granted `maker` for any
 * subscription-mode checkout that completed.
 *
 * Two ways to qualify, in order:
 *   * the metadata names a brand — our own checkout writes `brand` on both the session and
 *     the subscription, so this is the normal path, and it is exact: another brand's
 *     subscription is ignored here and handled by that brand's own deployment;
 *   * no brand metadata at all, but the price is one of ours — covers a subscription created
 *     by hand in the dashboard against a Batchlabel price.
 *
 * Anything else is not ours. It is IGNORED rather than rejected: erroring would return a
 * non-2xx to Stripe for a perfectly valid event about somebody else's product, and a run of
 * those gets the endpoint disabled, taking Batchlabel billing down with it.
 */
export function belongsToThisBrand(
metadata: Stripe.Metadata | null | undefined,
priceId: string | null,
config: IntentConfig)
: boolean {
  const brand = typeof metadata?.brand === 'string' ? metadata.brand.trim() : '';
  if (brand) return brand === config.brand;
  return Boolean(priceId && config.prices[priceId]);
}

/**
 * The weaker test, for events that cannot prove ownership either way.
 *
 * An invoice carries a snapshot of the subscription's metadata, but only for invoices
 * finalised since June 2023 and only if the subscription had metadata at all. Absent that,
 * an invoice event has no brand and no price to check — and it can only ever ANNOTATE an
 * existing membership (it never carries a plan), so rejecting it outright would lose real
 * dunning information for a hypothetical mismatch. It is let through, and the database's
 * subscription-identity guard is what stops it touching a membership whose subscription it
 * is not about. Only an explicit, different brand is rejected here.
 */
export function namesAnotherBrand(
metadata: Stripe.Metadata | null | undefined,
config: IntentConfig)
: boolean {
  const brand = typeof metadata?.brand === 'string' ? metadata.brand.trim() : '';
  return Boolean(brand) && brand !== config.brand;
}

/**
 * The paid tier a subscription sells, preferring what we recorded at checkout.
 *
 * Order matters. `planForPrice` falls back to the Maker plan for an unrecognised price, on
 * the grounds that a customer who has paid and gets nothing is the worse failure. But
 * Orchestrate runs one Stripe account across sub-brands, so "any subscription with an
 * unknown price grants Batchlabel Maker" is a real cross-brand hazard as soon as there is a
 * second product. Our own checkout writes `plan` into the subscription metadata, so reading
 * that first means the fallback is only reached for a subscription created outside this
 * codebase — and the value is allow-listed, so it can only ever name a tier we sell.
 */
export function readPlan(
metadata: Stripe.Metadata | null | undefined,
fallback: string)
: string {
  const raw = metadata?.plan;
  if (typeof raw === 'string' && PAID_PLANS.includes(raw.trim())) return raw.trim();
  return fallback;
}

function baseIntent(event: Stripe.Event, config: IntentConfig, brand: string): EntitlementIntent {
  return {
    eventId: event.id,
    eventType: event.type,
    eventAt: toIso(event.created) ?? new Date().toISOString(),
    brand: brand || config.brand,
    userId: null,
    customerId: null,
    subscriptionId: null,
    email: null,
    plan: null,
    planStatus: null,
    priceId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: null,
    trialEnd: null,
    billing: {}
  };
}

/**
 * Returns the entitlement change an event implies, or null when the event is none of our
 * business. Never throws: a malformed payload yields null rather than a 500 that makes
 * Stripe retry a poisoned event for three days.
 */
export function intentFromEvent(
event: Stripe.Event,
config: IntentConfig)
: EntitlementIntent | null {
  switch (event.type) {
    case 'checkout.session.completed':
      return fromCheckoutSession(event, config);
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return fromSubscription(event, config);
    case 'invoice.payment_failed':
      return fromFailedInvoice(event, config);
    default:
      return null;
  }
}

/**
 * checkout.session.completed — the LINKING event.
 *
 * Its unique job is recording stripe_customer_id, because that is what
 * /api/create-portal-session needs and no other event is guaranteed to reach us first.
 * Stripe frequently emits customer.subscription.created BEFORE this one, which is exactly
 * why the subscription metadata carries the same supabase_user_id.
 *
 * It also grants the plan when the payment actually succeeded, as a belt-and-braces path
 * in case a subscription event is missed. The authoritative status still arrives on
 * customer.subscription.*, and the ordering guard makes whichever lands last correct.
 */
function fromCheckoutSession(event: Stripe.Event, config: IntentConfig): EntitlementIntent | null {
  const session = event.data.object as Stripe.Checkout.Session;
  // A one-off payment is not an entitlement. Batchlabel sells no one-off products today,
  // but "we added a paid template pack" should not silently grant a subscription.
  if (session.mode !== 'subscription') return null;

  // Somebody else's product on the shared Orchestrate Stripe account. A session carries no
  // line items on the webhook payload, so the brand metadata our own checkout writes is the
  // only signal available here — and a session with no brand metadata at all is, by
  // definition, not one we created.
  if (!belongsToThisBrand(session.metadata, null, config)) return null;

  const intent = baseIntent(event, config, config.brand);
  intent.userId = readUserId(session.metadata);
  intent.customerId = idOf(session.customer);
  intent.subscriptionId = idOf(session.subscription);
  intent.email = session.customer_details?.email ?? session.customer_email ?? null;

  const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  if (paid) {
    intent.plan = MAKER_PLAN;
    intent.planStatus = 'active';
  }

  intent.billing = {
    checkout_session_id: session.id,
    checkout_completed_at: intent.eventAt,
    amount_total: session.amount_total ?? null,
    currency: session.currency ?? null
  };

  // Only populated when the caller expanded `subscription`; harmless when it is a string.
  if (session.subscription && typeof session.subscription !== 'string') {
    intent.currentPeriodEnd = subscriptionPeriodEnd(session.subscription);
    intent.priceId = subscriptionPriceId(session.subscription);
  }

  return intent;
}

/**
 * The facts a completed checkout gives the Meta Conversions API, or null when there is
 * nothing to report.
 *
 * Separate from `intentFromEvent` on purpose. An entitlement intent answers "what should the
 * database now believe", and every field on it is nullable so a partial event cannot destroy
 * a fact. A conversion signal answers a different question — "did money change hands, and
 * what do we know about the click that produced it" — and it is allowed to be strict, because
 * an event we are unsure about should simply not be reported.
 *
 * WHY payment_status MUST BE EXACTLY 'paid'
 *
 * `no_payment_required` is what Stripe returns for a 100%-off promotion code, and
 * `allow_promotion_codes` is on for this checkout. Those sessions complete with
 * `amount_total: 0`. Reporting them as Purchases would feed £0 conversions into Meta's
 * optimisation, dragging the modelled order value down and teaching the algorithm to find
 * more people who pay nothing. An unpaid session is not a purchase.
 *
 * It returns no personal data. The email is looked up separately, from the verified auth
 * identity of the user the consent check was run against — see AdvertisingConsent in
 * ./meta-capi.ts for why the address typed into Stripe Checkout is not used.
 */
export function purchaseSignal(event: Stripe.Event, config: IntentConfig): PurchaseSignal | null {
  if (event.type !== 'checkout.session.completed') return null;

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.mode !== 'subscription') return null;
  if (!belongsToThisBrand(session.metadata, null, config)) return null;
  if (session.payment_status !== 'paid') return null;
  if (!session.id) return null;

  const metadata = session.metadata ?? {};
  const read = (key: string): string | null => {
    const value = metadata[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };

  return {
    checkoutSessionId: session.id,
    supabaseUserId: readUserId(session.metadata),
    // Stripe's event.created is already unix seconds, which is the unit Meta wants.
    eventTimeUnix: event.created,
    amountTotalMinor: typeof session.amount_total === 'number' ? session.amount_total : null,
    currency: session.currency ?? null,
    fbclid: read('fbclid'),
    firstSeenAt: read('first_seen_at'),
    fbp: read('fbp'),
    fbc: read('fbc')
  };
}

/** customer.subscription.created | updated | deleted — the authority on plan and status. */
function fromSubscription(event: Stripe.Event, config: IntentConfig): EntitlementIntent | null {
  const subscription = event.data.object as Stripe.Subscription;
  if (!subscription?.id) return null;

  const priceId = subscriptionPriceId(subscription);
  // Another Orchestrate product on the same Stripe account. Ignored, not errored.
  if (!belongsToThisBrand(subscription.metadata, priceId, config)) return null;

  const deleted = event.type === 'customer.subscription.deleted';
  const intent = baseIntent(event, config, config.brand);

  intent.userId = readUserId(subscription.metadata);
  intent.customerId = idOf(subscription.customer);
  intent.subscriptionId = subscription.id;
  intent.priceId = priceId;

  // `deleted` is terminal by definition. Trusting the event type over the payload's status
  // means a replayed or oddly-shaped delete still ends the entitlement.
  intent.planStatus = deleted ? 'canceled' : subscription.status ?? null;
  intent.plan = deleted ?
  FREE_PLAN :
  planForStatus(
    intent.planStatus,
    readPlan(subscription.metadata, planForPrice(intent.priceId, config.prices))
  );

  intent.currentPeriodEnd = subscriptionPeriodEnd(subscription);
  intent.cancelAtPeriodEnd = deleted ? false : Boolean(subscription.cancel_at_period_end);
  intent.trialEnd = subscriptionTrialEnd(subscription);

  intent.billing = {
    interval: subscriptionInterval(subscription),
    cancel_at: toIso(subscription.cancel_at),
    canceled_at: toIso(subscription.canceled_at),
    subscription_status: intent.planStatus
  };

  return intent;
}

/**
 * invoice.payment_failed — annotate, never grant.
 *
 * `plan` is null unconditionally: an invoice event has no business promoting anybody, and
 * stating that here rather than relying on the caller means it stays true.
 *
 * The status is only moved to past_due for a RENEWAL failure. A failed FIRST charge means
 * the person never subscribed; marking them past_due would misreport them forever as a
 * customer who lapsed. Stripe emits customer.subscription.updated for the real status
 * change anyway — this is the annotation that makes the account screen able to say why.
 */
function fromFailedInvoice(event: Stripe.Event, config: IntentConfig): EntitlementIntent | null {
  const invoice = event.data.object as Stripe.Invoice;
  const subscriptionId = invoiceSubscriptionId(invoice);
  // No subscription on the invoice means it is not about an entitlement at all.
  if (!subscriptionId) return null;

  // Stripe snapshots the subscription's metadata onto the invoice at finalisation, so an
  // invoice for another Orchestrate product can be recognised and ignored here. When that
  // snapshot is absent (invoices created before June 2023, or a subscription made by hand)
  // the event still passes, and the subscription-identity guard in the database is what
  // stops it touching a membership whose subscription it is not about.
  if (namesAnotherBrand(invoiceSubscriptionMetadata(invoice), config)) return null;

  const intent = baseIntent(event, config, config.brand);
  intent.subscriptionId = subscriptionId;
  intent.customerId = idOf(invoice.customer);
  intent.email = invoice.customer_email ?? null;

  if (isRenewalFailure(invoice)) {
    intent.planStatus = 'past_due';
  }

  intent.billing = {
    last_payment_failed_at: intent.eventAt,
    last_failed_invoice_id: invoice.id ?? null,
    last_failed_invoice_reason: invoice.billing_reason ?? null,
    last_failed_invoice_url: invoice.hosted_invoice_url ?? null
  };

  return intent;
}
