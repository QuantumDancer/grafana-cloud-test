import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useEffect } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { server } from '../mocks/server';
import { CartProvider, useCart } from '../state/CartContext';
import { CustomerProvider } from '../state/CustomerContext';
import type { Product } from '../types/domain';
import { CheckoutPage } from './CheckoutPage';

const telescope: Product = {
  id: 1,
  name: 'Voyager 70mm Refractor',
  category: 'Telescopes',
  price: 189.99,
  stock: 12,
  emoji: '🔭',
  description: 'test fixture',
};

// Seeds the cart via the real CartProvider (rather than mocking useCart)
// so this exercises the same addItem path a shopper's clicks would take.
function SeedCartAndRenderCheckout() {
  const { addItem } = useCart();
  useEffect(() => {
    addItem(telescope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <CheckoutPage />;
}

function renderCheckout() {
  return render(
    <MemoryRouter initialEntries={['/checkout']}>
      <CartProvider>
        <CustomerProvider>
          <Routes>
            <Route path="/checkout" element={<SeedCartAndRenderCheckout />} />
            <Route path="/orders/:customerId" element={<div>order history page</div>} />
          </Routes>
        </CustomerProvider>
      </CartProvider>
    </MemoryRouter>,
  );
}

describe('CheckoutPage error surfacing', () => {
  it('shows an honest out-of-stock message on a 409 response', async () => {
    server.use(http.post('/api/orders', () => HttpResponse.json({ message: 'out of stock' }, { status: 409 })));
    const user = userEvent.setup();
    renderCheckout();

    await user.click(await screen.findByRole('button', { name: 'Place order' }));

    expect(await screen.findByText(/sold out before checkout completed/i)).toBeInTheDocument();
  });

  it('shows an honest server-error message on a planted 500 response', async () => {
    server.use(http.post('/api/orders', () => HttpResponse.json({ message: 'boom' }, { status: 500 })));
    const user = userEvent.setup();
    renderCheckout();

    await user.click(await screen.findByRole('button', { name: 'Place order' }));

    expect(await screen.findByText(/checkout failed due to a server error/i)).toBeInTheDocument();
  });

  it('confirms the order and clears the cart on success', async () => {
    server.use(
      http.post('/api/orders', () =>
        // The backend's OrderResponse shape — integer cents, `createdAt`, and
        // the `COMPLETED` status enum. Asserting the rendered total below is
        // what makes this a real check: against the frontend's old invented
        // shape the mapping produces a total of NaN, and a confirmation
        // reading "Total $NaN" would otherwise still satisfy the id match.
        HttpResponse.json(
          {
            id: 4242,
            customerId: 1,
            status: 'COMPLETED',
            totalCents: 18999,
            createdAt: '2026-08-07T09:15:00.123456Z',
            items: [{ productId: 1, productName: 'Voyager 70mm Refractor', quantity: 1, unitPriceCents: 18999 }],
          },
          { status: 201 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderCheckout();

    await user.click(await screen.findByRole('button', { name: 'Place order' }));

    expect(await screen.findByText(/Order #4242 confirmed! Total \$189\.99\./)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Place order' })).not.toBeInTheDocument();
    });
  });
});
