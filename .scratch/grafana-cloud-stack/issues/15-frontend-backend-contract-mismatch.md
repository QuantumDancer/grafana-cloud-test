# Frontend/backend API contract mismatch — catalog crashes on load

Status: ready-for-agent

`https://shop.rottlr.de/` throws on first render: `can't access property "length",
a.items is undefined` (react-router's default error boundary, "Unexpected Application
Error!"). **Not a planted fault** — the documented plants are four backend faults
(slow search, N+1, checkout 500s, memory leak; `apps/backend/README.md`) and two
frontend faults (`/lens-care` render throw, `/slow-page`; `apps/frontend/README.md`).
None of them is a contract mismatch.

Root cause: the two apps were built independently against a brief that pinned only
paths and status codes, not response schemas. The frontend's MSW mocks
(`src/mocks/handlers.ts`) invented one wire shape, the backend another, and every
frontend test runs against the mocks — so the first real browser-to-backend
integration (this live run) is the first time the divergence could bite.

Full divergence inventory (frontend expectation vs live backend):

| Surface | Frontend (`types/domain.ts`, mocks) | Backend (DTOs, Spring) |
|---|---|---|
| `GET /api/products` envelope | `{items, page (1-based), totalPages, totalItems}` | Spring `Page`: `{content, number (0-based), totalPages, totalElements, …}`; `page` request param 0-based |
| Product fields | `price` (dollars), `description`, `emoji` | `priceCents`; summary DTO has no description; `magnification`/`apertureMm` extra; no emoji anywhere |
| `category` values | `'Telescopes' \| 'Binoculars' \| 'Magnifying Glasses'` (also sent as filter param) | enum names `TELESCOPE`/`BINOCULARS`/`MAGNIFIER`; unknown filter values normalize to `null` → filter silently ignored |
| Reviews | `{author, comment, productId}` | `{authorName, text, createdAt}`, no productId |
| Orders | `{total (dollars), placedAt}` | `{totalCents, createdAt}` |

Recommended fix (frontend-side): `types/domain.ts` itself says the wire format is
"dictated by a backend we don't own", so adapt the frontend — thin mapping layer in
`api/client.ts` (wire DTO → view model: cents→dollars, category enum↔display name,
0-based↔1-based page, emoji derived from category client-side), and rewrite the MSW
mocks to serve the *backend's* wire shape so tests exercise the real contract and
this class of bug can't hide behind the mocks again.

Silver lining: this is a live, recurring frontend error hitting every browserloop
session — an ideal real-world test case for issue 10's "deobfuscated stack trace in
Frontend O11y" check (bundle `index-CCfP7k0Q.js`, uploaded map matches).

## Comments
