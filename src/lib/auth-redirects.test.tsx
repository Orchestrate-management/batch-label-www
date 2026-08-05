import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from './auth';
import { APP_URL } from './app-handoff';

/**
 * Where each auth flow sends people afterwards.
 *
 * Every one of them ends in the product. Two of them cannot go there DIRECTLY, and the
 * reasons are easy to forget, which is why they are asserted rather than left to a comment:
 *
 *  - Google must return to www, because an OAuth call carries no brand, business name or
 *    consent, so the account is not really made until /finish-setup collects them. That
 *    screen then hands the maker over itself — including the returning user, who is not
 *    re-asked for anything and presses nothing.
 *  - The password reset must land on www's /reset-password, because that is where the
 *    recovery gate lives. Sending it to the app would strand the maker with a recovery
 *    token and nothing to spend it on. That page hands over too, once the password is set.
 *
 * Someone "tidying" these to all point at the app would break both flows in ways no
 * other test would notice. Someone tidying them to point at a page of this site would
 * reintroduce the detour this file's Google case is named after.
 */
const mocks = vi.hoisted(() => ({
  signUp: vi.fn((_args: unknown) =>
    Promise.resolve({ data: { user: { id: 'u1' } }, error: null })
  ),
  signInWithOtp: vi.fn((_args: unknown) => Promise.resolve({ error: null })),
  signInWithOAuth: vi.fn((_args: unknown) => Promise.resolve({ error: null })),
  resetPasswordForEmail: vi.fn((_email: unknown, _opts: unknown) =>
    Promise.resolve({ error: null })
  )
}));

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signUp: (a: unknown) => mocks.signUp(a),
      signInWithOtp: (a: unknown) => mocks.signInWithOtp(a),
      signInWithOAuth: (a: unknown) => mocks.signInWithOAuth(a),
      resetPasswordForEmail: (a: unknown, b: unknown) => mocks.resetPasswordForEmail(a, b)
    }
  },
  isSupabaseConfigured: true,
  MISSING_CONFIG_MESSAGE: 'not connected'
}));

vi.mock('./analytics', () => ({
  trackSignUpStarted: () => undefined,
  trackSignUpCompleted: () => Promise.resolve()
}));

function wrapper({ children }: {children: React.ReactNode;}) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('where each auth flow lands', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockClear());
  });

  it('sends a confirmed email signup straight into the app, not to this site', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.signUpWithPassword({
        email: 'maker@example.com',
        password: 'a-good-passphrase',
        businessName: 'Willow & Wick',
        marketingEmailOptIn: false
      });
    });
    const options = mocks.signUp.mock.calls[0][0] as unknown as {options: {emailRedirectTo: string;};};
    expect(options.options.emailRedirectTo).toBe(APP_URL);
    expect(options.options.emailRedirectTo).not.toContain('/dashboard');
  });

  it('sends a magic link into the app too', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.sendMagicLink({ email: 'maker@example.com' });
    });
    const options = mocks.signInWithOtp.mock.calls[0][0] as unknown as {options: {emailRedirectTo: string;};};
    expect(options.options.emailRedirectTo).toBe(APP_URL);
  });

  /**
   * The redirect target is baked into the URL sent to Google, so it is the one part of
   * this flow that cannot be corrected after the fact — a wrong value is a round trip
   * that ends somewhere else entirely.
   *
   * It used to be /dashboard, and that is the bug: a returning Google user came back
   * signed in and was left standing on this site's account page. It must be /finish-setup,
   * which is the only route that can tell a new Google user from a returning one, because
   * the answer is not knowable until Supabase has made the session.
   */
  it('keeps Google on this site, because /finish-setup has to collect the terms', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.signInWithGoogle({ intent: 'sign_up' });
    });
    const options = mocks.signInWithOAuth.mock.calls[0][0] as unknown as {options: {redirectTo: string;};};
    expect(options.options.redirectTo).not.toBe(APP_URL);
    expect(options.options.redirectTo).toContain('/finish-setup');
  });

  it('does not return a Google login to a dashboard on this site, which no longer exists', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.signInWithGoogle({ intent: 'log_in' });
    });
    const options = mocks.signInWithOAuth.mock.calls[0][0] as unknown as {options: {redirectTo: string;};};
    expect(options.options.redirectTo).not.toContain('/dashboard');
  });

  /**
   * Signup and login are the same call to Google and must come back to the same place.
   * `intent` decides whether this counts as a signup for analytics and nothing else — an
   * OAuth redirect cannot carry which button was pressed, so a route that depended on it
   * would be a route that guessed.
   */
  it('returns signup and login to the same place, because Google cannot tell them apart', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.signInWithGoogle({ intent: 'sign_up' });
      await result.current.signInWithGoogle({ intent: 'log_in' });
    });
    const [first, second] = mocks.signInWithOAuth.mock.calls.map(
      (call) => (call[0] as unknown as {options: {redirectTo: string;};}).options.redirectTo
    );
    expect(first).toBe(second);
  });

  it('keeps the password reset on this site, where the recovery gate lives', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.sendPasswordReset('maker@example.com');
    });
    const options = mocks.resetPasswordForEmail.mock.calls[0][1] as unknown as {redirectTo: string;};
    expect(options.redirectTo).toContain('/reset-password');
    expect(options.redirectTo).not.toBe(APP_URL);
  });
});
