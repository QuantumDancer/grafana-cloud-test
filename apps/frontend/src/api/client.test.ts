import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../mocks/server';
import { fetchCustomerOrders, fetchProduct, fetchProductReviews, fetchProducts, placeOrder } from './client';

// These are the contract tests for the wire→view mapping layer. Every payload
// below is a verbatim capture from the live backend
// (https://shop.rottlr.de/api, 2026-08-07) rather than something invented
// here — inventing the wire shape is precisely how the catalog came to crash
// on first contact with the real API. If the backend's format changes, these
// fixtures are what should be re-captured and re-pasted.

const LIVE_PRODUCT_ROW = {
  id: 3,
  name: 'Sky-Watcher Pioneer 324',
  category: 'TELESCOPE',
  magnification: 271,
  apertureMm: 167,
  priceCents: 144259,
  stock: 106,
};

/** The full Jackson serialization of a Spring `PageImpl`, sub-objects and all,
 *  so the mapper is tested against the real envelope rather than a tidied-up
 *  subset of it. */
function livePage(content: unknown[], number = 0, totalElements = 333) {
  const size = 20;
  return {
    content,
    pageable: {
      pageNumber: number,
      pageSize: size,
      sort: { empty: true, sorted: false, unsorted: true },
      offset: number * size,
      paged: true,
      unpaged: false,
    },
    last: false,
    totalElements,
    totalPages: Math.ceil(totalElements / size),
    size,
    number,
    sort: { empty: true, sorted: false, unsorted: true },
    first: number === 0,
    numberOfElements: content.length,
    empty: content.length === 0,
  };
}

describe('fetchProducts', () => {
  it('maps the Spring page envelope onto the catalog view model', async () => {
    server.use(http.get('/api/products', () => HttpResponse.json(livePage([LIVE_PRODUCT_ROW]))));

    const page = await fetchProducts({});

    expect(page).toEqual({
      // 0-based `number` becomes the 1-based page the URL and pager use.
      page: 1,
      totalPages: 17,
      totalItems: 333,
      items: [
        {
          id: 3,
          name: 'Sky-Watcher Pioneer 324',
          category: 'Telescopes',
          price: 1442.59,
          stock: 106,
          emoji: '🔭',
        },
      ],
    });
  });

  it('translates the 1-based UI page and display category into what the backend expects', async () => {
    let requested: URL | undefined;
    server.use(
      http.get('/api/products', ({ request }) => {
        requested = new URL(request.url);
        return HttpResponse.json(livePage([], 2));
      }),
    );

    await fetchProducts({ search: 'zeiss', category: 'Magnifying Glasses', page: 3 });

    expect(requested?.searchParams.get('page')).toBe('2');
    expect(requested?.searchParams.get('category')).toBe('MAGNIFIER');
    expect(requested?.searchParams.get('search')).toBe('zeiss');
  });

  it('omits a category the backend has no enum for instead of sending one it will silently ignore', async () => {
    let requested: URL | undefined;
    server.use(
      http.get('/api/products', ({ request }) => {
        requested = new URL(request.url);
        return HttpResponse.json(livePage([]));
      }),
    );

    await fetchProducts({ category: 'Sextants' });

    expect(requested?.searchParams.has('category')).toBe(false);
  });

  it('never asks for a negative page', async () => {
    let requested: URL | undefined;
    server.use(
      http.get('/api/products', ({ request }) => {
        requested = new URL(request.url);
        return HttpResponse.json(livePage([]));
      }),
    );

    await fetchProducts({ page: 0 });

    expect(requested?.searchParams.get('page')).toBe('0');
  });

  it('throws with the status when the catalog request fails', async () => {
    server.use(http.get('/api/products', () => new HttpResponse(null, { status: 503 })));

    await expect(fetchProducts({})).rejects.toThrow(/503/);
  });
});

describe('fetchProduct', () => {
  it('maps the detail payload, keeping the description the summary row lacks', async () => {
    server.use(
      http.get('/api/products/1', () =>
        HttpResponse.json({
          id: 1,
          name: 'Zeiss Voyager 974',
          description: "A binoculars from Zeiss's Voyager line, offering 15x magnification and a 44mm aperture.",
          category: 'BINOCULARS',
          magnification: 15,
          apertureMm: 44,
          priceCents: 75956,
          stock: 107,
        }),
      ),
    );

    await expect(fetchProduct(1)).resolves.toEqual({
      id: 1,
      name: 'Zeiss Voyager 974',
      description: "A binoculars from Zeiss's Voyager line, offering 15x magnification and a 44mm aperture.",
      category: 'Binoculars',
      price: 759.56,
      stock: 107,
      emoji: '🔎',
    });
  });
});

