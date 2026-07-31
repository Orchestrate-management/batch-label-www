import { beforeEach, describe, expect, it } from 'vitest';
import {
  captureRecoveryEntry,
  RECOVERY_ENTRY_STORAGE_KEY } from
'./recovery-entry';

/**
 * The gate on /reset-password.
 *
 * This decides whether a page load may change a password without asking for the
 * old one. Getting it wrong in the permissive direction turns a shared session
 * cookie into an account takeover, so the negative cases matter more than the
 * positive one.
 */

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('a genuine recovery link', () => {
  it('is recognised from the implicit-flow fragment', () => {
    const entry = captureRecoveryEntry(
      '',
      '#access_token=abc&refresh_token=def&expires_in=3600&token_type=bearer&type=recovery'
    );
    expect(entry).toEqual({ kind: 'recovery' });
  });

  it('is recognised from the query string too', () => {
    expect(captureRecoveryEntry('?type=recovery', '')).toEqual({ kind: 'recovery' });
  });

  it('survives a reload, because the fragment does not', () => {
    captureRecoveryEntry('', '#access_token=abc&type=recovery');
    // auth-js wipes window.location.hash the moment it reads it, so a refresh
    // part way through a real reset arrives with a bare URL.
    expect(captureRecoveryEntry('', '')).toEqual({ kind: 'recovery' });
  });

  it('does not leak to another tab, because the marker is session scoped', () => {
    captureRecoveryEntry('', '#type=recovery');
    expect(window.sessionStorage.getItem(RECOVERY_ENTRY_STORAGE_KEY)).toBe('1');
    // sessionStorage is per tab. A second tab starts with none of this.
    window.sessionStorage.clear();
    expect(captureRecoveryEntry('', '')).toEqual({ kind: 'none' });
  });
});

describe('a link that did not work', () => {
  it('reports an expired one-time token', () => {
    const entry = captureRecoveryEntry(
      '',
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'
    );
    expect(entry).toEqual({
      kind: 'link_failed',
      code: 'otp_expired',
      description: 'Email link is invalid or has expired'
    });
  });

  it('reports an error that arrives in the query string', () => {
    expect(captureRecoveryEntry('?error=access_denied', '')).toMatchObject({
      kind: 'link_failed'
    });
  });

  it('clears an earlier marker, so a dead link cannot ride on a live one', () => {
    captureRecoveryEntry('', '#type=recovery');
    const entry = captureRecoveryEntry('', '#error=access_denied&error_code=otp_expired');

    expect(entry.kind).toBe('link_failed');
    expect(window.sessionStorage.getItem(RECOVERY_ENTRY_STORAGE_KEY)).toBeNull();
    // And the next bare load is not a recovery either.
    expect(captureRecoveryEntry('', '')).toEqual({ kind: 'none' });
  });
});

describe('no link', () => {
  it('is none for a bare URL', () => {
    expect(captureRecoveryEntry('', '')).toEqual({ kind: 'none' });
  });

  it('is none for an unrelated fragment', () => {
    expect(captureRecoveryEntry('?utm_source=email', '#section-two')).toEqual({ kind: 'none' });
  });

  /**
   * The whole point. A signed-in maker arrives at this page with a perfectly
   * valid session, because the session cookie is shared across .batchlabel.xyz
   * for 400 days. Nothing about that is a recovery link, and this module must
   * never say otherwise — it cannot see the session, which is precisely why it
   * cannot be fooled by one.
   */
  it('is none for a magic link or an OAuth return, which are not recovery', () => {
    expect(captureRecoveryEntry('', '#access_token=abc&type=magiclink')).toEqual({ kind: 'none' });
    expect(captureRecoveryEntry('', '#access_token=abc&type=signup')).toEqual({ kind: 'none' });
    expect(captureRecoveryEntry('', '#access_token=abc')).toEqual({ kind: 'none' });
  });
});

describe('when sessionStorage is unavailable', () => {
  it('still answers from the URL', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('blocked');
      }
    });
    try {
      expect(captureRecoveryEntry('', '#type=recovery')).toEqual({ kind: 'recovery' });
      expect(captureRecoveryEntry('', '')).toEqual({ kind: 'none' });
    } finally {
      if (original) Object.defineProperty(window, 'sessionStorage', original);
    }
  });
});
