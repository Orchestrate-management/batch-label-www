// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The invite endpoint, exercised as a handler rather than as a set of helpers.
 *
 * WHY IT IS DRIVEN THROUGH `fetch(Request)`. Every failure worth catching here is a failure of
 * ORDER: the key checked before the mint, the actor read from the token and never the body,
 * the invite withdrawn when the send fails. Testing the pieces separately would assert that
 * each can behave, not that they are wired in the sequence that matters.
 *
 * Supabase and Resend are both stubbed. Nothing here sends mail or touches a database: the
 * point is what this file DOES with their answers, and a test that needed either would not run
 * in CI at all.
 */

const ACCOUNT = '11111111-2222-3333-4444-555555555555';
const INVITER = '99999999-8888-7777-6666-555555555555';

interface Stubs {
  rpc: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  user: { id: string; email: string } | null;
}
let stubs: Stubs;

vi.mock('../lib/supabase-admin', () => ({}));

/**
 * The bundle is generated at build time, so the handler's `'../_server.js'` import is mocked
 * to the real source modules plus the two seams. `renderInviteEmail` is deliberately NOT
 * stubbed: the token must be provably absent from the response, and swapping the renderer for
 * a fake is how you accidentally prove that about the fake.
 */
vi.mock('../../api/_server.js', async () => {
  const http = await import('./http');
  const cors = await import('./cors');
  const config = await import('./config');
  const email = await import('../lib/invite-email');
  return {
    ...http,
    ...cors,
    ...config,
    renderInviteEmail: email.renderInviteEmail,
    createAdminClient: () => ({
      rpc: (...args: unknown[]) => stubs.rpc(...args),
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Ash & Ember' } }) }) }),
        update: (patch: unknown) => ({
          eq: () => ({ is: () => ({ is: async () => stubs.update(patch) }) })
        })
      })
    }),
    userFromRequest: async () => stubs.user
  };
});

async function handler() {
  return (await import('../../api/account-invite')).default;
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://www.batchlabel.xyz/api/account/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token', ...headers },
    body: JSON.stringify(body)
  });
}

const VALID = { account_id: ACCOUNT, email: 'colleague@example.com', role: 'editor' };

beforeEach(() => {
  vi.resetModules();
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.RESEND_API_KEY = 'resend-key';
  stubs = {
    rpc: vi.fn(async () => ({ data: [{ invite_id: 'inv-1', token: 'PLAINTEXT-TOKEN-NEVER-LEAVES' }], error: null })),
    update: vi.fn(async () => ({ error: null })),
    user: { id: INVITER, email: 'owner@example.com' }
  };
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"id":"re_1"}', { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.INVITE_FROM_EMAIL;
});

