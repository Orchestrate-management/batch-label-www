// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Stripe from 'stripe';
import { handleStripeWebhook, type ApplyOutcome, type EntitlementStore } from './webhook';
import type { ConversionForwarder, PurchaseSignal } from './meta-capi';
import { buildPriceIndex } from './plan-contract';
import type { EntitlementIntent, IntentConfig } from './stripe-events';
import {
  PERIOD_END_ISO,
  PRICE_ENV,
  SUBSCRIPTION_ID,
  USER_ID,
  checkoutSessionCompleted,
  invoicePaymentFailed,
  subscriptionEvent } from
'../test/stripe-fixtures';

/**
 * A real Stripe client with a dummy key. Nothing here touches the network — signature
 * generation and verification are local crypto — so the verification path this endpoint
 * depends on is exercised for real, not mocked into always passing.
 */
const stripe = new Stripe('sk_test_dummy_key_for_signature_tests');
const WEBHOOK_SECRET = 'whsec_test_secret_do_not_use_anywhere';

const config: IntentConfig = {
  brand: 'batchlabel',
  priceIndex: buildPriceIndex(PRICE_ENV)
};

function signedRequest(payload: string, secret = WEBHOOK_SECRET): Request {
  return new Request('https://www.batchlabel.xyz/api/stripe-webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload, secret })
    },
    body: payload
  });
}

/** A store that records what it was asked to do and answers with a fixed outcome. */
function recordingStore(outcome: ApplyOutcome = 'applied') {
  const calls: EntitlementIntent[] = [];
  const store: EntitlementStore = {
    apply: async (intent) => {
      calls.push(intent);
      return outcome;
    }
  };
  return { store, calls };
}

/**
 * An in-memory model of apply_stripe_entitlement().
 *
 * WHAT THIS DOES AND DOES NOT PROVE. The enforcing copy of the idempotency and ordering
 * rules is the SQL in supabase/migrations/20260801120000_entitlements.sql — only the
 * database can make "claim the event id and apply the change" atomic, and there is no
 * Postgres in this test environment to run it against. This model implements the same three
 * rules so that the SEQUENCES below are meaningful end-to-end tests of the half that is
 * TypeScript: what each Stripe event is mapped to, and what the final stored state is after
 * a replay or an out-of-order delivery. The rules themselves are asserted directly further
 * down, so a change to either copy that breaks the contract shows up here.
 */
function modelStore(initial: Partial<StoredRow> = {}) {
  const processed = new Map<string, ApplyOutcome>();
  const row: StoredRow = {
    plan: 'free',
    plan_status: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    current_period_end: null,
    cancel_at_period_end: false,
    stripe_event_id: null,
    stripe_event_at: null,
    stripe_status_at: null,
    ...initial
  };

  const store: EntitlementStore = {
    apply: async (intent) => {
      // 1. Exactly once, keyed on the Stripe event id.
      if (processed.has(intent.eventId)) return 'duplicate';
      processed.set(intent.eventId, 'applied');

      let plan = intent.plan;
      let planStatus = intent.planStatus;
      let cancelAtPeriodEnd = intent.cancelAtPeriodEnd;
      const isSubscriptionEvent = intent.eventType.startsWith('customer.subscription.');
      const entitling = (status: string | null) =>
      status === 'active' || status === 'trialing' || status === 'past_due';

      // 0. Subscription identity. One customer can hold several subscriptions (an abandoned
      //    `incomplete` one plus the live retry), so an event about a subscription this
      //    membership does not hold must not touch it — and must not rebind the id, which
      //    would disarm this very check for the event after it.
      if (
      intent.subscriptionId &&
      row.stripe_subscription_id &&
      intent.subscriptionId !== row.stripe_subscription_id &&
      !(isSubscriptionEvent && (!entitling(row.plan_status) || entitling(planStatus))))
      {
        processed.set(intent.eventId, 'superseded');
        return 'superseded';
      }

      if (isSubscriptionEvent) {
        // 2. Monotonic on event.created, scoped to the subscription family.
        if (row.stripe_status_at && intent.eventAt < row.stripe_status_at) {
          processed.set(intent.eventId, 'stale');
          return 'stale';
        }
        if (
        row.stripe_status_at &&
        intent.eventAt === row.stripe_status_at &&
        row.plan_status === 'canceled' &&
        (planStatus ?? row.plan_status) !== 'canceled')
        {
          processed.set(intent.eventId, 'stale');
          return 'stale';
        }
      } else if (row.stripe_status_at && intent.eventAt <= row.stripe_status_at) {
        // 4. An additive event that predates the subscription clock keeps its factual half
        //    and loses its opinion about the plan.
        plan = null;
        planStatus = null;
        cancelAtPeriodEnd = null;
      }

      // Partial update: null means "this event says nothing about that column".
      row.plan = plan ?? row.plan;
      row.plan_status = planStatus ?? row.plan_status;
      row.stripe_customer_id = intent.customerId ?? row.stripe_customer_id;
      row.stripe_subscription_id = intent.subscriptionId ?? row.stripe_subscription_id;
      row.current_period_end = intent.currentPeriodEnd ?? row.current_period_end;
      row.cancel_at_period_end = cancelAtPeriodEnd ?? row.cancel_at_period_end;
      row.stripe_event_id = intent.eventId;
      row.stripe_event_at = intent.eventAt;
      if (isSubscriptionEvent) row.stripe_status_at = intent.eventAt;
      return 'applied';
    }
  };

  return { store, row, processed };
}

