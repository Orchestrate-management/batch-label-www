import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * The end of the reset flow.
 *
 * The case worth defending is the one nobody tests by hand: arriving with no
 * recovery session. That happens on an expired link, a second click on a link
 * already used, and a link opened in a different browser from the one that asked
 * for it — none of them exotic. The page used to render the form anyway and fail
 * on submit with Supabase's own "Auth session missing!", after the person had
 * chosen a password and typed it twice.
 */

const updatePassword = vi.fn();
const goToApp = vi.fn();

let authState: {session: unknown;loading: boolean;configured: boolean;} = {
  session: { user: { id: 'user-1' } },
  loading: false,
  configured: true
};

async function renderPage() {
  vi.resetModules();

  vi.doMock('../../lib/auth', () => ({
    useAuth: () => ({ ...authState, updatePassword })
  }));
  vi.doMock('../../lib/app-handoff', () => ({
    goToApp,
    APP_URL: 'https://app.batchlabel.xyz'
  }));
  vi.doMock('../../lib/seo', () => ({ usePageMeta: () => undefined }));

  const { ResetPassword } = await import('./ResetPassword');
  return render(
    <MemoryRouter>
      <ResetPassword />
    </MemoryRouter>
  );
}

beforeEach(() => {
  authState = { session: { user: { id: 'user-1' } }, loading: false, configured: true };
  updatePassword.mockReset().mockResolvedValue({ error: null });
  goToApp.mockReset();
});

describe('with a recovery session', () => {
  it('saves the new password and hands the maker to the product', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByLabelText(/^new password/i), 'a-brand-new-passphrase');
    await user.type(screen.getByLabelText(/confirm new password/i), 'a-brand-new-passphrase');
    await user.click(screen.getByRole('button', { name: /save my new password/i }));

    await waitFor(() => expect(updatePassword).toHaveBeenCalledWith('a-brand-new-passphrase'));
    // Every other completed auth flow ends in the app. This one used to stop on
    // the marketing dashboard, one hop short.
    expect(goToApp).toHaveBeenCalled();
  });

  it('refuses a short password without asking Supabase', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByLabelText(/^new password/i), 'short');
    await user.type(screen.getByLabelText(/confirm new password/i), 'short');
    await user.click(screen.getByRole('button', { name: /save my new password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least eight characters/i);
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('refuses a mismatch', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByLabelText(/^new password/i), 'a-brand-new-passphrase');
    await user.type(screen.getByLabelText(/confirm new password/i), 'something-else-entirely');
    await user.click(screen.getByRole('button', { name: /save my new password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(updatePassword).not.toHaveBeenCalled();
  });
});

describe('with no recovery session', () => {
  beforeEach(() => {
    authState = { session: null, loading: false, configured: true };
  });

  it('explains the dead end instead of showing a form that cannot work', async () => {
    await renderPage();

    expect(screen.getByRole('heading', { name: /that link has expired/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^new password/i)).not.toBeInTheDocument();
  });

  it('offers the one action that fixes it', async () => {
    await renderPage();

    expect(screen.getByRole('link', { name: /send me a new link/i })).toHaveAttribute(
      'href',
      '/forgot-password'
    );
  });
});

describe('while the session is still resolving', () => {
  it('waits rather than telling a good link it has expired', async () => {
    authState = { session: null, loading: true, configured: true };
    await renderPage();

    // Reading the session is asynchronous. Deciding early would show the expiry
    // screen to everybody, for a moment, including everyone whose link is fine.
    expect(screen.queryByRole('heading', { name: /that link has expired/i })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/checking your link/i);
  });
});

describe('when Supabase is not configured', () => {
  it('still renders the form, so the screen can be reviewed', async () => {
    authState = { session: null, loading: false, configured: false };
    await renderPage();

    expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
  });
});
