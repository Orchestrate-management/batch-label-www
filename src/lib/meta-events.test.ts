import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  buildFbc,
  isValidFbc,
  isValidFbp,
  isoToUnixMs,
  purchaseEventId,
  randomEventId,
  registrationEventId } from
'./meta-events';

describe('meta-events: the deduplication contract', () => {
  /**
   * The format is not cosmetic. Meta parses `fbc` and matches on the whole string, so a
   * wrong separator, a wrong subdomain index or seconds-instead-of-milliseconds all produce
   * a value that looks plausible in a log and matches nothing.
   */
  describe('buildFbc', () => {
    it('produces fb.1.<unix_ms>.<fbclid>', () => {
      expect(buildFbc('IwAR0abcDEF', 1767225600000)).toBe('fb.1.1767225600000.IwAR0abcDEF');
    });

    it('uses subdomain index 1, which is what Meta specifies for a reconstructed value', () => {
      const fbc = buildFbc('abc', 1767225600000);
      expect(fbc!.split('.')[1]).toBe('1');
    });

    it('uses MILLISECONDS, not seconds', () => {
      const seconds = 1767225600;
      const fbc = buildFbc('abc', seconds * 1000);
      expect(fbc).toBe(`fb.1.${seconds * 1000}.abc`);
      // A 10-digit timestamp would be seconds and is the classic mistake.
      expect(fbc!.split('.')[2]).toHaveLength(13);
    });

    it('floors a fractional timestamp rather than emitting a decimal point', () => {
      // A decimal would add a fifth segment and break parsing entirely.
      expect(buildFbc('abc', 1767225600123.9)).toBe('fb.1.1767225600123.abc');
      expect(buildFbc('abc', 1767225600123.9)!.split('.')).toHaveLength(4);
    });

    it('trims surrounding whitespace off the fbclid', () => {
      expect(buildFbc('  abc  ', 1767225600000)).toBe('fb.1.1767225600000.abc');
    });

    it('returns null without an fbclid: no click id, no fbc', () => {
      expect(buildFbc(null, 1767225600000)).toBeNull();
      expect(buildFbc(undefined, 1767225600000)).toBeNull();
      expect(buildFbc('', 1767225600000)).toBeNull();
      expect(buildFbc('   ', 1767225600000)).toBeNull();
    });

    it('returns null rather than fabricating a timestamp', () => {
      expect(buildFbc('abc', null)).toBeNull();
      expect(buildFbc('abc', undefined)).toBeNull();
      expect(buildFbc('abc', Number.NaN)).toBeNull();
      expect(buildFbc('abc', 0)).toBeNull();
      expect(buildFbc('abc', -1)).toBeNull();
    });
  });

  describe('isoToUnixMs', () => {
    it('converts the ISO first_seen_at the attribution record stores', () => {
      expect(isoToUnixMs('2026-01-01T00:00:00.000Z')).toBe(1767225600000);
    });

    it('returns null for absent or unparseable values, so the caller can choose', () => {
      expect(isoToUnixMs(null)).toBeNull();
      expect(isoToUnixMs(undefined)).toBeNull();
      expect(isoToUnixMs('')).toBeNull();
      expect(isoToUnixMs('   ')).toBeNull();
      expect(isoToUnixMs('not a date')).toBeNull();
    });
  });

  /**
   * The ids below are the entire defence against double-counting. If they stop being
   * derived from the identity of the action, the browser and the server can no longer
   * arrive at the same string independently, and Meta counts one conversion twice.
   */
  describe('purchaseEventId', () => {
    it('is the Stripe Checkout Session id verbatim', () => {
      expect(purchaseEventId('cs_test_a1b2c3')).toBe('cs_test_a1b2c3');
    });

    it('is deterministic: the same session always yields the same id', () => {
      expect(purchaseEventId('cs_live_9')).toBe(purchaseEventId('cs_live_9'));
    });

    it('is NOT random, which is what makes a Stripe webhook retry safe', () => {
      const first = purchaseEventId('cs_test_retry');
      const second = purchaseEventId('cs_test_retry');
      expect(first).toBe(second);
      expect(first).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    });
  });

  describe('registrationEventId', () => {
    it('is namespaced so it cannot collide with a purchase id', () => {
      expect(registrationEventId('a'.repeat(64))).toBe(`signup.${'a'.repeat(64)}`);
    });

    it('is derived from the email hash, which every signup path has', () => {
      // The user id is deliberately not used: a magic-link signup has none at this point.
      expect(registrationEventId('abc')).toBe(registrationEventId('abc'));
    });

    it('returns null with no hash, rather than inventing an undeduplicable id', () => {
      // This is the advertising-consent-denied case. No hash is computed, so there is no
      // stable id — and a random one would look deduplicable while deduplicating nothing.
      expect(registrationEventId(null)).toBeNull();
      expect(registrationEventId(undefined)).toBeNull();
      expect(registrationEventId('')).toBeNull();
    });
  });

  describe('randomEventId', () => {
    it('is unique per call, for events that exist in exactly one place', () => {
      const ids = new Set(Array.from({ length: 200 }, () => randomEventId()));
      expect(ids.size).toBe(200);
    });

    it('never throws, even where crypto.randomUUID is unavailable', () => {
      // A tracking helper that throws takes a page render down with it, so the fallback is
      // worth having even though every runtime this ships to has randomUUID.
      vi.stubGlobal('crypto', undefined);
      try {
        expect(randomEventId()).toMatch(/^e\./);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  /**
   * These validate values that arrive from a browser. Without them, a caller could put
   * arbitrary text into Stripe metadata and, from there, into an event attributed to our
   * Meta dataset.
   */
  describe('cookie validators', () => {
    it('accepts a real _fbp', () => {
      expect(isValidFbp('fb.1.1767225600000.1234567890')).toBe(true);
    });

    it('rejects anything that is not the documented shape', () => {
      expect(isValidFbp('')).toBe(false);
      expect(isValidFbp('fb.1.abc.123')).toBe(false);
      expect(isValidFbp('nonsense')).toBe(false);
      expect(isValidFbp('fb.1.1767225600000')).toBe(false);
      expect(isValidFbp(null)).toBe(false);
      expect(isValidFbp(42)).toBe(false);
      expect(isValidFbp({})).toBe(false);
    });

    it('accepts a real _fbc, whose last segment is an opaque token', () => {
      expect(isValidFbc('fb.1.1767225600000.IwAR0Xyz-_123')).toBe(true);
    });

    it('rejects an _fbc carrying anything but a URL-safe token', () => {
      expect(isValidFbc('fb.1.1767225600000.has spaces')).toBe(false);
      expect(isValidFbc('fb.1.1767225600000.<script>')).toBe(false);
      expect(isValidFbc('fb.1.1767225600000.')).toBe(false);
      expect(isValidFbc(null)).toBe(false);
    });

    it('caps the length, so it cannot blow Stripe metadata s 500-char limit', () => {
      expect(isValidFbc(`fb.1.1767225600000.${'a'.repeat(400)}`)).toBe(true);
      expect(isValidFbc(`fb.1.1767225600000.${'a'.repeat(401)}`)).toBe(false);
    });
  });

  /**
   * The structural guarantee. This module is imported by the browser Pixel AND by a Vercel
   * Function, so a browser global or a secret in here breaks one of the two — the browser
   * one at build time, the server one by dragging `window` into a serverless runtime.
   *
   * Asserted against the source text rather than the behaviour, because the failure mode is
   * a future edit adding an import, and by the time behaviour catches it the damage is a
   * production incident rather than a red test.
   */
  describe('isomorphic purity', () => {
    const source = readFileSync(join(process.cwd(), 'src/lib/meta-events.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    it('imports nothing at all', () => {
      expect(code).not.toMatch(/^\s*import\s/m);
    });

    it('touches no browser global', () => {
      expect(code).not.toMatch(/\bwindow\b/);
      expect(code).not.toMatch(/\bdocument\b/);
      expect(code).not.toMatch(/\blocalStorage\b/);
    });

    it('reads no environment and therefore holds no secret', () => {
      expect(code).not.toMatch(/process\.env/);
      expect(code).not.toMatch(/import\.meta/);
      expect(code).not.toMatch(/ACCESS_TOKEN/);
    });
  });
});
