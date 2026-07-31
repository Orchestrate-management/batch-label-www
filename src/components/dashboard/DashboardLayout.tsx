import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ExternalLinkIcon, LogOutIcon } from 'lucide-react';
import { Logo } from '../layout/Logo';
import { useAuth } from '../../lib/auth';
import { APP_URL } from '../../lib/app-handoff';

const tabs = [
{ to: '/dashboard', label: 'Labels', end: true },
{ to: '/dashboard/account', label: 'Account and billing', end: false }];


export function DashboardLayout() {
  const { user, signOut, configured } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-paper">
      <header className="border-b border-paper-edge bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-3 sm:px-6">
          <Logo />
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-ink-muted sm:inline">
              {user?.email ?? 'Not signed in'}
            </span>
            {/*
              The way back. Everything a maker actually does happens in the product,
              and until now this account area had no link to it — someone who came
              here to change a card had to know the app's address to get back to work.
              A plain anchor, not goToApp: this is a link a person may want to open in
              a new tab, and the session crosses in a cookie either way.
             */}
            <a
              href={APP_URL}
              className="inline-flex items-center gap-1.5 text-sm text-teal-700 underline decoration-teal-700/30 underline-offset-4 hover:decoration-teal-700">
              Open Batchlabel
              <ExternalLinkIcon size={14} aria-hidden="true" />
            </a>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 rounded-xl border border-ink/15 px-3 py-2 text-sm text-ink-soft hover:bg-paper-deep hover:text-ink">
              
              <LogOutIcon size={15} aria-hidden="true" />
              Log out
            </button>
          </div>
        </div>
        <div className="mx-auto w-full max-w-5xl px-5 sm:px-6">
          <nav aria-label="Dashboard" className="flex gap-5">
            {tabs.map((tab) =>
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
              `-mb-px border-b-2 pb-2.5 pt-1 text-sm ${
              isActive ? 'border-teal-700 text-ink' : 'border-transparent text-ink-muted hover:text-ink'}`

              }>
              
                {tab.label}
              </NavLink>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 sm:px-6">
        {!configured ?
        <div className="mb-6 rounded-xl border border-paper-edge bg-white px-4 py-3 text-sm text-ink-soft">
            This is the dashboard shell. Sign in is not connected in this environment, so you are
            seeing it as a new maker would.
          </div> :
        null}
        <Outlet />
      </main>

      <footer className="border-t border-paper-edge px-5 py-6 text-xs leading-relaxed text-ink-muted sm:px-6">
        <div className="mx-auto w-full max-w-5xl">
          Batchlabel produces labels against published UK CLP and EU CLP requirements from the
          information you provide. Responsibility for the final label rests with you as the seller.
        </div>
      </footer>
    </div>);

}