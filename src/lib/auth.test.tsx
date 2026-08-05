import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, HandOffIfSignedIn, RequireAuth, RequireSetup } from './auth';

/**
 * THE TWO GATES, AND THE ONE THING NEITHER OF THEM MAY DO.
 *
 * The product is app.batchlabel.xyz. This site is marketing and auth, and since the
 * dashboard was removed it has no signed-in destination at all except /finish-setup, which
 * exists only to collect a Terms acceptance an OAuth redirect could not carry.
 *
 * So every assertion below is one of two shapes: "this person ended up in the app", or
 * "this person was asked for consent first". Anything that leaves a signed-in maker
 * sitting on a page of this site is the bug being fixed.
 */
const mocks = vi.hoisted(() => ({
  fetchMembershipState: vi.fn(),
  signInWithOAuth: vi.fn((_args: unknown) => Promise.resolve({ error: null })),
  goToApp: vi.fn(),
  session: { user: { id: 'user-1', email: 'maker@example.com' } } as unknown,
  /** Captured so a test can fire an auth state change the way supabase-js does. */
  authCallback: null as null | ((event: string, session: unknown) => void),
}));

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: mocks.session } }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        mocks.authCallback = cb;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      signInWithOAuth: (args: unknown) => mocks.signInWithOAuth(args),
    },
  },
  isSupabaseConfigured: true,
  MISSING_CONFIG_MESSAGE: 'not connected',
}));

vi.mock('./membership', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./membership')>()),
  fetchMembershipState: () => mocks.fetchMembershipState(),
}));

/**
 * Leaving for the app is a cross-origin navigation, which jsdom cannot perform. Spy on it
 * rather than on window.location, so a test can assert the destination as well as the fact.
 */
vi.mock('./app-handoff', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./app-handoff')>()),
  goToApp: (next?: string | null) => mocks.goToApp(next),
}));

