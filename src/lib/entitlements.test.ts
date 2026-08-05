import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchEntitlement, formatPeriodEnd, summarisePlan, type Entitlement } from './entitlements';
import { LADDER, PLANS, skuAllowance } from './plans';

const mocks = vi.hoisted(() => ({
  result: { data: null as unknown, error: null as unknown },
  /** Captured so a test can assert which relation and filters were used. */
  from: '' as string,
  filters: [] as Array<[string, unknown]>
}));

vi.mock('./supabase', () => {
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      mocks.filters.push([column, value]);
      return builder;
    },
    maybeSingle: () => Promise.resolve(mocks.result)
  };
  return {
    supabase: {
      from: (relation: string) => {
        mocks.from = relation;
        return builder;
      }
    },
    isSupabaseConfigured: true,
    MISSING_CONFIG_MESSAGE: 'not connected'
  };
});

function entitlement(overrides: Partial<Entitlement> = {}): Entitlement {
  return {
    brand: 'batchlabel',
    plan: 'maker',
    status: 'active',
    membershipStatus: 'active',
    active: true,
    currentPeriodEnd: '2030-01-01T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    trialEnd: null,
    ...overrides
  };
}

describe('fetchEntitlement', () => {
  beforeEach(() => {
    mocks.result = { data: null, error: null };
    mocks.from = '';
    mocks.filters = [];
  });

  /**
   * Through the VIEW, not brand_memberships. The view is the documented contract the
   * separate product app reads, and it is where the single definition of "currently
   * entitled" lives — reading the table here would be a second, divergent copy.
   */
  it('reads the entitlements view, scoped to this brand', async () => {
    mocks.result = {
      data: {
        brand: 'batchlabel',
        plan: 'maker',
        status: 'active',
        membership_status: 'active',
        active: true,
        current_period_end: '2030-01-01T00:00:00.000Z',
        cancel_at_period_end: false,
        trial_end: null
      },
      error: null
    };

    const result = await fetchEntitlement();

    expect(mocks.from).toBe('entitlements');
    expect(mocks.filters).toEqual([['brand', 'batchlabel']]);
    expect(result).toEqual({
      brand: 'batchlabel',
      plan: 'maker',
      status: 'active',
      membershipStatus: 'active',
      active: true,
      currentPeriodEnd: '2030-01-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      trialEnd: null
    });
  });

  /** No user id is sent: RLS scopes the view to the caller, so there is nothing to pass. */
  it('never filters on a user id', async () => {
    mocks.result = { data: null, error: null };
    await fetchEntitlement();
    expect(mocks.filters.map(([column]) => column)).not.toContain('user_id');
  });

  it('returns null rather than a fabricated free plan when the read fails', async () => {
    mocks.result = { data: null, error: { message: 'network' } };
    expect(await fetchEntitlement()).toBeNull();
  });

  it('returns null when the user has no membership for this brand', async () => {
    mocks.result = { data: null, error: null };
    expect(await fetchEntitlement()).toBeNull();
  });
});

