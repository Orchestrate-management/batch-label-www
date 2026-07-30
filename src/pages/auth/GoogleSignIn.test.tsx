import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SignUp } from './SignUp';
import { LogIn } from './LogIn';

const mocks = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(),
  signUpWithPassword: vi.fn(),
  signInWithPassword: vi.fn(),
  sendMagicLink: vi.fn(),
}));

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    signUpWithPassword: mocks.signUpWithPassword,
    signInWithPassword: mocks.signInWithPassword,
    sendMagicLink: mocks.sendMagicLink,
    signInWithGoogle: mocks.signInWithGoogle,
    configured: true,
  }),
}));

function renderPage(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const googleButton = () => screen.getByRole('button', { name: /Continue with Google/i });

describe('Continue with Google', () => {
  beforeEach(() => {
    mocks.signInWithGoogle.mockReset();
    mocks.signInWithGoogle.mockResolvedValue({ error: null });
    mocks.signUpWithPassword.mockReset();
    window.dataLayer = [];
  });

  it('is offered on the sign up page and starts the redirect as a signup', async () => {
    renderPage(<SignUp />);
    fireEvent.click(googleButton());
    await waitFor(() =>
      expect(mocks.signInWithGoogle).toHaveBeenCalledWith({ intent: 'sign_up' }),
    );
  });

  it('is offered on the log in page and starts the redirect as a log in', async () => {
    renderPage(<LogIn />);
    fireEvent.click(googleButton());
    await waitFor(() => expect(mocks.signInWithGoogle).toHaveBeenCalledWith({ intent: 'log_in' }));
  });

  it('warns on the sign up page that the terms are still coming', () => {
    renderPage(<SignUp />);
    expect(screen.getByText(/shop name and the terms on the next screen/i)).toBeInTheDocument();
  });

  it('surfaces a failure to start the redirect instead of hanging', async () => {
    mocks.signInWithGoogle.mockResolvedValue({ error: 'Unsupported provider: google' });
    renderPage(<SignUp />);
    fireEvent.click(googleButton());
    expect(await screen.findByText('Unsupported provider: google')).toBeInTheDocument();
  });

  it('does not disturb the email signup path, which still carries its own consents', async () => {
    mocks.signUpWithPassword.mockResolvedValue({ error: null });
    renderPage(<SignUp />);

    fireEvent.change(screen.getByLabelText(/Business or shop name/i), {
      target: { value: 'Willow & Wick' },
    });
    fireEvent.change(screen.getByLabelText(/^Email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^Password/i), { target: { value: 'a-long-phrase' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /I accept the Terms of Service/i }));
    fireEvent.click(screen.getByRole('button', { name: /Create my account/i }));

    await waitFor(() => expect(mocks.signUpWithPassword).toHaveBeenCalled());
    expect(mocks.signInWithGoogle).not.toHaveBeenCalled();
  });

  it('still refuses an email signup with the terms unticked', () => {
    renderPage(<SignUp />);
    fireEvent.click(screen.getByRole('button', { name: /Create my account/i }));
    expect(mocks.signUpWithPassword).not.toHaveBeenCalled();
  });
});
