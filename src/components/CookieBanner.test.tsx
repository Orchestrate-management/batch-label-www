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
});
