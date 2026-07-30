import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { RouteAnnouncer } from './RouteAnnouncer';
import { PAGE_TITLE_EVENT } from '../lib/seo';

function announce(title: string) {
  act(() => {
    window.dispatchEvent(new CustomEvent(PAGE_TITLE_EVENT, { detail: title }));
  });
}

describe('RouteAnnouncer', () => {
  it('renders an empty polite live region from first paint', () => {
    render(<RouteAnnouncer />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
    expect(region).toBeEmptyDOMElement();
  });

  it('stays quiet on the first title, which the browser has already announced', () => {
    render(<RouteAnnouncer />);
    announce('Pricing | Batchlabel');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('reads the new page title on every navigation after that', () => {
    render(<RouteAnnouncer />);
    announce('Pricing | Batchlabel');
    announce('FAQ | Batchlabel');
    expect(screen.getByRole('status')).toHaveTextContent('FAQ | Batchlabel');

    announce('About us | Batchlabel');
    expect(screen.getByRole('status')).toHaveTextContent('About us | Batchlabel');
  });

  it('is visually hidden, so the announcement never shows on the page', () => {
    render(<RouteAnnouncer />);
    expect(screen.getByRole('status').className).toContain('sr-only');
  });
});
