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
import type { PurchaseSignal } from './meta-capi.js';
import {
  idOf,
  invoiceSubscriptionId,
  invoiceSubscriptionMetadata,
  isRenewalFailure,
  planForStatus,
  readSubscriptionPriceId,
  subscriptionInterval,
  subscriptionPeriodEnd,
  subscriptionPriceIds,
  subscriptionTrialEnd,
  toIso } from
'./entitlements.js';
import {
  FREE_PLAN,
  allowanceForPlan,
  isEntitlingPlan,
  isPlanSlug,
  planEntryForPrice,
  type PlanSlug,
  type PriceIndex,
  type ResolvedPrice } from
'./plan-contract.js';

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
  /** A contract slug or null. Null means "this event says nothing about the tier", which the
   *  entitlement RPC treats as leave-alone — never as a downgrade to free. */
  plan: PlanSlug | null;
  planStatus: string | null;
  priceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  trialEnd: string | null;
  /**
   * HOW MUCH, as opposed to WHETHER. Resolved from `plan` through the contract and from
   * nothing else — never from Stripe metadata, never from the price id, never from a default.
   *
   * Null carries the same meaning every other field's null carries: this event says nothing
   * about the allowance, so apply_stripe_entitlement leaves the column alone. It is null
   * exactly when `plan` is null, which is the invariant enforced in intentFromEvent below.
   */
  skuLimit: number | null;
  editorSeatLimit: number | null;
  /** Merged into brand_memberships.data->'billing'. Brand-specific extras live here. */
  billing: Record<string, unknown>;
}

