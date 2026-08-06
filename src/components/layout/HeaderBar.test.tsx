import { describe, it, expect, vi } from 'vitest';
import { render, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SiteHeader } from './SiteHeader';
import { HEADER_ROW_CLASS, HEADER_SHELL_CLASS } from './HeaderBar';
import { GUTTER } from '../ui/Section';
import { AuthShell } from '../auth/AuthShell';

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
 * that produces the layout: every shell must render the same header primitive with the
 * same row box.
 *
 * THERE ARE TWO SHELLS NOW, NOT THREE. The dashboard shell was deleted with the dashboard
 * itself — this site is marketing and auth, and account management lives in the product —
 * so its rows are gone from here rather than relaxed. Nothing about the marketing and auth
 * comparison has been loosened; the third shell simply has no header to measure.
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

describe('shared header geometry', () => {
  it('gives the marketing and auth shells the same header row box', () => {
    const marketing = rowOf(renderMarketing());
    const auth = rowOf(renderAuth());

    expect(auth.className).toBe(marketing.className);
    expect(marketing.className).toBe(HEADER_ROW_CLASS);
  });

  it('gives both the same header shell — same background, same stickiness', () => {
    const shell = (container: HTMLElement) => container.querySelector('header')?.className;

    expect(shell(renderAuth())).toBe(HEADER_SHELL_CLASS);
    expect(shell(renderMarketing())).toBe(HEADER_SHELL_CLASS);
  });

  it('reserves the row height, so a header with no button is as tall as one with a button', () => {
    // This is the vertical half of the fix. Without it the auth row collapses to the
    // logo's line box and the mark rides 7px higher than it does on the marketing site.
    expect(HEADER_ROW_CLASS).toContain('min-h-[4.25rem]');
    expect(rowOf(renderAuth()).className).toContain('min-h-[4.25rem]');
    expect(rowOf(renderMarketing()).className).toContain('min-h-[4.25rem]');
  });

  it('puts the horizontal padding on the same box as the width constraint', () => {
    // The horizontal half. Padding on the <header> with an unpadded, centred inner box
    // puts the content one gutter to the left of padding applied to the box itself.
    //
    // The measure is max-w-6xl since the visual pass. It is asserted here because it has
    // to be the SAME box the page bands use — GUTTER and Section in
    // components/ui/Section.tsx — or the mark stops lining up with the first word of
    // every heading beneath it.
    for (const row of [rowOf(renderMarketing()), rowOf(renderAuth())]) {
      expect(row.className).toContain('max-w-6xl');
      expect(row.className).toContain('px-5');
      expect(row.className).toContain('sm:px-6');
      expect(row.className).toContain('mx-auto');
    }
    for (const container of [renderMarketing(), renderAuth()]) {
      const header = container.querySelector('header') as HTMLElement;
      expect(header.className).not.toContain('px-');
    }
  });

  it('shares its measure and its gutter with the page bands under it', () => {
    // The header and the content used to be able to drift apart silently: the header row
    // was max-w-5xl and Section was max-w-5xl, agreeing by coincidence rather than by
    // construction. This asserts the agreement, so widening one without the other fails
    // here rather than showing up as a misaligned mark on a screenshot.
    for (const token of GUTTER.split(' ')) {
      expect(HEADER_ROW_CLASS).toContain(token);
    }
    expect(HEADER_ROW_CLASS).toContain('max-w-6xl');
  });

  it('puts the mark in the header row on every shell, at the same size', () => {
    const marks = [renderMarketing(), renderAuth()].map((container) =>
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
    const [marketing, auth] = marks;
    expect(auth.getAttribute('style')).toBe(marketing.getAttribute('style'));
    expect(auth.className).toBe(marketing.className);
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

  /**
   * The `below` slot is what kept the dashboard's tab row inside the one banner landmark.
   * The dashboard is gone, but the slot is still load-bearing for the marketing site's
   * mobile panel — covered below, including the single-landmark assertion.
   */
  it('renders exactly one banner landmark per shell', () => {
    expect(renderMarketing().querySelectorAll('header')).toHaveLength(1);
    expect(renderAuth().querySelectorAll('header')).toHaveLength(1);
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
