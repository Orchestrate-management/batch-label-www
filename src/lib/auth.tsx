import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase, isSupabaseConfigured, MISSING_CONFIG_MESSAGE } from './supabase';
import { BRAND_SLUG } from './brand';
import { signupConsents } from './agreements';
import { attributionForMetadata } from './attribution';
import { trackSignUpCompleted, trackSignUpStarted } from './analytics';
import { fetchMembershipState, membershipRedirect, type MembershipState } from './membership';

interface AuthResult {
  error: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  signUpWithPassword: (input: {
    email: string;
    password: string;
    businessName: string;
    marketingEmailOptIn: boolean;
    advertisingOptIn: boolean;
  }) => Promise<AuthResult>;
  signInWithPassword: (input: {email: string;password: string;}) => Promise<AuthResult>;
  /**
   * Starts the Google redirect. Nothing about the account can be decided here: an OAuth
   * call has no options.data, so no brand, business name or consent reaches
   * raw_user_meta_data and the provisioning trigger cannot fire. Both signup and login
   * therefore land on /dashboard, where the membership gate sends anyone without a
   * membership to /finish-setup to accept the terms. `intent` only decides whether this
   * counts as a signup for analytics.
   */
  signInWithGoogle: (input: {intent: 'sign_up' | 'log_in';}) => Promise<AuthResult>;
  /**
   * Sends a one time sign in link. Pass `signUp` to create the account (carrying the
   * signup consents); omit it on the log in path so an unknown email is NOT silently
   * turned into a consent-less account.
   */
  sendMagicLink: (input: {
    email: string;
    signUp?: {businessName: string;marketingEmailOptIn: boolean;advertisingOptIn: boolean;};
  }) => Promise<AuthResult>;
  sendPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function redirectTo(path: string) {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}${path}`;
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
    async ({ email, password, businessName, marketingEmailOptIn, advertisingOptIn }) => {
      if (!supabase) return { error: MISSING_CONFIG_MESSAGE };
      trackSignUpStarted('password');
      // Signup context is written to auth.users.raw_user_meta_data. The Supabase
      // provisioning trigger (see supabase/migrations) reads `brand`, `business_name`,
      // the nested `attribution`, and `consents` to create the profile, brand membership
      // and consent audit trail. `consents` carries the exact document versions shown;
      // the acceptance timestamp is stamped server-side, not trusted from here.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo('/dashboard'),
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo('/dashboard'),
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
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Only the signup path may create a new account. On the log in path an unknown
        // email is rejected rather than turned into an account with no consent on file.
        shouldCreateUser: isSignUp,
        emailRedirectTo: redirectTo('/dashboard'),
        data: isSignUp ?
        {
          brand: BRAND_SLUG,
          business_name: signUp!.businessName,
          attribution: attributionForMetadata(),
          consents: signupConsents(signUp!.marketingEmailOptIn, signUp!.advertisingOptIn),
          marketing_email_opt_in: signUp!.marketingEmailOptIn,
          advertising_opt_in: signUp!.advertisingOptIn
        } :
        undefined
      }
    });
    if (error) return { error: error.message };
    if (isSignUp) {
      await trackSignUpCompleted(
        'magic_link', email, undefined,
        signUp!.marketingEmailOptIn, signUp!.advertisingOptIn
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
 * Protected route wrapper for the dashboard shell. While Supabase is not configured we
 * let the shell through so the placeholder can be reviewed, and the dashboard shows a
 * plain notice explaining that sign in is not connected yet.
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
 * The second half of the gate, for OAuth users.
 *
 * RequireAuth proves there is a session. It does not prove the person has a brand
 * membership, and after a Google redirect they will not have one — no membership, and no
 * terms accepted. Dropping them on the dashboard would show an account area with nothing
 * in it, so they go to /finish-setup instead.
 *
 * Wrap the dashboard with page="dashboard" and the completion screen with
 * page="finish_setup". Both use the same rule (membershipRedirect), which is what keeps
 * them from bouncing a user back and forth: neither redirects on `unknown`, and they
 * redirect on opposite states otherwise.
 */
export function RequireMembership({
  page,
  children



}: {page: 'dashboard' | 'finish_setup';children: React.ReactNode;}) {
  const { session, loading: authLoading, configured } = useAuth();
  const [state, setState] = useState<MembershipState | null>(null);

  useEffect(() => {
    if (!configured || !session) {
      setState('unknown');
      return;
    }
    let active = true;
    setState(null);
    fetchMembershipState().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [configured, session]);

  if (authLoading || state === null) {
    return (
      <div className="flex min-h-[60vh] w-full items-center justify-center bg-paper">
        <p className="text-sm text-ink-muted">Checking your account...</p>
      </div>);

  }

  const destination = membershipRedirect(state, page);
  if (destination) return <Navigate to={destination} replace />;

  return <>{children}</>;
}