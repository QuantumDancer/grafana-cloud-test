import type { Category, Order, OrderLine, Product, ProductPage, Review } from '../types/domain';
import type {
  WireCategory,
  WireOrder,
  WireOrderItem,
  WirePage,
  WireProductDetail,
  WireProductSummary,
  WireReview,
} from '../types/wire';

// The single place where the backend's wire format becomes the view models the
// components render. Every response body from `./client` passes through here.
//
// It exists because the two apps were built independently against a brief that
// pinned paths and status codes but not response schemas, and the divergence
// (cents vs. dollars, enum names vs. display labels, 0- vs. 1-based paging,
// `authorName`/`text` vs. `author`/`comment`) only surfaced when a real browser
// first talked to a real backend. Adapting on the frontend is the right side to
// fix: `types/domain.ts` already noted the wire format is "dictated by a backend
// we don't own".

// ---------------------------------------------------------------- categories

/** Both directions of the category translation in one table, so the two can't
 *  drift apart the way the two apps' schemas did. */
const CATEGORY_DISPLAY: Record<WireCategory, Category> = {
  TELESCOPE: 'Telescopes',
  BINOCULARS: 'Binoculars',
  MAGNIFIER: 'Magnifying Glasses',
};

const CATEGORY_WIRE: Record<Category, WireCategory> = {
  Telescopes: 'TELESCOPE',
  Binoculars: 'BINOCULARS',
  'Magnifying Glasses': 'MAGNIFIER',
};

/** Presentation only — the backend has no image or emoji field, and a demo shop
 *  with no product photography still wants something on each card. */
const CATEGORY_EMOJI: Record<WireCategory, string> = {
  TELESCOPE: '🔭',
  BINOCULARS: '🔎',
  MAGNIFIER: '🔍',
};

export function toDisplayCategory(category: WireCategory): Category {
  return CATEGORY_DISPLAY[category];
}

/**
 * Display label → enum name for the catalog filter, or `undefined` for
 * anything unrecognized.
 *
 * The `undefined` case matters: `ProductService.normalizeCategory` turns a
 * category it can't parse into "no filter at all" rather than an error, so
 * sending a bad value would silently return the *unfiltered* catalog. Omitting
 * the parameter produces the same result honestly, and keeps the "which values
 * are legal" question answerable here rather than by reading Java.
 */
export function toWireCategory(category: string | undefined): WireCategory | undefined {
  if (!category) {
    return undefined;
  }
  return CATEGORY_WIRE[category as Category];
}

// -------------------------------------------------------------------- money

/** The backend stores and sends integer cents; every price in the UI is
 *  rendered with `toFixed(2)` from dollars. */
function centsToDollars(cents: number): number {
  return cents / 100;
}

// ----------------------------------------------------------------- products

export function toProduct(dto: WireProductSummary | WireProductDetail): Product {
  return {
    id: dto.id,
    name: dto.name,
    category: toDisplayCategory(dto.category),
    price: centsToDollars(dto.priceCents),
    stock: dto.stock,
    emoji: CATEGORY_EMOJI[dto.category],
    // Only the detail DTO carries a description. Spreading it conditionally
    // rather than setting `description: undefined` keeps a catalog row and a
    // detail row structurally distinct, which is what the optional field in the
    // view model claims.
    ...('description' in dto ? { description: dto.description } : {}),
  };
}

/** Spring pages from 0 and calls the page index `number`; the URL, the pager
 *  controls, and everything else user-facing count from 1. */
export function toProductPage(page: WirePage<WireProductSummary>): ProductPage {
  return {
    items: page.content.map(toProduct),
    page: page.number + 1,
    totalPages: page.totalPages,
    totalItems: page.totalElements,
  };
}

/** UI page (1-based) → backend page (0-based), floored at 0 and truncated to
 *  an integer so a malformed `?page=` in the URL — negative, or fractional
 *  like `2.7` — can't turn into a request the backend would 400 on. */
export function toWirePageNumber(page: number | undefined): number {
  return Math.max(0, Math.trunc((page ?? 1) - 1));
}

// ------------------------------------------------------------------ reviews

export function toReview(dto: WireReview): Review {
  return {
    id: dto.id,
    author: dto.authorName,
    // `StarRating` builds its stars with `String.repeat`, which throws a
    // RangeError on a negative count — so an out-of-range rating would crash
    // the render. The database CHECK constraint makes that unreachable today;
    // clamping keeps it unreachable if it ever stops being.
    rating: Math.min(5, Math.max(0, Math.round(dto.rating))),
    comment: dto.text,
  };
}

// ------------------------------------------------------------------- orders

function toOrderLine(dto: WireOrderItem): OrderLine {
  return {
    productId: dto.productId,
    productName: dto.productName,
    quantity: dto.quantity,
    unitPrice: centsToDollars(dto.unitPriceCents),
  };
}

export function toOrder(dto: WireOrder): Order {
  return {
    id: dto.id,
    customerId: dto.customerId,
    status: dto.status,
    total: centsToDollars(dto.totalCents),
    placedAt: dto.createdAt,
    items: dto.items.map(toOrderLine),
  };
}
