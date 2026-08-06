/**
 * POST /api/account/invite
 *
 * Mints an invitation to join an account and emails it. The last piece between a built team
 * feature and a second person actually being able to get in.
 *
 * Header: Authorization: Bearer <supabase access token>. Required.
 * Body:   { account_id: uuid, email: string, role: 'owner'|'admin'|'editor'|'viewer' }
 * Answers: { ok: true } and nothing else, or { error, hint? } with a status.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SERVER ENDPOINT AND NOT AN RPC THE APP CALLS DIRECTLY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `public.create_account_invite` is service-role only and returns the plaintext token exactly
 * once, so it can be emailed. A token that transits a browser is a token in a history entry, a
 * network tab, a screen share, a referrer header and any client-side error report. So the app
 * posts here with its bearer JWT, this route verifies it, takes the actor from THAT verified
 * token and from nowhere else, calls the RPC under the service role, sends the mail, and
 * answers `{ ok: true }` carrying no token. Same shape lib/billing.ts already proves.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ONE THING THIS ENDPOINT MUST GET RIGHT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `p_actor` decides whether the caller may invite anybody at all and at what rank. It comes
 * from `userFromRequest`, which verifies the JWT, and there is NO parameter by which a caller
 * could supply it. create-portal-session.ts carries the same note for the same reason: its
 * predecessor took a user id from the request body, and with a real lookup behind it that is
 * an endpoint where changing one string in a fetch hands you a stranger's account.
 *
 * Read the body for exactly three fields. Anything else in the JSON is ignored rather than
 * merged, so a smuggled `actor` or `user_id` has nothing to attach to.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ORDERING: MINT, THEN SEND, THEN WITHDRAW IF THE SEND FAILED
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The RPC has to run first, because the token does not exist until it does and there is
 * nothing to put in the email before that. But a minted invite RESERVES A SEAT, so an invite
 * whose email never left the building is a seat sold for a message nobody received, and on a
 * one-seat plan that is the difference between adding a colleague and not.
 *
 * So a failed send withdraws the invite it just created (`revoked_at = now()`), under the
 * service role, and the caller is told the mail did not go. If the withdrawal ALSO fails the
 * seat stays reserved, which is why that case logs loudly: it is the one state a person has to
 * clear by hand from the team screen.
 *
 * We do not pre-check the seat count here. The ceiling is raised at COMMIT by a deferred
 * constraint trigger, so the database is the only thing that can answer truthfully under
 * concurrency, and a check in this file would be a second opinion that is wrong half the time.
 */

import {
  allowedOrigins,
  corsHeaders,
  createAdminClient,
  fail,
  json,
  preflightResponse,
  readServerConfig,
  renderInviteEmail,
  userFromRequest
} from '../_server.js';

/** Matches the CHECK on public.account_members.role. Anything else is refused before the RPC. */
const ROLES = ['owner', 'admin', 'editor', 'viewer'];

/** The column default on account_invites.expires_at is `now() + interval '7 days'`. */
const EXPIRES_IN_DAYS = 7;

/**
 * A deliberately small surface. Length caps are here so a 10MB address cannot be forwarded to
 * Resend, and the shape check is the RFC-lite one every signup form uses: the database is not
 * asked to validate an address and neither is a regex pretending to implement RFC 5322.
 */
function readInvite(body: unknown): { accountId: string; email: string; role: string } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const accountId = typeof b.account_id === 'string' ? b.account_id.trim() : '';
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const role = typeof b.role === 'string' ? b.role.trim() : '';

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId);
  // No whitespace, exactly one @, something either side, a dot in the domain. Also rejects the
  // CR and LF that a header-injection attempt needs, though the Resend call is JSON and would
  // not honour them anyway. Two independent reasons it cannot happen is the right number.
  const isEmail = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(email) && email.length <= 254;

  if (!isUuid || !isEmail || !ROLES.includes(role)) return null;
  return { accountId, email, role };
}

