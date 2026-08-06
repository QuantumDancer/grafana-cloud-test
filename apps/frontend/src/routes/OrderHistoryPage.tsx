import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchCustomerOrders } from '../api/client';
import type { Order } from '../types/domain';

/**
 * Shown at both /orders (no id — prompts for one) and /orders/:customerId.
 * There's no login, so "your" order history only exists once you've checked
 * out at least once in this session (see CustomerContext); this page lets
 * you also look up any other customer id, since that's the only way to
 * revisit an order placed in an earlier session.
 */
export function OrderHistoryPage() {
  const { customerId: customerIdParam } = useParams();
  const navigate = useNavigate();
  const [lookupId, setLookupId] = useState(customerIdParam ?? '');
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const customerId = Number(customerIdParam);
  const hasValidId = customerIdParam !== undefined && Number.isInteger(customerId) && customerId > 0;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!hasValidId) {
        setOrders(null);
        return;
      }
      setError(null);
      try {
        const result = await fetchCustomerOrders(customerId);
        if (!cancelled) setOrders(result);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [customerId, hasValidId]);

  if (!hasValidId) {
    return (
      <div className="order-history-lookup">
        <h2>Order History</h2>
        <p>Enter a customer id to view their order history.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (lookupId) navigate(`/orders/${lookupId}`);
          }}
        >
          <input
            type="number"
            min={1}
            max={10000}
            placeholder="Customer id"
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
          />
          <button type="submit">View history</button>
        </form>
      </div>
    );
  }

  return (
    <div className="order-history">
      <h2>Orders for customer #{customerId}</h2>
      {error && <p className="error-banner">Couldn't load order history: {error}</p>}
      {orders && orders.length === 0 && <p>No orders yet for this customer.</p>}
      {orders && orders.length > 0 && (
        <ul>
          {orders.map((order) => (
            <li key={order.id}>
              Order #{order.id} — {new Date(order.placedAt).toLocaleString()} — ${order.total.toFixed(2)} ({order.items.length} item{order.items.length === 1 ? '' : 's'})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