export interface IntentConfig {
  /** The brand this deployment sells for. A server constant, never a request parameter. */
  brand: string;
  /** price id -> { slug, interval }, from the plan contract. The same index the checkout
   *  endpoint resolves against, so what was sold and what is granted cannot disagree. */
  priceIndex: PriceIndex;
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
 *
 * The price clause takes EVERY item, not the first. Stripe does not guarantee item order, so
 * a first-item test makes the answer depend on something we do not control — and with the
 * full price index it now recognises every Batchlabel price rather than only the two Maker
 * ones, which makes the fallback materially stronger for a hand-made subscription.
 */
export function belongsToThisBrand(
metadata: Stripe.Metadata | null | undefined,
priceIds: readonly (string | null)[],
config: IntentConfig)
: boolean {
  const brand = typeof metadata?.brand === 'string' ? metadata.brand.trim() : '';
  if (brand) return brand === config.brand;
  return priceIds.some((id) => Boolean(id && config.priceIndex.has(id)));
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
 * The tier a subscription grants — or null when nothing on the event says.
 *
 * THE PRICE WINS. The price id is the thing Stripe actually charges against; the metadata is
 * a copy we wrote once at checkout and never update. This inverts the order that used to be
 * here, and the reason is the Customer Portal: tier switching is done natively there via
 * `default_allowed_updates: ['price']`, and A PORTAL PRICE CHANGE DOES NOT REWRITE
 * SUBSCRIPTION METADATA. After a Maker upgrades to Studio the metadata still reads `maker`.
 * Reading metadata first pins every self-serve upgrade at the tier originally bought, and
 * keeps granting the higher tier after every downgrade.
 *
 * Metadata is consulted ONLY when the price does not resolve — a subscription created by
 * hand in the dashboard against a price this deploy has no env var for. It is allow-listed
 * against the entitling plans, so it can only ever name a tier we sell, and never
 * `rail_test` or `free`.
 *
 * A disagreement is LOGGED AND IGNORED, not arbitrated. "Take the lower tier on
 * disagreement" was considered and rejected: every upgrade disagrees in exactly that
 * direction, so it is the metadata-first bug wearing a different hat.
 */
export function resolvePlan(
resolved: ResolvedPrice | null,
metadata: Stripe.Metadata | null | undefined)
: PlanSlug | null {
  const claimed = typeof metadata?.plan === 'string' ? metadata.plan.trim() : '';
  const fromMetadata = isEntitlingPlan(claimed) ? claimed : null;

  if (resolved) {
    if (fromMetadata && fromMetadata !== resolved.entry.slug) {
      console.warn(
        `[stripe-events] price ${resolved.priceId} resolves to ${resolved.entry.slug} but metadata ` +
        `claims ${fromMetadata}. Using the price. This is expected after a Customer Portal tier change.`
      );
    }
    return resolved.entry.slug;
  }
  return fromMetadata;
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
    skuLimit: null,
    editorSeatLimit: null,
    billing: {}
  };
}

/**
 * THE ALLOWANCE THAT TRAVELS WITH A PLAN.
 *
 * Null rather than allowanceForPlan()'s Free fallback when the plan is null, and the
 * difference is the direction of travel. allowanceForPlan is a READ path: it is handed a slug
 * that already passed the database's CHECK constraint, so an unrecognised one means an old
 * deploy reading a new row, where granting least is right. This is the WRITE path, where
 * "we do not know" must leave the stored allowance alone — falling back to Free here would
 * let one late invoice event cut a paying Consultant down to three SKUs.
 */
function allowanceForIntent(plan: PlanSlug | null): Pick<EntitlementIntent, 'skuLimit' | 'editorSeatLimit'> {
  if (!isPlanSlug(plan)) return { skuLimit: null, editorSeatLimit: null };
  const { skuLimit, editorSeatLimit } = allowanceForPlan(plan);
  return { skuLimit, editorSeatLimit };
}

/**
 * Returns the entitlement change an event implies, or null when the event is none of our
 * business. Never throws: a malformed payload yields null rather than a 500 that makes
 * Stripe retry a poisoned event for three days.
 *
 * THE ALLOWANCE IS RESOLVED HERE AND IN NO OTHER PLACE, deliberately mirroring the single
 * enforcement point in apply_stripe_entitlement (20260802120000_plan_limits.sql §6). Each
 * builder below decides the TIER, under its own rules; this decides how much that tier
 * allows, once, after every branch that could have declined to name one. Resolving it inside
 * the builders would put the rule in three places and would eventually leave one branch
 * writing an allowance for a plan it had just refused to write.
 */
export function intentFromEvent(
event: Stripe.Event,
config: IntentConfig)
: EntitlementIntent | null {
  const intent = interpretEvent(event, config);
  if (!intent) return null;
  return { ...intent, ...allowanceForIntent(intent.plan) };
}

function interpretEvent(event: Stripe.Event, config: IntentConfig): EntitlementIntent | null {
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
  if (!belongsToThisBrand(session.metadata, [], config)) return null;

  const intent = baseIntent(event, config, config.brand);
  intent.userId = readUserId(session.metadata);
  intent.customerId = idOf(session.customer);
  intent.subscriptionId = idOf(session.subscription);
  intent.email = session.customer_details?.email ?? session.customer_email ?? null;

  const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  if (paid) {
    // A session carries no line items on the webhook payload, so the price cannot be
    // re-derived here — metadata is the only signal, which is exactly why the checkout
    // writes `plan` onto it. And it is TRUSTWORTHY here in a way it is not on a subscription
    // event: a session is immutable and the Customer Portal never touches one, so its
    // metadata cannot go stale relative to a fact that moved. That asymmetry with
    // resolvePlan above is deliberate; say it out loud in review rather than harmonising it.
    const claimed = typeof session.metadata?.plan === 'string' ? session.metadata.plan.trim() : '';
    if (isEntitlingPlan(claimed)) {
      intent.plan = claimed;
    }
    // `rail_test` lands here by construction, because it is not an entitling plan. A penny
    // checkout therefore never writes a tier on this path: it records the link and the
    // active status, and the subscription event resolves rail_test through its own index
    // entry — which grants exactly the Free allowance. No special case needed.
    intent.planStatus = 'active';
  }

  intent.billing = {
    checkout_session_id: session.id,
    checkout_completed_at: intent.eventAt,
    // What the customer was actually charged, VAT included — the right number for a support
    // conversation. amount_subtotal is the ex-VAT figure beside it, so the two can never be
    // confused by whoever reads the row next. Prices are stored exclusive of VAT, so these
    // differ by the customer's country.
    amount_total: session.amount_total ?? null,
    amount_subtotal: session.amount_subtotal ?? null,
    currency: session.currency ?? null
  };

  // Only populated when the caller expanded `subscription`; harmless when it is a string.
  if (session.subscription && typeof session.subscription !== 'string') {
    intent.currentPeriodEnd = subscriptionPeriodEnd(session.subscription);
    intent.priceId = readSubscriptionPriceId(session.subscription).priceId;
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
  if (!belongsToThisBrand(session.metadata, [], config)) return null;
  if (session.payment_status !== 'paid') return null;
  if (!session.id) return null;

  const metadata = session.metadata ?? {};
  const read = (key: string): string | null => {
    const value = metadata[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  };

  const claimedPlan = read('plan');

  return {
    checkoutSessionId: session.id,
    supabaseUserId: readUserId(session.metadata),
    // Stripe's event.created is already unix seconds, which is the unit Meta wants.
    eventTimeUnix: event.created,
    // EX-TAX, and this is the one that matters. Prices are stored exclusive of VAT, so
    // `amount_total` includes whatever VAT Stripe added for that customer's country: the
    // same tier is £16.80 in the UK and £14.00 on an export sale. Reporting that as the ad
    // conversion value would make one product worth different amounts by geography, which
    // corrupts ROAS. The tax is carried separately so net is recoverable without a second
    // definition of "value".
    amountSubtotalMinor: typeof session.amount_subtotal === 'number' ? session.amount_subtotal : null,
    taxMinor: session.total_details?.amount_tax ?? null,
    // The tier, for content_ids. The slug is what makes a rail-test purchase filterable out
    // of ROAS reporting instead of being counted as a real sale of whatever we hardcoded.
    plan: isPlanSlug(claimedPlan) ? claimedPlan : null,
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

  const { priceId, refusal } = readSubscriptionPriceId(subscription);
  // Another Orchestrate product on the same Stripe account. Ignored, not errored. Every
  // item's price is offered, so the answer does not depend on Stripe's item ordering.
  if (!belongsToThisBrand(subscription.metadata, subscriptionPriceIds(subscription), config)) return null;

  const deleted = event.type === 'customer.subscription.deleted';
  const intent = baseIntent(event, config, config.brand);

  intent.userId = readUserId(subscription.metadata);
  intent.customerId = idOf(subscription.customer);
  intent.subscriptionId = subscription.id;
  intent.priceId = priceId;

  // `deleted` is terminal by definition. Trusting the event type over the payload's status
  // means a replayed or oddly-shaped delete still ends the entitlement.
  intent.planStatus = deleted ? 'canceled' : subscription.status ?? null;

  const resolved = deleted ? null : planEntryForPrice(priceId, config.priceIndex);

  if (deleted) {
    intent.plan = FREE_PLAN;
  } else {
    const slug = resolvePlan(resolved, subscription.metadata);
    if (slug) {
      intent.plan = planForStatus(intent.planStatus, slug);
    } else {
      // NEITHER the price nor the metadata says what this is. That is not "grant Maker" and
      // it is not "grant Free" — it is "this event says nothing about the tier". `plan` stays
      // null, which the entitlement RPC treats as leave-alone, so the period end, the status
      // and the cancel flag on this event still land while the tier stays whatever a previous
      // event established. Recovery is a config deploy adding the price id, or a hand-granted
      // plan, which is already a supported state.
      //
      // Safe because `active` and the allowance are orthogonal and the database requires BOTH
      // an entitling plan and an entitling status: a subscription we cannot resolve whose
      // status goes canceled ends up inactive without the tier ever being guessed.
      intent.plan = null;
      intent.billing.unrecognised_price_id = priceId;
      intent.billing.unrecognised_price_reason = refusal;
      console.error(
        `[stripe-events] subscription ${subscription.id}: ` +
        (refusal ?
        `refused to read a price id (${refusal})` :
        `price ${priceId ?? 'null'} is not in the price index`) +
        ' and metadata names no entitling plan. Tier left unchanged.'
      );
    }
  }

  intent.currentPeriodEnd = subscriptionPeriodEnd(subscription);
  intent.cancelAtPeriodEnd = deleted ? false : Boolean(subscription.cancel_at_period_end);
  intent.trialEnd = subscriptionTrialEnd(subscription);

  intent.billing = {
    ...intent.billing,
    // OUR vocabulary, from the resolved price entry — the same value the checkout wrote into
    // Stripe metadata, so the account row and the metadata cannot disagree.
    interval: resolved?.interval ?? null,
    // STRIPE's vocabulary, kept as a cross-check. Disagreement means the price index is
    // wrong about an interval, which is a config bug worth being able to see.
    stripe_interval: subscriptionInterval(subscription),
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
