// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { bearerToken, userFromRequest } from './supabase-admin';

function request(headers: Record<string, string> = {}): Request {
  return new Request('https://www.batchlabel.xyz/api/create-portal-session', {
    method: 'POST',
    headers
  });
}

describe('bearerToken', () => {
  it('reads a bearer token', () => {
    expect(bearerToken(request({ authorization: 'Bearer abc.def.ghi' }))).toBe('abc.def.ghi');
  });

  it('is case insensitive about the scheme', () => {
    expect(bearerToken(request({ authorization: 'bearer abc' }))).toBe('abc');
  });

  it('returns null when there is no usable Authorization header', () => {
    expect(bearerToken(request())).toBeNull();
    expect(bearerToken(request({ authorization: 'abc' }))).toBeNull();
    expect(bearerToken(request({ authorization: 'Basic abc' }))).toBeNull();
    expect(bearerToken(request({ authorization: 'Bearer' }))).toBeNull();
  });
});

describe('userFromRequest', () => {
  function fakeAdmin(response: unknown) {
    const getUser = vi.fn().mockResolvedValue(response);
    return { admin: { auth: { getUser } } as unknown as SupabaseClient, getUser };
  }

  it('asks Supabase who the token belongs to, rather than decoding it locally', async () => {
    const { admin, getUser } = fakeAdmin({
      data: { user: { id: 'user-1', email: 'maker@example.com' } },
      error: null
    });

    const user = await userFromRequest(admin, request({ authorization: 'Bearer the.access.token' }));

    expect(user).toEqual({ id: 'user-1', email: 'maker@example.com' });
    // The token itself is what is verified — not a user id the caller claimed.
    expect(getUser).toHaveBeenCalledWith('the.access.token');
  });

  it('returns null when Supabase rejects the token', async () => {
    const { admin } = fakeAdmin({ data: { user: null }, error: { message: 'invalid JWT' } });
    expect(await userFromRequest(admin, request({ authorization: 'Bearer expired' }))).toBeNull();
  });

  it('returns null when there is no token at all, without calling Supabase', async () => {
    const { admin, getUser } = fakeAdmin({ data: { user: { id: 'user-1' } }, error: null });
    expect(await userFromRequest(admin, request())).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  /**
   * The property that matters: there is no code path from a request BODY to an identity.
   * A body cannot be passed to this function at all, which is the point.
   */
  it('cannot be given an identity by the request body', async () => {
    const { admin } = fakeAdmin({ data: { user: null }, error: { message: 'no token' } });
    const withBody = new Request('https://www.batchlabel.xyz/api/create-portal-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: 'somebody-elses-id' })
    });
    expect(await userFromRequest(admin, withBody)).toBeNull();
  });
});
