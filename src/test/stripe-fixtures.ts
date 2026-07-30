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
} = {}): Stripe.Event {
  const metadata: Record<string, string> = {
    brand: options.brand ?? 'batchlabel',
    plan: 'maker',
    billing_interval: 'monthly'
  };
  if (options.userId !== null) metadata.supabase_user_id = options.userId ?? USER_ID;

  return envelope(options.id ?? 'evt_checkout_1', 'checkout.session.completed', options.created ?? 1000, {
    id: 'cs_test_1',
    object: 'checkout.session',
    mode: options.mode ?? 'subscription',
    customer: CUSTOMER_ID,
    subscription: SUBSCRIPTION_ID,
    payment_status: options.paymentStatus ?? 'paid',
    amount_total: 1400,
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
} = {}): Stripe.Event {
  const metadata: Record<string, string> = { brand: 'batchlabel', plan: 'maker' };
  if (options.userId !== null) metadata.supabase_user_id = options.userId ?? USER_ID;

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
        {
          id: 'si_test_1',
          object: 'subscription_item',
          // Where Stripe actually puts it now. See src/server/entitlements.ts.
          current_period_end: options.periodEnd ?? PERIOD_END,
          current_period_start: 1000,
          price: {
            id: options.priceId ?? PRICE_MONTHLY,
            object: 'price',
            recurring: { interval: options.priceId === PRICE_ANNUAL ? 'year' : 'month' }
          }
        }]

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
} = {}): Stripe.Event {
  const subscriptionId = options.subscriptionId === null ? null : options.subscriptionId ?? SUBSCRIPTION_ID;
  const modern = options.modernShape !== false;

  return envelope(options.id ?? 'evt_invoice_1', 'invoice.payment_failed', options.created ?? 3000, {
    id: 'in_test_1',
    object: 'invoice',
    customer: CUSTOMER_ID,
    customer_email: 'maker@example.com',
    billing_reason: options.billingReason === undefined ? 'subscription_cycle' : options.billingReason,
    hosted_invoice_url: 'https://invoice.stripe.com/i/test',
    ...(subscriptionId ?
    modern ?
    { parent: { type: 'subscription_details', subscription_details: { subscription: subscriptionId } } } :
    { subscription: subscriptionId } :
    { parent: null })
  });
}
