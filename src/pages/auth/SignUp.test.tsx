import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SignUp } from './SignUp';

const mocks = vi.hoisted(() => ({
  signUpWithPassword: vi.fn(),
  sendMagicLink: vi.fn(),
  signInWithGoogle: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mocks.navigate,
}));

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    signUpWithPassword: mocks.signUpWithPassword,
    sendMagicLink: mocks.sendMagicLink,
    signInWithGoogle: mocks.signInWithGoogle,
    configured: true,
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <SignUp />
    </MemoryRouter>,
  );
}

const terms = () => screen.getByRole('checkbox', { name: /I accept the Terms of Service/i });
const submit = () => screen.getByRole('button', { name: /Create my account/i });

function fillTheForm() {
  fireEvent.change(screen.getByLabelText(/Business or shop name/i), {
    target: { value: 'Willow & Wick' },
  });
  fireEvent.change(screen.getByLabelText(/^Email/i), { target: { value: 'maker@example.com' } });
  fireEvent.change(screen.getByLabelText(/^Password/i), { target: { value: 'a-long-phrase' } });
}

describe('SignUp consents', () => {
  beforeEach(() => {
    mocks.signUpWithPassword.mockReset();
    mocks.signUpWithPassword.mockResolvedValue({ error: null });
    mocks.sendMagicLink.mockReset();
    mocks.sendMagicLink.mockResolvedValue({ error: null });
    mocks.navigate.mockReset();
    window.localStorage.clear();
  });

  describe('how many questions we ask', () => {
    it('asks exactly two: the terms and marketing email', () => {
      renderPage();
      expect(screen.getAllByRole('checkbox')).toHaveLength(2);
      expect(terms()).toBeInTheDocument();
      expect(
        screen.getByRole('checkbox', { name: /product tips and offers/i }),
      ).toBeInTheDocument();
    });

    it('has no advertising checkbox: the cookie banner owns that decision', () => {
      renderPage();
      expect(screen.queryByRole('checkbox', { name: /advertising/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox', { name: /retargeting/i })).not.toBeInTheDocument();
    });

    it('leaves nothing optional pre-ticked', () => {
      renderPage();
      screen.getAllByRole('checkbox').forEach((box) => expect(box).not.toBeChecked());
    });

    it('does not claim advertising consent is collected on this form', () => {
      renderPage();
      expect(screen.getByText(/follows your cookie choice/i)).toBeInTheDocument();
    });
  });

  describe('marking the terms as required', () => {
    it('puts "required" in the accessible name, so the asterisk is not the only signal', () => {
      renderPage();
      expect(
        screen.getByRole('checkbox', { name: /I accept the Terms of Service.*\(required\)/i }),
      ).toBeInTheDocument();
    });

    it('carries the required semantics as well as the words', () => {
      renderPage();
      expect(terms()).toBeRequired();
      expect(terms()).toHaveAttribute('aria-required', 'true');
    });

    it('does not mark the optional box as required', () => {
      renderPage();
      const optional = screen.getByRole('checkbox', { name: /product tips and offers/i });
      expect(optional).not.toBeRequired();
      expect(optional).not.toHaveAttribute('aria-required');
    });

    it('explains the asterisk in words rather than leaving it to be guessed', () => {
      renderPage();
      const key = screen.getByText(/Boxes marked/i);
      // A sighted reader sees "Boxes marked * are required." A screen reader hears
      // "Boxes marked with an asterisk are required." — the character is hidden and the
      // words stand in for it, so neither audience gets a bare "star".
      expect(key.querySelector('[aria-hidden="true"]')).toHaveTextContent('*');
      expect(key.querySelector('.sr-only')).toHaveTextContent('with an asterisk');
      expect(key).toHaveTextContent(/are required\./i);
    });

    it('hides the asterisk itself from assistive tech, so it is never read as "star"', () => {
      const { container } = renderPage();
      const asterisks = Array.from(container.querySelectorAll('span')).filter(
        (span) => span.textContent === '*',
      );
      expect(asterisks.length).toBeGreaterThan(0);
      asterisks.forEach((span) => expect(span).toHaveAttribute('aria-hidden', 'true'));
    });
  });

  describe('submitting', () => {
    it('refuses to submit with the terms unticked, and says why out loud', async () => {
      renderPage();
      fillTheForm();
      fireEvent.click(submit());

      expect(await screen.findByRole('alert')).toHaveTextContent(/accept the Terms of Service/i);
      expect(mocks.signUpWithPassword).not.toHaveBeenCalled();
    });

    it('marks the control invalid while the terms are missing', async () => {
      renderPage();
      fireEvent.click(submit());
      await screen.findByRole('alert');
      expect(terms()).toHaveAttribute('aria-invalid', 'true');
      expect(terms()).toHaveAccessibleDescription(/accept the Terms of Service/i);
    });

    it('sends only the business name, email and email opt-in, never an advertising box', async () => {
      renderPage();
      fillTheForm();
      fireEvent.click(terms());
      fireEvent.click(submit());

      await waitFor(() => expect(mocks.signUpWithPassword).toHaveBeenCalled());
      const [input] = mocks.signUpWithPassword.mock.calls[0];
      expect(input).toEqual({
        email: 'maker@example.com',
        password: 'a-long-phrase',
        businessName: 'Willow & Wick',
        marketingEmailOptIn: false,
      });
      expect(input).not.toHaveProperty('advertisingOptIn');
    });

    it('sends the same shape on the magic link path', async () => {
      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Email me a link/i }));
      fireEvent.change(screen.getByLabelText(/Business or shop name/i), {
        target: { value: 'Willow & Wick' },
      });
      fireEvent.change(screen.getByLabelText(/^Email/i), {
        target: { value: 'maker@example.com' },
      });
      fireEvent.click(terms());
      fireEvent.click(screen.getByRole('button', { name: /Email me a sign in link/i }));

      await waitFor(() => expect(mocks.sendMagicLink).toHaveBeenCalled());
      expect(mocks.sendMagicLink.mock.calls[0][0].signUp).toEqual({
        businessName: 'Willow & Wick',
        marketingEmailOptIn: false,
      });
    });
  });
});
