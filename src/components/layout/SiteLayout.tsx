import { Outlet } from 'react-router-dom';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';

export function SiteLayout() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-teal-700 focus:px-4 focus:py-2 focus:text-sm focus:text-white">
        
        Skip to content
      </a>
      <SiteHeader />
      {/*
        tabIndex={-1} is what makes the skip link work. Without it, <main> is not
        focusable, and Safari in particular moves the scroll position to the fragment but
        leaves focus on the skip link, so the next Tab drops the user straight back into
        the header they were trying to skip.
      */}
      <main id="main" tabIndex={-1} className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>);

}