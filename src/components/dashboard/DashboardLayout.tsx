import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOutIcon } from 'lucide-react';
import { Logo } from '../layout/Logo';
import { useAuth } from '../../lib/auth';

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