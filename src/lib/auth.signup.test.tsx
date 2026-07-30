/**
 * Signup writes the advertising opt-in it derived from the cookie banner.
 *
 * The signup form does not ask about advertising any more, so the only way the flag can
 * be right is if these calls read the banner. That is what this file pins down.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth';
import { CONSENT_STORAGE_KEY } from './consent';

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithOtp: vi.fn(),
}));

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signUp: (args: unknown) => mocks.signUp(args),
      signInWithOtp: (args: unknown) => mocks.signInWithOtp(args),
    },
  },
  isSupabaseConfigured: true,
  MISSING_CONFIG_MESSAGE: 'not connected',
}));

function Probe() {
  const { signUpWithPassword, sendMagicLink } = useAuth();
  return (
    <>
      <button
        onClick={() =>
          signUpWithPassword({
            email: 'maker@example.com',
            password: 'a-long-phrase',
            businessName: 'Willow & Wick',
            marketingEmailOptIn: false,
          })
        }
      >
        password
      </button>
      <button
        onClick={() =>
          sendMagicLink({
            email: 'maker@example.com',
            signUp: { businessName: 'Willow & Wick', marketingEmailOptIn: false },
          })
        }
      >
        magic link
      </button>
    </>
  );
}

function storeBannerChoice(marketing: boolean) {
  window.localStorage.setItem(
    CONSENT_STORAGE_KEY,
    JSON.stringify({ analytics: true, marketing, decided_at: '2026-07-30', version: 1 }),
  );
}

async function press(label: string) {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: label }));
}

const metadata = (mock: typeof mocks.signUp) =>
  mock.mock.calls[0][0].options.data as Record<string, any>;

describe('signup derives advertising from the cookie banner', () => {
  beforeEach(() => {
    mocks.signUp.mockReset();
    mocks.signUp.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mocks.signInWithOtp.mockReset();
    mocks.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    window.localStorage.clear();
    window.dataLayer = [];
  });

  it('sends true when the maker accepted marketing cookies', async () => {
    storeBannerChoice(true);
    await press('password');

    await waitFor(() => expect(mocks.signUp).toHaveBeenCalled());
    expect(metadata(mocks.signUp).advertising_opt_in).toBe(true);
    expect(metadata(mocks.signUp).consents.advertising).toMatchObject({
      id: 'advertising',
      accepted: true,
    });
  });

  it('sends false when the maker rejected them', async () => {
    storeBannerChoice(false);
    await press('password');

    await waitFor(() => expect(mocks.signUp).toHaveBeenCalled());
    expect(metadata(mocks.signUp).advertising_opt_in).toBe(false);
    expect(metadata(mocks.signUp).consents.advertising.accepted).toBe(false);
  });

  it('sends false when the banner has never been answered', async () => {
    await press('password');

    await waitFor(() => expect(mocks.signUp).toHaveBeenCalled());
    expect(metadata(mocks.signUp).advertising_opt_in).toBe(false);
  });

  it('never carries an acceptance timestamp, which the server stamps', async () => {
    storeBannerChoice(true);
    await press('password');

    await waitFor(() => expect(mocks.signUp).toHaveBeenCalled());
    Object.values(metadata(mocks.signUp).consents).forEach((snapshot) => {
      expect(snapshot).not.toHaveProperty('accepted_at');
    });
  });

  it('derives it on the magic link path too', async () => {
    storeBannerChoice(true);
    await press('magic link');

    await waitFor(() => expect(mocks.signInWithOtp).toHaveBeenCalled());
    expect(metadata(mocks.signInWithOtp).advertising_opt_in).toBe(true);
  });

  it('reports the derived value on the sign_up_completed event, not a ticked box', async () => {
    storeBannerChoice(true);
    await press('password');

    await waitFor(() => expect(mocks.signUp).toHaveBeenCalled());
    await waitFor(() => {
      const events = (window.dataLayer ?? []) as Array<Record<string, unknown>>;
      const completed = events.find((e) => e.event === 'sign_up_completed');
      expect(completed).toMatchObject({ advertising_opt_in: true, marketing_email_opt_in: false });
    });
  });
});
