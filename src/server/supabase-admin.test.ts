// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { bearerToken, createEntitlementStore, userFromRequest } from './supabase-admin';
import { intentFromEvent, type IntentConfig } from './stripe-events';
import { PLAN_CONTRACT, buildPriceIndex } from './plan-contract';
import { PRICE_ENV, checkoutSessionCompleted, invoicePaymentFailed } from '../test/stripe-fixtures';

function request(headers: Record<string, string> = {}): Request {
  return new Request('https://www.batchlabel.xyz/api/create-portal-session', {
    method: 'POST',
    headers
  });
}

describe('bearerToken', () => {
  it('reads a bearer token', () => {
    expect(bearerToken(request({ authorization: 'Bearer abc.def.ghi' }))).toBe('abc.def.ghi');
  });

  it('is case insensitive about the scheme', () => {
    expect(bearerToken(request({ authorization: 'bearer abc' }))).toBe('abc');
  });

  it('returns null when there is no usable Authorization header', () => {
    expect(bearerToken(request())).toBeNull();
    expect(bearerToken(request({ authorization: 'abc' }))).toBeNull();
    expect(bearerToken(request({ authorization: 'Basic abc' }))).toBeNull();
    expect(bearerToken(request({ authorization: 'Bearer' }))).toBeNull();
  });
});

describe('userFromRequest', () => {
  function fakeAdmin(response: unknown) {
    const getUser = vi.fn().mockResolvedValue(response);
    return { admin: { auth: { getUser } } as unknown as SupabaseClient, getUser };
  }

  it('asks Supabase who the token belongs to, rather than decoding it locally', async () => {
    const { admin, getUser } = fakeAdmin({
      data: { user: { id: 'user-1', email: 'maker@example.com' } },
      error: null
    });

    const user = await userFromRequest(admin, request({ authorization: 'Bearer the.access.token' }));

    expect(user).toEqual({ id: 'user-1', email: 'maker@example.com' });
    // The token itself is what is verified — not a user id the caller claimed.
    expect(getUser).toHaveBeenCalledWith('the.access.token');
  });

  it('returns null when Supabase rejects the token', async () => {
    const { admin } = fakeAdmin({ data: { user: null }, error: { message: 'invalid JWT' } });
    expect(await userFromRequest(admin, request({ authorization: 'Bearer expired' }))).toBeNull();
  });

  it('returns null when there is no token at all, without calling Supabase', async () => {
    const { admin, getUser } = fakeAdmin({ data: { user: { id: 'user-1' } }, error: null });
    expect(await userFromRequest(admin, request())).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  /**
   * The property that matters: there is no code path from a request BODY to an identity.
   * A body cannot be passed to this function at all, which is the point.
   */
  it('cannot be given an identity by the request body', async () => {
    const { admin } = fakeAdmin({ data: { user: null }, error: { message: 'no token' } });
    const withBody = new Request('https://www.batchlabel.xyz/api/create-portal-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: 'somebody-elses-id' })
    });
    expect(await userFromRequest(admin, withBody)).toBeNull();
  });
});

/**
 * THE CALL THAT HAS TO CARRY THE ALLOWANCE.
 *
 * 20260802120000_plan_limits.sql took apply_stripe_entitlement to sixteen arguments and drops
 * the fourteen-argument signature so a short call cannot land on a function that ignores the
 * new two. This call site kept passing fourteen, so nothing ever wrote an allowance and every
 * membership held the fail-closed defaults (3 SKUs, 1 editor seat) permanently — a defect that
 * is invisible until the enforcement trigger lands and caps every paying customer at three.
 *
 * These assert the ARGUMENT NAMES as well as the values, because PostgREST resolves the
 * overload by name: a typo would not error, it would call the old function.
 */
describe('createEntitlementStore', () => {
  const config: IntentConfig = { brand: 'batchlabel', priceIndex: buildPriceIndex(PRICE_ENV) };

  function fakeAdmin() {
    const rpc = vi.fn().mockResolvedValue({ data: 'applied', error: null });
    return { admin: { rpc } as unknown as SupabaseClient, rpc };
  }

  /** The fixtures all produce an intent; a null here means the fixture changed, not that the
   *  assertion below is optional. */
  function intentFor(event: Parameters<typeof intentFromEvent>[0]) {
    const intent = intentFromEvent(event, config);
    if (!intent) throw new Error('the fixture produced no intent');
    return intent;
  }

  it('sends the tier allowance the plan contract resolved, under the names the RPC expects', async () => {
    const { admin, rpc } = fakeAdmin();

    const outcome = await createEntitlementStore(admin).apply(
      intentFor(checkoutSessionCompleted({ plan: 'consultant' }))
    );

    expect(outcome).toBe('applied');
    const [fn, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('apply_stripe_entitlement');
    expect(args.p_plan).toBe('consultant');
    expect(args.p_sku_limit).toBe(PLAN_CONTRACT.consultant.skuLimit);
    expect(args.p_editor_seat_limit).toBe(PLAN_CONTRACT.consultant.editorSeatLimit);
  });

  /** Null, never a default. The function reads null as leave-alone, so an event that says
   *  nothing about the tier cannot resize a membership it knows nothing about. */
  it('sends a null allowance for an event that carries no plan', async () => {
    const { admin, rpc } = fakeAdmin();

    await createEntitlementStore(admin).apply(intentFor(invoicePaymentFailed()));

    const args = (rpc.mock.calls[0] as [string, Record<string, unknown>])[1];
    expect(args.p_plan).toBeNull();
    expect(args.p_sku_limit).toBeNull();
    expect(args.p_editor_seat_limit).toBeNull();
  });

  /** The whole signature, so a future argument cannot be added to the migration and quietly
   *  forgotten here — which is exactly how the allowance went unwritten. */
  it('names all sixteen arguments, and no p_email among them', async () => {
    const { admin, rpc } = fakeAdmin();
    await createEntitlementStore(admin).apply(intentFor(checkoutSessionCompleted()));

    const args = (rpc.mock.calls[0] as [string, Record<string, unknown>])[1];
    expect(Object.keys(args).sort()).toEqual(
      [
      'p_billing',
      'p_brand',
      'p_cancel_at_period_end',
      'p_current_period_end',
      'p_customer_id',
      'p_editor_seat_limit',
      'p_event_at',
      'p_event_id',
      'p_event_type',
      'p_plan',
      'p_plan_status',
      'p_price_id',
      'p_sku_limit',
      'p_subscription_id',
      'p_trial_end',
      'p_user_id'].
      sort()
    );
  });
});
