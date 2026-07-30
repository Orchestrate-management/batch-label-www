import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SignUp } from './SignUp';
import { LogIn } from './LogIn';

/**
 * The Google option is gated on VITE_GOOGLE_AUTH_ENABLED so that merging this code
 * cannot put a "Continue with Google" button in front of a maker before the provider is
 * switched on in Supabase and the OAuth client exists in Google Cloud Console. A button
 * that errors is worse than no button.
 *
 * The flag is unset under test, which is the disabled case, so these render the real
 * pages with no mocking of the gate at all.
 */
vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    signUpWithPassword: vi.fn(),
    signInWithPassword: vi.fn(),
    sendMagicLink: vi.fn(),
    signInWithGoogle: vi.fn(),
    configured: true
  })
}));

function renderPage(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('Google sign-in gate (flag off)', () => {
  it('hides the Google button on sign up until the flag is set', () => {
    renderPage(<SignUp />);
    expect(
      screen.queryByRole('button', { name: /Continue with Google/i })
    ).not.toBeInTheDocument();
  });

  it('hides the Google button on log in until the flag is set', () => {
    renderPage(<LogIn />);
    expect(
      screen.queryByRole('button', { name: /Continue with Google/i })
    ).not.toBeInTheDocument();
  });

  it('still offers the email routes while Google is switched off', () => {
    renderPage(<SignUp />);
    expect(screen.getByRole('button', { name: /Create my account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Business or shop name/i)).toBeInTheDocument();
  });
});
