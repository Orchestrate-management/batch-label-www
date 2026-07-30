import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth, RequireMembership } from './auth';

const mocks = vi.hoisted(() => ({
  fetchMembershipState: vi.fn(),
  signInWithOAuth: vi.fn(),
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

/** The real route shape from App.tsx: both pages gated, in opposite directions. */
function renderApp(at: string) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <AuthProvider>
        <Routes>
          <Route path="/log-in" element={<p>Log in page</p>} />
          <Route
            path="/finish-setup"
            element={
              <RequireAuth>
                <RequireMembership page="finish_setup">
                  <p>Finish setup screen</p>
                </RequireMembership>
              </RequireAuth>
            }
          />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <RequireMembership page="dashboard">
                  <p>Dashboard</p>
                </RequireMembership>
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('RequireMembership (the OAuth completion gate)', () => {
  beforeEach(() => {
    mocks.fetchMembershipState.mockReset();
    mocks.session = { user: { id: 'user-1', email: 'maker@example.com' } };
  });

  it('keeps a Google user with no membership out of the dashboard', async () => {
    mocks.fetchMembershipState.mockResolvedValue('needs_setup');
    renderApp('/dashboard');
    expect(await screen.findByText('Finish setup screen')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('lets a provisioned user straight into the dashboard', async () => {
    mocks.fetchMembershipState.mockResolvedValue('complete');
    renderApp('/dashboard');
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('does not re-ask a returning Google user for consent', async () => {
    mocks.fetchMembershipState.mockResolvedValue('complete');
    renderApp('/finish-setup');
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Finish setup screen')).not.toBeInTheDocument();
  });

  it('shows the dashboard rather than trapping anyone when the membership read fails', async () => {
    mocks.fetchMembershipState.mockResolvedValue('unknown');
    renderApp('/dashboard');
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('checks the membership once per visit, not once per render', async () => {
    mocks.fetchMembershipState.mockResolvedValue('complete');
    renderApp('/dashboard');
    await screen.findByText('Dashboard');
    expect(mocks.fetchMembershipState).toHaveBeenCalledTimes(1);
  });

  it('sends a signed-out visitor to log in before any membership check happens', async () => {
    mocks.session = null;
    mocks.fetchMembershipState.mockResolvedValue('needs_setup');
    renderApp('/dashboard');
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
        user: { id: 'user-1', email: 'maker@example.com' }
      });
    });

    expect(screen.getByText('Finish setup screen')).toBeInTheDocument();
    expect(screen.queryByText('Checking your account...')).not.toBeInTheDocument();
    // The user did not change, so there is nothing to re-check.
    expect(mocks.fetchMembershipState).toHaveBeenCalledTimes(1);
  });

  it('re-checks when a genuinely different user signs in', async () => {
    mocks.fetchMembershipState.mockResolvedValue('complete');
    renderApp('/dashboard');
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();

    await act(async () => {
      mocks.authCallback?.('SIGNED_IN', {
        user: { id: 'user-2', email: 'someone-else@example.com' }
      });
    });

    expect(mocks.fetchMembershipState).toHaveBeenCalledTimes(2);
  });
});
