// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { HANDLED_EVENT_TYPES, intentFromEvent, readUserId, type IntentConfig } from './stripe-events';
import { buildPriceMap } from './entitlements';
import {
  CUSTOMER_ID,
  PERIOD_END_ISO,
  PRICE_ANNUAL,
  PRICE_MONTHLY,
  SUBSCRIPTION_ID,
  USER_ID,
  checkoutSessionCompleted,
  invoicePaymentFailed,
  subscriptionEvent } from
'../test/stripe-fixtures';

const config: IntentConfig = {
  brand: 'batchlabel',
  prices: buildPriceMap({
    STRIPE_PRICE_MAKER_MONTHLY: PRICE_MONTHLY,
    STRIPE_PRICE_MAKER_ANNUAL: PRICE_ANNUAL
  })
};

describe('readUserId', () => {
  it('reads a well-formed uuid out of metadata', () => {
    expect(readUserId({ supabase_user_id: USER_ID })).toBe(USER_ID);
    expect(readUserId({ supabase_user_id: ` ${USER_ID} ` })).toBe(USER_ID);
  });

  /**
   * A non-uuid would blow up the RPC's uuid cast, turning one bad subscription into a
   * webhook that 500s on every retry for three days and then gets disabled.
   */
  it('refuses anything that is not a uuid rather than passing it to Postgres', () => {
    expect(readUserId({ supabase_user_id: 'not-a-uuid' })).toBeNull();
    expect(readUserId({ supabase_user_id: "'; drop table brand_memberships; --" })).toBeNull();
    expect(readUserId({})).toBeNull();
    expect(readUserId(null)).toBeNull();
  });
});

describe('checkout.session.completed', () => {
  it('links the Stripe customer, which is the only thing the billing portal can use', () => {
    const intent = intentFromEvent(checkoutSessionCompleted(), config);
    expect(intent?.customerId).toBe(CUSTOMER_ID);
    expect(intent?.subscriptionId).toBe(SUBSCRIPTION_ID);
    expect(intent?.userId).toBe(USER_ID);
    expect(intent?.brand).toBe('batchlabel');
  });

  it('grants the plan when the payment actually succeeded', () => {
    const intent = intentFromEvent(checkoutSessionCompleted({ paymentStatus: 'paid' }), config);
    expect(intent?.plan).toBe('maker');
    expect(intent?.planStatus).toBe('active');
  });

  it('grants nothing while the payment is still unpaid', () => {
    const intent = intentFromEvent(checkoutSessionCompleted({ paymentStatus: 'unpaid' }), config);
    expect(intent?.plan).toBeNull();
    expect(intent?.planStatus).toBeNull();
    // ...but still records the link, so the portal works and later events can attach.
    expect(intent?.customerId).toBe(CUSTOMER_ID);
  });

  it('says nothing about the billing period, so it cannot blank one already stored', () => {
    const intent = intentFromEvent(checkoutSessionCompleted(), config);
    expect(intent?.currentPeriodEnd).toBeNull();
    expect(intent?.cancelAtPeriodEnd).toBeNull();
    expect(intent?.trialEnd).toBeNull();
  });

  it('keeps the email so an anonymous checkout can still be attributed', () => {
    const intent = intentFromEvent(checkoutSessionCompleted({ userId: null }), config);
    expect(intent?.userId).toBeNull();
    expect(intent?.email).toBe('maker@example.com');
  });

  it('ignores a one-off payment session entirely', () => {
    expect(intentFromEvent(checkoutSessionCompleted({ mode: 'payment' }), config)).toBeNull();
  });
});