/** The real route shape from App.tsx. */
function renderApp(at: string) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <AuthProvider>
        <Routes>
          <Route
            path="/log-in"
            element={
              <HandOffIfSignedIn>
                <p>Log in page</p>
              </HandOffIfSignedIn>
            }
          />
          <Route
            path="/finish-setup"
            element={
              <RequireAuth>
                <RequireSetup>
                  <p>Finish setup screen</p>
                </RequireSetup>
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const leftForApp = () => waitFor(() => expect(mocks.goToApp).toHaveBeenCalled());

describe('RequireSetup (the gate on /finish-setup, where Google returns)', () => {
  beforeEach(() => {
    mocks.fetchMembershipState.mockReset();
    mocks.goToApp.mockReset();
    mocks.session = { user: { id: 'user-1', email: 'maker@example.com' } };
  });

  it('shows the consent form to a Google user with no membership', async () => {
    mocks.fetchMembershipState.mockResolvedValue('needs_setup');
    renderApp('/finish-setup');
    expect(await screen.findByText('Finish setup screen')).toBeInTheDocument();
    expect(mocks.goToApp).not.toHaveBeenCalled();
  });

  /**
   * THE REGRESSION THIS FILE EXISTS FOR. A returning Google user used to be redirected
   * from here to www/dashboard — signed in, on the marketing site, one click short of the
   * product they had just asked to be signed in to.
   */
  it('hands a returning Google user straight to the app, with no page of ours in between', async () => {
    mocks.fetchMembershipState.mockResolvedValue('complete');
    renderApp('/finish-setup');
    await leftForApp();
    expect(screen.queryByText('Finish setup screen')).not.toBeInTheDocument();
  });

  it('never sends anyone from here to a dashboard on this site', async () => {
    mocks.fetchMembershipState.mockResolvedValue('complete');
    renderApp('/finish-setup');
    await leftForApp();
    expect(mocks.goToApp).toHaveBeenCalledWith(undefined);
  });

  it('says what is happening while the browser is on its way', async () => {
    mocks.fetchMembershipState.mockResolvedValue('complete');
    renderApp('/finish-setup');
    expect(await screen.findByText(/Taking you to Batchlabel/i)).toBeInTheDocument();
  });

  /**
   * A failed read must not push somebody past a consent gate. Being asked once more is
   * cheap; being in the product with no Terms acceptance on file is not.
   */
  it('shows the form rather than the app when the membership read fails', async () => {
    mocks.fetchMembershipState.mockResolvedValue('unknown');
    renderApp('/finish-setup');
    expect(await screen.findByText('Finish setup screen')).toBeInTheDocument();
    expect(mocks.goToApp).not.toHaveBeenCalled();
  });

  it('checks the membership once per visit, not once per render', async () => {
    mocks.fetchMembershipState.mockResolvedValue('needs_setup');
    renderApp('/finish-setup');
    await screen.findByText('Finish setup screen');
    expect(mocks.fetchMembershipState).toHaveBeenCalledTimes(1);
  });

  it('sends a signed-out visitor to log in before any membership check happens', async () => {
    mocks.session = null;
    mocks.fetchMembershipState.mockResolvedValue('needs_setup');
    renderApp('/finish-setup');
    expect(await screen.findByText('Log in page')).toBeInTheDocument();
    expect(mocks.fetchMembershipState).not.toHaveBeenCalled();
  });

  /**
   * Regression: supabase-js re-reads the session from storage on every tab refocus and
   * token refresh and notifies with a BRAND NEW object. Keying the gate on that object,
   * and blanking the state while refetching, unmounted the completion screen and wiped a
   * half-filled consent form — triggered by the user doing exactly what we ask, opening
   * the terms in a new tab to read them before accepting.
   */
  it('keeps the completion screen mounted when supabase re-notifies with a new session object', async () => {
    mocks.fetchMembershipState.mockResolvedValue('needs_setup');
    renderApp('/finish-setup');
    expect(await screen.findByText('Finish setup screen')).toBeInTheDocument();

    // Same user, different object identity — what a visibilitychange produces.
    await act(async () => {
      mocks.authCallback?.('SIGNED_IN', {
        user: { id: 'user-1', email: 'maker@example.com' },
      });
    });

    expect(screen.getByText('Finish setup screen')).toBeInTheDocument();
    expect(screen.queryByText('Checking your account...')).not.toBeInTheDocument();
    // The user did not change, so there is nothing to re-check.
    expect(mocks.fetchMembershipState).toHaveBeenCalledTimes(1);
  });

  it('re-checks when a genuinely different user signs in', async () => {
    mocks.fetchMembershipState.mockResolvedValue('needs_setup');
    renderApp('/finish-setup');
    expect(await screen.findByText('Finish setup screen')).toBeInTheDocument();

    await act(async () => {
      mocks.authCallback?.('SIGNED_IN', {
        user: { id: 'user-2', email: 'someone-else@example.com' },
      });
    });

    await waitFor(() => expect(mocks.fetchMembershipState).toHaveBeenCalledTimes(2));
  });
});

/**
 * The session cookie on `.batchlabel.xyz` lasts 400 days, so a returning maker arriving at
 * /log-in from a bookmark is already signed in. Handing them a form to fill in — one that
 * ends in the same handoff — is the dashboard detour again, one page along.
 */
describe('HandOffIfSignedIn (the gate on /log-in)', () => {
  beforeEach(() => {
    mocks.fetchMembershipState.mockReset();
    mocks.goToApp.mockReset();
    mocks.session = { user: { id: 'user-1', email: 'maker@example.com' } };
  });

  it('shows the form to somebody who is not signed in', async () => {
    mocks.session = null;
    renderApp('/log-in');
    expect(await screen.findByText('Log in page')).toBeInTheDocument();
    expect(mocks.goToApp).not.toHaveBeenCalled();
  });

  it('sends an already-signed-in maker to the app instead of asking for a password', async () => {
    mocks.fetchMembershipState.mockResolvedValue('complete');
    renderApp('/log-in');
    await leftForApp();
    expect(screen.queryByText('Log in page')).not.toBeInTheDocument();
  });

  /**
   * `next` is how the app asks to be returned to the page the maker was actually on. It is
   * attacker-controllable, so it is passed to goToApp, which validates it against the
   * allow-list — see lib/app-handoff.ts. Dropping it here would send a customer who
   * clicked a deep link to the app's front door instead.
   */
  it('honours the deep link the app asked us to return to', async () => {
    mocks.fetchMembershipState.mockResolvedValue('complete');
    renderApp('/log-in?next=https%3A%2F%2Fapp.batchlabel.xyz%2Fproducts%2F123');
    await waitFor(() =>
      expect(mocks.goToApp).toHaveBeenCalledWith('https://app.batchlabel.xyz/products/123'),
    );
  });

  /**
   * A Google user who abandoned /finish-setup has a session and no Terms acceptance. This
   * route must not be the back door that puts them in the product without one.
   */
  it('sends a half-finished Google signup to the consent screen, not to the app', async () => {
    mocks.fetchMembershipState.mockResolvedValue('needs_setup');
    renderApp('/log-in');
    expect(await screen.findByText('Finish setup screen')).toBeInTheDocument();
    expect(mocks.goToApp).not.toHaveBeenCalled();
  });

  /**
   * The opposite call from the completion gate, on purpose: there is no consent gate to
   * skip here, and a successful password login on this very page already hands over
   * without reading the membership at all.
   */
  it('sends them to the app when the membership read fails', async () => {
    mocks.fetchMembershipState.mockResolvedValue('unknown');
    renderApp('/log-in');
    await leftForApp();
  });

  /**
   * REGRESSION, AND THE ONE THIS GATE ALMOST SHIPPED WITH.
   *
   * "Not asked yet" and "asked and failed" are both absences, and for one frame they look
   * identical: the session has not resolved, so there is no user to read a membership for,
   * so the state sits at `unknown` — which this gate treats as "go to the app".
   *
   * The window is a few milliseconds and it opens on every single page load, so the
   * failure is intermittent by construction: a Google user who still owed us a Terms
   * acceptance would be handed into the product before the read that would have stopped
   * them came back. Nothing would look broken; there would just be an account in the
   * product with no consent on file.
   *
   * The fix is in useMembershipState — the answer is stored with the user id it is about,
   * so an answer that is not about the current user reads as "still waiting" rather than
   * as a failure. This test holds the read open to keep that window forced wide.
   */
  it('waits for the membership read rather than acting on the gap before it', async () => {
    let land: (state: string) => void = () => undefined;
    mocks.fetchMembershipState.mockReturnValue(
      new Promise<string>((resolve) => {
        land = resolve;
      }),
    );

    renderApp('/log-in');

    // The session resolves well before the membership does. Nothing may happen yet.
    await waitFor(() => expect(mocks.fetchMembershipState).toHaveBeenCalled());
    expect(mocks.goToApp).not.toHaveBeenCalled();
    expect(screen.queryByText('Log in page')).not.toBeInTheDocument();

    await act(async () => {
      land('needs_setup');
    });

    expect(await screen.findByText('Finish setup screen')).toBeInTheDocument();
    expect(mocks.goToApp).not.toHaveBeenCalled();
  });
});

/* Where signInWithGoogle actually sends the browser is asserted in auth-redirects.test.tsx,
   alongside the other three flows, so the four decisions sit in one place and a "tidy-up"
   that points them all at the same destination fails a test that explains why it must not. */
