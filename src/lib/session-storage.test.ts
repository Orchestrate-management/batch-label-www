import { describe, it, expect, beforeEach } from 'vitest';
import { sharedCookieStorage, SESSION_COOKIE_CONFIG } from './session-storage';

const KEY = 'sb-cqzrwfresuiktgzhkhok-auth-token';

function clearAllCookies() {
  for (const row of document.cookie.split('; ')) {
    const name = row.split('=')[0];
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
}

describe('shared cookie session storage', () => {
  beforeEach(() => {
    clearAllCookies();
  });

  it('round-trips a small session in a single cookie', () => {
    sharedCookieStorage.setItem(KEY, 'a-small-session');
    expect(sharedCookieStorage.getItem(KEY)).toBe('a-small-session');
    expect(document.cookie).toContain(KEY);
    expect(document.cookie).not.toContain(`${KEY}.0`);
  });

  it('returns null when nothing is stored', () => {
    expect(sharedCookieStorage.getItem(KEY)).toBeNull();
  });

  /**
   * The whole reason this adapter exists. A real Supabase session regularly runs
   * past the ~4KB per-cookie limit, and browsers drop an oversized cookie rather
   * than erroring — which surfaces as users being logged out at random.
   */
  it('splits an oversized session across chunks and reassembles it exactly', () => {
    const big = 'x'.repeat(SESSION_COOKIE_CONFIG.CHUNK_SIZE * 3 + 137);
    sharedCookieStorage.setItem(KEY, big);

    expect(document.cookie).toContain(`${KEY}.0`);
    expect(document.cookie).toContain(`${KEY}.3`);
    expect(sharedCookieStorage.getItem(KEY)).toBe(big);
    expect(sharedCookieStorage.getItem(KEY)?.length).toBe(big.length);
  });

  it('keeps no unchunked copy once a value is chunked, so reads cannot pick the stale one', () => {
    sharedCookieStorage.setItem(KEY, 'short');
    const big = 'y'.repeat(SESSION_COOKIE_CONFIG.CHUNK_SIZE + 10);
    sharedCookieStorage.setItem(KEY, big);

    expect(sharedCookieStorage.getItem(KEY)).toBe(big);
    // The single-cookie form must be gone, or getItem would short-circuit on it.
    const unchunked = document.cookie.
    split('; ').
    find((r) => r.startsWith(`${KEY}=`));
    expect(unchunked).toBeUndefined();
  });

  it('clears the stale tail when a session gets shorter', () => {
    const big = 'z'.repeat(SESSION_COOKIE_CONFIG.CHUNK_SIZE * 3);
    sharedCookieStorage.setItem(KEY, big);
    expect(document.cookie).toContain(`${KEY}.2`);

    const smaller = 'w'.repeat(SESSION_COOKIE_CONFIG.CHUNK_SIZE + 5);
    sharedCookieStorage.setItem(KEY, smaller);

    // Round-trip must be exact — a leftover .2 would be appended to the value.
    expect(sharedCookieStorage.getItem(KEY)).toBe(smaller);
    expect(document.cookie).not.toContain(`${KEY}.2`);
  });

  it('removes every chunk on sign out', () => {
    sharedCookieStorage.setItem(KEY, 'q'.repeat(SESSION_COOKIE_CONFIG.CHUNK_SIZE * 2));
    sharedCookieStorage.removeItem(KEY);

    expect(sharedCookieStorage.getItem(KEY)).toBeNull();
    expect(document.cookie).not.toContain(KEY);
  });

  it('survives a value containing characters that need encoding', () => {
    const tricky = JSON.stringify({ token: 'a;b=c d', user: { name: 'Willow & Wick' } });
    sharedCookieStorage.setItem(KEY, tricky);
    expect(sharedCookieStorage.getItem(KEY)).toBe(tricky);
  });
});
