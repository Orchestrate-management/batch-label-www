import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { RecoveryEntry } from '../../lib/recovery-entry';

/**
 * The end of the reset flow.
 *
 * The case that matters is not "no session" — it is "a session, but no recovery
 * link". The session cookie is shared across .batchlabel.xyz for 400 days, so on
 * this site an ordinary signed-in maker is signed in essentially always. A page
 * that gates on session presence therefore hands `updateUser({ password })` to
 * anyone holding the browser: no current password, no email, no proof. That is
 * the exact attack the product app asks for the current password to stop, and it
 * was walkable here on the sibling domain.
 *
 * An earlier version of this file had a block named "with a recovery session"
 * that seeded any session at all, which is why that hole passed a green suite.
 * The tests below keep the two ideas apart on purpose.
 */

const updatePassword = vi.fn();
const revokeOtherSessions = vi.fn();
const goToApp = vi.fn();
const clearRecoveryEntry = vi.fn();

let authState: {session: unknown;loading: boolean;configured: boolean;} = {
  session: { user: { id: 'user-1' } },
  loading: false,
  configured: true
};
let entry: RecoveryEntry = { kind: 'recovery' };

async function renderPage() {
  vi.resetModules();

  vi.doMock('../../lib/auth', () => ({
    useAuth: () => ({ ...authState, updatePassword, revokeOtherSessions })
  }));
  vi.doMock('../../lib/app-handoff', () => ({
    goToApp,
    APP_URL: 'https://app.batchlabel.xyz'
  }));
  vi.doMock('../../lib/seo', () => ({ usePageMeta: () => undefined }));
  vi.doMock('../../lib/recovery-entry', () => ({
    recoveryEntry: () => entry,
    clearRecoveryEntry
  }));

  const { ResetPassword } = await import('./ResetPassword');
  return render(
    <MemoryRouter>
      <ResetPassword />
    </MemoryRouter>
  );
}

const form = () => screen.queryByLabelText(/^new password/i);

beforeEach(() => {
  authState = { session: { user: { id: 'user-1' } }, loading: false, configured: true };
  entry = { kind: 'recovery' };
  updatePassword.mockReset().mockResolvedValue({ error: null });
  revokeOtherSessions.mockReset().mockResolvedValue({ error: null });
  goToApp.mockReset();
  clearRecoveryEntry.mockReset();
});

describe('arrived through a working recovery link', () => {
  it('saves the new password, ends other sessions, and hands over to the product', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByLabelText(/^new password/i), 'a-brand-new-passphrase');
    await user.type(screen.getByLabelText(/confirm new password/i), 'a-brand-new-passphrase');
    await user.click(screen.getByRole('button', { name: /save my new password/i }));

    await waitFor(() => expect(updatePassword).toHaveBeenCalledWith('a-brand-new-passphrase'));
    // A reset is what someone does when they think another person is in their
    // account. Leaving that person signed in would achieve nothing.
    expect(revokeOtherSessions).toHaveBeenCalled();
    // The marker must not survive as a standing permission to do it again.
    expect(clearRecoveryEntry).toHaveBeenCalled();
    expect(goToApp).toHaveBeenCalled();
  });

  it('says what will happen to other devices before it happens', async () => {
    await renderPage();
    expect(screen.getByText(/signs you out on every other device/i)).toBeInTheDocument();
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

  it('does not hand over or revoke anything when the change fails', async () => {
    updatePassword.mockResolvedValue({ error: 'Password is too weak' });
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByLabelText(/^new password/i), 'a-brand-new-passphrase');
    await user.type(screen.getByLabelText(/confirm new password/i), 'a-brand-new-passphrase');
    await user.click(screen.getByRole('button', { name: /save my new password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/too weak/i);
    expect(revokeOtherSessions).not.toHaveBeenCalled();
    expect(goToApp).not.toHaveBeenCalled();
  });
});

describe('signed in, but no recovery link — the takeover case', () => {
  beforeEach(() => {
    // Exactly what an ordinary signed-in maker looks like on this site, and
    // exactly what someone holding their unlocked laptop looks like too.
    authState = { session: { user: { id: 'user-1' } }, loading: false, configured: true };
    entry = { kind: 'none' };
  });

  it('does NOT render the password form', async () => {
    await renderPage();

    expect(form()).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save my new password/i })).not.toBeInTheDocument();
  });

  it('cannot reach updateUser at all', async () => {
    await renderPage();
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('sends them to the app, which asks for the current password', async () => {
    await renderPage();

    expect(screen.getByRole('heading', { name: /needs the link we email you/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /change it in the app/i })).toHaveAttribute(
      'href',
      'https://app.batchlabel.xyz/settings/account'
    );
    expect(screen.getByRole('link', { name: /email me a reset link/i })).toHaveAttribute(
      'href',
      '/forgot-password'
    );
  });
});

describe('no link and not signed in', () => {
  beforeEach(() => {
    authState = { session: null, loading: false, configured: true };
    entry = { kind: 'none' };
  });

  it('explains rather than showing a form that cannot work', async () => {
    await renderPage();

    expect(form()).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /email me a reset link/i })).toBeInTheDocument();
    // No app link: there is no session to change a password with.
    expect(screen.queryByRole('link', { name: /change it in the app/i })).not.toBeInTheDocument();
  });
});

describe('the link failed', () => {
  /**
   * The population this used to miss entirely. auth-js keeps an existing session
   * when a URL login fails (GoTrueClient.js:401, "Don't remove existing session
   * on URL login failure"), so a signed-in maker whose link had expired kept
   * their session, passed a session-presence check, and saw a form — while the
   * link they clicked had done nothing at all.
   */
  it('shows the expired screen even though the maker is still signed in', async () => {
    authState = { session: { user: { id: 'user-1' } }, loading: false, configured: true };
    entry = { kind: 'link_failed', code: 'otp_expired', description: 'Email link has expired' };
    await renderPage();

    expect(screen.getByRole('heading', { name: /that link has expired/i })).toBeInTheDocument();
    expect(form()).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /send me a new link/i })).toHaveAttribute(
      'href',
      '/forgot-password'
    );
  });

  it('shows it when signed out too', async () => {
    authState = { session: null, loading: false, configured: true };
    entry = { kind: 'link_failed', code: 'access_denied', description: null };
    await renderPage();

    expect(screen.getByRole('heading', { name: /that link has expired/i })).toBeInTheDocument();
  });
});

describe('a recovery marker with no session', () => {
  it('is treated as expired, not as permission', async () => {
    authState = { session: null, loading: false, configured: true };
    entry = { kind: 'recovery' };
    await renderPage();

    expect(screen.getByRole('heading', { name: /that link has expired/i })).toBeInTheDocument();
    expect(form()).not.toBeInTheDocument();
  });
});

describe('while the session is still resolving', () => {
  it('waits rather than telling a good link it has expired', async () => {
    authState = { session: null, loading: true, configured: true };
    entry = { kind: 'recovery' };
    await renderPage();

    expect(screen.queryByRole('heading', { name: /that link has expired/i })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/checking your link/i);
  });
});

describe('when Supabase is not configured', () => {
  it('still renders the form, so the screen can be reviewed', async () => {
    authState = { session: null, loading: false, configured: false };
    entry = { kind: 'none' };
    await renderPage();

    expect(form()).toBeInTheDocument();
  });
});
