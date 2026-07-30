import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SiteLayout } from './SiteLayout';

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ session: null, user: null, configured: false })
}));

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/pricing']}>
      <Routes>
        <Route element={<SiteLayout />}>
          <Route path="/pricing" element={<h1>Pricing</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('SiteLayout landmarks', () => {
  it('puts the page inside a main landmark, with a header and a footer around it', () => {
    renderLayout();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('renders the routed page inside main, not beside it', () => {
    renderLayout();
    const main = screen.getByRole('main');
    expect(main).toContainElement(screen.getByRole('heading', { level: 1, name: 'Pricing' }));
  });

  it('names its navigation, so a screen reader can tell the two navs apart', () => {
    renderLayout();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });
});

describe('skip to content link', () => {
  it('is the first thing a keyboard user reaches', async () => {
    renderLayout();
    await userEvent.tab();
    expect(document.activeElement).toHaveTextContent('Skip to content');
  });

  it('points at the main landmark', () => {
    renderLayout();
    const skip = screen.getByRole('link', { name: /skip to content/i });
    expect(skip).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('targets a main that can actually take focus', () => {
    // Without tabindex="-1" the browser scrolls to the fragment but leaves focus on the
    // link, so the next Tab returns to the header the user was skipping.
    renderLayout();
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
  });

  it('is hidden until focused, then visible', () => {
    renderLayout();
    const skip = screen.getByRole('link', { name: /skip to content/i });
    expect(skip.className).toContain('sr-only');
    expect(skip.className).toContain('focus:not-sr-only');
  });
});
