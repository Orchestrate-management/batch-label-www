import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sharedCookieStorage } from './session-storage';
/**
 * Imported for its side effect, and imported HERE on purpose.
 *
 * This module snapshots the URL fragment the moment it is evaluated. Creating
 * the Supabase client below wipes that fragment (auth-js clears
 * `window.location.hash` as soon as it reads it), so the snapshot has to happen
 * first. Importing it from this file makes that a fact about the module graph
 * rather than a rule someone has to remember when editing index.tsx.
 *
 * Without it, /reset-password cannot tell a genuine recovery link from an
 * ordinary signed-in visitor, and every signed-in maker looks like one.
 */
import './recovery-entry';

/**
 * Supabase browser client.
 *
 * Set these in your environment (never commit them):
 *   VITE_SUPABASE_URL=https://your-project.supabase.co
 *   VITE_SUPABASE_ANON_KEY=your-anon-key
 */
const url = (import.meta as unknown as {env?: Record<string, string>;}).env?.VITE_SUPABASE_URL;
const anonKey = (import.meta as unknown as {env?: Record<string, string>;}).env?.
VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured ?
createClient(url as string, anonKey as string, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Session lives in a cookie on .batchlabel.xyz rather than localStorage, so
    // app.batchlabel.xyz sees the same login. See lib/session-storage.ts — that
    // file is duplicated in the product app and the two must stay identical.
    storage: sharedCookieStorage
  }
}) :
null;

export const MISSING_CONFIG_MESSAGE =
'Sign in is not connected yet. Add your Supabase URL and anon key to the environment to switch it on.';