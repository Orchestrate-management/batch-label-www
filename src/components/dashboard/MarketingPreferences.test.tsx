import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MarketingPreferences } from './MarketingPreferences';

const mocks = vi.hoisted(() => ({
  fetchConsentPreferences: vi.fn(),
  updateConsentPreference: vi.fn(),
  openCookieSettings: vi.fn(),
}));

vi.mock('../../lib/consent-preferences', () => ({
  fetchConsentPreferences: () => mocks.fetchConsentPreferences(),
  updateConsentPreference: (agreement: unknown, accepted: boolean) =>
    mocks.updateConsentPreference(agreement, accepted),
}));

vi.mock('../CookieBanner', () => ({
  openCookieSettings: () => mocks.openCookieSettings(),
}));

const emailBox = () => screen.getByRole('checkbox', { name: /Marketing emails/i });

describe('MarketingPreferences', () => {
  beforeEach(() => {
    mocks.fetchConsentPreferences.mockReset();
    mocks.fetchConsentPreferences.mockResolvedValue({ marketingEmail: true, advertising: false });
    mocks.updateConsentPreference.mockReset();
    mocks.updateConsentPreference.mockResolvedValue({ error: null });
    mocks.openCookieSettings.mockReset();
  });

  it('offers exactly one toggle, for marketing email', async () => {
    render(<MarketingPreferences />);
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(1));
    expect(emailBox()).toBeChecked();
  });

  it('has no independent advertising toggle, which is what used to duplicate the banner', async () => {
    render(<MarketingPreferences />);
    await screen.findByRole('checkbox');
    expect(screen.queryByRole('checkbox', { name: /Advertising/i })).not.toBeInTheDocument();
  });

  it('still shows what the account currently records for advertising', async () => {
    render(<MarketingPreferences />);
    expect(await screen.findByText(/Advertising and retargeting/i)).toBeInTheDocument();
    expect(screen.getByText(/Currently/i)).toHaveTextContent(/Currently off\./i);
  });

  it('shows it as on when the account says so', async () => {
    mocks.fetchConsentPreferences.mockResolvedValue({ marketingEmail: false, advertising: true });
    render(<MarketingPreferences />);
    expect(await screen.findByText(/Currently/i)).toHaveTextContent(/Currently on\./i);
  });

  it('sends the maker to cookie settings to change advertising', async () => {
    render(<MarketingPreferences />);
    fireEvent.click(await screen.findByRole('button', { name: /Change in cookie settings/i }));
    expect(mocks.openCookieSettings).toHaveBeenCalled();
  });

  it('saves an email change through the consent path', async () => {
    render(<MarketingPreferences />);
    fireEvent.click(await screen.findByRole('checkbox'));

    await waitFor(() => expect(mocks.updateConsentPreference).toHaveBeenCalled());
    const [agreement, accepted] = mocks.updateConsentPreference.mock.calls[0];
    expect(agreement).toMatchObject({ id: 'marketing_emails' });
    expect(accepted).toBe(false);
  });

  it('never writes advertising from here', async () => {
    render(<MarketingPreferences />);
    fireEvent.click(await screen.findByRole('checkbox'));

    await waitFor(() => expect(mocks.updateConsentPreference).toHaveBeenCalled());
    mocks.updateConsentPreference.mock.calls.forEach(([agreement]) => {
      expect(agreement).not.toMatchObject({ id: 'advertising' });
    });
  });

  it('puts the toggle back and explains itself when the save fails', async () => {
    mocks.updateConsentPreference.mockResolvedValue({ error: 'Could not save your preference.' });
    render(<MarketingPreferences />);
    fireEvent.click(await screen.findByRole('checkbox'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not save your preference/i);
    expect(emailBox()).toBeChecked();
  });

  it('says plainly that the preferences could not be read, rather than showing false state', async () => {
    mocks.fetchConsentPreferences.mockResolvedValue(null);
    render(<MarketingPreferences />);
    expect(await screen.findByText(/could not load your preferences/i)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