interface StoredRow {
  plan: string;
  plan_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_event_id: string | null;
  stripe_event_at: string | null;
  stripe_status_at: string | null;
}

function deps(store: EntitlementStore) {
  return { stripe, webhookSecret: WEBHOOK_SECRET, store, config };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('signature verification', () => {
  it('accepts a correctly signed event and applies it', async () => {
    const { store, calls } = recordingStore();
    const payload = JSON.stringify(subscriptionEvent({ status: 'active' }));

    const response = await handleStripeWebhook(signedRequest(payload), deps(store));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ received: true, outcome: 'applied' });
    expect(calls).toHaveLength(1);
  });

  /**
   * The whole reason this endpoint needs verification: without it, anyone who can POST JSON
   * can grant themselves a paid plan. An unsigned request must not reach the store.
   */
  it('rejects a request with no signature header, and writes nothing', async () => {
    const { store, calls } = recordingStore();
    const request = new Request('https://www.batchlabel.xyz/api/stripe-webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(subscriptionEvent())
    });

    const response = await handleStripeWebhook(request, deps(store));

    expect(response.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('rejects an event signed with the wrong secret, and writes nothing', async () => {
    const { store, calls } = recordingStore();
    const payload = JSON.stringify(subscriptionEvent());

    const response = await handleStripeWebhook(
      signedRequest(payload, 'whsec_an_attackers_own_secret'),
      deps(store)
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid signature.' });
    expect(calls).toHaveLength(0);
  });

  it('rejects a forged signature header', async () => {
    const { store, calls } = recordingStore();
    const request = new Request('https://www.batchlabel.xyz/api/stripe-webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=deadbeef' },
      body: JSON.stringify(subscriptionEvent())
    });

    expect((await handleStripeWebhook(request, deps(store))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  /**
   * THE RAW BODY TRAP, demonstrated. Stripe signs exact bytes. Re-serialising an identical
   * object — which is what every JSON body parser in the request path forces you to do —
   * changes those bytes and verification fails. This test fails if anyone ever "helpfully"
   * swaps request.text() for request.json().
   */
  it('fails verification when the body has been re-serialised rather than passed through raw', async () => {
    const { store, calls } = recordingStore();
    const payload = JSON.stringify(subscriptionEvent());
    const reserialised = JSON.stringify(JSON.parse(payload), null, 2);
    expect(reserialised).not.toBe(payload);

    const request = new Request('https://www.batchlabel.xyz/api/stripe-webhook', {
      method: 'POST',
      headers: {
        'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET })
      },
      body: reserialised
    });

    expect((await handleStripeWebhook(request, deps(store))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  /** Fail closed. A missing secret must never mean "skip verification". */
  it('refuses to process anything when the webhook secret is not configured', async () => {
    const { store, calls } = recordingStore();
    const payload = JSON.stringify(subscriptionEvent());

    const response = await handleStripeWebhook(signedRequest(payload), {
      ...deps(store),
      webhookSecret: undefined
    });

    expect(response.status).toBe(500);
    expect(calls).toHaveLength(0);
  });

  it('rejects a non-POST request', async () => {
    const { store } = recordingStore();
    const request = new Request('https://www.batchlabel.xyz/api/stripe-webhook', { method: 'GET' });
    expect((await handleStripeWebhook(request, deps(store))).status).toBe(405);
  });
});

describe('what the store is asked to do', () => {
  it('passes the event id and event.created through, which is what the ordering guard runs on', async () => {
    const { store, calls } = recordingStore();
    const payload = JSON.stringify(subscriptionEvent({ id: 'evt_ordering', created: 1700000000 }));

    await handleStripeWebhook(signedRequest(payload), deps(store));

    expect(calls[0]).toMatchObject({
      eventId: 'evt_ordering',
      eventAt: '2023-11-14T22:13:20.000Z',
      brand: 'batchlabel'
    });
  });

  it('acknowledges an event type it does not act on without touching the store', async () => {
    const { store, calls } = recordingStore();
    const event = subscriptionEvent();
    (event as {type: string;}).type = 'customer.created';

    const response = await handleStripeWebhook(signedRequest(JSON.stringify(event)), deps(store));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ outcome: 'ignored' });
    expect(calls).toHaveLength(0);
  });

  /**
   * 500 so Stripe retries. Swallowing a database error with a 200 loses a paid subscription
   * permanently, because Stripe will never send that event again.
   */
  it('returns 500 when the write fails, so Stripe retries', async () => {
    const store: EntitlementStore = {
      apply: async () => {
        throw new Error('connection reset');
      }
    };
    const response = await handleStripeWebhook(
      signedRequest(JSON.stringify(subscriptionEvent())),
      deps(store)
    );
    expect(response.status).toBe(500);
  });

  /**
   * ...but 200 when there is simply nobody to attach the event to. Retrying cannot help, and
   * a run of 5xx gets the endpoint automatically disabled by Stripe.
   */
  it('returns 200 for an event that matches no account, and says so loudly', async () => {
    const { store } = recordingStore('no_membership');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const response = await handleStripeWebhook(
      signedRequest(JSON.stringify(subscriptionEvent())),
      deps(store)
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ outcome: 'no_membership' });
    expect(warn).toHaveBeenCalled();
  });

  /**
   * Same reasoning as no_membership: an event naming a brand we do not run can never
   * succeed, so retrying it for three days only risks getting the endpoint disabled.
   */
  it('returns 200 for an event naming an unknown brand, and says so loudly', async () => {
    const { store } = recordingStore('unknown_brand');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const response = await handleStripeWebhook(
      signedRequest(JSON.stringify(subscriptionEvent())),
      deps(store)
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ outcome: 'unknown_brand' });
    expect(warn).toHaveBeenCalled();
  });

  it('reports the outcome back to Stripe so the dashboard event log is readable', async () => {
    for (const outcome of ['applied', 'duplicate', 'stale', 'superseded'] as ApplyOutcome[]) {
      const { store } = recordingStore(outcome);
      const response = await handleStripeWebhook(
        signedRequest(JSON.stringify(subscriptionEvent())),
        deps(store)
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ outcome });
    }
  });
});

describe('idempotency and ordering, end to end', () => {
  async function deliver(event: Stripe.Event, store: EntitlementStore) {
    const response = await handleStripeWebhook(signedRequest(JSON.stringify(event)), deps(store));
    return (await response.json()) as {outcome: ApplyOutcome;};
  }

  it('applies a first subscription and records the whole entitlement', async () => {
    const model = modelStore();

    await deliver(checkoutSessionCompleted({ id: 'evt_1', created: 1000 }), model.store);
    await deliver(subscriptionEvent({ id: 'evt_2', created: 1001, status: 'active' }), model.store);

    expect(model.row).toMatchObject({
      plan: 'maker',
      plan_status: 'active',
      stripe_customer_id: 'cus_test_1',
      stripe_subscription_id: SUBSCRIPTION_ID,
      current_period_end: PERIOD_END_ISO,
      cancel_at_period_end: false
    });
  });

  /** Stripe retries. The same event arriving twice must change nothing the second time. */
  it('is idempotent: a replayed event is recognised and changes nothing', async () => {
    const model = modelStore();
    const event = subscriptionEvent({ id: 'evt_replay', created: 2000, status: 'active' });

    expect((await deliver(event, model.store)).outcome).toBe('applied');
    const afterFirst = { ...model.row };

    expect((await deliver(event, model.store)).outcome).toBe('duplicate');
    expect(model.row).toEqual(afterFirst);
  });

  it('is idempotent across a byte-identical redelivery of a cancellation', async () => {
    const model = modelStore();
    await deliver(subscriptionEvent({ id: 'evt_a', created: 2000, status: 'active' }), model.store);
    const cancel = subscriptionEvent({ id: 'evt_b', created: 3000, type: 'customer.subscription.deleted' });

    expect((await deliver(cancel, model.store)).outcome).toBe('applied');
    expect((await deliver(cancel, model.store)).outcome).toBe('duplicate');
    expect(model.row.plan).toBe('free');
    expect(model.row.plan_status).toBe('canceled');
  });

  /**
   * The case the brief calls out: a `deleted` arrives before a `.updated` that Stripe
   * generated EARLIER. Applying them in arrival order would leave a cancelled customer
   * marked active and still using the product.
   */
  it('tolerates out-of-order delivery: a late .updated cannot resurrect a cancelled plan', async () => {
    const model = modelStore();
    await deliver(subscriptionEvent({ id: 'evt_active', created: 2000, status: 'active' }), model.store);

    // Generated at t=3000, delivered first.
    expect(
      (await deliver(
        subscriptionEvent({ id: 'evt_deleted', created: 3000, type: 'customer.subscription.deleted' }),
        model.store
      )).outcome
    ).toBe('applied');

    // Generated at t=2500, delivered second. Older than what we already applied.
    expect(
      (await deliver(
        subscriptionEvent({ id: 'evt_late_update', created: 2500, status: 'active' }),
        model.store
      )).outcome
    ).toBe('stale');

    expect(model.row.plan).toBe('free');
    expect(model.row.plan_status).toBe('canceled');
  });

  it('applies a genuinely newer event that arrives after an older one', async () => {
    const model = modelStore();
    await deliver(subscriptionEvent({ id: 'evt_old', created: 2000, status: 'active' }), model.store);
    await deliver(
      subscriptionEvent({ id: 'evt_new', created: 4000, status: 'active', cancelAtPeriodEnd: true }),
      model.store
    );
    expect(model.row.cancel_at_period_end).toBe(true);
    expect(model.row.plan).toBe('maker');
  });

  /**
   * checkout.session.completed carries no billing period. If it were applied as a full
   * overwrite it would blank the period end that customer.subscription.created had just
   * written, and every "when does my plan renew" answer would be blank.
   */
  it('a later partial event does not blank facts an earlier event established', async () => {
    const model = modelStore();
    await deliver(subscriptionEvent({ id: 'evt_sub', created: 1000, status: 'active' }), model.store);
    await deliver(checkoutSessionCompleted({ id: 'evt_checkout', created: 2000 }), model.store);

    expect(model.row.current_period_end).toBe(PERIOD_END_ISO);
    expect(model.row.plan).toBe('maker');
  });

  /**
   * REGRESSION. Stripe creates the subscription BEFORE the checkout session completes, so
   * customer.subscription.created is always the OLDER of the two. Deliver them in the other
   * order under a single global clock and the subscription event is discarded as stale -
   * taking with it the only copy of current_period_end, stripe_price_id and trial_end that
   * will ever be sent. The customer pays and their renewal date is blank forever.
   *
   * Only customer.subscription.* events advance the ordering clock, so this works.
   */
  it('a checkout event landing FIRST does not discard the subscription event behind it', async () => {
    const model = modelStore();

    // Delivered first, generated second.
    await deliver(checkoutSessionCompleted({ id: 'evt_checkout', created: 1001 }), model.store);
    // Delivered second, generated first.
    const outcome = await deliver(
      subscriptionEvent({ id: 'evt_sub_created', created: 1000, type: 'customer.subscription.created' }),
      model.store
    );

    expect(outcome.outcome).toBe('applied');
    expect(model.row.current_period_end).toBe(PERIOD_END_ISO);
    expect(model.row.plan).toBe('maker');
  });

  /**
   * ...but an additive event may not use its head start to contradict a newer subscription
   * event. It keeps the factual half (the Stripe customer id, without which the billing
   * portal can never work) and loses its opinion about the plan.
   */
  it('an out-of-order checkout event records the customer id without resurrecting a cancelled plan', async () => {
    const model = modelStore();
    await deliver(subscriptionEvent({ id: 'evt_active', created: 2000, status: 'active' }), model.store);
    await deliver(
      subscriptionEvent({ id: 'evt_deleted', created: 3000, type: 'customer.subscription.deleted' }),
      model.store
    );

    const outcome = await deliver(
      checkoutSessionCompleted({ id: 'evt_late_checkout', created: 2500 }),
      model.store
    );

    expect(outcome.outcome).toBe('applied');
    expect(model.row.stripe_customer_id).toBe('cus_test_1');
    expect(model.row.plan).toBe('free');
    expect(model.row.plan_status).toBe('canceled');
  });

  it('a cancellation for a superseded subscription does not take the current one down', async () => {
    const model = modelStore();
    await deliver(
      subscriptionEvent({ id: 'evt_new_sub', created: 5000, status: 'active', subscriptionId: 'sub_new' }),
      model.store
    );

    const outcome = await deliver(
      subscriptionEvent({
        id: 'evt_old_cancel',
        created: 6000,
        type: 'customer.subscription.deleted',
        subscriptionId: 'sub_old'
      }),
      model.store
    );

    expect(outcome.outcome).toBe('superseded');
    expect(model.row.plan).toBe('maker');
    expect(model.row.stripe_subscription_id).toBe('sub_new');
  });

  /**
   * REGRESSION, and the nastiest of the lot. A Stripe customer routinely holds more than
   * one subscription: an `incomplete` one left behind by a checkout that was abandoned,
   * plus the live one from the retry. Letting any event rebind stripe_subscription_id meant
   * an invoice for the abandoned subscription repointed the membership at it — after which
   * the abandoned subscription's own cancellation no longer looked superseded and revoked a
   * paying customer's access.
   */
  it('an invoice for an abandoned second subscription cannot rebind the membership', async () => {
    const model = modelStore();
    await deliver(
      subscriptionEvent({ id: 'evt_live', created: 1000, status: 'active', subscriptionId: 'sub_live' }),
      model.store
    );

    const outcome = await deliver(
      invoicePaymentFailed({ id: 'evt_inv_abandoned', created: 2000, subscriptionId: 'sub_abandoned' }),
      model.store
    );

    expect(outcome.outcome).toBe('superseded');
    expect(model.row.stripe_subscription_id).toBe('sub_live');
    expect(model.row.plan_status).toBe('active');
  });

  it('...so the abandoned subscription\'s cancellation still cannot revoke the live plan', async () => {
    const model = modelStore();
    await deliver(
      subscriptionEvent({ id: 'evt_live', created: 1000, status: 'active', subscriptionId: 'sub_live' }),
      model.store
    );
    await deliver(
      invoicePaymentFailed({ id: 'evt_inv_abandoned', created: 2000, subscriptionId: 'sub_abandoned' }),
      model.store
    );
    const outcome = await deliver(
      subscriptionEvent({
        id: 'evt_abandoned_deleted',
        created: 3000,
        type: 'customer.subscription.deleted',
        subscriptionId: 'sub_abandoned'
      }),
      model.store
    );

    expect(outcome.outcome).toBe('superseded');
    expect(model.row.plan).toBe('maker');
    expect(model.row.plan_status).toBe('active');
  });

  it('an abandoned incomplete subscription cannot take over from the live one', async () => {
    const model = modelStore();
    await deliver(
      subscriptionEvent({ id: 'evt_live', created: 1000, status: 'active', subscriptionId: 'sub_live' }),
      model.store
    );

    const outcome = await deliver(
      subscriptionEvent({
        id: 'evt_incomplete',
        created: 2000,
        status: 'incomplete',
        subscriptionId: 'sub_abandoned'
      }),
      model.store
    );

    expect(outcome.outcome).toBe('superseded');
    expect(model.row.plan).toBe('maker');
    expect(model.row.stripe_subscription_id).toBe('sub_live');
  });

  /** ...but a genuine resubscribe, where the stored subscription is dead, must take over. */
  it('a new subscription takes over once the stored one is no longer entitling', async () => {
    const model = modelStore();
    await deliver(
      subscriptionEvent({ id: 'evt_a', created: 1000, status: 'active', subscriptionId: 'sub_a' }),
      model.store
    );
    await deliver(
      subscriptionEvent({
        id: 'evt_a_deleted',
        created: 2000,
        type: 'customer.subscription.deleted',
        subscriptionId: 'sub_a'
      }),
      model.store
    );
    const outcome = await deliver(
      subscriptionEvent({ id: 'evt_b', created: 3000, status: 'active', subscriptionId: 'sub_b' }),
      model.store
    );

    expect(outcome.outcome).toBe('applied');
    expect(model.row.stripe_subscription_id).toBe('sub_b');
    expect(model.row.plan).toBe('maker');
  });

  /** An invoice failure annotates; it must never be able to hand out a plan. */
  it('a failed renewal marks past_due without granting anything', async () => {
    const model = modelStore();
    await deliver(subscriptionEvent({ id: 'evt_active', created: 1000, status: 'active' }), model.store);
    await deliver(invoicePaymentFailed({ id: 'evt_fail', created: 2000 }), model.store);

    expect(model.row.plan_status).toBe('past_due');
    // Still entitled: Stripe is retrying the card, and locking them out now is worse.
    expect(model.row.plan).toBe('maker');
  });

  it('a failed invoice on a free account cannot promote it', async () => {
    const model = modelStore();
    await deliver(invoicePaymentFailed({ id: 'evt_fail_only', created: 2000 }), model.store);
    expect(model.row.plan).toBe('free');
  });
});

/**
 * CONVERSION FORWARDING — where the Purchase event is raised, and where it is not.
 *
 * The failure this guards against is double-counting, and it is worse than under-counting
 * because it is invisible: Meta optimises towards whatever we tell it worked, so inflated
 * conversions quietly buy worse traffic. Stripe webhooks are at-least-once — retries on any
 * non-2xx, redeliveries on Stripe's own schedule, and a "Resend" button in the dashboard —
 * so "the same purchase arrives more than once" is routine, not exceptional.
 *
 * Two independent defences, both tested here:
 *   1. Forward only on `applied`. The entitlement RPC claims the event id atomically, so a
 *      redelivery returns `duplicate` and never reaches Meta at all.
 *   2. A deterministic `event_id` (the Stripe Checkout Session id). Even if a send did
 *      happen twice, Meta collapses the pair.
 */
describe('Meta conversion forwarding', () => {
  function forwarder() {
    const sent: PurchaseSignal[] = [];
    const conversions: ConversionForwarder = {
      forwardPurchase: async (signal) => {
        sent.push(signal);
        return 'sent';
      }
    };
    return { conversions, sent };
  }

  async function deliverWith(event: Stripe.Event, store: EntitlementStore, conversions: ConversionForwarder) {
    return handleStripeWebhook(signedRequest(JSON.stringify(event)), {
      ...deps(store),
      conversions
    });
  }

  it('forwards a Purchase on a paid checkout.session.completed that was applied', async () => {
    const { store } = recordingStore('applied');
    const { conversions, sent } = forwarder();

    await deliverWith(checkoutSessionCompleted(), store, conversions);

    expect(sent).toHaveLength(1);
    expect(sent[0].checkoutSessionId).toBe('cs_test_1');
    expect(sent[0].supabaseUserId).toBe(USER_ID);
  });

  it('uses the Stripe Checkout Session id, so a retry cannot mint a second conversion', async () => {
    const { store } = recordingStore('applied');
    const { conversions, sent } = forwarder();
    const event = checkoutSessionCompleted();

    await deliverWith(event, store, conversions);
    await deliverWith(event, store, conversions);

    // The store here always says `applied`, so both deliveries forward — which is exactly
    // the scenario where the event id has to carry the load. Identical ids mean Meta counts
    // one purchase, not two.
    expect(sent).toHaveLength(2);
    expect(sent[0].checkoutSessionId).toBe(sent[1].checkoutSessionId);
  });

  it('does NOT forward when the store says duplicate: that is a Stripe redelivery', async () => {
    const { store } = recordingStore('duplicate');
    const { conversions, sent } = forwarder();
    await deliverWith(checkoutSessionCompleted(), store, conversions);
    expect(sent).toHaveLength(0);
  });

  it('does NOT forward on stale, superseded, no_membership or unknown_brand', async () => {
    for (const outcome of ['stale', 'superseded', 'no_membership', 'unknown_brand'] as ApplyOutcome[]) {
      const { store } = recordingStore(outcome);
      const { conversions, sent } = forwarder();
      await deliverWith(checkoutSessionCompleted(), store, conversions);
      expect(sent, `outcome ${outcome} must not forward`).toHaveLength(0);
    }
  });

  it('does NOT forward for a subscription or invoice event', async () => {
    // A renewal is not a new Purchase, and an invoice failure is certainly not one.
    for (const event of [subscriptionEvent({ status: 'active' }), invoicePaymentFailed()]) {
      const { store } = recordingStore('applied');
      const { conversions, sent } = forwarder();
      await deliverWith(event, store, conversions);
      expect(sent).toHaveLength(0);
    }
  });

  it('does NOT forward an unpaid session, nor a 100%-off promotion code', async () => {
    for (const paymentStatus of ['unpaid', 'no_payment_required']) {
      const { store } = recordingStore('applied');
      const { conversions, sent } = forwarder();
      await deliverWith(checkoutSessionCompleted({ paymentStatus }), store, conversions);
      expect(sent, `payment_status ${paymentStatus} must not forward`).toHaveLength(0);
    }
  });

  it('does NOT forward another Orchestrate brand s checkout on the shared Stripe account', async () => {
    const { store } = recordingStore('applied');
    const { conversions, sent } = forwarder();
    await deliverWith(checkoutSessionCompleted({ brand: 'someone-else' }), store, conversions);
    expect(sent).toHaveLength(0);
  });

  it('carries the click identifiers the webhook needs to rebuild fbc', async () => {
    const { store } = recordingStore('applied');
    const { conversions, sent } = forwarder();

    await deliverWith(
      checkoutSessionCompleted({
        metadata: {
          fbclid: 'IwAR0abcDEF',
          first_seen_at: '2025-12-01T00:00:00.000Z',
          fbp: 'fb.1.1767225600000.1234567890',
          fbc: 'fb.1.1700000000000.IwAR0real'
        }
      }),
      store,
      conversions
    );

    expect(sent[0]).toMatchObject({
      fbclid: 'IwAR0abcDEF',
      firstSeenAt: '2025-12-01T00:00:00.000Z',
      fbp: 'fb.1.1767225600000.1234567890',
      fbc: 'fb.1.1700000000000.IwAR0real'
    });
  });

  it('passes the Stripe event time in seconds, not the time we got round to reporting', async () => {
    const { store } = recordingStore('applied');
    const { conversions, sent } = forwarder();
    await deliverWith(checkoutSessionCompleted({ created: 1767225600 }), store, conversions);
    expect(sent[0].eventTimeUnix).toBe(1767225600);
  });

  it('nulls the click identifiers when the session carried none', async () => {
    const { store } = recordingStore('applied');
    const { conversions, sent } = forwarder();
    await deliverWith(checkoutSessionCompleted(), store, conversions);
    expect(sent[0]).toMatchObject({ fbclid: null, firstSeenAt: null, fbp: null, fbc: null });
  });

  /**
   * Measurement is downstream of billing and must never be able to break it. A forwarder
   * that threw would otherwise produce a 500, and Stripe would retry an event that has
   * already granted the plan.
   */
  it('still returns 200 when forwarding throws', async () => {
    const { store } = recordingStore('applied');
    const conversions: ConversionForwarder = {
      forwardPurchase: async () => {
        throw new Error('meta exploded');
      }
    };

    const response = await deliverWith(checkoutSessionCompleted(), store, conversions);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ received: true, outcome: 'applied' });
  });

  it('works unchanged with no forwarder at all, which is the preview and pre-setup case', async () => {
    const { store, calls } = recordingStore('applied');
    const response = await handleStripeWebhook(
      signedRequest(JSON.stringify(checkoutSessionCompleted())),
      deps(store)
    );
    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
  });
});
