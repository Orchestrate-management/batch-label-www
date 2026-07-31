import React from 'react';
import { Link } from 'react-router-dom';
import { HeaderBar } from '../layout/HeaderBar';

interface AuthShellProps {
  title: string;
  intro?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthShell({ title, intro, children, footer }: AuthShellProps) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-paper">
      {/*
        The minimal variant: same HeaderBar, same padding, same reserved row height, so
        the mark lands on the exact pixel it occupied on the page the user just left —
        but nothing to the right of it. A signup page is a form to be completed, not a
        place to offer four ways to leave, and every page that uses this shell already
        cross-links its counterpart under the card via `footer`.
      */}
      <HeaderBar />

      <main className="flex flex-1 items-start justify-center px-5 py-10 sm:px-6 sm:py-14">
        <div className="w-full max-w-md">
          <h1 className="font-display text-[1.6rem] font-semibold leading-tight tracking-[-0.015em] text-ink sm:text-[1.9rem]">
            {title}
          </h1>
          {intro ? <p className="mt-2 text-[0.97rem] leading-relaxed text-ink-soft">{intro}</p> : null}

          <div className="mt-6 rounded-2xl border border-paper-edge bg-white p-5 sm:p-6">{children}</div>

          {footer ? <div className="mt-5 text-sm text-ink-soft">{footer}</div> : null}

          <p className="mt-8 text-xs leading-relaxed text-ink-muted">
            Batchlabel produces labels against published UK CLP and EU CLP requirements from the
            information you provide. Responsibility for the final label rests with you as the seller.
            See our{' '}
            <Link to="/terms" className="underline decoration-ink/20 underline-offset-2">
              terms
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="underline decoration-ink/20 underline-offset-2">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </main>
    </div>);

}