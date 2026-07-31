import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ResetPassword } from './ResetPassword';

/**
 * A reset link works once and lasts an hour, so a stale one is a normal thing to
 * click — the second tap on an email, or one opened the next morning.
 *
 * Before this, that landed on a working-looking form. You chose a new password,
 * typed it twice, pressed the button, and Supabase's own string came back:
 * "Auth session missing!". Nothing said the link was the problem and nothing
 * offered a new one.
 */

const state = {
  session: null as unknown,
  loading: false,
  configured: true
};

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    session: state.session,
    loading: state.loading,
    configured: state.configured,
    updatePassword: vi.fn()
  })
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ResetPassword />
    </MemoryRouter>
  );
}

beforeEach(() => {
  state.session = null;
  state.loading = false;
  state.configured = true;
});

describe('a link that no longer works', () => {
  it('says so instead of showing a form that cannot save', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/expired/i);
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
  });

  it('offers a fresh link rather than leaving the maker on a dead end', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /send me a new link/i })).toHaveAttribute(
      'href',
      '/forgot-password'
    );
  });

  it('reassures them that nothing has changed about their account', () => {
    renderPage();
    expect(screen.getByText(/old password still works/i)).toBeInTheDocument();
  });
});

describe('while the recovery token is still being read out of the URL', () => {
  it('waits, rather than accusing a perfectly good link of being expired', () => {
    // supabase-js parses the token from the fragment asynchronously. Deciding before
    // that resolves would show "expired" to everyone, every time.
    state.loading = true;
    renderPage();
    expect(screen.queryByText(/expired/i)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('a link that worked', () => {
  it('shows the form', () => {
    state.session = { user: { id: 'user-1' } };
    renderPage();
    expect(screen.getByRole('button', { name: /save my new password/i })).toBeInTheDocument();
  });
});

describe('when Supabase is not configured', () => {
  it('still renders the form, so the shell can be reviewed locally', () => {
    state.configured = false;
    renderPage();
    expect(screen.getByRole('button', { name: /save my new password/i })).toBeInTheDocument();
  });
});
