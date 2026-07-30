import { describe, it, expect } from 'vitest';
import { APP_URL, resolveHandoffTarget, __testing } from './app-handoff';

const { isAllowedDestination } = __testing;

describe('app handoff', () => {
  it('defaults to the app front door', () => {
    expect(resolveHandoffTarget(null)).toBe(APP_URL);
    expect(resolveHandoffTarget(undefined)).toBe(APP_URL);
    expect(resolveHandoffTarget('')).toBe(APP_URL);
  });

  it('honours a deep link back into the app', () => {
    expect(resolveHandoffTarget('https://app.batchlabel.xyz/products/123')).toBe(
      'https://app.batchlabel.xyz/products/123'
    );
  });

  it('accepts a relative path, resolved against the app', () => {
    expect(resolveHandoffTarget('/materials')).toBe('https://app.batchlabel.xyz/materials');
  });

  /**
   * `next` arrives from the query string, so it is attacker controllable. An
   * unchecked value here is an open redirect, and an unusually convincing one:
   * it fires the instant someone completes a genuine login.
   */
  describe('rejects destinations that are not the app', () => {
    const hostile = [
    'https://evil.example.com/phish',
    'https://app.batchlabel.xyz.evil.com/',
    'https://evilbatchlabel.xyz/',
    'javascript:alert(1)',
    '//evil.example.com',
    'https://www.batchlabel.xyz@evil.example.com/'];


    for (const url of hostile) {
      it(`refuses ${url}`, () => {
        expect(isAllowedDestination(url)).toBe(false);
        expect(resolveHandoffTarget(url)).toBe(APP_URL);
      });
    }
  });

  it('allows localhost so the app can be developed against', () => {
    expect(isAllowedDestination('http://localhost:5174/products')).toBe(true);
  });

  /**
   * The localhost allowance is for developing the app against a local www. Left on in a
   * production build it is an open redirect — a login link could bounce a freshly
   * authenticated person to an attacker-controlled host merely named "localhost". The
   * second argument is what the dev-build check resolves to, so both branches are
   * testable rather than only the one this test run happens to be in.
   */
  it('refuses localhost in a production build', () => {
    expect(isAllowedDestination('http://localhost:5174/products', false)).toBe(false);
    expect(isAllowedDestination('http://127.0.0.1:5174/products', false)).toBe(false);
    // The real app is still fine with the allowance off.
    expect(isAllowedDestination('https://app.batchlabel.xyz/products', false)).toBe(true);
  });
});
