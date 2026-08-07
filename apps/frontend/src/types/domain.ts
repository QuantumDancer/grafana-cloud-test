// View models — the shapes the components actually render. They are *not* the
// backend's wire format (that lives in `./wire`); `src/api/mapping.ts`
// translates one into the other on every response.
//
// Keeping the two apart is the fix for the catalog crash of 2026-08-07: the
// frontend was written against an invented wire shape, every test ran against
// mocks that agreed with the invention, and the first real browser-to-backend
// request was the first thing that disagreed. The backend owns the wire
// format; this file owns what the UI wants; the mapping layer absorbs the
// difference in one auditable place.

/** The user-facing category label. The backend speaks enum names
 *  (`TELESCOPE`), which read badly in a select box and a product card, so the
 *  display names live here and the mapping layer translates both ways. */
export type Category = 'Telescopes' | 'Binoculars' | 'Magnifying Glasses';

export interface Product {
  id: number;
  name: string;
  category: Category;
  /** Dollars, converted from the backend's integer cents. */
  price: number;
  /** Only the detail endpoint sends a description — the catalog row DTO omits
   * it — so cards rendered from search results legitimately have none. */
  description?: string;
  stock: number;
  /** A single emoji used in place of product photography. The backend has no
   * such field and shouldn't: it's presentation, derived from the category by
   * the mapping layer. */
  emoji: string;
}

/** One page of catalog results, renumbered to the **1-based** paging the URL
 *  and the pagination controls use. The backend pages from 0. */
export interface ProductPage {
  items: Product[];
  page: number;
  totalPages: number;
  totalItems: number;
}

export interface Review {
  id: number;
  author: string;
  /** 0–5. The backend's CHECK constraint keeps this in 1–5, but the mapping
   * layer clamps anyway — `StarRating` builds its stars with `String.repeat`,
   * which throws on a negative count, and a rendering crash is exactly the
   * failure mode this whole boundary exists to prevent. */
  rating: number;
  comment: string;
}

/** What the checkout sends. Matches the backend's `OrderRequest` record
 *  as-is — the request direction was never the broken half of the contract. */
export interface OrderItemRequest {
  productId: number;
  quantity: number;
}

export interface OrderRequest {
  customerId: number;
  items: OrderItemRequest[];
}

/** A line on a *placed* order, which (unlike the request) echoes back the
 *  product name and the price actually charged. */
export interface OrderLine {
  productId: number;
  productName: string;
  quantity: number;
  /** Dollars, converted from the backend's integer cents. */
  unitPrice: number;
}

export interface Order {
  id: number;
  customerId: number;
  items: OrderLine[];
  /** The backend's `OrderStatus` name — `COMPLETED` today. Not rendered
   * anywhere; kept so the view model doesn't quietly drop wire data. */
  status: string;
  /** ISO-8601 timestamp, from the backend's `createdAt`. */
  placedAt: string;
  /** Dollars, converted from the backend's integer cents. */
  total: number;
}

/** Discriminates the three ways POST /api/orders can end, so the checkout UI
 * can render a distinct, honest message for each rather than a generic
 * "something went wrong". The 500 case is a planted backend fault we want
 * surfaced, not swallowed. */
export type CheckoutOutcome =
  | { kind: 'success'; order: Order }
  | { kind: 'out-of-stock' }
  | { kind: 'server-error' };