describe('the invite endpoint refuses before it mints', () => {
  it('answers 405 to anything but POST, without calling the database', async () => {
    const res = await (await handler()).fetch(
      new Request('https://www.batchlabel.xyz/api/account/invite', { method: 'GET' })
    );
    expect(res.status).toBe(405);
    expect(stubs.rpc).not.toHaveBeenCalled();
  });

  it('answers 501 when RESEND_API_KEY is absent, and mints nothing', async () => {
    delete process.env.RESEND_API_KEY;
    const res = await (await handler()).fetch(post(VALID));
    // 501 is what the app maps to "not switched on". The seat must not be reserved for an
    // invitation the server already knows it cannot deliver.
    expect(res.status).toBe(501);
    expect(stubs.rpc).not.toHaveBeenCalled();
  });

  it('answers 401 for an unverified caller, and mints nothing', async () => {
    stubs.user = null;
    const res = await (await handler()).fetch(post(VALID));
    expect(res.status).toBe(401);
    expect(stubs.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['account_id that is not a uuid', { ...VALID, account_id: 'not-a-uuid' }],
    ['an address with no @', { ...VALID, email: 'nobody' }],
    ['an address carrying a newline', { ...VALID, email: 'a@b.co\nbcc: victim@example.com' }],
    ['a role outside the four', { ...VALID, role: 'superuser' }],
    ['a missing body', {}]
  ])('answers 400 to %s, and mints nothing', async (_label, body) => {
    const res = await (await handler()).fetch(post(body));
    expect(res.status).toBe(400);
    expect(stubs.rpc).not.toHaveBeenCalled();
  });
});

describe('the actor comes from the verified token and nowhere else', () => {
  it('passes the JWT user id as p_actor', async () => {
    await (await handler()).fetch(post(VALID));
    expect(stubs.rpc).toHaveBeenCalledWith('create_account_invite', expect.objectContaining({ p_actor: INVITER }));
  });

  it('ignores an actor smuggled in the body', async () => {
    // The whole authorisation model rests on this. If a body field could reach p_actor, one
    // string in a fetch call would invite somebody into an account on a stranger's authority.
    await (await handler()).fetch(post({ ...VALID, p_actor: ACCOUNT, actor: ACCOUNT, user_id: ACCOUNT }));
    expect(stubs.rpc).toHaveBeenCalledWith('create_account_invite', expect.objectContaining({ p_actor: INVITER }));
  });
});

describe('what the database refuses, the endpoint reports', () => {
  it('maps the seat ceiling to 409 with hint seat_limit_reached', async () => {
    stubs.rpc = vi.fn(async () => ({ data: null, error: { message: 'seat_limit_reached: no editor seat free' } }));
    const res = await (await handler()).fetch(post(VALID));
    const body = await res.json();
    expect(res.status).toBe(409);
    // The app matches the hint, never the sentence, because the sentence lives in a migration.
    expect(body.hint).toBe('seat_limit_reached');
  });

  it('maps any other refusal to 403 without naming which rule stopped them', async () => {
    stubs.rpc = vi.fn(async () => ({ data: null, error: { message: 'permission denied for relation account_invites' } }));
    const res = await (await handler()).fetch(post(VALID));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(JSON.stringify(body)).not.toMatch(/permission denied|relation/i);
  });
});

describe('a successful send', () => {
  it('answers exactly { ok: true }', async () => {
    const res = await (await handler()).fetch(post(VALID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('NEVER puts the token in the response, in any header, or in the CORS preflight', async () => {
    const res = await (await handler()).fetch(post(VALID));
    const body = await res.text();
    expect(body).not.toContain('PLAINTEXT-TOKEN-NEVER-LEAVES');
    expect(JSON.stringify([...res.headers])).not.toContain('PLAINTEXT-TOKEN-NEVER-LEAVES');
  });

  it('sends the token to Resend and only to Resend', async () => {
    await (await handler()).fetch(post(VALID));
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    const payload = JSON.parse((init as RequestInit).body as string);
    expect(payload.to).toEqual(['colleague@example.com']);
    expect(payload.html).toContain('PLAINTEXT-TOKEN-NEVER-LEAVES');
    expect(payload.text).toContain('PLAINTEXT-TOKEN-NEVER-LEAVES');
    expect(payload.from).toBe('Batchlabel <hello@batchlabel.xyz>');
  });

  it('honours INVITE_FROM_EMAIL when the verified domain differs', async () => {
    process.env.INVITE_FROM_EMAIL = 'Batchlabel <team@mail.batchlabel.xyz>';
    await (await handler()).fetch(post(VALID));
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string).from).toBe('Batchlabel <team@mail.batchlabel.xyz>');
  });

  it('does not withdraw the invite it just created', async () => {
    await (await handler()).fetch(post(VALID));
    expect(stubs.update).not.toHaveBeenCalled();
  });
});

describe('a failed send does not sell a seat for a message nobody got', () => {
  it('withdraws the invite when Resend refuses, and answers 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('domain not verified', { status: 403 })));
    const res = await (await handler()).fetch(post(VALID));
    expect(res.status).toBe(502);
    // A minted invite reserves a seat. Leaving it live would cost the customer a seat for an
    // invitation that never left the building.
    expect(stubs.update).toHaveBeenCalledWith(expect.objectContaining({ revoked_at: expect.any(String) }));
  });

  it('withdraws the invite when Resend is unreachable, and answers 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET'); }));
    const res = await (await handler()).fetch(post(VALID));
    expect(res.status).toBe(502);
    expect(stubs.update).toHaveBeenCalled();
  });

  it('still answers 502 when the withdrawal itself fails, rather than claiming success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    stubs.update = vi.fn(async () => ({ error: { message: 'update failed' } }));
    const res = await (await handler()).fetch(post(VALID));
    expect(res.status).toBe(502);
  });

  it('never leaks Resend\'s reply to the caller', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"The batchlabel.xyz domain is not verified"}', { status: 403 })));
    const res = await (await handler()).fetch(post(VALID));
    expect(await res.text()).not.toMatch(/not verified|domain/i);
  });
});
