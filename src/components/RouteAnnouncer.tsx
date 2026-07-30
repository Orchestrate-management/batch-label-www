import { useEffect, useRef, useState } from 'react';
import { PAGE_TITLE_EVENT } from '../lib/seo';

/**
 * Tells screen reader users that the page changed.
 *
 * A full page load is announced by the browser. A client side route change is not: React
 * Router swaps the DOM, `document.title` changes, and a screen reader says nothing, so
 * the user is left on what sounds like the same page. This polite live region reads the
 * new title after each navigation.
 *
 * Two details matter. The region is in the DOM from first paint and starts empty,
 * because assistive tech only announces changes to a region it was already watching. And
 * the first title is swallowed: on initial load the browser has already announced the
 * document, so repeating it is noise.
 *
 * Rendered from `App` rather than from a layout so its listener is registered before the
 * first page component's `usePageMeta` effect runs, which is what makes the "swallow the
 * first one" count correct.
 */
export function RouteAnnouncer() {
  const [message, setMessage] = useState('');
  const hasLoaded = useRef(false);

  useEffect(() => {
    const onTitle = (event: Event) => {
      const title = (event as CustomEvent<string>).detail;
      if (!hasLoaded.current) {
        hasLoaded.current = true;
        return;
      }
      setMessage(typeof title === 'string' ? title : '');
    };

    window.addEventListener(PAGE_TITLE_EVENT, onTitle);
    return () => window.removeEventListener(PAGE_TITLE_EVENT, onTitle);
  }, []);

  return (
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </p>);

}