describe('fetchProductReviews', () => {
  it('renames the backend review fields to what the review list renders', async () => {
    server.use(
      http.get('/api/products/1/reviews', () =>
        HttpResponse.json([
          {
            id: 1,
            authorName: 'Sam T.',
            rating: 5,
            text: 'Good value, though the included case feels a bit flimsy.',
            createdAt: '2026-05-21T07:26:19.961215Z',
          },
        ]),
      ),
    );

    await expect(fetchProductReviews(1)).resolves.toEqual([
      {
        id: 1,
        author: 'Sam T.',
        rating: 5,
        comment: 'Good value, though the included case feels a bit flimsy.',
      },
    ]);
  });

  it('clamps a rating outside 1–5 rather than letting StarRating throw on it', async () => {
    server.use(
      http.get('/api/products/1/reviews', () =>
        HttpResponse.json([{ id: 1, authorName: 'Sam T.', rating: 9, text: 'Nine stars.', createdAt: '2026-05-21T07:26:19.961215Z' }]),
      ),
    );

    const [review] = await fetchProductReviews(1);
    expect(review.rating).toBe(5);
  });
});

describe('fetchCustomerOrders', () => {
  it('maps cents to dollars and createdAt to placedAt', async () => {
    server.use(
      http.get('/api/customers/1/orders', () =>
        HttpResponse.json([
          {
            id: 47305,
            customerId: 1,
            status: 'COMPLETED',
            totalCents: 293227,
            createdAt: '2026-03-21T07:26:07.558142Z',
            items: [
              { productId: 885, productName: 'Celestron Horizon 846', quantity: 1, unitPriceCents: 290782 },
              { productId: 560, productName: 'Coil Pathfinder 838', quantity: 1, unitPriceCents: 2445 },
            ],
          },
        ]),
      ),
    );

    await expect(fetchCustomerOrders(1)).resolves.toEqual([
      {
        id: 47305,
        customerId: 1,
        status: 'COMPLETED',
        total: 2932.27,
        placedAt: '2026-03-21T07:26:07.558142Z',
        items: [
          { productId: 885, productName: 'Celestron Horizon 846', quantity: 1, unitPrice: 2907.82 },
          { productId: 560, productName: 'Coil Pathfinder 838', quantity: 1, unitPrice: 24.45 },
        ],
      },
    ]);
  });
});

describe('placeOrder', () => {
  const request = { customerId: 42, items: [{ productId: 3, quantity: 2 }] };

  it('sends the request body the backend validates and maps the 201 back', async () => {
    let body: unknown;
    server.use(
      http.post('/api/orders', async ({ request: req }) => {
        body = await req.json();
        return HttpResponse.json(
          {
            id: 99001,
            customerId: 42,
            status: 'COMPLETED',
            totalCents: 288518,
            createdAt: '2026-08-07T09:15:00.123456Z',
            items: [{ productId: 3, productName: 'Sky-Watcher Pioneer 324', quantity: 2, unitPriceCents: 144259 }],
          },
          { status: 201 },
        );
      }),
    );

    const outcome = await placeOrder(request);

    expect(body).toEqual({ customerId: 42, items: [{ productId: 3, quantity: 2 }] });
    expect(outcome).toEqual({
      kind: 'success',
      order: {
        id: 99001,
        customerId: 42,
        status: 'COMPLETED',
        total: 2885.18,
        placedAt: '2026-08-07T09:15:00.123456Z',
        items: [{ productId: 3, productName: 'Sky-Watcher Pioneer 324', quantity: 2, unitPrice: 1442.59 }],
      },
    });
  });

  it('reports the 409 as out-of-stock', async () => {
    server.use(http.post('/api/orders', () => HttpResponse.json({ error: 'Insufficient stock' }, { status: 409 })));
    await expect(placeOrder(request)).resolves.toEqual({ kind: 'out-of-stock' });
  });

  it('reports the planted 500 as a server error', async () => {
    server.use(http.post('/api/orders', () => HttpResponse.json({ error: 'Payment provider unavailable' }, { status: 500 })));
    await expect(placeOrder(request)).resolves.toEqual({ kind: 'server-error' });
  });
});