describe('summarisePlan', () => {
  /**
   * THE ONE THAT COSTS MONEY. The account screen used to hard-code "Free plan" and always
   * render "Upgrade to Maker", so a paying customer was told they had nothing and invited to
   * buy a second subscription — two charges a month on one account.
   */
  it('never offers an upgrade to somebody who is already entitled', () => {
    for (const status of ['active', 'trialing', 'past_due']) {
      const summary = summarisePlan(entitlement({ status }));
      expect(summary.showUpgrade).toBe(false);
      expect(summary.showManageBilling).toBe(true);
    }
  });

  /**
   * Every branch used to hard-code "Maker", so a paying Studio or Consultant customer was
   * shown a tier they had not bought. The slug is in hand at the select; use it.
   */
  it.each(['maker', 'studio', 'consultant'] as const)('names the %s plan it was given', (slug) => {
    const summary = summarisePlan(entitlement({ plan: slug }));
    expect(summary.label).toBe(`${PLANS[slug].label} plan`);
    expect(summary.detail).toContain(skuAllowance(PLANS[slug]));
  });

  it('shows the real plan rather than a hard-coded one', () => {
    expect(summarisePlan(entitlement()).label).toBe('Maker plan');
    expect(summarisePlan(entitlement({ plan: 'free', status: null, active: false })).label).toBe(
      'Free plan'
    );
  });

  /** A slug a newer deploy introduced must not render as a plan this build invented. */
  it('falls back to wording true of every plan for an unknown slug', () => {
    const summary = summarisePlan(entitlement({ plan: 'something_new' }));
    expect(summary.label).toBe('Your plan');
    expect(summary.detail).not.toMatch(/SKU/);
  });

  /**
   * A lapsed account is a Free account, with Free's allowance. Cancelling must never leave
   * somebody worse off than never having subscribed.
   */
  it('gives a lapsed account the Free allowance rather than nothing', () => {
    const summary = summarisePlan(
      entitlement({ plan: 'free', status: 'canceled', active: false })
    );
    expect(summary.detail).toContain(skuAllowance(PLANS.free));
  });

  /**
   * No SKU limit is enforced anywhere in the product yet, so no branch may tell a customer
   * they will be stopped at one.
   */
  it('never claims a limit is enforced', () => {
    for (const slug of [...LADDER, 'consultant'] as const) {
      const summary = summarisePlan(entitlement({ plan: slug }));
      expect(summary.detail).not.toMatch(/cannot create|blocked|locked|at the limit/i);
    }
  });

  it('offers the upgrade on the free plan', () => {
    const summary = summarisePlan(entitlement({ plan: 'free', status: null, active: false }));
    expect(summary.showUpgrade).toBe(true);
  });

  /**
   * A failed read is NOT the free plan. Treating it as one is how a paying customer whose
   * network blipped is shown a buy button for something they already own.
   */
  it('does not offer an upgrade when the entitlement could not be read', () => {
    const summary = summarisePlan(null);
    expect(summary.showUpgrade).toBe(false);
    expect(summary.label).not.toBe('Free plan');
    expect(summary.detail).toMatch(/could not read/i);
  });

  it('tells a past_due customer to fix their card, without switching anything off', () => {
    const summary = summarisePlan(entitlement({ status: 'past_due' }));
    expect(summary.warning).toMatch(/update your card/i);
    expect(summary.warning).toMatch(/nothing has been switched off/i);
    expect(summary.showUpgrade).toBe(false);
  });

  it('says when a cancelled-at-period-end plan actually ends', () => {
    const summary = summarisePlan(entitlement({ cancelAtPeriodEnd: true }));
    expect(summary.detail).toMatch(/1 January 2030/);
    expect(summary.showUpgrade).toBe(false);
  });

  it('says when the renewal is due on a healthy plan', () => {
    expect(summarisePlan(entitlement()).detail).toMatch(/Renews 1 January 2030/);
  });

  it('marks a trial as a trial', () => {
    expect(summarisePlan(entitlement({ status: 'trialing' })).label).toBe('Maker plan (trial)');
  });

  /** Nothing on this screen may describe an artefact or a feature that does not exist. */
  it('promises no watermark, no PNG and no file export', () => {
    for (const overrides of [
      {},
      { status: 'past_due' },
      { status: 'trialing' },
      { plan: 'free', status: null, active: false },
      { cancelAtPeriodEnd: true }
    ] as Partial<Entitlement>[]) {
      const summary = summarisePlan(entitlement(overrides));
      const text = `${summary.label} ${summary.detail} ${summary.warning ?? ''}`;
      expect(text).not.toMatch(/watermark|\bPNG\b|\bSVG\b|print ready|unlimited labels/i);
    }
  });

  it('invites a lapsed customer back rather than pretending nothing happened', () => {
    const summary = summarisePlan(
      entitlement({ plan: 'free', status: 'canceled', active: false, cancelAtPeriodEnd: false })
    );
    expect(summary.showUpgrade).toBe(true);
    expect(summary.warning).toMatch(/has ended/i);
    // Their invoices are still in the portal.
    expect(summary.showManageBilling).toBe(true);
  });

  /** A suspended account is not a sales opportunity. */
  it('does not try to sell anything to a suspended account', () => {
    const summary = summarisePlan(entitlement({ membershipStatus: 'suspended', active: false }));
    expect(summary.label).toBe('Account suspended');
    expect(summary.showUpgrade).toBe(false);
    expect(summary.warning).toMatch(/suspended/i);
  });
});

describe('formatPeriodEnd', () => {
  it('formats an ISO instant as a UK date', () => {
    expect(formatPeriodEnd('2030-01-01T00:00:00.000Z')).toBe('1 January 2030');
  });

  it('returns null for missing or unparseable input', () => {
    expect(formatPeriodEnd(null)).toBeNull();
    expect(formatPeriodEnd('not a date')).toBeNull();
  });
});
