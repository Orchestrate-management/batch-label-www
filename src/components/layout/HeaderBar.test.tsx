import { describe, it, expect, vi } from 'vitest';
import { render, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SiteHeader } from './SiteHeader';
import { HEADER_ROW_CLASS, HEADER_SHELL_CLASS } from './HeaderBar';
import { AuthShell } from '../auth/AuthShell';
import { DashboardLayout } from '../dashboard/DashboardLayout';

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    session: null,
    user: { email: 'maker@example.com' },
    configured: false,
    signOut: vi.fn()
  })
}));

/**
 * The bug this file exists to prevent.
 *
 * Three shells each drew their own header around the same mark. The marketing bar put
 * its horizontal padding on the inner max-w-5xl box and the auth bar put it on the
 * full-width <header>, which is one gutter — 24px — apart at any viewport wider than the
 * container. And the marketing row took its height from the call-to-action button while
 * the auth row took its from the logo's line box, so the auth logo sat 7.1px higher.
 * Neither is visible in jsdom, which has no layout, so the assertion is on the thing
 * that produces the layout: all three shells must render the same header primitive with
 * the same row box.
 */
function rowOf(container: HTMLElement) {
  const row = container.querySelector('header [data-header-row]');
  if (!row) throw new Error('no header row found');
  return row as HTMLElement;
}

function renderMarketing() {
  return render(
    <MemoryRouter>
      <SiteHeader />
    </MemoryRouter>
  ).container;
}

function renderAuth() {
  return render(
    <MemoryRouter>
      <AuthShell title="Make your first label, free">
        <p>form</p>
      </AuthShell>
    </MemoryRouter>
  ).container;
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardLayout />
    </MemoryRouter>
  ).container;
}

describe('shared header geometry', () => {
  it('gives the marketing, auth and dashboard shells the same header row box', () => {
    const marketing = rowOf(renderMarketing());
    const auth = rowOf(renderAuth());
    const dashboard = rowOf(renderDashboard());

    expect(auth.className).toBe(marketing.className);
    expect(dashboard.className).toBe(marketing.className);
    expect(marketing.className).toBe(HEADER_ROW_CLASS);
  });

  it('gives all three the same header shell — same background, same stickiness', () => {
    const shell = (container: HTMLElement) => container.querySelector('header')?.className;

    expect(shell(renderAuth())).toBe(HEADER_SHELL_CLASS);
    expect(shell(renderMarketing())).toBe(HEADER_SHELL_CLASS);
    expect(shell(renderDashboard())).toBe(HEADER_SHELL_CLASS);
  });

  it('reserves the row height, so a header with no button is as tall as one with a button', () => {
    // This is the vertical half of the fix. Without it the auth row collapses to the
    // logo's line box and the mark rides 7px higher than it does on the marketing site.
    expect(HEADER_ROW_CLASS).toContain('min-h-[4.25rem]');
    expect(rowOf(renderAuth()).className).toContain('min-h-[4.25rem]');
    expect(rowOf(renderMarketing()).className).toContain('min-h-[4.25rem]');
    expect(rowOf(renderDashboard()).className).toContain('min-h-[4.25rem]');
  });

  it('puts the horizontal padding on the same box as the width constraint', () => {
    // The horizontal half. Padding on the <header> with an unpadded max-w-5xl box inside
    // it centres the content one gutter to the left of padding on the box itself.
    for (const row of [rowOf(renderMarketing()), rowOf(renderAuth()), rowOf(renderDashboard())]) {
      expect(row.className).toContain('max-w-5xl');
      expect(row.className).toContain('px-5');
      expect(row.className).toContain('sm:px-6');
      expect(row.className).toContain('mx-auto');
    }
    for (const container of [renderMarketing(), renderAuth(), renderDashboard()]) {
      const header = container.querySelector('header') as HTMLElement;
      expect(header.className).not.toContain('px-');
    }
  });

  it('puts the mark in the header row on every shell, at the same size', () => {
    const marks = [renderMarketing(), renderAuth(), renderDashboard()].map((container) =>
    within(rowOf(container)).getByRole('link', { name: /batchlabel\s*, home/i })
    );

    for (const mark of marks) {
      expect(mark).toHaveAttribute('href', '/');
      expect(mark.querySelector('svg')).toHaveAttribute('width', '28');
      expect(mark.querySelector('svg')).toHaveAttribute('height', '28');
    }

    // The lockup's font-size is derived from the mark height, so a mismatch here would
    // scale the whole thing on one route and not another. Compared to each other rather
    // than to a literal — the number is Logo's business, sameness is this file's.
    const [marketing, auth, dashboard] = marks;
    expect(auth.getAttribute('style')).toBe(marketing.getAttribute('style'));
    expect(dashboard.getAttribute('style')).toBe(marketing.getAttribute('style'));
    expect(auth.className).toBe(marketing.className);
    expect(dashboard.className).toBe(marketing.className);
  });
});

describe('header variants', () => {
  it('keeps the full nav on the marketing site', () => {
    const container = renderMarketing();
    expect(within(container).getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(within(container).getByRole('link', { name: 'Make a label free' })).toBeInTheDocument();
  });

  it('keeps the auth pages free of navigation, so signing up stays the only job', () => {
    const container = renderAuth();
    const header = container.querySelector('header') as HTMLElement;
    expect(within(header).queryByRole('navigation')).not.toBeInTheDocument();
    // The mark is the only control in an auth header. Anything else is a way out of the
    // form, and this shell is the conversion surface.
    expect(within(header).getAllByRole('link')).toHaveLength(1);
    expect(within(header).queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps the dashboard tabs and log out inside the one banner landmark', () => {
    const container = renderDashboard();
    expect(container.querySelectorAll('header')).toHaveLength(1);
    const header = container.querySelector('header') as HTMLElement;
    expect(within(header).getByRole('navigation', { name: 'Dashboard' })).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: /log out/i })).toBeInTheDocument();
  });
});

describe('the marketing mobile menu still works', () => {
  it('renders the panel inside the same header, not as a second landmark', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const container = renderMarketing();
    const toggle = within(container).getByRole('button', { name: 'Open menu' });

    expect(container.querySelector('#mobile-nav')).toBeNull();
    await userEvent.click(toggle);

    const panel = container.querySelector('#mobile-nav');
    expect(panel).not.toBeNull();
    expect(container.querySelector('header')).toContainElement(panel as HTMLElement);
    expect(container.querySelectorAll('header')).toHaveLength(1);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(container).getByRole('navigation', { name: 'Main, mobile' })).toBeInTheDocument();
  });
});
