import { http, HttpResponse } from 'msw';
import type { OrderRequest } from '../types/domain';
import type { WireCategory, WireOrder, WirePage, WireProductDetail, WireProductSummary, WireReview } from '../types/wire';
import { findProduct, nextOrderIdSequence, ORDERS, PRODUCTS, REVIEWS } from './fixtures';

// This module stands in for the Spring Boot backend whenever the app runs
// without one — local dev with no VITE_BACKEND_URL configured, and every
// vitest run. It reproduces the real backend's *wire format*, not just its
// paths and status codes: the Spring `Page` envelope with 0-based `number`,
// `priceCents`, `TELESCOPE`-style category names, `authorName`/`text` reviews,
// `totalCents`/`createdAt` orders, and the `{"error": …}` body the
// ApiExceptionHandler returns. Anything less and the mocks would once again be
// asserting a contract only the frontend believes in.

/** The real backend pages at 20. Six keeps the 15 fixture products spread over
 *  three pages so the pagination controls stay exercisable in dev and in
 *  tests — page *size* is backend policy, not part of the response contract
 *  the frontend has to agree with. */
const PAGE_SIZE = 6;

/** Mirrors `ProductService.normalizeCategory`: case-insensitive parse into the
 *  enum, and — importantly — `null` (no filter at all) for anything that
 *  doesn't parse, rather than an error or an empty result. Reproducing the
 *  silent-ignore behaviour is what lets a test catch the frontend sending a
 *  category name the backend has never heard of. */
function normalizeCategory(raw: string | null): WireCategory | null {
  if (!raw || !raw.trim()) {
    return null;
  }
  const candidate = raw.trim().toUpperCase();
  return candidate === 'TELESCOPE' || candidate === 'BINOCULARS' || candidate === 'MAGNIFIER' ? candidate : null;
}

/** The catalog list DTO is the detail row minus its description — the backend
 *  keeps the two apart so a search results page doesn't carry the full text. */
function toSummary(product: WireProductDetail): WireProductSummary {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    magnification: product.magnification,
    apertureMm: product.apertureMm,
    priceCents: product.priceCents,
    stock: product.stock,
  };
}

/** Jackson's serialization of a `PageImpl`, sub-objects included. The extra
 *  fields are never read by the client, but emitting the real envelope means
 *  the mock can't quietly be easier to consume than the backend. */
function toPage(content: WireProductSummary[], number: number, totalElements: number) {
  const totalPages = Math.max(1, Math.ceil(totalElements / PAGE_SIZE));
  const sort = { empty: true, sorted: false, unsorted: true };
  return {
    content,
    pageable: { pageNumber: number, pageSize: PAGE_SIZE, sort, offset: number * PAGE_SIZE, paged: true, unpaged: false },
    last: number >= totalPages - 1,
    totalElements,
    totalPages,
    size: PAGE_SIZE,
    number,
    sort,
    first: number === 0,
    numberOfElements: content.length,
    empty: content.length === 0,
  } satisfies WirePage<WireProductSummary> & Record<string, unknown>;
}

export const handlers = [
  http.get('/api/products', ({ request }) => {
    const url = new URL(request.url);
    const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
    const category = normalizeCategory(url.searchParams.get('category'));
    // 0-based, like Spring's `@RequestParam(defaultValue = "0") int page`.
    const page = Math.max(0, Number(url.searchParams.get('page') ?? '0') || 0);

    // Matches the FAULT_SLOW_SEARCH=ON query shape (`ProductRepository.searchSlow`),
    // which is the deployed default: unanchored ILIKE on both name and
    // description.
    const filtered = PRODUCTS.filter((product) => {
      const matchesSearch =
        search === '' || product.name.toLowerCase().includes(search) || product.description.toLowerCase().includes(search);
      const matchesCategory = category === null || product.category === category;
      return matchesSearch && matchesCategory;
    });

    const start = page * PAGE_SIZE;
    const content = filtered.slice(start, start + PAGE_SIZE).map(toSummary);

    return HttpResponse.json(toPage(content, page, filtered.length));
  }),

  http.get('/api/products/:id', ({ params }) => {
    const product = findProduct(Number(params.id));
    if (!product) {
      return HttpResponse.json({ error: `No product with id ${params.id}` }, { status: 404 });
    }
    return HttpResponse.json(product);
  }),

  http.get('/api/products/:id/reviews', ({ params }) => {
    const productId = Number(params.id);
    if (!findProduct(productId)) {
      return HttpResponse.json({ error: `No product with id ${productId}` }, { status: 404 });
    }
    // `productId` is a column, not a wire field — project it away the way
    // ReviewDto does rather than handing the client something it won't get in
    // production.
    const reviews: WireReview[] = REVIEWS.filter((r) => r.productId === productId).map((r) => ({
      id: r.id,
      authorName: r.authorName,
      rating: r.rating,
      text: r.text,
      createdAt: r.createdAt,
    }));
    return HttpResponse.json(reviews);
  }),

  http.post('/api/orders', async ({ request }) => {
    const body = (await request.json()) as OrderRequest;

    // Planted fault: the real backend occasionally 500s on checkout regardless
    // of stock levels. We mirror that here (rather than gating it behind
    // faultsEnabled, which only controls the two frontend-owned faults) so
    // the "honest failed checkout" UI path is exercisable standalone too.
    if (Math.random() < 0.1) {
      return HttpResponse.json({ error: 'Payment provider unavailable' }, { status: 500 });
    }

    for (const item of body.items) {
      const product = findProduct(item.productId);
      if (!product || product.stock < item.quantity) {
        return HttpResponse.json({ error: `Insufficient stock for product ${item.productId}` }, { status: 409 });
      }
    }

    // Only decrement stock once we know every line item can be fulfilled —
    // otherwise a failed order would leave earlier items debited.
    const items = body.items.map((item) => {
      const product = findProduct(item.productId)!;
      product.stock -= item.quantity;
      return {
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPriceCents: product.priceCents,
      };
    });

    const order: WireOrder = {
      id: nextOrderIdSequence(),
      customerId: body.customerId,
      status: 'COMPLETED',
      totalCents: items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0),
      createdAt: new Date().toISOString(),
      items,
    };
    ORDERS.push(order);

    return HttpResponse.json(order, { status: 201 });
  }),

  http.get('/api/customers/:customerId/orders', ({ params }) => {
    const customerId = Number(params.customerId);
    return HttpResponse.json(ORDERS.filter((o) => o.customerId === customerId));
  }),
];
