import { http, HttpResponse } from 'msw';
import type { Order, OrderRequest } from '../types/domain';
import { findProduct, nextOrderIdSequence, ORDERS, PRODUCTS, REVIEWS } from './fixtures';

const PAGE_SIZE = 6;

// This module stands in for the Spring Boot backend whenever the app runs
// without one — local dev with no VITE_BACKEND_URL configured, and every
// vitest run. Routes and status codes mirror the real API contract in the
// brief exactly (including the two non-200 checkout outcomes) so the UI code
// under test never needs to know which backend it's talking to.
export const handlers = [
  http.get('/api/products', ({ request }) => {
    const url = new URL(request.url);
    const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
    const category = url.searchParams.get('category') ?? '';
    const page = Number(url.searchParams.get('page') ?? '1') || 1;

    const filtered = PRODUCTS.filter((product) => {
      const matchesSearch = search === '' || product.name.toLowerCase().includes(search) || product.description.toLowerCase().includes(search);
      const matchesCategory = category === '' || product.category === category;
      return matchesSearch && matchesCategory;
    });

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const start = (page - 1) * PAGE_SIZE;
    const items = filtered.slice(start, start + PAGE_SIZE);

    return HttpResponse.json({
      items,
      page,
      totalPages,
      totalItems: filtered.length,
    });
  }),

  http.get('/api/products/:id', ({ params }) => {
    const product = findProduct(Number(params.id));
    if (!product) {
      return HttpResponse.json({ message: 'Product not found' }, { status: 404 });
    }
    return HttpResponse.json(product);
  }),

  http.get('/api/products/:id/reviews', ({ params }) => {
    const productId = Number(params.id);
    return HttpResponse.json(REVIEWS.filter((r) => r.productId === productId));
  }),

  http.post('/api/orders', async ({ request }) => {
    const body = (await request.json()) as OrderRequest;

    // Planted fault: the real backend occasionally 500s on checkout regardless
    // of stock levels. We mirror that here (rather than gating it behind
    // faultsEnabled, which only controls the two frontend-owned faults) so
    // the "honest failed checkout" UI path is exercisable standalone too.
    if (Math.random() < 0.1) {
      return HttpResponse.json({ message: 'Internal server error' }, { status: 500 });
    }

    for (const item of body.items) {
      const product = findProduct(item.productId);
      if (!product || product.stock < item.quantity) {
        return HttpResponse.json({ message: `Insufficient stock for product ${item.productId}` }, { status: 409 });
      }
    }

    // Only decrement stock once we know every line item can be fulfilled —
    // otherwise a failed order would leave earlier items debited.
    let total = 0;
    for (const item of body.items) {
      const product = findProduct(item.productId)!;
      product.stock -= item.quantity;
      total += product.price * item.quantity;
    }

    const order: Order = {
      id: nextOrderIdSequence(),
      customerId: body.customerId,
      items: body.items,
      status: 'CONFIRMED',
      placedAt: new Date().toISOString(),
      total: Math.round(total * 100) / 100,
    };
    ORDERS.push(order);

    return HttpResponse.json(order, { status: 201 });
  }),

  http.get('/api/customers/:customerId/orders', ({ params }) => {
    const customerId = Number(params.customerId);
    return HttpResponse.json(ORDERS.filter((o) => o.customerId === customerId));
  }),
];
