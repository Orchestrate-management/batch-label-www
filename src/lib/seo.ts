import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from './analytics';

const SITE_NAME = 'Batchlabel';
const OG_IMAGE_SLOT = 'https://batchlabel.co.uk/og/batchlabel-share.png'; // TODO: replace with the final 1200x630 share image.

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
 * Sets the per page title, description, Open Graph and Twitter tags, then fires a
 * page_view to the dataLayer once the metadata is in place.
 */
export function usePageMeta({ title, description, noIndex = false }: PageMeta) {
  const location = useLocation();

  useEffect(() => {
    const fullTitle = `${title} | ${SITE_NAME}`;
    document.title = fullTitle;
    const url =
    typeof window === 'undefined' ? '' : `${window.location.origin}${location.pathname}`;

    upsertMeta('meta[name="description"]', 'name', 'description', description);
    upsertMeta('meta[name="robots"]', 'name', 'robots', noIndex ? 'noindex, nofollow' : 'index, follow');
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', fullTitle);
    upsertMeta('meta[property="og:description"]', 'property', 'og:description', description);
    upsertMeta('meta[property="og:type"]', 'property', 'og:type', 'website');
    upsertMeta('meta[property="og:site_name"]', 'property', 'og:site_name', SITE_NAME);
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', url);
    upsertMeta('meta[property="og:image"]', 'property', 'og:image', OG_IMAGE_SLOT);
    upsertMeta('meta[property="og:locale"]', 'property', 'og:locale', 'en_GB');
    upsertMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
    upsertMeta('meta[name="twitter:title"]', 'name', 'twitter:title', fullTitle);
    upsertMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    upsertMeta('meta[name="twitter:image"]', 'name', 'twitter:image', OG_IMAGE_SLOT);
    if (url) upsertCanonical(url);

    trackPageView(location.pathname, fullTitle);
  }, [title, description, noIndex, location.pathname]);
}