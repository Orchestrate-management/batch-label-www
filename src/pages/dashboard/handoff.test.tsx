import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Labels } from './Labels';
import { CheckoutSuccess } from '../checkout/CheckoutSuccess';
import { DashboardLayout } from '../../components/dashboard/DashboardLayout';
import { APP_URL } from '../../lib/app-handoff';

/**
 * The product is app.batchlabel.xyz. This site does marketing, accounts and money.
 *
 * Every screen here that a signed-in maker can land on must therefore offer a way
 * back to the product, and none of them may pretend to be it. The specific bug these
 * cover: the confirmation email in an email + password signup lands on /dashboard,
 * and the primary button on that page linked to /dashboard — the page it was on. A
 * brand new customer pressed "Create your first label" and nothing happened, with no
 * mention anywhere that the product lived on another subdomain.
 */

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({
    session: { user: { id: 'user-1' } },
    user: { id: 'user-1', email: 'maker@example.com', user_metadata: { business_name: 'Willow & Wick' } },
    loading: false,
    configured: true,
    signOut: vi.fn()
  })
}));

function renderAt(path: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={path} element={element} />
      </Routes>
    </MemoryRouter>
  );
}

describe('the empty dashboard', () => {
  it('sends the maker to the product, not back to itself', () => {
    renderAt('/dashboard', <Labels />);
    const cta = screen.getByRole('link', { name: /open batchlabel/i });
    expect(cta).toHaveAttribute('href', APP_URL);
  });

  it('has no call to action pointing at the page it is already on', () => {
    renderAt('/dashboard', <Labels />);
    const selfLinks = screen.
    getAllByRole('link').
    filter((link) => link.getAttribute('href') === '/dashboard');
    expect(selfLinks).toEqual([]);
  });

  it('says where the labels are actually made', () => {
    renderAt('/dashboard', <Labels />);
    expect(screen.getByText(/app\.batchlabel\.xyz/i)).toBeInTheDocument();
  });
});

describe('the account area', () => {
  it('keeps a link back to the product on every tab', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard/account']}>
        <Routes>
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route path="account" element={<p>Account</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: /open batchlabel/i })).toHaveAttribute('href', APP_URL);
  });
});

describe('after paying', () => {
  it('offers the product rather than the empty labels page', () => {
    renderAt('/checkout/success', <CheckoutSuccess />);
    expect(screen.getByRole('link', { name: /back to my labels/i })).toHaveAttribute('href', APP_URL);
  });

  it('does not tell someone who has just paid that their first label is free', () => {
    renderAt('/checkout/success', <CheckoutSuccess />);
    expect(screen.queryByText(/first label is free/i)).not.toBeInTheDocument();
  });
});
