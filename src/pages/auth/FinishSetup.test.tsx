import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { FinishSetup } from './FinishSetup';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  completeOAuthSignup: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mocks.navigate,
}));

vi.mock('../../lib/membership', () => ({
  completeOAuthSignup: (input: unknown) => mocks.completeOAuthSignup(input),
}));

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'maker@example.com' },
    signOut: mocks.signOut,
    configured: true,
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/finish-setup']}>
      <FinishSetup />
    </MemoryRouter>,
  );
}

const terms = () => screen.getByRole('checkbox', { name: /I accept the Terms of Service/i });
const submit = () => screen.getByRole('button', { name: /Finish and start my label/i });

describe('FinishSetup (the OAuth completion screen)', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.completeOAuthSignup.mockReset();
    mocks.completeOAuthSignup.mockResolvedValue({ error: null, provisioned: true });
    window.dataLayer = [];
  });

  it('tells the user which account they came back with', () => {
    renderPage();
    expect(screen.getByText(/maker@example.com/)).toBeInTheDocument();
  });

  it('asks for the terms, which the Google redirect could not collect', () => {
    renderPage();
    expect(terms()).toBeInTheDocument();
    expect(terms()).not.toBeChecked();
  });

  it('blocks submission while the terms are unticked and does not provision anything', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Business or shop name/i), {
      target: { value: 'Willow & Wick' },
    });
    fireEvent.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent(/accept the Terms of Service/i);
    expect(mocks.completeOAuthSignup).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('clears the terms error as soon as the box is ticked', async () => {
    renderPage();
    fireEvent.click(submit());
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    fireEvent.click(terms());
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('provisions with the ticked consents and sends the user to the dashboard', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/Business or shop name/i), {
      target: { value: 'Willow & Wick' },
    });
    fireEvent.click(terms());
    fireEvent.click(screen.getByRole('checkbox', { name: /product tips and offers/i }));
    fireEvent.click(submit());

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/dashboard'));
    expect(mocks.completeOAuthSignup).toHaveBeenCalledWith({
      businessName: 'Willow & Wick',
      termsAccepted: true,
      marketingEmailOptIn: true,
      advertisingOptIn: false,
    });
  });

  it('records the optional consents as declined when the boxes are left alone', async () => {
    renderPage();
    fireEvent.click(terms());
    fireEvent.click(submit());

    await waitFor(() => expect(mocks.completeOAuthSignup).toHaveBeenCalled());
    expect(mocks.completeOAuthSignup).toHaveBeenCalledWith(
      expect.objectContaining({ marketingEmailOptIn: false, advertisingOptIn: false }),
    );
  });

  it('fires sign_up_completed with method google once the account really exists', async () => {
    renderPage();
    fireEvent.click(terms());
    fireEvent.click(submit());

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
    const events = (window.dataLayer ?? []) as Array<Record<string, unknown>>;
    const completed = events.find((e) => e.event === 'sign_up_completed');
    expect(completed).toMatchObject({ method: 'google', user_id: 'user-1' });
  });

  it('does not fire sign_up_completed when the membership already existed', async () => {
    mocks.completeOAuthSignup.mockResolvedValue({ error: null, provisioned: false });
    renderPage();
    fireEvent.click(terms());
    fireEvent.click(submit());

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/dashboard'));
    const events = (window.dataLayer ?? []) as Array<Record<string, unknown>>;
    expect(events.some((e) => e.event === 'sign_up_completed')).toBe(false);
  });

  it('shows the error and stays put when provisioning fails', async () => {
    mocks.completeOAuthSignup.mockResolvedValue({ error: 'Could not finish.', provisioned: false });
    renderPage();
    fireEvent.click(terms());
    fireEvent.click(submit());

    expect(await screen.findByText('Could not finish.')).toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
