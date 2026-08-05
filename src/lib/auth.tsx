import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase, isSupabaseConfigured, MISSING_CONFIG_MESSAGE } from './supabase';
import { BRAND_SLUG } from './brand';
import { APP_URL, goToApp } from './app-handoff';
import { signupConsents } from './agreements';
import { advertisingConsentFromBanner } from './consent';
import { attributionForMetadata } from './attribution';
import { trackSignUpCompleted, trackSignUpStarted } from './analytics';
import {
  fetchMembershipState,
  finishSetupDestination,
  signedInDestination,
  FINISH_SETUP_PATH,
  type MembershipState } from
'./membership';

interface AuthResult {
  error: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  /**
   * Creates the account. There is no advertisingOptIn argument on purpose: the signup
   * form does not ask, and this function derives it from the cookie banner instead.
   */
  signUpWithPassword: (input: {
    email: string;
    password: string;
    businessName: string;
    marketingEmailOptIn: boolean;
  }) => Promise<AuthResult>;
  signInWithPassword: (input: {email: string;password: string;}) => Promise<AuthResult>;
  /**
   * Starts the Google redirect. Nothing about the account can be decided here: an OAuth
   * call has no options.data, so no brand, business name or consent reaches
   * raw_user_meta_data and the provisioning trigger cannot fire. Both signup and login
   * therefore come back to /finish-setup, which is the one route that can tell the two
   * apart AFTER the round trip: a new user gets the form, a returning one is handed
   * straight to the app. `intent` only decides whether this counts as a signup for
   * analytics.
   */
  signInWithGoogle: (input: {intent: 'sign_up' | 'log_in';}) => Promise<AuthResult>;
  /**
   * Sends a one time sign in link. Pass `signUp` to create the account (carrying the
   * signup consents); omit it on the log in path so an unknown email is NOT silently
   * turned into a consent-less account.
   */
  sendMagicLink: (input: {
    email: string;
    signUp?: {businessName: string;marketingEmailOptIn: boolean;};
  }) => Promise<AuthResult>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  /**
   * Ends every other session for this user and keeps the current one. Used after
   * a password reset: a reset is what someone does when they believe another
   * person is in their account, and one that leaves the intruder signed in has
   * achieved nothing.
   */
  revokeOtherSessions: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function redirectTo(path: string) {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}${path}`;
}

/**
 * Where a confirmed email link lands: the product, not this site.
 *
 * Supabase verifies the token and then redirects here with the session in the URL
 * fragment, and the app runs `detectSessionInUrl`, so it picks the session up and writes
 * it to the shared .batchlabel.xyz cookie exactly as www would have. There is no reason
 * to stop on the way — this site has no dashboard function; everything a maker does
 * happens in the app.
 *
 * Not used for the Google redirect or the password reset, and deliberately so. OAuth has
 * nowhere to put the brand and consent, so it must come back here to /finish-setup; and
 * the reset link must land on this site's /reset-password, which is where the recovery
 * gate lives. Both of those routes end in the same handoff, so neither is a stop the
 * maker has to click their way out of.
 */
function appRedirect() {
  if (typeof window === 'undefined') return undefined;
  return APP_URL;
}

export function AuthProvider({ children }: {children: React.ReactNode;}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signUpWithPassword = useCallback<AuthContextValue['signUpWithPassword']>(
    async ({ email, password, businessName, marketingEmailOptIn }) => {
      if (!supabase) return { error: MISSING_CONFIG_MESSAGE };
      trackSignUpStarted('password');
      // Read, not asked. The cookie banner owns advertising, so this is the decision the
      // browser is already acting on, written onto the account so the two start in step.
      // No banner choice yet means false, which is what Consent Mode is already doing.
      const advertisingOptIn = advertisingConsentFromBanner();
      // Signup context is written to auth.users.raw_user_meta_data. The Supabase
      // provisioning trigger (see supabase/migrations) reads `brand`, `business_name`,
      // the nested `attribution`, and `consents` to create the profile, brand membership
      // and consent audit trail. `consents` carries the exact document versions shown;
      // the acceptance timestamp is stamped server-side, not trusted from here.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: appRedirect(),
          data: {
            brand: BRAND_SLUG,
            business_name: businessName,
            attribution: attributionForMetadata(),
            consents: signupConsents(marketingEmailOptIn, advertisingOptIn),
            marketing_email_opt_in: marketingEmailOptIn,
            advertising_opt_in: advertisingOptIn
          }
        }
      });
      if (error) return { error: error.message };
      await trackSignUpCompleted('password', email, data.user?.id, marketingEmailOptIn, advertisingOptIn);
      return { error: null };
    },
    []
  );

  const signInWithPassword = useCallback<AuthContextValue['signInWithPassword']>(
    async ({ email, password }) => {
      if (!supabase) return { error: MISSING_CONFIG_MESSAGE };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error ? error.message : null };
    },
    []
  );

  const signInWithGoogle = useCallback<AuthContextValue['signInWithGoogle']>(async ({ intent }) => {
    if (!supabase) return { error: MISSING_CONFIG_MESSAGE };
    if (intent === 'sign_up') trackSignUpStarted('google');
    // sign_up_completed is deliberately NOT fired here. The account is not really made
    // until the terms are accepted on /finish-setup, and this call ends in a full page
    // redirect to Google anyway.
    // BACK TO /finish-setup, NOT TO THE APP AND NOT TO A DASHBOARD.
    //
    // Sending a Google return straight to APP_URL would drop a brand new user into the
    // product with no membership and no Terms acceptance on file, which is a compliance
    // problem rather than a fast signup. Sending it to a www dashboard — what this used to
    // do — made every returning Google user stop on this site and press a link to get to
    // the product they had just asked to be signed in to.
    //
    // /finish-setup is the only route that can decide, because the answer is not knowable
    // until Supabase has made the session: the gate reads the membership and either shows
    // the consent form or hands over. Supabase's Redirect URLs allow-list is a
    // `https://www.batchlabel.xyz/**` wildcard, so this path needs no configuration change
    // — see docs/GOOGLE_OAUTH_SETUP.md §2b.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo(FINISH_SETUP_PATH),
        // Always show the account chooser. Makers often have a personal and a shop
        // Google account and silently reusing the last one is how you end up with two.
        queryParams: { prompt: 'select_account' }
      }
    });
    return { error: error ? error.message : null };
  }, []);

  const sendMagicLink = useCallback<AuthContextValue['sendMagicLink']>(async ({ email, signUp }) => {
    if (!supabase) return { error: MISSING_CONFIG_MESSAGE };
    const isSignUp = Boolean(signUp);
    if (isSignUp) trackSignUpStarted('magic_link');
    // Same derivation as the password path, for the same reason.
    const advertisingOptIn = advertisingConsentFromBanner();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Only the signup path may create a new account. On the log in path an unknown
        // email is rejected rather than turned into an account with no consent on file.
        shouldCreateUser: isSignUp,
        emailRedirectTo: appRedirect(),
        data: isSignUp ?
        {
          brand: BRAND_SLUG,
          business_name: signUp!.businessName,
          attribution: attributionForMetadata(),
          consents: signupConsents(signUp!.marketingEmailOptIn, advertisingOptIn),
          marketing_email_opt_in: signUp!.marketingEmailOptIn,
          advertising_opt_in: advertisingOptIn
        } :
        undefined
      }
    });
    if (error) return { error: error.message };
    if (isSignUp) {
      await trackSignUpCompleted(
        'magic_link', email, undefined,
        signUp!.marketingEmailOptIn, advertisingOptIn
      );
    }
    return { error: null };
  }, []);

  const sendPasswordReset = useCallback<AuthContextValue['sendPasswordReset']>(async (email) => {
    if (!supabase) return { error: MISSING_CONFIG_MESSAGE };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectTo('/reset-password')
    });
    return { error: error ? error.message : null };
  }, []);

  const updatePassword = useCallback<AuthContextValue['updatePassword']>(async (password) => {
    if (!supabase) return { error: MISSING_CONFIG_MESSAGE };
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error ? error.message : null };
  }, []);

  const revokeOtherSessions = useCallback<AuthContextValue['revokeOtherSessions']>(async () => {
    if (!supabase) return { error: MISSING_CONFIG_MESSAGE };
    // 'others', never 'global': signing the maker out of the browser they are
    // standing in front of, moments after they set a password there, would look
    // like the reset had failed.
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    return { error: error ? error.message : null };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured: isSupabaseConfigured,
      signUpWithPassword,
      signInWithPassword,
      signInWithGoogle,
      sendMagicLink,
      sendPasswordReset,
      updatePassword,
      revokeOtherSessions,
      signOut
    }),
    [
    session,
    loading,
    signUpWithPassword,
    signInWithPassword,
    signInWithGoogle,
    sendMagicLink,
    sendPasswordReset,
    updatePassword,
    revokeOtherSessions,
    signOut]

  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

