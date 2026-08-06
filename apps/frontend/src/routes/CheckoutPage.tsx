import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { placeOrder } from '../api/client';
import { useCart } from '../state/CartContext';
import { useCustomer } from '../state/CustomerContext';
import type { CheckoutOutcome } from '../types/domain';

// The brief calls for a "fake customer picker": there's no login, so instead
// of a form we just assign the shopper a random seeded id in [1, 10000] —
// enough range to spread orders across many distinct customer histories
// without colliding constantly.
function randomCustomerId(): number {
  return Math.floor(Math.random() * 10000) + 1;
}

export function CheckoutPage() {
  const { lines, subtotal, clear } = useCart();
  const { setLastCustomerId } = useCustomer();
  const navigate = useNavigate();

  const [customerId, setCustomerId] = useState<number>(() => randomCustomerId());
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<CheckoutOutcome | null>(null);

  if (lines.length === 0 && !outcome) {
    return <p>Your cart is empty — nothing to check out.</p>;
  }

  const handlePlaceOrder = async () => {
    setSubmitting(true);
    setOutcome(null);
    try {
      const result = await placeOrder({
        customerId,
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      });
      setOutcome(result);
      if (result.kind === 'success') {
        setLastCustomerId(customerId);
        clear();
      }
    } catch {
      // Network-level failure (server unreachable), distinct from the
      // planted 500 the backend can also return — both read as "failed" to
      // the shopper, but this path never hit the server at all.
      setOutcome({ kind: 'server-error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="checkout">
      <h2>Checkout</h2>
      <p>
        You're checking out as customer <strong>#{customerId}</strong>.{' '}
        <button className="link-button" onClick={() => setCustomerId(randomCustomerId())} disabled={submitting}>
          Not you? Pick another
        </button>
      </p>

      <ul className="checkout__summary">
        {lines.map(({ product, quantity }) => (
          <li key={product.id}>{quantity} × {product.name} — ${(product.price * quantity).toFixed(2)}</li>
        ))}
      </ul>
      <p>Total: <strong>${subtotal.toFixed(2)}</strong></p>

      {outcome?.kind === 'out-of-stock' && (
        <p className="error-banner">
          Sorry — one or more items in your cart sold out before checkout completed. Please adjust quantities and try again.
        </p>
      )}
      {outcome?.kind === 'server-error' && (
        <p className="error-banner">
          Checkout failed due to a server error. This one's on us, not you — please try again in a moment.
        </p>
      )}
      {outcome?.kind === 'success' && (
        <div className="checkout__success">
          <p>Order #{outcome.order.id} confirmed! Total ${outcome.order.total.toFixed(2)}.</p>
          <button onClick={() => navigate(`/orders/${customerId}`)}>View order history</button>
        </div>
      )}

      {outcome?.kind !== 'success' && (
        <button onClick={handlePlaceOrder} disabled={submitting || lines.length === 0}>
          {submitting ? 'Placing order…' : 'Place order'}
        </button>
      )}
    </div>
  );
}
