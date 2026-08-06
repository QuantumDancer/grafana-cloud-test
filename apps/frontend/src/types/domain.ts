// Shapes mirrored from the Spring Boot backend's REST contract (see repo root
// CLAUDE.md / brief). Kept intentionally flat — this is a demo storefront, not
// a domain model exercise, and the wire format is dictated by a backend we
// don't own.

export type Category = 'Telescopes' | 'Binoculars' | 'Magnifying Glasses';

export interface Product {
  id: number;
  name: string;
  category: Category;
  price: number;
  description: string;
  stock: number;
  /** A single emoji used in place of product photography — keeps the demo
   * asset-free while still giving each card a bit of telescope/lens charm. */
  emoji: string;
}

export interface ProductPage {
  items: Product[];
  page: number;
  totalPages: number;
  totalItems: number;
}

export interface Review {
  id: number;
  productId: number;
  author: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string;
}

export interface OrderItem {
  productId: number;
  quantity: number;
}

export interface OrderRequest {
  customerId: number;
  items: OrderItem[];
}

export interface Order {
  id: number;
  customerId: number;
  items: OrderItem[];
  status: 'CONFIRMED';
  placedAt: string;
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
