import type { CheckoutOutcome, Order, OrderRequest, Product, ProductPage, Review } from '../types/domain';
import type { WireOrder, WirePage, WireProductDetail, WireProductSummary, WireReview } from '../types/wire';
import { toOrder, toProduct, toProductPage, toReview, toWireCategory, toWirePageNumber } from './mapping';

// Every call is a relative /api path — same-origin by design (see brief),
// which is also what lets TracingInstrumentation's traceparent header reach
// the backend without a CORS preflight fuss.
//
// Each response is parsed as the backend's wire type and handed to the mapping
// layer, which returns a view model. Callers never see a wire shape; that
// containment is the point (see `./mapping`).

export interface ProductQuery {
  search?: string;
  /** A display label from `Category` — translated to the backend's enum name,
   *  or dropped if it isn't one the backend knows. */
  category?: string;
  /** 1-based, as it appears in the URL. */
  page?: number;
}

export async function fetchProducts(query: ProductQuery): Promise<ProductPage> {
  const params = new URLSearchParams();
  if (query.search) params.set('search', query.search);

  const category = toWireCategory(query.category);
  if (category) params.set('category', category);

  params.set('page', String(toWirePageNumber(query.page)));

  const res = await fetch(`/api/products?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to load products (${res.status})`);
  }
  return toProductPage((await res.json()) as WirePage<WireProductSummary>);
}

export async function fetchProduct(id: number): Promise<Product> {
  const res = await fetch(`/api/products/${id}`);
  if (!res.ok) {
    throw new Error(`Failed to load product ${id} (${res.status})`);
  }
  return toProduct((await res.json()) as WireProductDetail);
}

export async function fetchProductReviews(id: number): Promise<Review[]> {
  const res = await fetch(`/api/products/${id}/reviews`);
  if (!res.ok) {
    throw new Error(`Failed to load reviews for product ${id} (${res.status})`);
  }
  return ((await res.json()) as WireReview[]).map(toReview);
}

export async function fetchCustomerOrders(customerId: number): Promise<Order[]> {
  const res = await fetch(`/api/customers/${customerId}/orders`);
  if (!res.ok) {
    throw new Error(`Failed to load orders for customer ${customerId} (${res.status})`);
  }
  return ((await res.json()) as WireOrder[]).map(toOrder);
}

/**
 * Placing an order has three meaningfully different outcomes per the brief
 * (201 / 409 out-of-stock / planted 500), and checkout needs to show a
 * distinct, honest message for each — so this returns a discriminated union
 * instead of throwing, reserving thrown errors for genuine network failure.
 *
 * The request body needs no mapping: `{customerId, items: [{productId,
 * quantity}]}` is exactly the backend's `OrderRequest` record. Only the
 * response direction ever diverged.
 */
export async function placeOrder(order: OrderRequest): Promise<CheckoutOutcome> {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  });

  if (res.status === 201) {
    return { kind: 'success', order: toOrder((await res.json()) as WireOrder) };
  }
  if (res.status === 409) {
    return { kind: 'out-of-stock' };
  }
  // Treat any other non-2xx (in practice the planted 500) as the honest
  // "checkout failed" case rather than trying to enumerate every status.
  return { kind: 'server-error' };
}
