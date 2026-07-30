import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase, isSupabaseConfigured, MISSING_CONFIG_MESSAGE } from './supabase';
import { BRAND_SLUG } from './brand';
import { attributionForMetadata } from './attribution';
import { trackSignUpCompleted, trackSignUpStarted } from './analytics';

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
  }) => Promise<AuthResult>;
  signInWithPassword: (input: {email: string;password: string;}) => Promise<AuthResult>;
  sendMagicLink: (email: string) => Promise<AuthResult>;
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
    async ({ email, password, businessName }) => {
      if (!supabase) return { error: MISSING_CONFIG_MESSAGE };
      trackSignUpStarted('password');
      // Signup context is written to auth.users.raw_user_meta_data. The Supabase
      // provisioning trigger (see supabase/migrations) reads `brand`, `business_name`
      // and the nested `attribution` to create the profile and brand membership, so the
      // sale can be tied back to the ad that started it and to the right sub-brand.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo('/dashboard'),
          data: {
            brand: BRAND_SLUG,
            business_name: businessName,
            attribution: attributionForMetadata()
          }
        }
      });
      if (error) return { error: error.message };
      await trackSignUpCompleted('password', email, data.user?.id);
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

  const sendMagicLink = useCallback<AuthContextValue['sendMagicLink']>(async (email) => {
    if (!supabase) return { error: MISSING_CONFIG_MESSAGE };
    trackSignUpStarted('magic_link');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectTo('/dashboard'),
        data: {
          brand: BRAND_SLUG,
          attribution: attributionForMetadata()
        }
      }
    });
    if (error) return { error: error.message };
    await trackSignUpCompleted('magic_link', email);
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