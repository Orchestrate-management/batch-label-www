import { describe, it, expect, beforeEach } from 'vitest';
import {
  CHECKOUT_INTENT_KEY,
  CHECKOUT_INTENT_TTL_MS,
  clearCheckoutIntent,
  readCheckoutIntent,
  saveCheckoutIntent } from
'./checkout-intent';

describe('checkout intent', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  /**
   * The point of the whole module: a maker who chose ANNUAL and was interrupted to sign up
   * must not come back to a page silently reset to monthly.
   */
  it('remembers the interval across a signup', () => {
    saveCheckoutIntent('annual');
    expect(readCheckoutIntent()).toBe('annual');
  });

  it('is cleared once used, so it cannot change a later purchase', () => {
    saveCheckoutIntent('annual');
    clearCheckoutIntent();
    expect(readCheckoutIntent()).toBeNull();
  });

  it('returns null when nothing was saved', () => {
    expect(readCheckoutIntent()).toBeNull();
  });

  /** A stale intent from last month must not decide what someone is buying today. */
  it('expires', () => {
    saveCheckoutIntent('annual');
    const justInside = Date.now() + CHECKOUT_INTENT_TTL_MS - 1000;
    const justOutside = Date.now() + CHECKOUT_INTENT_TTL_MS + 1000;
    expect(readCheckoutIntent(justInside)).toBe('annual');
    expect(readCheckoutIntent(justOutside)).toBeNull();
  });

  it('ignores a malformed or tampered value rather than trusting it', () => {
    window.localStorage.setItem(CHECKOUT_INTENT_KEY, 'not json');
    expect(readCheckoutIntent()).toBeNull();

    window.localStorage.setItem(CHECKOUT_INTENT_KEY, JSON.stringify({ interval: 'free_forever', saved_at: Date.now() }));
    expect(readCheckoutIntent()).toBeNull();

    window.localStorage.setItem(CHECKOUT_INTENT_KEY, JSON.stringify({ interval: 'annual' }));
    expect(readCheckoutIntent()).toBeNull();
  });

  it('stores nothing beyond the interval and a timestamp', () => {
    saveCheckoutIntent('monthly');
    const stored = JSON.parse(window.localStorage.getItem(CHECKOUT_INTENT_KEY) as string);
    expect(Object.keys(stored).sort()).toEqual(['interval', 'saved_at']);
  });
});