/**
 * Protected route wrapper. While Supabase is not configured we let the page through so it
 * can be reviewed, and each page says plainly that sign in is not connected yet.
 */
export function RequireAuth({ children }: {children: React.ReactNode;}) {
  const { session, loading, configured } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center bg-paper">
        <p className="text-sm text-ink-muted">Checking your session...</p>
      </div>);

  }

  if (configured && !session) {
    return <Navigate to="/log-in" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

/**
 * Reads the membership for whoever is signed in.
 *
 * Null while no answer for THIS user has arrived yet; a MembershipState once one has.
 *
 * THE ANSWER IS STORED WITH THE USER IT IS ABOUT, and that is the whole design of this
 * hook. A membership state on its own cannot say whose it is, and there are two moments
 * when it would be read as the wrong person's:
 *
 *  - On the very first paint the session has not resolved, so there is no user to ask
 *    about and the state is `unknown`. `unknown` means "the read failed", and a gate that
 *    acts on it will act — this exact race sent a Google user who still owed us a Terms
 *    acceptance straight into the app, because for one frame between "no session yet" and
 *    "session, now reading" the gate believed the read had already failed.
 *  - When a genuinely different user signs in, the previous user's answer is still in
 *    hand and is not an answer about this one.
 *
 * Pairing the state with the user id makes both of those a spinner instead of a decision.
 *
 * Keyed on the user ID, NOT the session object. supabase-js hands us a freshly parsed
 * session object on every tab refocus and token refresh, so depending on the object would
 * re-run this on each one, and the state would blank each time — unmounting whatever is
 * gated and wiping a half-filled consent form the moment someone opens the terms in a new
 * tab to read them, which is exactly what we ask them to do. A refresh for the same user
 * leaves the id untouched, so the answer stays valid and the children stay mounted.
 */
function useMembershipState(): {state: MembershipState | null;authLoading: boolean;} {
  const { session, loading: authLoading, configured } = useAuth();
  const [resolved, setResolved] = useState<
    {userId: string | null;state: MembershipState;} | null>(
    null);
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!configured || !userId) {
      setResolved({ userId, state: 'unknown' });
      return;
    }
    let active = true;
    fetchMembershipState().then((next) => {
      if (active) setResolved({ userId, state: next });
    });
    return () => {
      active = false;
    };
  }, [configured, userId]);

  const state = resolved && resolved.userId === userId ? resolved.state : null;
  return { state, authLoading };
}

