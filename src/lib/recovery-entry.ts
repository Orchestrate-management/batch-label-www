/**
 * Did this page load arrive from a password recovery link?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS, AND WHY IT MUST RUN FIRST
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * /reset-password calls `updateUser({ password })`, which changes the password
 * of whoever the current session belongs to and asks for nothing else. The only
 * thing standing between that and an account takeover is proof that this page
 * load came from a link we emailed.
 *
 * "Is there a session?" is NOT that proof. The session cookie is shared across
 * `.batchlabel.xyz` with a 400 day lifetime, so an ordinary signed-in maker
 * satisfies it on this site at all times. Anyone with an unlocked laptop or a
 * replayed cookie could open /reset-password, type a new password twice, and own
 * the account — no current password, no email, no link. The product app asks for
 * the current password precisely to stop that; a sibling site that does not ask
 * is the same hole with a different address.
 *
 * So the recovery marker is the gate, and the session is only the mechanism.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TIMING PROBLEM
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The marker arrives in the URL fragment (`#access_token=…&type=recovery`,
 * because the client uses the default implicit flow) and it does not survive
 * long. Two things in @supabase/auth-js 2.111 destroy or hide it before any
 * React component could look:
 *
 *  1. `GoTrueClient.js:3315` — `window.location.hash = ''`. The fragment is
 *     wiped as soon as the client processes it, and the client is constructed
 *     when `lib/supabase.ts` is imported, long before React mounts.
 *  2. `GoTrueClient.js:343-357` — the `PASSWORD_RECOVERY` event is pushed onto
 *     `_pendingInitNotifications` and flushed at the end of `_initialize()`.
 *     That also happens at import time, so `onAuthStateChange` inside
 *     `AuthProvider` can subscribe after the event has already been delivered to
 *     nobody. Listening for the event is therefore unreliable by construction.
 *
 * The fix is to read the URL synchronously, before the Supabase client exists.
 * `lib/supabase.ts` imports this module above its `createClient` call, so module
 * evaluation order guarantees it — a structural guarantee rather than one that
 * depends on somebody keeping the imports in `index.tsx` in the right order.
 *
 * WHAT THIS ASSUMES
 *
 * That the recovery link arrives as a full page load. It always does: Supabase
 * redirects from its own origin to ours, which is a fresh document. But it means
 * a fragment-only change on a page that is already open (`/reset-password` →
 * `/reset-password#type=recovery`) is NOT noticed, because no module is
 * re-evaluated. Do not add a client-side route or `Link` that reaches this page
 * with a recovery fragment; it would silently look like no link at all.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A FAILED LINK IS ITS OWN ANSWER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * An expired or already-used link comes back as `#error=access_denied&
 * error_code=otp_expired`. Supabase deliberately keeps any existing session in
 * that case (`GoTrueClient.js:401`, "Don't remove existing session on URL login
 * failure"), so a signed-in maker whose link expired still has a session and
 * would sail past any check based on session presence — while their link did
 * nothing. That is the population most likely to hit an expired link, so it gets
 * its own state and its own screen.
 */

/** Tab-scoped, so a reload part way through a genuine reset still works. */
const STORAGE_KEY = 'bl_recovery_entry';

export type RecoveryEntry =
{kind: 'recovery';} |
{kind: 'link_failed';code: string | null;description: string | null;} |
{kind: 'none';};

function readStore(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Everything in the fragment and the query string, fragment winning.
 *
 * The implicit flow puts the answer in the fragment. The query string is read as
 * well because Supabase puts some link errors there, and reading one extra place
 * costs nothing.
 */
function urlParams(search: string, hash: string): URLSearchParams {
  const merged = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  new URLSearchParams(fragment).forEach((value, key) => merged.set(key, value));
  return merged;
}

/** Exported for tests; called once at module evaluation in a browser. */
export function captureRecoveryEntry(search: string, hash: string): RecoveryEntry {
  const params = urlParams(search, hash);
  const store = readStore();

  const error = params.get('error') ?? params.get('error_code');
  if (error) {
    // The link failed, so nothing is in flight and a marker from an earlier
    // attempt in this tab must not stand in for one.
    try {
      store?.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable; the in-memory answer below is still correct */
    }
    return {
      kind: 'link_failed',
      code: params.get('error_code') ?? params.get('error'),
      description: params.get('error_description')
    };
  }

  if (params.get('type') === 'recovery') {
    try {
      store?.setItem(STORAGE_KEY, '1');
    } catch {
      /* storage unavailable; this page load still knows, a reload will not */
    }
    return { kind: 'recovery' };
  }

  try {
    if (store?.getItem(STORAGE_KEY) === '1') return { kind: 'recovery' };
  } catch {
    /* fall through to none */
  }

  return { kind: 'none' };
}

const captured: RecoveryEntry =
typeof window === 'undefined' ?
{ kind: 'none' } :
captureRecoveryEntry(window.location.search, window.location.hash);

/** What this page load arrived as. Decided once, at first script evaluation. */
export function recoveryEntry(): RecoveryEntry {
  return captured;
}

/**
 * Called once a password has actually been set, so the marker does not leave a
 * standing permission to change it again in this tab.
 */
export function clearRecoveryEntry(): void {
  try {
    readStore()?.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Exported for tests. */
export const RECOVERY_ENTRY_STORAGE_KEY = STORAGE_KEY;
