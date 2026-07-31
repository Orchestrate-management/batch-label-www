import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CookieBanner } from './CookieBanner';
import { getStoredConsent } from '../lib/consent';

const mocks = vi.hoisted(() => ({
  syncAdvertisingConsent: vi.fn(),
}));

vi.mock('../lib/consent-preferences', () => ({
  syncAdvertisingConsent: (marketing: boolean) => mocks.syncAdvertisingConsent(marketing),
}));

function renderBanner() {
  return render(
    <MemoryRouter>
      <CookieBanner />
    </MemoryRouter>,
  );
}

describe('CookieBanner', () => {
  beforeEach(() => {
    mocks.syncAdvertisingConsent.mockReset();
    mocks.syncAdvertisingConsent.mockResolvedValue('skipped');
    window.localStorage.clear();
    window.dataLayer = [];
  });

  it('asks on a first visit, with nothing decided yet', () => {
    renderBanner();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(getStoredConsent()).toBeNull();
  });

  it('carries an accept-all onto the account, because the banner owns advertising', async () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: /Accept all/i }));

    await waitFor(() => expect(mocks.syncAdvertisingConsent).toHaveBeenCalledWith(true));
    expect(getStoredConsent()).toMatchObject({ analytics: true, marketing: true });
  });

  it('carries a rejection the same way, so a withdrawal is recorded too', async () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: /Reject optional/i }));

    await waitFor(() => expect(mocks.syncAdvertisingConsent).toHaveBeenCalledWith(false));
    expect(getStoredConsent()).toMatchObject({ marketing: false });
  });

  it('carries a granular save, where analytics is on and marketing is not', async () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: /Choose cookies/i }));
    fireEvent.click(screen.getByLabelText(/Analytics/i));
    fireEvent.click(screen.getByRole('button', { name: /Save my choices/i }));

    await waitFor(() => expect(mocks.syncAdvertisingConsent).toHaveBeenCalledWith(false));
    expect(getStoredConsent()).toMatchObject({ analytics: true, marketing: false });
  });

  it('stays out of the way once a choice has been stored', () => {
    window.localStorage.setItem(
      'bl_consent',
      JSON.stringify({ analytics: true, marketing: true, decided_at: '2026-07-30', version: 1 }),
    );
    renderBanner();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.syncAdvertisingConsent).not.toHaveBeenCalled();
  });

  /**
   * The product app has no banner and no way of showing one: advertising is asked
   * here and only here. So it links to `?cookie-settings=1`, and that has to open
   * the panel rather than land someone on a page with a link to it.
   */
  describe('opening from a URL', () => {
    const setUrl = (url: string) => window.history.replaceState({}, '', url);

    beforeEach(() => setUrl('/cookie-policy'));

    it('opens the detail panel when sent here with ?cookie-settings=1', () => {
      window.localStorage.setItem(
        'bl_consent',
        JSON.stringify({ analytics: true, marketing: true, decided_at: '2026-07-30', version: 1 }),
      );
      setUrl('/cookie-policy?cookie-settings=1');
      renderBanner();

      // Open despite a stored choice, and open on the toggles — the maker was
      // sent here to change one, not to read the summary again.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByLabelText(/Marketing/i)).toBeChecked();
    });

    it('shows the stored choice rather than a fresh set of defaults', () => {
      window.localStorage.setItem(
        'bl_consent',
        JSON.stringify({ analytics: true, marketing: false, decided_at: '2026-07-30', version: 1 }),
      );
      setUrl('/cookie-policy?cookie-settings=1');
      renderBanner();

      expect(screen.getByLabelText(/Analytics/i)).toBeChecked();
      expect(screen.getByLabelText(/^Marketing/i)).not.toBeChecked();
    });

    it('takes the parameter out of the address bar', () => {
      setUrl('/cookie-policy?cookie-settings=1');
      renderBanner();

      // Left in place, a refresh or a back button reopens the banner over
      // whatever the maker went on to read.
      expect(window.location.search).toBe('');
      expect(window.location.pathname).toBe('/cookie-policy');
    });

    it('keeps any other query parameters', () => {
      setUrl('/cookie-policy?cookie-settings=1&utm_source=app');
      renderBanner();

      expect(window.location.search).toBe('?utm_source=app');
    });

    it('does nothing without the parameter', () => {
      window.localStorage.setItem(
        'bl_consent',
        JSON.stringify({ analytics: true, marketing: true, decided_at: '2026-07-30', version: 1 }),
      );
      setUrl('/cookie-policy');
      renderBanner();

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