function Waiting({ children }: {children: React.ReactNode;}) {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center bg-paper">
      <p className="text-sm text-ink-muted" role="status">
        {children}
      </p>
    </div>);

}

/**
 * Leaves for the product. A full navigation, so it happens in an effect rather than
 * during render, and it says so while the browser is on its way.
 *
 * `next` is the app URL the app itself asked us to return to. goToApp validates it against
 * the allow-list in lib/app-handoff.ts before following it — anything else falls back to
 * the app's front door rather than being obeyed.
 */
function LeavingForApp({ next }: {next?: string | null;}) {
  useEffect(() => {
    goToApp(next);
  }, [next]);
  return <Waiting>Taking you to Batchlabel...</Waiting>;
}

/**
 * The gate on /finish-setup, which is where Google returns everybody.
 *
 * RequireAuth proves there is a session. It does not prove the person has a brand
 * membership, and after a Google signup they will not have one — no membership, and no
 * Terms acceptance. So this screen asks. Someone who already has a membership is not
 * re-asked; they are handed to the app, which is the only place there is for them to go.
 *
 * This used to send that person to www's /dashboard, and that redirect is the whole
 * complaint: a returning Google user was signed in, bounced to a marketing-site account
 * page, and left to find the product themselves.
 */
export function RequireSetup({ children }: {children: React.ReactNode;}) {
  const { state, authLoading } = useMembershipState();

  if (authLoading || state === null) return <Waiting>Checking your account...</Waiting>;
  if (finishSetupDestination(state) === 'app') return <LeavingForApp />;

  return <>{children}</>;
}

/**
 * Wraps /log-in so that somebody who is ALREADY signed in never sees a login form.
 *
 * The session cookie on `.batchlabel.xyz` lasts 400 days, so "already signed in" is the
 * normal state for a returning maker, and a bookmark or a header link to /log-in is a
 * thing that happens. Showing them a form and making them type a password they do not
 * need — and which ends in the same handoff anyway — is the same detour as the dashboard,
 * one page along.
 *
 * The membership is still checked. A Google user who abandoned /finish-setup has a session
 * and no Terms acceptance, and this is one of the routes that could otherwise drop them
 * into the product without one.
 */
export function HandOffIfSignedIn({ children }: {children: React.ReactNode;}) {
  const { session, configured } = useAuth();
  const location = useLocation();
  const { state, authLoading } = useMembershipState();

  // `next` is the page inside the app the maker was actually trying to reach when it
  // bounced them here to sign in.
  const next = new URLSearchParams(location.search).get('next');

  // Not signed in, or no Supabase to ask: the form is exactly what they came for.
  if (!configured || !authLoading && !session) return <>{children}</>;
  if (authLoading || state === null) return <Waiting>Checking your session...</Waiting>;

  if (signedInDestination(state) === 'finish_setup') {
    return <Navigate to={FINISH_SETUP_PATH} replace />;
  }
  return <LeavingForApp next={next} />;
}