// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ALLOWED_ORIGINS,
  allowedOrigins,
  corsHeaders,
  isAllowedOrigin,
  parseExtraOrigins,
  preflightResponse } from
'./cors';

const allowList = allowedOrigins(undefined);

describe('the allow-list', () => {
  it('includes the separate product client', () => {
    expect(DEFAULT_ALLOWED_ORIGINS).toContain('https://app.batchlabel.xyz');
  });

  it('keeps the marketing origins working', () => {
    expect(isAllowedOrigin('https://www.batchlabel.xyz', allowList)).toBe(true);
    expect(isAllowedOrigin('https://batchlabel.xyz', allowList)).toBe(true);
  });

  it('rejects lookalike origins', () => {
    expect(isAllowedOrigin('https://app.batchlabel.xyz.evil.com', allowList)).toBe(false);
    expect(isAllowedOrigin('https://batchlabel.xyz.attacker.io', allowList)).toBe(false);
    expect(isAllowedOrigin('http://app.batchlabel.xyz', allowList)).toBe(false);
    expect(isAllowedOrigin(null, allowList)).toBe(false);
  });

  it('accepts extra origins from the environment, for preview deployments', () => {
    const withPreview = allowedOrigins('https://app-git-feat.vercel.app, https://other.example/');
    expect(isAllowedOrigin('https://app-git-feat.vercel.app', withPreview)).toBe(true);
    expect(isAllowedOrigin('https://other.example', withPreview)).toBe(true);
  });

  it('parses an empty or absent env value to nothing', () => {
    expect(parseExtraOrigins(undefined)).toEqual([]);
    expect(parseExtraOrigins('')).toEqual([]);
    expect(parseExtraOrigins(' , , ')).toEqual([]);
  });
});

describe('corsHeaders', () => {
  /**
   * These endpoints are credentialed (they carry a Supabase access token), so a wildcard is
   * both forbidden by the Fetch spec alongside allow-credentials and a bad idea on an
   * endpoint that mints billing-portal links.
   */
  it('echoes the exact origin and never a wildcard', () => {
    const headers = corsHeaders('https://app.batchlabel.xyz', allowList);
    expect(headers['Access-Control-Allow-Origin']).toBe('https://app.batchlabel.xyz');
    expect(headers['Access-Control-Allow-Origin']).not.toBe('*');
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
  });

  it('sends no allow-origin header at all for an origin that is not on the list', () => {
    const headers = corsHeaders('https://evil.example', allowList);
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(headers['Access-Control-Allow-Credentials']).toBeUndefined();
  });

  /**
   * Without Vary, a CDN can serve the response it built for app.batchlabel.xyz to www with
   * the wrong allow-origin header — which presents as an intermittent CORS failure that
   * nobody can reproduce.
   */
  it('always varies on Origin, allowed or not', () => {
    expect(corsHeaders('https://app.batchlabel.xyz', allowList).Vary).toBe('Origin');
    expect(corsHeaders('https://evil.example', allowList).Vary).toBe('Origin');
    expect(corsHeaders(null, allowList).Vary).toBe('Origin');
  });
});

describe('preflight', () => {
  it('answers OPTIONS with 204 and the methods and headers the app repo needs', () => {
    const response = preflightResponse('https://app.batchlabel.xyz', allowList);
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.batchlabel.xyz');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    expect(response.headers.get('access-control-allow-headers')).toContain('authorization');
    expect(response.headers.get('access-control-max-age')).toBe('86400');
  });

  it('withholds the allow-origin header on a preflight from an unknown origin', () => {
    const response = preflightResponse('https://evil.example', allowList);
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});
