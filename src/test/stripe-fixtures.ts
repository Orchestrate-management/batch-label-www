/**
 * Stripe event fixtures for the tests.
 *
 * Shaped like the real thing rather than like the code that reads it — in particular the
 * subscription fixtures put the billing period on the ITEM, which is where Stripe actually
 * puts it from API version 2025-03-31.basil onwards. A fixture that used the old top-level
 * field would let the mapping bug this codebase is guarding against pass every test.
 *
 * Kept beside the other test support (src/test/setup.ts) so the mapping tests and the
 * webhook tests build events the same way; a per-file copy would drift.
 */

import type Stripe from 'stripe';

export const USER_ID = '11111111-1111-4111-8111-111111111111';
export const CUSTOMER_ID = 'cus_test_1';
export const SUBSCRIPTION_ID = 'sub_test_1';
export const PRICE_MONTHLY = 'price_maker_monthly';
export const PRICE_ANNUAL = 'price_maker_annual';
export const PRICE_STUDIO_MONTHLY = 'price_studio_monthly';
export const PRICE_CONSULTANT_ANNUAL = 'price_consultant_annual';
export const PRICE_RAIL_TEST = 'price_rail_test_monthly';

/** The env a fully configured deployment sets, for buildPriceIndex in the tests. */
export const PRICE_ENV: Record<string, string> = {
  STRIPE_PRICE_MAKER_MONTHLY: PRICE_MONTHLY,
  STRIPE_PRICE_MAKER_ANNUAL: PRICE_ANNUAL,
  STRIPE_PRICE_STUDIO_MONTHLY: PRICE_STUDIO_MONTHLY,
  STRIPE_PRICE_CONSULTANT_ANNUAL: PRICE_CONSULTANT_ANNUAL,
  STRIPE_PRICE_RAIL_TEST_MONTHLY: PRICE_RAIL_TEST
};

/** 2030-01-01T00:00:00Z, comfortably in the future so "is it active" is not clock-dependent. */
export const PERIOD_END = 1893456000;
export const PERIOD_END_ISO = '2030-01-01T00:00:00.000Z';

function envelope(id: string, type: string, created: number, object: unknown): Stripe.Event {
  return {
    id,
    object: 'event',
    api_version: '2026-07-29.dahlia',
    created,
    livemode: false,
    pending_webhooks: 0,
    request: null,
    type,
    data: { object }
  } as unknown as Stripe.Event;
}

export function checkoutSessionCompleted(options: {
  id?: string;
  created?: number;
  userId?: string | null;
  brand?: string;
  paymentStatus?: string;
  mode?: string;
  email?: string | null;
  /** The tier the session was created for. `null` writes no plan key at all. */
  plan?: string | null;
  /** Extra metadata keys — the marketing half our own checkout writes (fbclid, fbp, ...). */
  metadata?: Record<string, string>;
} = {}): Stripe.Event {
  const metadata: Record<string, string> = {
    brand: options.brand ?? 'batchlabel',
    billing_interval: 'monthly',
    ...options.metadata
  };
  if (options.plan !== null) metadata.plan = options.plan ?? 'maker';
  if (options.userId !== null) metadata.supabase_user_id = options.userId ?? USER_ID;

  return envelope(options.id ?? 'evt_checkout_1', 'checkout.session.completed', options.created ?? 1000, {
    id: 'cs_test_1',
    object: 'checkout.session',
    mode: options.mode ?? 'subscription',
    customer: CUSTOMER_ID,
    subscription: SUBSCRIPTION_ID,
    payment_status: options.paymentStatus ?? 'paid',
    // Prices are stored EXCLUSIVE of VAT, so the total carries the VAT Stripe added for the
    // customer's country and the subtotal is the number the tier actually costs. A UK Maker
    // monthly is 1400 + 280.
    amount_total: 1680,
    amount_subtotal: 1400,
    total_details: { amount_tax: 280 },
    currency: 'gbp',
    customer_details: { email: options.email === null ? null : options.email ?? 'maker@example.com' },
    metadata
  });
}

export function subscriptionEvent(options: {
  id?: string;
  type?: 'customer.subscription.created' | 'customer.subscription.updated' | 'customer.subscription.deleted';
  created?: number;
  status?: string;
  subscriptionId?: string;
  userId?: string | null;
  priceId?: string;
  cancelAtPeriodEnd?: boolean;
  periodEnd?: number;
  trialEnd?: number | null;
  /** Always 1 for a subscription we created. Set it to see the refusal path. */
  quantity?: number;
  /** A second item, which our own checkout never produces. */
  extraPriceId?: string;
  plan?: string | null;
} = {}): Stripe.Event {
  const metadata: Record<string, string> = { brand: 'batchlabel' };
  if (options.plan !== null) metadata.plan = options.plan ?? 'maker';
  if (options.userId !== null) metadata.supabase_user_id = options.userId ?? USER_ID;

  const item = (priceId: string, id: string) => ({
    id,
    object: 'subscription_item',
    // Where Stripe actually puts it now. See src/server/entitlements.ts.
    current_period_end: options.periodEnd ?? PERIOD_END,
    current_period_start: 1000,
    quantity: options.quantity ?? 1,
    price: {
      id: priceId,
      object: 'price',
      recurring: { interval: priceId === PRICE_ANNUAL || priceId === PRICE_CONSULTANT_ANNUAL ? 'year' : 'month' }
    }
  });

  return envelope(
    options.id ?? 'evt_sub_1',
    options.type ?? 'customer.subscription.updated',
    options.created ?? 2000,
    {
      id: options.subscriptionId ?? SUBSCRIPTION_ID,
      object: 'subscription',
      customer: CUSTOMER_ID,
      status: options.status ?? 'active',
      cancel_at_period_end: options.cancelAtPeriodEnd ?? false,
      cancel_at: null,
      canceled_at: null,
      trial_end: options.trialEnd ?? null,
      metadata,
      items: {
        object: 'list',
        data: [
        item(options.priceId ?? PRICE_MONTHLY, 'si_test_1'),
        ...(options.extraPriceId ? [item(options.extraPriceId, 'si_test_2')] : [])]

      }
    }
  );
}

export function invoicePaymentFailed(options: {
  id?: string;
  created?: number;
  billingReason?: string | null;
  subscriptionId?: string | null;
  modernShape?: boolean;
  /**
   * The subscription-metadata snapshot Stripe copies onto an invoice at finalisation.
   * Absent by default, because it is absent on invoices finalised before June 2023 and on
   * subscriptions that carry no metadata — the case the code has to tolerate.
   */
  brand?: string;
} = {}): Stripe.Event {
  const subscriptionId = options.subscriptionId === null ? null : options.subscriptionId ?? SUBSCRIPTION_ID;
  const modern = options.modernShape !== false;
  const details: Record<string, unknown> = { subscription: subscriptionId };
  if (options.brand) details.metadata = { brand: options.brand };

  return envelope(options.id ?? 'evt_invoice_1', 'invoice.payment_failed', options.created ?? 3000, {
    id: 'in_test_1',
    object: 'invoice',
    customer: CUSTOMER_ID,
    customer_email: 'maker@example.com',
    billing_reason: options.billingReason === undefined ? 'subscription_cycle' : options.billingReason,
    hosted_invoice_url: 'https://invoice.stripe.com/i/test',
    ...(subscriptionId ?
    modern ?
    { parent: { type: 'subscription_details', subscription_details: details } } :
    { subscription: subscriptionId } :
    { parent: null })
  });
}
