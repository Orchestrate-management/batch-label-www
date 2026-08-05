import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Button } from './Button';

describe('Button', () => {
  beforeEach(() => {
    window.dataLayer = [];
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/pricing', search: '', href: 'https://batchlabel.xyz/pricing' },
    });
  });

  it('renders its label as a real <button> by default', () => {
    render(<Button>Get started</Button>);
    const button = screen.getByRole('button', { name: 'Get started' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('type', 'button');
  });

  it('applies the primary variant classes by default', () => {
    render(<Button>Buy</Button>);
    expect(screen.getByRole('button', { name: 'Buy' })).toHaveClass('bg-teal-700');
  });

  it('fires onClick when pressed', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Click me' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('pushes a cta_click event to the dataLayer when track is set', () => {
    render(
      <Button track={{ label: 'Start free', location: 'hero' }}>Start free</Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start free' }));

    const events = (window.dataLayer ?? []) as Array<Record<string, unknown>>;
    expect(
      events.some(
        (e) => e.event === 'cta_click' && e.cta_label === 'Start free' && e.cta_location === 'hero',
      ),
    ).toBe(true);
  });

  it('renders a router link when `to` is provided', () => {
    render(
      <MemoryRouter>
        <Button to="/pricing">See pricing</Button>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'See pricing' });
    expect(link).toHaveAttribute('href', '/pricing');
  });

  it('renders a plain anchor when `href` is provided', () => {
    render(<Button href="https://example.com">External</Button>);
    expect(screen.getByRole('link', { name: 'External' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
  });
});
