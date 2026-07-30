import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from './analytics';
import { SITE_NAME, canonicalUrl } from './routes';
import { OG_IMAGE_URL, OG_IMAGE_ALT, type JsonLd } from './structured-data';

/**
 * Fired once `document.title` has been updated for a route. `components/RouteAnnouncer`
 * listens for it: a client side router replaces the page without the browser announcing
 * anything, so a screen reader user otherwise gets no signal that navigation happened.
 */
export const PAGE_TITLE_EVENT = 'bl:page-title';

/** Marks the JSON-LD blocks this module owns, so it never removes somebody else's. */
const JSONLD_ATTRIBUTE = 'data-bl-jsonld';

function upsertMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

export interface PageMeta {
  title: string;
  description: string;
  noIndex?: boolean;
}

/**
 * Sets the per page title, description, canonical, Open Graph and Twitter tags, then
 * fires a page_view to the dataLayer once the metadata is in place.
 *
 * Canonicals are pinned to the canonical origin rather than derived from
 * `window.location.origin`. The apex domain 308-redirects to `www`, and preview
 * deployments serve the whole site on a vercel.app host, so deriving it from the current
 * origin emits a different canonical for the same page depending on where it loaded.
 */
export function usePageMeta({ title, description, noIndex = false }: PageMeta) {
  const location = useLocation();

  useEffect(() => {
    const fullTitle = `${title} | ${SITE_NAME}`;
    document.title = fullTitle;
    const url = canonicalUrl(location.pathname);

    upsertMeta('meta[name="description"]', 'name', 'description', description);
    upsertMeta('meta[name="robots"]', 'name', 'robots', noIndex ? 'noindex, nofollow' : 'index, follow');
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle);
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', description);
    upsertMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
    upsertMeta('meta[property="og:site_name"]', 'property', 'og:site_name', SITE_NAME);
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', url);
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', OG_IMAGE_URL);
    upsertMeta('meta[property="og:image:alt"]', 'property', 'og:image:alt', OG_IMAGE_ALT);
    upsertMeta('meta[property="og:image:width"]', 'property', 'og:image:width', '1200');
    upsertMeta('meta[property="og:image:height"]', 'property', 'og:image:height', '630');
    upsertMeta('meta[property="og:locale"]', 'property', 'og:locale', 'en_GB');
    upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle);
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', OG_IMAGE_URL);
    upsertMeta('meta[name="twitter:image:alt"]', 'name', 'twitter:image:alt', OG_IMAGE_ALT);
    upsertCanonical(url);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(PAGE_TITLE_EVENT, { detail: fullTitle }));
    }

    trackPageView(location.pathname, fullTitle);
  }, [title, description, noIndex, location.pathname]);
}

/**
 * Injects one JSON-LD block for the current page and removes it on the way out, so a
 * route change never leaves the previous page's markup behind.
 *
 * `Organization` and `WebSite` are not injected here. They are static in `index.html`,
 * where a crawler that does not execute JavaScript still sees them.
 */
export function useStructuredData(schema: JsonLd | null) {
  const serialised = schema ? JSON.stringify(schema) : null;

  useEffect(() => {
    if (!serialised) return;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute(JSONLD_ATTRIBUTE, 'page');
    script.textContent = serialised;
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [serialised]);
}
