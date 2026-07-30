/**
 * The Orchestrate sub-brand this deployment belongs to.
 *
 * Orchestrate runs one shared Supabase identity pool across every offering. Each
 * deployment tags its signups with a brand slug so the pool stays filterable by
 * sub-brand (see supabase/migrations, public.brand_memberships.brand_slug).
 *
 * Set VITE_ORCHESTRATE_BRAND per deployment. Batchlabel is the default because it is
 * the first offering; a future brand ships the same code with a different value.
 */
const configured = (import.meta as unknown as {env?: Record<string, string>;}).env?.
VITE_ORCHESTRATE_BRAND;

export const BRAND_SLUG = (configured && configured.trim()) || 'batchlabel';
