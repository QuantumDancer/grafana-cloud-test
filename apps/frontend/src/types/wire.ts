// The Spring Boot backend's actual REST wire format — transcribed from the
// live responses of https://shop.rottlr.de/api (2026-08-07) and cross-checked
// against the DTO records in `apps/backend/.../web/dto`.
//
// These types exist so the divergence between "what the backend sends" and
// "what the UI wants to render" is written down in one place instead of being
// assumed. Nothing outside `src/api/mapping.ts` should import from here: every
// component works with the view models in `./domain`, which the mapping layer
// produces from these shapes.

/** Stored and returned as the Java enum's own name. The catalog filter param
 *  is parsed case-insensitively into this same enum, and anything that doesn't
 *  parse is silently treated as "no filter" — hence the care in
 *  `toWireCategory` to only ever send a value the backend recognizes. */
export type WireCategory = 'TELESCOPE' | 'BINOCULARS' | 'MAGNIFIER';

/** Catalog row, from `GET /api/products`. Deliberately lighter than
 *  {@link WireProductDetail} on the backend side: a search results page
 *  doesn't carry the description text. */
export interface WireProductSummary {
  id: number;
  name: string;
  category: WireCategory;
  magnification: number | null;
  apertureMm: number | null;
  priceCents: number;
  stock: number;
}

/** `GET /api/products/{id}` — the summary fields plus the description. */
export interface WireProductDetail extends WireProductSummary {
  description: string;
}

/**
 * Jackson's default serialization of a Spring Data `PageImpl`. The backend
 * returns `Page<ProductSummaryDto>` straight from the controller with no
 * `spring.data.web.pageable.serialization-mode` configured, so the whole
 * envelope — including the `pageable`/`sort` sub-objects we ignore — lands on
 * the wire. Only the four fields below are modelled; the rest are derivable
 * (`first`, `last`, `empty`, …) and no UI needs them.
 *
 * Note `number` is **0-based**, as is the `page` request parameter.
 */
export interface WirePage<T> {
  content: T[];
  number: number;
  size: number;
  totalPages: number;
  totalElements: number;
}

/** `GET /api/products/{id}/reviews`. Carries no `productId` — the caller
 *  already knows which product it asked about. */
export interface WireReview {
  id: number;
  authorName: string;
  rating: number;
  text: string;
  createdAt: string;
}

export interface WireOrderItem {
  productId: number;
  productName: string;
  quantity: number;
  unitPriceCents: number;
}

/** `POST /api/orders` (201) and each element of
 *  `GET /api/customers/{id}/orders`. `status` is the backend's `OrderStatus`
 *  enum name, currently always `COMPLETED` — modelled as a plain string
 *  because the UI never branches on it and a future status shouldn't be a
 *  type error at the wire boundary. */
export interface WireOrder {
  id: number;
  customerId: number;
  status: string;
  totalCents: number;
  createdAt: string;
  items: WireOrderItem[];
}
