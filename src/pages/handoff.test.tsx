import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppRedirect } from './AppRedirect';
import { CheckoutSuccess } from './checkout/CheckoutSuccess';
import { SiteHeader } from '../components/layout/SiteHeader';
import { APP_URL } from '../lib/app-handoff';

/**
 * THE PRODUCT IS app.batchlabel.xyz. THIS SITE IS MARKETING AND AUTH.
 *
 * This file used to test the www dashboard: that its empty state linked to the product
 * rather than to itself, and that the account shell kept a way back. That dashboard has
 * been deleted, because a second place to manage an account is what produced the complaint
 * these tests were written for — a maker finishing a signup, landing on this site, and
 * having to press a link to reach the thing they had just signed up for.
 *
 * What is left to assert is narrower and more important: the routes that dashboard owned
 * still resolve, they resolve INTO THE APP, and no screen a signed-in maker can reach on
 * this site pretends to be the product.
 */
const mocks = vi.hoisted(() => ({
  goToApp: vi.fn(),
  session: { user: { id: 'user-1' } } as unknown,
}));

vi.mock('../lib/app-handoff', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/app-handoff')>()),
  goToApp: (next?: string | null) => mocks.goToApp(next),
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    session: mocks.session,
    user: { id: 'user-1', email: 'maker@example.com' },
    loading: false,
    configured: true,
    signOut: vi.fn(),
  }),
}));

function renderAt(path: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

/**
 * The forwarding address for the deleted dashboard.
 *
 * These two paths are kept mounted rather than left to 404 because a bookmark, an old
 * email or a link in someone's notes still points at them. A stale link landing correctly
 * is the whole reason they exist; a stale link landing on a page of this site is the thing
 * being removed.
 */
describe('/dashboard, after the dashboard was removed', () => {
  beforeEach(() => {
    mocks.goToApp.mockReset();
  });

  it('forwards a stale bookmark into the app rather than rendering an account page', async () => {
    renderAt('/dashboard', <AppRedirect />);
    await waitFor(() => expect(mocks.goToApp).toHaveBeenCalledWith(undefined));
  });

  it('forwards the old account page to the app account settings, not to the app front door', async () => {
    renderAt('/dashboard/account', <AppRedirect to="/settings/account" />);
    await waitFor(() => expect(mocks.goToApp).toHaveBeenCalledWith('/settings/account'));
  });

  it('says what is happening rather than showing a blank page mid-navigation', () => {
    renderAt('/dashboard', <AppRedirect />);
    expect(screen.getByRole('status')).toHaveTextContent(/Taking you to Batchlabel/i);
  });

  /**
   * It renders no account data, so there is nothing here to protect and no reason to make
   * a signed-out visitor stop on this site first. The app's own gate sends them to
   * /log-in?next=… and therefore returns them to the page they were aiming at, which a
   * gate on this end would swallow.
   */
  it('forwards a signed-out visitor too, so the app can bounce them back to where they were going', async () => {
    mocks.session = null;
    renderAt('/dashboard', <AppRedirect />);
    await waitFor(() => expect(mocks.goToApp).toHaveBeenCalled());
    mocks.session = { user: { id: 'user-1' } };
  });
});

describe('after paying', () => {
  it('offers the product rather than a page of this site', () => {
    renderAt('/checkout/success', <CheckoutSuccess />);
    expect(screen.getByRole('link', { name: /back to my labels/i })).toHaveAttribute(
      'href',
      APP_URL,
    );
  });

  /** Billing lives in the app now. This used to point at www's /dashboard/account. */
  it('sends someone after their invoices into the app, not through a redirect they can watch', () => {
    renderAt('/checkout/success', <CheckoutSuccess />);
    expect(screen.getByRole('link', { name: /billing and invoices/i })).toHaveAttribute(
      'href',
      `${APP_URL}/billing`,
    );
  });

  it('does not tell someone who has just paid that their first label is free', () => {
    renderAt('/checkout/success', <CheckoutSuccess />);
    expect(screen.queryByText(/first label is free/i)).not.toBeInTheDocument();
  });
});

/**
 * The marketing pages themselves are NOT redirected, and that is deliberate. A signed-in
 * maker is allowed to read the pricing page or the FAQ; what they must not have to do is
 * hunt for the way back. The header carries it on every route.
 */
describe('the marketing header, seen by someone who is signed in', () => {
  it('offers the product instead of a log-in link', () => {
    render(
      <MemoryRouter initialEntries={['/pricing']}>
        <SiteHeader />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole('link', { name: /open batchlabel/i });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => expect(link).toHaveAttribute('href', APP_URL));
  });

  it('has no link anywhere to a dashboard on this site', () => {
    render(
      <MemoryRouter initialEntries={['/pricing']}>
        <SiteHeader />
      </MemoryRouter>,
    );
    const stale = screen
      .getAllByRole('link')
      .filter((link) => (link.getAttribute('href') ?? '').startsWith('/dashboard'));
    expect(stale).toEqual([]);
  });
});

/**
 * THE GUARD, because a redirect is exactly the kind of thing that regresses silently.
 *
 * Every one of these paths existed and worked, once. What made them wrong was not a broken
 * link but a correct link to the wrong place, which no rendering test notices — the button
 * is there, the page loads, and the maker is simply somewhere they did not ask to be. So
 * the rule is enforced over the source rather than over a screen: nothing this site ships
 * may route a signed-in maker to /dashboard, because there is nothing there to route them
 * to.
 */
const ROOT = resolve(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

/**
 * Comments may name the removed route to explain why it was removed. Code may not.
 *
 * `path="/dashboard"` is stripped too, and it is the one form that stays legitimate: a
 * route MOUNT at that path is the forwarding address. Everything else — a `to=`, an
 * `href=`, a `<Navigate>`, a `redirectTo` — is a destination, and there is no longer a
 * destination there to send anybody to.
 */
function scannableCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/path=(["'])[^"']*\1/g, ' ');
}

describe('nothing routes a maker to a dashboard on this site', () => {
  const files = sourceFiles(resolve(ROOT, 'src'));

  it('scans a real set of files, so a broken walk cannot pass vacuously', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('has no router target, link or redirect pointing at /dashboard', () => {
    const offenders = files.flatMap((file) => {
      const code = scannableCode(readFileSync(file, 'utf8'));
      // A quoted path, which is what a `to=`, an `href=`, a Navigate or a redirectTo is.
      const hits = code.match(/['"`]\/dashboard[^'"`]*['"`]/g) ?? [];
      return hits.map((hit) => `${relative(ROOT, file)}: ${hit}`);
    });
    expect(offenders).toEqual([]);
  });

  /**
   * The two forwarding routes in App.tsx are the deliberate exception and are matched on
   * their own terms: they must be `path=`, never a destination.
   */
  it('keeps /dashboard mounted as a forwarding address, so old bookmarks still land', () => {
    const app = readFileSync(resolve(ROOT, 'src/App.tsx'), 'utf8');
    expect(app).toContain('path="/dashboard"');
    expect(app).toContain('path="/dashboard/account"');
    expect(app).toContain('<AppRedirect');
  });
});