export default {
  async fetch(request: Request): Promise<Response> {
    const config = readServerConfig(process.env);
    const allowList = allowedOrigins(config.extraOrigins);
    const origin = request.headers.get('origin');
    const cors = corsHeaders(origin, allowList);

    if (request.method === 'OPTIONS') return preflightResponse(origin, allowList);
    if (request.method !== 'POST') return fail({ status: 405, message: 'Method not allowed' }, cors);

    if (!config.supabaseUrl || !config.serviceRoleKey) {
      return fail(
        { status: 500, message: 'Invitations are not configured yet.', detail: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing' },
        cors
      );
    }

    // 501, not 500, and the app already branches on it: sendInvite maps 501 and 404 to a
    // written explanation that the sending half is not switched on. This is the designed
    // state before RESEND_API_KEY is set, and it must never fall through to minting an invite
    // that cannot be delivered.
    const resendKey = process.env.RESEND_API_KEY?.trim();
    if (!resendKey) {
      return fail({ status: 501, message: 'Sending invitations is not switched on yet.' }, cors);
    }

    const admin = createAdminClient(config.supabaseUrl, config.serviceRoleKey);

    const user = await userFromRequest(admin, request);
    if (!user) {
      return fail({ status: 401, message: 'Please sign in again to invite somebody.' }, cors);
    }

    let parsed: { accountId: string; email: string; role: string } | null = null;
    try {
      parsed = readInvite(await request.json());
    } catch {
      parsed = null;
    }
    if (!parsed) {
      return fail({ status: 400, message: 'That invitation was not something we could read. Check the email address and try again.' }, cors);
    }

    // The business name for the email. Read under the service role, but ONLY after the RPC has
    // agreed the caller may invite into this account: doing it first would make this endpoint
    // an oracle that confirms an account id exists to anybody holding any valid session.
    const { data: minted, error: mintError } = await admin.rpc('create_account_invite', {
      p_actor: user.id,
      p_account_id: parsed.accountId,
      p_email: parsed.email,
      p_role: parsed.role
    });

    if (mintError) {
      // The seat ceiling is a deferred constraint trigger and reports itself with this hint.
      // The app matches the hint and never the sentence, because the sentence lives in a
      // migration and will be rewritten.
      const raw = `${mintError.message ?? ''} ${mintError.details ?? ''} ${mintError.hint ?? ''}`;
      if (raw.includes('seat_limit_reached')) {
        return json({ error: 'That account is using all of its editor seats.', hint: 'seat_limit_reached' }, 409, cors);
      }
      if (raw.includes('one_live_per_email')) {
        return json({ error: 'That address already has an invitation waiting. Withdraw it first if you want to send another.' }, 409, cors);
      }
      // Everything else is a refusal by the RPC's own rank and membership rules. 403 rather
      // than 500, and deliberately one sentence for every cause: telling a caller WHICH rule
      // stopped them tells them what they would need to change to get past it.
      return json({ error: 'You cannot invite somebody to that account at that role.' }, 403, cors);
    }

    const row = Array.isArray(minted) ? minted[0] : minted;
    const token = row?.token;
    const inviteId = row?.invite_id;
    if (!token || !inviteId) {
      return fail({ status: 500, message: 'The invitation could not be created. Nothing was sent.' }, cors);
    }

    const { data: account } = await admin.
      from('accounts').
      select('name').
      eq('id', parsed.accountId).
      maybeSingle();

    const email = renderInviteEmail({
      accountName: account?.name?.trim() || 'a Batchlabel account',
      inviterEmail: user.email ?? 'somebody at Batchlabel',
      role: parsed.role,
      acceptUrl: `${config.appUrl}/invite/${token}`,
      siteUrl: config.siteUrl,
      expiresInDays: EXPIRES_IN_DAYS
    });

    let sent = false;
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.INVITE_FROM_EMAIL?.trim() || 'Batchlabel <hello@batchlabel.xyz>',
          to: [parsed.email],
          reply_to: user.email ?? undefined,
          subject: email.subject,
          html: email.html,
          text: email.text
        })
      });
      sent = response.ok;
      if (!response.ok) {
        // The body can name a domain that is not verified, which is the likeliest real cause
        // and is worth having in the log. It cannot contain the token: the token appears only
        // in the html and text we sent, never in Resend's reply.
        console.error('[invite] resend refused', response.status, (await response.text()).slice(0, 400));
      }
    } catch (error) {
      console.error('[invite] resend unreachable', error instanceof Error ? error.message : error);
    }

    if (!sent) {
      const { error: revokeError } = await admin.
        from('account_invites').
        update({ revoked_at: new Date().toISOString() }).
        eq('id', inviteId).
        is('revoked_at', null).
        is('accepted_at', null);
      if (revokeError) {
        // The one state that needs a human: a seat is reserved for an invitation nobody got.
        console.error('[invite] ORPHANED RESERVATION, withdraw by hand:', inviteId, revokeError.message);
      }
      return fail({ status: 502, message: 'We could not send that invitation, so nothing was booked. Try again in a moment.' }, cors);
    }

    // No token, no invite id, no address echoed. There is nothing here worth intercepting.
    return json({ ok: true }, 200, cors);
  }
};
