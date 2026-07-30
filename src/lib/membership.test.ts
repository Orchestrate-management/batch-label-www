import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  membershipRedirect,
  completionPayload,
  completeOAuthSignup,
  fetchMembershipState,
  FINISH_SETUP_PATH,
  DASHBOARD_PATH } from
'./membership';
import { ATTRIBUTION_STORAGE_KEY } from './attribution';
import { TERMS_AGREEMENT } from './agreements';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (name: string, args: unknown) => mocks.rpc(name, args),
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => mocks.maybeSingle() }),
      }),
    }),
  },
  isSupabaseConfigured: true,
  MISSING_CONFIG_MESSAGE: 'not connected',
}));

const ACCEPTED = {
  businessName: 'Willow & Wick',
  termsAccepted: true,
  marketingEmailOptIn: false,
  advertisingOptIn: false,
};

describe('membership', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.maybeSingle.mockReset();
    window.localStorage.clear();
  });

  describe('membershipRedirect (the completion gate)', () => {
    it('sends a signed-in user with no membership to the completion screen', () => {
      expect(membershipRedirect('needs_setup', 'dashboard')).toBe(FINISH_SETUP_PATH);
    });

    it('lets a provisioned user into the dashboard', () => {
      expect(membershipRedirect('complete', 'dashboard')).toBeNull();
    });

    it('does not re-ask a returning user for consent', () => {
      expect(membershipRedirect('complete', 'finish_setup')).toBe(DASHBOARD_PATH);
    });

    it('shows the completion screen to a user who still needs it', () => {
      expect(membershipRedirect('needs_setup', 'finish_setup')).toBeNull();
    });

    it('never redirects on an unknown state, from either side, so there is no loop', () => {
      expect(membershipRedirect('unknown', 'dashboard')).toBeNull();
      expect(membershipRedirect('unknown', 'finish_setup')).toBeNull();
    });

    it('never has both pages redirecting at once for any state', () => {
      (['complete', 'needs_setup', 'unknown'] as const).forEach((state) => {
        const both =
          membershipRedirect(state, 'dashboard') !== null &&
          membershipRedirect(state, 'finish_setup') !== null;
        expect(both).toBe(false);
      });
    });
  });

  describe('fetchMembershipState', () => {
    it('reports complete when a membership row comes back', async () => {
      mocks.maybeSingle.mockResolvedValue({ data: { id: 'm1' }, error: null });
      expect(await fetchMembershipState()).toBe('complete');
    });

    it('reports needs_setup when there is no row for this brand', async () => {
      mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
      expect(await fetchMembershipState()).toBe('needs_setup');
    });

    it('reports unknown on a read failure rather than pushing a customer into signup', async () => {
      mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'network' } });
      expect(await fetchMembershipState()).toBe('unknown');
    });
  });

  describe('completionPayload', () => {
    it('sends the brand, the trimmed business name and the consent booleans', () => {
      const payload = completionPayload({
        businessName: '  Willow & Wick  ',
        termsAccepted: true,
        marketingEmailOptIn: true,
        advertisingOptIn: false,
      });
      expect(payload).toMatchObject({
        p_brand: 'batchlabel',
        p_business_name: 'Willow & Wick',
        p_terms_accepted: true,
        p_marketing_email_opt_in: true,
        p_advertising_opt_in: false,
      });
    });

    it('sends a null business name rather than an empty string', () => {
      expect(completionPayload({ ...ACCEPTED, businessName: '   ' }).p_business_name).toBeNull();
    });

    it('never carries the user id — the server takes it from the JWT', () => {
      expect(Object.keys(completionPayload(ACCEPTED))).not.toContain('p_user_id');
    });

    it('sends document snapshots with NO accepted flag or timestamp, so acceptance cannot be forged', () => {
      const { p_agreements } = completionPayload({ ...ACCEPTED, marketingEmailOptIn: true });
      Object.values(p_agreements).forEach((doc) => {
        expect(doc).not.toHaveProperty('accepted');
        expect(doc).not.toHaveProperty('accepted_at');
      });
    });

    it('pins the exact terms version and url that were rendered', () => {
      const { p_agreements } = completionPayload(ACCEPTED);
      expect(p_agreements.terms).toMatchObject({
        id: TERMS_AGREEMENT.id,
        version: TERMS_AGREEMENT.version,
        url: `https://batchlabel.co.uk${TERMS_AGREEMENT.path}`,
      });
    });

    it('carries first-touch attribution, which survives the Google redirect in storage', () => {
      window.localStorage.setItem(
        ATTRIBUTION_STORAGE_KEY,
        JSON.stringify({ utm_source: 'google', utm_medium: 'cpc', gclid: 'g1' }),
      );
      expect(completionPayload(ACCEPTED).p_attribution).toMatchObject({
        utm_source: 'google',
        utm_medium: 'cpc',
        gclid: 'g1',
      });
    });
  });

  describe('completeOAuthSignup', () => {
    it('refuses to submit when the terms are not ticked, and never calls the database', async () => {
      const result = await completeOAuthSignup({ ...ACCEPTED, termsAccepted: false });
      expect(result.error).toMatch(/Terms of Service/);
      expect(result.provisioned).toBe(false);
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('calls complete_oauth_signup with the payload and reports the membership as provisioned', async () => {
      mocks.rpc.mockResolvedValue({ data: true, error: null });
      const result = await completeOAuthSignup(ACCEPTED);
      expect(mocks.rpc).toHaveBeenCalledWith(
        'complete_oauth_signup',
        expect.objectContaining({ p_brand: 'batchlabel', p_terms_accepted: true }),
      );
      expect(result).toEqual({ error: null, provisioned: true });
    });

    it('reports provisioned:false when the membership already existed, so a repeat submit is not a signup', async () => {
      mocks.rpc.mockResolvedValue({ data: false, error: null });
      expect(await completeOAuthSignup(ACCEPTED)).toEqual({ error: null, provisioned: false });
    });

    it('turns a database error into a sentence a maker can read', async () => {
      mocks.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
      const result = await completeOAuthSignup(ACCEPTED);
      expect(result.error).toBe('Could not finish setting up your account. Please try again.');
      expect(result.provisioned).toBe(false);
    });
  });
});
