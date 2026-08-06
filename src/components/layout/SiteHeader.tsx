import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { MenuIcon, XIcon } from 'lucide-react';
import { HeaderBar } from './HeaderBar';
import { Button } from '../ui/Button';
import { useAuth } from '../../lib/auth';
import { APP_URL } from '../../lib/app-handoff';

const links = [
{ to: '/how-it-works', label: 'How it works' },
{ to: '/pricing', label: 'Pricing' },
{ to: '/faq', label: 'FAQ' }];


/**
 * The full-nav variant of the site header. Geometry — padding, reserved row height,
 * background, stickiness and the mark itself — lives in HeaderBar and is shared with the
 * auth and dashboard shells. Everything below is only what sits to the right of the mark.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { session } = useAuth();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <HeaderBar
      below={
      open ?
      <div id="mobile-nav" className="border-t border-paper-edge bg-paper md:hidden">
            <nav aria-label="Main, mobile" className="mx-auto grid w-full max-w-6xl gap-px px-5 py-3">
              {links.map((link) =>
          <NavLink
            key={link.to}
            to={link.to}
            className="flex min-h-[2.875rem] items-center rounded-lg px-2 font-display text-[1.05rem] font-medium text-ink-soft hover:bg-paper-deep hover:text-ink">

                  {link.label}
                </NavLink>
          )}
              {session ?
          <a
            href={APP_URL}
            className="flex min-h-[2.875rem] items-center rounded-lg px-2 font-display text-[1.05rem] font-medium text-ink-soft hover:bg-paper-deep hover:text-ink">
                  Open Batchlabel
                </a> :

          <NavLink
            to="/log-in"
            className="flex min-h-[2.875rem] items-center rounded-lg px-2 font-display text-[1.05rem] font-medium text-ink-soft hover:bg-paper-deep hover:text-ink">
                  Log in
                </NavLink>
          }
              <Button
            to="/sign-up"
            className="mt-3"
            size="lg"
            fullWidth
            track={{ label: 'Make a label free', location: 'mobile_nav' }}>

                Make a label free
              </Button>
            </nav>
          </div> :
      null
      }>

      {/*
        The active state was a 2px teal underline sitting 6px below the word, which is the
        browser's own visited-link language and read as "this is a link you have used".
        It is a clay tick above the word now — the same mark that opens every section — so
        "where I am" is said in the site's own vocabulary and does not compete with the
        underline used for real inline links.
       */}
      <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
        {links.map((link) =>
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) =>
          `relative flex min-h-[2.5rem] items-center text-[0.95rem] transition-colors before:absolute before:left-0 before:right-0 before:top-0 before:h-[2px] before:transition-colors ${
          isActive ?
          'font-medium text-ink before:bg-clay-500' :
          'text-ink-soft before:bg-transparent hover:text-ink hover:before:bg-paper-edge'}`

          }>

            {link.label}
          </NavLink>
        )}
      </nav>

      <div className="hidden items-center gap-5 md:flex">
        {session ?
        // Signed in means there is nothing for them here. A plain anchor, not a router
        // link: the app is a different origin, and the session travels in the shared
        // .batchlabel.xyz cookie either way.
        <a href={APP_URL} className="text-[0.95rem] text-ink-soft transition-colors hover:text-ink">
            Open Batchlabel
          </a> :

        <Link to="/log-in" className="text-[0.95rem] text-ink-soft transition-colors hover:text-ink">
            Log in
          </Link>
        }
        <Button to="/sign-up" track={{ label: 'Make a label free', location: 'header' }}>
          Make a label free
        </Button>
      </div>

      <button
        type="button"
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-ink-line/60 bg-white text-ink transition-colors hover:bg-paper-deep md:hidden"
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((value) => !value)}>

        <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
        {open ? <XIcon size={20} aria-hidden="true" /> : <MenuIcon size={20} aria-hidden="true" />}
      </button>
    </HeaderBar>);

}
