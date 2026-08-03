// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { HANDLED_EVENT_TYPES, intentFromEvent, purchaseSignal, readUserId, type IntentConfig } from './stripe-events';
import { buildPriceIndex } from './plan-contract';
import {
  CUSTOMER_ID,
  PERIOD_END_ISO,
  PRICE_ANNUAL,
  PRICE_CONSULTANT_ANNUAL,
  PRICE_ENV,
  PRICE_MONTHLY,
  PRICE_RAIL_TEST,
  PRICE_STUDIO_MONTHLY,
  SUBSCRIPTION_ID,
  USER_ID,
  checkoutSessionCompleted,
  invoicePaymentFailed,
  subscriptionEvent } from
'../test/stripe-fixtures';

const config: IntentConfig = {
  brand: 'batchlabel',
  priceIndex: buildPriceIndex(PRICE_ENV)
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

  it('grants the plan the session was created for, not a hardcoded one', () => {
    const intent = intentFromEvent(checkoutSessionCompleted({ paymentStatus: 'paid' }), config);
    expect(intent?.plan).toBe('maker');
    expect(intent?.planStatus).toBe('active');

    const studio = intentFromEvent(checkoutSessionCompleted({ plan: 'studio' }), config);
    expect(studio?.plan).toBe('studio');
  });

  /**
   * This path used to write MAKER for every completed subscription checkout, so a Consultant
   * buyer was granted Maker and only corrected when the subscription event happened to land
   * afterwards — which Stripe frequently emits out of order.
   */
  it('grants the top tier to somebody who bought the top tier', () => {
    expect(intentFromEvent(checkoutSessionCompleted({ plan: 'consultant' }), config)?.plan).toBe('consultant');
  });

  it('records the ex-VAT subtotal beside the VAT-inclusive total', () => {
    const intent = intentFromEvent(checkoutSessionCompleted(), config);
    expect(intent?.billing).toMatchObject({ amount_total: 1680, amount_subtotal: 1400 });
  });

  /** rail_test is not an entitling plan, so it falls into the else branch by construction —
   *  no special case, and a penny checkout never writes a tier here. */
  it('writes no tier for a rail-test session, only the active status', () => {
    const intent = intentFromEvent(checkoutSessionCompleted({ plan: 'rail_test' }), config);
    expect(intent?.plan).toBeNull();
    expect(intent?.planStatus).toBe('active');
  });

  it('writes no tier when the session names a plan we do not sell, or names none', () => {
    expect(intentFromEvent(checkoutSessionCompleted({ plan: 'enterprise' }), config)?.plan).toBeNull();
    expect(intentFromEvent(checkoutSessionCompleted({ plan: 'free' }), config)?.plan).toBeNull();
    expect(intentFromEvent(checkoutSessionCompleted({ plan: null }), config)?.plan).toBeNull();
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
    // OUR vocabulary from the resolved entry, STRIPE's kept beside it as a cross-check.
    expect(intent?.billing).toMatchObject({ interval: 'monthly', stripe_interval: 'month' });
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
    expect(intent?.billing).toMatchObject({ interval: 'annual', stripe_interval: 'year' });
  });

  it('grants each tier its own price sells', () => {
    expect(intentFromEvent(subscriptionEvent({ priceId: PRICE_STUDIO_MONTHLY }), config)?.plan).toBe('studio');
    expect(intentFromEvent(subscriptionEvent({ priceId: PRICE_CONSULTANT_ANNUAL }), config)?.plan).toBe(
      'consultant'
    );
  });

  /** The penny price resolves through its own contract entry to a plan that does not
   *  entitle. It is never Maker and never a fallthrough. */
  it('resolves the rail-test price to rail_test, which entitles nothing', () => {
    const event = subscriptionEvent({ priceId: PRICE_RAIL_TEST, plan: null });
    expect(intentFromEvent(event, config)?.plan).toBe('rail_test');
  });

  /**
   * The Stripe account is shared across Orchestrate brands and a webhook endpoint receives
   * every event for the whole account. An event for another brand's product is not this
   * deployment's business — and must not be turned into a Batchlabel entitlement.
   */
  it('ignores a subscription belonging to another Orchestrate brand', () => {
    const event = subscriptionEvent();
    (event.data.object as {metadata: Record<string, string>;}).metadata.brand = 'another-brand';
    expect(intentFromEvent(event, config)).toBeNull();
  });

  /**
   * THE PORTAL-UPGRADE REGRESSION TEST. Tier switching happens in the Customer Portal, and a
   * portal price change does NOT rewrite subscription metadata — so after a Maker upgrades
   * to Studio the metadata still reads `maker`. Preferring metadata here pinned every
   * self-serve upgrade at the tier originally bought, and kept granting the higher tier after
   * every downgrade.
   */
  it('takes the tier from the PRICE when stale metadata disagrees', () => {
    const event = subscriptionEvent({ priceId: PRICE_STUDIO_MONTHLY, plan: 'maker' });
    expect(intentFromEvent(event, config)?.plan).toBe('studio');
  });

  it('takes the tier from the price on a downgrade too, not the higher stale claim', () => {
    const event = subscriptionEvent({ priceId: PRICE_MONTHLY, plan: 'consultant' });
    expect(intentFromEvent(event, config)?.plan).toBe('maker');
  });

  /** Metadata is the fallback only, for a subscription made by hand against a price this
   *  deploy has no env var for. It is allow-listed, so it can only ever name a tier we sell. */
  it('falls back to metadata only when the price does not resolve', () => {
    const event = subscriptionEvent({ priceId: 'price_made_by_hand', plan: 'studio' });
    expect(intentFromEvent(event, config)?.plan).toBe('studio');
  });

  it('will not let metadata name free, rail_test or an invented tier', () => {
    for (const claim of ['free', 'rail_test', 'enterprise_unlimited']) {
      const event = subscriptionEvent({ priceId: 'price_made_by_hand', plan: claim });
      expect(intentFromEvent(event, config)?.plan).toBeNull();
    }
  });

  /**
   * NEITHER source says what this is. That is not "grant Maker" — which is what the code
   * used to do — and it is not "grant Free". It is "this event says nothing about the tier",
   * so the tier is left alone and the reason is recorded where it can be grepped in Supabase.
   */
  it('leaves the tier alone for an unresolvable price, and records why', () => {
    const event = subscriptionEvent({ priceId: 'price_replacement_2027', plan: null });
    const intent = intentFromEvent(event, config);
    expect(intent).not.toBeNull();
    expect(intent?.plan).toBeNull();
    // The rest of the event still lands: status, period end and the cancel flag.
    expect(intent?.planStatus).toBe('active');
    expect(intent?.currentPeriodEnd).toBe(PERIOD_END_ISO);
    expect(intent?.billing).toMatchObject({ unrecognised_price_id: 'price_replacement_2027' });
  });

  /** Under the no-add-ons decision a subscription we created has one item at quantity 1.
   *  Anything else means the object means something this code does not model. */
  it('refuses to resolve a tier from a multi-item or quantity-2 subscription', () => {
    const multi = intentFromEvent(
      subscriptionEvent({ priceId: PRICE_MONTHLY, extraPriceId: 'price_addon', plan: null }),
      config
    );
    expect(multi?.plan).toBeNull();
    expect(multi?.billing).toMatchObject({ unrecognised_price_reason: 'multiple_items' });

    const quantity = intentFromEvent(subscriptionEvent({ quantity: 2, plan: null }), config);
    expect(quantity?.plan).toBeNull();
    expect(quantity?.billing).toMatchObject({ unrecognised_price_reason: 'quantity_not_one' });
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

/**
 * The shared-Stripe-account hazard, in its own block because it is the one that costs real
 * money in the wrong direction: the account already carries Orchestrate's Starter (£480/mo)
 * and Scale (£1,800/mo) products, and this endpoint receives their events too.
 */
describe('other products on the shared Stripe account', () => {
  it('ignores a checkout session with no brand metadata (we did not create it)', () => {
    const event = checkoutSessionCompleted();
    (event.data.object as {metadata: Record<string, string>;}).metadata = {};
    expect(intentFromEvent(event, config)).toBeNull();
  });

  it('ignores a checkout session for another brand', () => {
    const event = checkoutSessionCompleted({ brand: 'orchestrate-scale' });
    expect(intentFromEvent(event, config)).toBeNull();
  });

  it('ignores a subscription with no brand metadata and an unrecognised price', () => {
    const event = subscriptionEvent({ priceId: 'price_orchestrate_scale_1800' });
    (event.data.object as {metadata: Record<string, string>;}).metadata = {};
    expect(intentFromEvent(event, config)).toBeNull();
  });

  /** A subscription created by hand in the dashboard against a real Batchlabel price. */
  it('accepts a subscription with no brand metadata when the price IS ours', () => {
    const event = subscriptionEvent({ priceId: PRICE_MONTHLY });
    (event.data.object as {metadata: Record<string, string>;}).metadata = {};
    expect(intentFromEvent(event, config)?.plan).toBe('maker');
  });

  /**
   * Stripe does not guarantee item order, so a first-item-only brand check makes the answer
   * depend on something we do not control. The intent still refuses to name a TIER for a
   * multi-item subscription — recognising it as ours and refusing to guess what it sells are
   * two different questions.
   */
  it('recognises the subscription as ours when a NON-first item carries our price', () => {
    const event = subscriptionEvent({ priceId: 'price_unknown_first', extraPriceId: PRICE_MONTHLY });
    (event.data.object as {metadata: Record<string, string>;}).metadata = {};
    const intent = intentFromEvent(event, config);
    expect(intent).not.toBeNull();
    expect(intent?.plan).toBeNull();
  });

  it('ignores an invoice whose subscription metadata names another brand', () => {
    const event = invoicePaymentFailed({ brand: 'orchestrate-starter' });
    expect(intentFromEvent(event, config)).toBeNull();
  });

  /**
   * Stripe only snapshots subscription metadata onto invoices finalised since June 2023, so
   * an absent snapshot must not be read as "not ours" — an invoice can only ever annotate an
   * existing membership, and the database's subscription-identity guard is what keeps it
   * from touching the wrong one.
   */
  it('still accepts an invoice with no metadata snapshot at all', () => {
    const event = invoicePaymentFailed();
    expect(intentFromEvent(event, config)?.subscriptionId).toBe(SUBSCRIPTION_ID);
  });
});

/**
 * The advertising value has to be the EX-VAT figure. Prices are stored tax-exclusive, so
 * `amount_total` carries whatever VAT the customer's country required: the same Maker
 * monthly is £16.80 in the UK and £14.00 on an export sale. Reporting that would make one
 * product worth different amounts by geography and corrupt ROAS.
 */
describe('purchaseSignal', () => {
  it('reads the value from the ex-tax subtotal, and carries the tax separately', () => {
    const signal = purchaseSignal(checkoutSessionCompleted(), config);
    expect(signal?.amountSubtotalMinor).toBe(1400);
    expect(signal?.taxMinor).toBe(280);
  });

  it('reports the tier that was actually bought', () => {
    expect(purchaseSignal(checkoutSessionCompleted({ plan: 'consultant' }), config)?.plan).toBe('consultant');
    // The rail test IS reported — that is the point of it — but under its own slug, so it is
    // filterable out of ROAS rather than counted as a real sale.
    expect(purchaseSignal(checkoutSessionCompleted({ plan: 'rail_test' }), config)?.plan).toBe('rail_test');
    expect(purchaseSignal(checkoutSessionCompleted({ plan: 'made_up' }), config)?.plan).toBeNull();
  });

  /** A 100%-off promotion code completes with payment_status 'no_payment_required'.
   *  Reporting it would teach Meta to find more people who pay nothing. */
  it('reports nothing for a session that was not actually paid', () => {
    expect(purchaseSignal(checkoutSessionCompleted({ paymentStatus: 'no_payment_required' }), config)).toBeNull();
    expect(purchaseSignal(checkoutSessionCompleted({ paymentStatus: 'unpaid' }), config)).toBeNull();
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
