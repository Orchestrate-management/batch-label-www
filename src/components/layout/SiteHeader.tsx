import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { MenuIcon, XIcon } from 'lucide-react';
import { Logo } from './Logo';
import { Button } from '../ui/Button';
import { useAuth } from '../../lib/auth';

const links = [
{ to: '/how-it-works', label: 'How it works' },
{ to: '/pricing', label: 'Pricing' },
{ to: '/faq', label: 'FAQ' },
{ to: '/about', label: 'About' }];


export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { session } = useAuth();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-40 border-b border-paper-edge bg-paper/95 backdrop-blur-[2px]">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-3 sm:px-6">
        <Logo />

        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
          {links.map((link) =>
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
            `text-[0.95rem] ${
            isActive ? 'text-ink underline decoration-teal-700 decoration-2 underline-offset-[6px]' : 'text-ink-soft hover:text-ink'}`

            }>
            
              {link.label}
            </NavLink>
          )}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {session ?
          <Link to="/dashboard" className="text-[0.95rem] text-ink-soft hover:text-ink">
              Dashboard
            </Link> :

          <Link to="/log-in" className="text-[0.95rem] text-ink-soft hover:text-ink">
              Log in
            </Link>
          }
          <Button to="/sign-up" track={{ label: 'Make a label free', location: 'header' }}>
            Make a label free
          </Button>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-xl border border-ink/15 bg-white p-2 text-ink md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((value) => !value)}>
          
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          {open ? <XIcon size={20} aria-hidden="true" /> : <MenuIcon size={20} aria-hidden="true" />}
        </button>
      </div>

      {open ?
      <div id="mobile-nav" className="border-t border-paper-edge bg-paper md:hidden">
          <nav aria-label="Main, mobile" className="mx-auto grid w-full max-w-5xl gap-1 px-5 py-3">
            {links.map((link) =>
          <NavLink
            key={link.to}
            to={link.to}
            className="rounded-lg px-2 py-2.5 text-[0.98rem] text-ink-soft hover:bg-paper-deep hover:text-ink">
            
                {link.label}
              </NavLink>
          )}
            <NavLink
            to={session ? '/dashboard' : '/log-in'}
            className="rounded-lg px-2 py-2.5 text-[0.98rem] text-ink-soft hover:bg-paper-deep hover:text-ink">
            
              {session ? 'Dashboard' : 'Log in'}
            </NavLink>
            <Button
            to="/sign-up"
            className="mt-2"
            fullWidth
            track={{ label: 'Make a label free', location: 'mobile_nav' }}>
            
              Make a label free
            </Button>
          </nav>
        </div> :
      null}
    </header>);

}