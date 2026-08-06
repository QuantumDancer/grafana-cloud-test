import type { CheckoutOutcome, Order, OrderRequest, Product, ProductPage, Review } from '../types/domain';

// Every call is a relative /api path — same-origin by design (see brief),
// which is also what lets TracingInstrumentation's traceparent header reach
// the backend without a CORS preflight fuss.

export interface ProductQuery {
  search?: string;
  category?: string;
  page?: number;
}

export async function fetchProducts(query: ProductQuery): Promise<ProductPage> {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);
  if (query.category) params.set('category', query.category);
  params.set('page', String(query.page ?? 1));

  const res = await fetch(`/api/products?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to load products (${res.status})`);
  }
  return res.json();
}

export async function fetchProduct(id: number): Promise<Product> {
  const res = await fetch(`/api/products/${id}`);
  if (!res.ok) {
    throw new Error(`Failed to load product ${id} (${res.status})`);
  }
  return res.json();
}

export async function fetchProductReviews(id: number): Promise<Review[]> {
  const res = await fetch(`/api/products/${id}/reviews`);
  if (!res.ok) {
    throw new Error(`Failed to load reviews for product ${id} (${res.status})`);
  }
  return res.json();
}

export async function fetchCustomerOrders(customerId: number): Promise<Order[]> {
  const res = await fetch(`/api/customers/${customerId}/orders`);
  if (!res.ok) {
    throw new Error(`Failed to load orders for customer ${customerId} (${res.status})`);
  }
  return res.json();
}

/**
 * Placing an order has three meaningfully different outcomes per the brief
 * (201 / 409 out-of-stock / planted 500), and checkout needs to show a
 * distinct, honest message for each — so this returns a discriminated union
 * instead of throwing, reserving thrown errors for genuine network failure.
 */
export async function placeOrder(order: OrderRequest): Promise<CheckoutOutcome> {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  });

  if (res.status === 201) {
    return { kind: 'success', order: await res.json() };
  }
  if (res.status === 409) {
    return { kind: 'out-of-stock' };
  }
  // Treat any other non-2xx (in practice the planted 500) as the honest
  // "checkout failed" case rather than trying to enumerate every status.
  return { kind: 'server-error' };
}
