import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchConsentPreferences,
  updateConsentPreference,
  syncAdvertisingConsent } from
'./consent-preferences';
import { MARKETING_EMAIL_AGREEMENT, ADVERTISING_AGREEMENT } from './agreements';

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

/** What the membership read returns for a signed-in maker. */
function membershipSays(advertising: boolean, marketingEmail = false) {
  mocks.maybeSingle.mockResolvedValue({
    data: { marketing_email_opt_in: marketingEmail, advertising_opt_in: advertising },
    error: null,
  });
}

/** No row: signed out, or signed in with no membership for this brand yet. */
function noMembership() {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
}

describe('consent preferences', () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.maybeSingle.mockReset();
  });

  describe('fetchConsentPreferences', () => {
    it('reads both flags off the membership', async () => {
      membershipSays(true, true);
      expect(await fetchConsentPreferences()).toEqual({ marketingEmail: true, advertising: true });
    });

    it('returns null when there is no row to read', async () => {
      noMembership();
      expect(await fetchConsentPreferences()).toBeNull();
    });
  });

  describe('updateConsentPreference', () => {
    it('goes through the set_consent RPC, carrying the wording the user saw', async () => {
      await updateConsentPreference(MARKETING_EMAIL_AGREEMENT, true);
      expect(mocks.rpc).toHaveBeenCalledWith('set_consent', {
        p_consent_id: 'marketing_emails',
        p_accepted: true,
        p_brand: 'batchlabel',
        p_title: MARKETING_EMAIL_AGREEMENT.title,
        p_version: MARKETING_EMAIL_AGREEMENT.version,
        p_url: `https://batchlabel.xyz${MARKETING_EMAIL_AGREEMENT.path}`,
      });
    });
  });

  describe('syncAdvertisingConsent (a banner choice reaching the account)', () => {
    it('records the change through set_consent when the account disagrees', async () => {
      membershipSays(false);
      expect(await syncAdvertisingConsent(true)).toBe('written');
      expect(mocks.rpc).toHaveBeenCalledWith(
        'set_consent',
        expect.objectContaining({
          p_consent_id: 'advertising',
          p_accepted: true,
          p_version: ADVERTISING_AGREEMENT.version,
        }),
      );
    });

    it('records a withdrawal the same way', async () => {
      membershipSays(true);
      expect(await syncAdvertisingConsent(false)).toBe('written');
      expect(mocks.rpc).toHaveBeenCalledWith(
        'set_consent',
        expect.objectContaining({ p_consent_id: 'advertising', p_accepted: false }),
      );
    });

    it('writes nothing when the account already says the same thing', async () => {
      membershipSays(true);
      expect(await syncAdvertisingConsent(true)).toBe('unchanged');
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('does nothing for a visitor with no membership, rather than erroring at them', async () => {
      noMembership();
      expect(await syncAdvertisingConsent(true)).toBe('skipped');
      expect(mocks.rpc).not.toHaveBeenCalled();
    });

    it('reports a failed write instead of pretending it landed', async () => {
      membershipSays(false);
      mocks.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
      expect(await syncAdvertisingConsent(true)).toBe('failed');
    });

    it('never writes the terms, whatever the banner says', async () => {
      membershipSays(false);
      await syncAdvertisingConsent(true);
      const ids = mocks.rpc.mock.calls.map(([, args]) => (args as {p_consent_id: string;}).p_consent_id);
      expect(ids).not.toContain('terms_of_service');
    });
  });
});
