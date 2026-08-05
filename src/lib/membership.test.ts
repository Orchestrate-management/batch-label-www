import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  finishSetupDestination,
  signedInDestination,
  completionPayload,
  completeOAuthSignup,
  fetchMembershipState,
  FINISH_SETUP_PATH } from
'./membership';
import { ATTRIBUTION_STORAGE_KEY } from './attribution';
import { CONSENT_STORAGE_KEY } from './consent';
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
};

describe('membership', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.maybeSingle.mockReset();
    window.localStorage.clear();
  });

  /**
   * The two routing rules, kept as plain functions so the decision that produced the
   * "why am I on www/dashboard" complaint is asserted rather than left in a component.
   *
   * NEITHER OF THEM MAY EVER RETURN A PATH ON THIS SITE OTHER THAN /finish-setup. That is
   * the rule the deleted dashboard broke, and the last test in this block is what would
   * catch it coming back.
   */
  describe('finishSetupDestination (where Google returns)', () => {
    it('shows the form to a Google user who has no membership yet', () => {
      expect(finishSetupDestination('needs_setup')).toBe('render');
    });

    it('hands a returning Google user to the app rather than re-asking for consent', () => {
      expect(finishSetupDestination('complete')).toBe('app');
    });

    /**
     * A flaky membership read must never push somebody PAST a consent gate. Re-asking
     * costs one screen; skipping it means a user in the product with no Terms acceptance
     * on file. complete_oauth_signup is idempotent, so a second submit provisions nothing.
     */
    it('shows the form rather than handing over when the membership read failed', () => {
      expect(finishSetupDestination('unknown')).toBe('render');
    });

    it('never sends anyone to a page on this site', () => {
      (['complete', 'needs_setup', 'unknown'] as const).forEach((state) => {
        expect(finishSetupDestination(state)).not.toBe('finish_setup');
      });
    });
  });

  describe('signedInDestination (already signed in, opening /log-in)', () => {
    it('sends a provisioned maker straight to the app, with no form to fill in', () => {
      expect(signedInDestination('complete')).toBe('app');
    });

    it('sends a half-finished Google signup to the completion screen, not the app', () => {
      expect(signedInDestination('needs_setup')).toBe('finish_setup');
      expect(FINISH_SETUP_PATH).toBe('/finish-setup');
    });

    /**
     * The opposite call from the rule above, deliberately. There is no consent gate to
     * skip here and this person already has an account, so a failed read resolves the way
     * a successful password login on this same page already resolves: into the app.
     */
    it('sends them to the app when the membership read failed', () => {
      expect(signedInDestination('unknown')).toBe('app');
    });

    it('never leaves a signed-in maker sitting on a login form', () => {
      (['complete', 'needs_setup', 'unknown'] as const).forEach((state) => {
        expect(signedInDestination(state)).not.toBe('render');
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
      });
      expect(payload).toMatchObject({
        p_brand: 'batchlabel',
        p_business_name: 'Willow & Wick',
        p_terms_accepted: true,
        p_marketing_email_opt_in: true,
        p_advertising_opt_in: false,
      });
    });

    it('derives advertising from the cookie banner, which survives the Google redirect', () => {
      window.localStorage.setItem(
        CONSENT_STORAGE_KEY,
        JSON.stringify({ analytics: true, marketing: true, decided_at: '2026-07-30', version: 1 }),
      );
      expect(completionPayload(ACCEPTED).p_advertising_opt_in).toBe(true);
    });

    it('sends false for advertising when the banner has never been answered', () => {
      expect(completionPayload(ACCEPTED).p_advertising_opt_in).toBe(false);
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

    it('re-applies only the email choice on a repeat submit, never advertising', async () => {
      // Nobody expressed anything about advertising on this form, and this browser may
      // never have answered the banner. Writing a derived false would silently withdraw
      // a consent given on another device.
      mocks.rpc.mockResolvedValue({ data: false, error: null });
      await completeOAuthSignup({ ...ACCEPTED, marketingEmailOptIn: true });

      const consentWrites = mocks.rpc.mock.calls.filter(([name]) => name === 'set_consent');
      expect(consentWrites).toHaveLength(1);
      expect(consentWrites[0][1]).toMatchObject({
        p_consent_id: 'marketing_emails',
        p_accepted: true,
      });
    });

    it('turns a database error into a sentence a maker can read', async () => {
      mocks.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
      const result = await completeOAuthSignup(ACCEPTED);
      expect(result.error).toBe('Could not finish setting up your account. Please try again.');
      expect(result.provisioned).toBe(false);
    });
  });
});