describe('customer.subscription.created / updated', () => {
  it('maps an active subscription to the paid plan with its period end', () => {
    const intent = intentFromEvent(subscriptionEvent({ status: 'active' }), config);
    expect(intent?.plan).toBe('maker');
    expect(intent?.planStatus).toBe('active');
    expect(intent?.currentPeriodEnd).toBe(PERIOD_END_ISO);
    expect(intent?.priceId).toBe(PRICE_MONTHLY);
    expect(intent?.billing).toMatchObject({ interval: 'month' });
  });

  it('keeps a past_due customer on the plan (Stripe is still retrying their card)', () => {
    const intent = intentFromEvent(subscriptionEvent({ status: 'past_due' }), config);
    expect(intent?.plan).toBe('maker');
    expect(intent?.planStatus).toBe('past_due');
  });

  it('does not grant the plan for an incomplete subscription', () => {
    const intent = intentFromEvent(subscriptionEvent({ status: 'incomplete' }), config);
    expect(intent?.plan).toBe('free');
    expect(intent?.planStatus).toBe('incomplete');
  });

  /** Cancel-at-period-end is still a paying customer until the date. */
  it('keeps access while cancel_at_period_end is set and the status is active', () => {
    const intent = intentFromEvent(subscriptionEvent({ status: 'active', cancelAtPeriodEnd: true }), config);
    expect(intent?.plan).toBe('maker');
    expect(intent?.cancelAtPeriodEnd).toBe(true);
    expect(intent?.currentPeriodEnd).toBe(PERIOD_END_ISO);
  });

  it('records the annual interval when the annual price is used', () => {
    const intent = intentFromEvent(subscriptionEvent({ priceId: PRICE_ANNUAL }), config);
    expect(intent?.priceId).toBe(PRICE_ANNUAL);
    expect(intent?.billing).toMatchObject({ interval: 'year' });
  });

  it('prefers the brand recorded in the subscription metadata over the deployment default', () => {
    const event = subscriptionEvent();
    (event.data.object as {metadata: Record<string, string>;}).metadata.brand = 'another-brand';
    expect(intentFromEvent(event, config)?.brand).toBe('another-brand');
  });

  /**
   * Orchestrate runs one Stripe account across sub-brands, and planForPrice falls back to
   * the Maker plan for an unrecognised price. Reading the plan we wrote at checkout first
   * means that fallback is only reached for a subscription created outside this codebase.
   */
  it('prefers the plan recorded at checkout over the unknown-price fallback', () => {
    const event = subscriptionEvent({ priceId: 'price_for_a_different_product' });
    (event.data.object as {metadata: Record<string, string>;}).metadata.plan = 'maker';
    expect(intentFromEvent(event, config)?.plan).toBe('maker');
  });

  it('ignores a plan that is not one we sell', () => {
    const event = subscriptionEvent();
    (event.data.object as {metadata: Record<string, string>;}).metadata.plan = 'enterprise_unlimited';
    // Falls back to the price map / Maker, never to the invented tier.
    expect(intentFromEvent(event, config)?.plan).toBe('maker');
  });
});

describe('customer.subscription.deleted', () => {
  it('ends the entitlement whatever the payload status says', () => {
    const intent = intentFromEvent(
      subscriptionEvent({ type: 'customer.subscription.deleted', status: 'active' }),
      config
    );
    expect(intent?.planStatus).toBe('canceled');
    expect(intent?.plan).toBe('free');
    expect(intent?.cancelAtPeriodEnd).toBe(false);
  });
});

describe('invoice.payment_failed', () => {
  /** The security property: an invoice event must never be able to promote anybody. */
  it('never carries a plan, under any billing reason', () => {
    for (const billingReason of ['subscription_cycle', 'subscription_create', 'manual', null]) {
      const intent = intentFromEvent(invoicePaymentFailed({ billingReason }), config);
      expect(intent?.plan).toBeNull();
    }
  });

  it('marks a failed RENEWAL past_due', () => {
    const intent = intentFromEvent(invoicePaymentFailed({ billingReason: 'subscription_cycle' }), config);
    expect(intent?.planStatus).toBe('past_due');
    expect(intent?.subscriptionId).toBe(SUBSCRIPTION_ID);
  });

  it('leaves the status alone when the FIRST charge fails (they never subscribed)', () => {
    const intent = intentFromEvent(invoicePaymentFailed({ billingReason: 'subscription_create' }), config);
    expect(intent?.planStatus).toBeNull();
  });

  it('records the failure for the account screen either way', () => {
    const intent = intentFromEvent(invoicePaymentFailed({ billingReason: 'subscription_create' }), config);
    expect(intent?.billing).toMatchObject({
      last_failed_invoice_id: 'in_test_1',
      last_failed_invoice_reason: 'subscription_create'
    });
  });

  it('reads the legacy top-level invoice.subscription shape too', () => {
    const intent = intentFromEvent(invoicePaymentFailed({ modernShape: false }), config);
    expect(intent?.subscriptionId).toBe(SUBSCRIPTION_ID);
  });

  it('ignores an invoice with no subscription at all', () => {
    expect(intentFromEvent(invoicePaymentFailed({ subscriptionId: null }), config)).toBeNull();
  });
});

describe('event coverage', () => {
  it('handles every type the setup guide tells the founder to subscribe to', () => {
    expect(HANDLED_EVENT_TYPES).toEqual([
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_failed']
    );
  });

  it('ignores an event type we do not act on', () => {
    const event = subscriptionEvent();
    (event as {type: string;}).type = 'customer.created';
    expect(intentFromEvent(event, config)).toBeNull();
  });

  it('stamps every intent with the Stripe event id and event.created', () => {
    const intent = intentFromEvent(subscriptionEvent({ id: 'evt_abc', created: 1700000000 }), config);
    expect(intent?.eventId).toBe('evt_abc');
    expect(intent?.eventAt).toBe('2023-11-14T22:13:20.000Z');
  });
});
