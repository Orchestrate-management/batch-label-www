import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
    detectSessionInUrl: true
  }
}) :
null;

export const MISSING_CONFIG_MESSAGE =
'Sign in is not connected yet. Add your Supabase URL and anon key to the environment to switch it on.';