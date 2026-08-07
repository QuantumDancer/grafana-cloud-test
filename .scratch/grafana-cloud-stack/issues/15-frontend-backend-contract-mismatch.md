# Frontend/backend API contract mismatch — catalog crashes on load

Status: resolved

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

2026-08-07 (agent): Telemetry-side findings (user asked why the error is invisible in
Frontend O11y; checked via gcx → Loki `{app_id="6986", kind="exception"}`):

- The crash does NOT prevent Faro from sending — every crashed page load delivers
  three exceptions. But `FaroErrorBoundary` never fires: react-router's built-in
  route error boundary is nearer to the throw and catches first. The signals reach
  Faro only via the console instrumentation (React Router `console.error`s the caught
  error; Faro's default ConsoleInstrumentation converts `console.error` →
  `pushError`), so every error name carries a `console.error:` prefix and each crash
  is triple-reported (2× React Router messages + 1× raw TypeError). Consider a real
  `errorElement` that calls `faro.api.pushError` once, or accept the noise.
- Until 08:21 UTC all recorded crashes were from the pre-fix bundle
  (`app_version=b937ad8`, `index-Bofb16TO.js`) which has NO uploaded source map —
  nothing to deobfuscate. The 08:21:37 SM probe recorded the first crash on
  `17ce414` (`index-CCfP7k0Q.js`), which does have its map uploaded.
- All 38 Faro signals over 6 h are from the Synthetic Monitoring k6 browser
  (`k6_isK6Browser=true`, Chrome 149). The user's real Firefox session sent
  nothing — collector POSTs to
  `faro-collector-prod-eu-west-2.grafana.net/collect/…` are evidently blocked
  client-side (Firefox Enhanced Tracking Protection / ad-blocker), worth confirming
  in devtools.

2026-08-07 (user): Firefox is almost certainly blocking the collector via tracking
protection; will confirm in devtools later. Working in Chrome for now — so the
missing-Firefox-telemetry thread is parked, not a blocker for this issue.

## Resolution (2026-08-07)

Fixed frontend-side, as recommended. The wire format and the view models are now
two separate things with one translation between them:

- `src/types/wire.ts` (new) — the backend's actual shapes, transcribed from live
  responses and cross-checked against its DTO records.
- `src/types/domain.ts` — rewritten as view models only.
- `src/api/mapping.ts` (new) — the whole translation: `priceCents`→dollars,
  `TELESCOPE`↔`Telescopes` (both directions, one table), Spring `Page`→1-based
  `ProductPage`, `authorName`/`text`→`author`/`comment`,
  `totalCents`/`createdAt`→`total`/`placedAt`, emoji derived from category.
- `src/api/client.ts` — parses each response as its wire type and returns view
  models; sends the 0-based `page` and the enum category name.
- `src/mocks/{fixtures,handlers}.ts` — rewritten to serve the backend's shape,
  including the full `PageImpl` envelope and the `{"error": …}` bodies
  `ApiExceptionHandler` returns, so tests can no longer pass against a contract
  only the frontend believes in.

Two divergences the mapping layer handles that weren't in the inventory above:

- **Order status.** The frontend's type said `'CONFIRMED'`; the backend's
  `OrderStatus` enum has exactly one value and it's `COMPLETED`. Widened to
  `string` — nothing renders it, and a future status shouldn't be a type error at
  the wire boundary.
- **Unrecognized category = no filter.** `ProductService.normalizeCategory` turns
  a category it can't parse into `null` rather than an error, so the old code's
  `category=Telescopes` returned the *unfiltered* catalog and looked like a broken
  filter rather than a bad request. `toWireCategory` now returns `undefined` for
  anything not in the enum and the client omits the parameter entirely, and the
  MSW handler reproduces the same silent-ignore so a test can catch a regression.

Verification: 25 unit tests pass (`src/api/client.test.ts` asserts the mapping
against payloads captured verbatim from the live backend), `tsc -b` and `eslint`
clean. A throwaway live-contract test (not committed) ran the mappers over the
real backend and mapped all **1000 products across 50 pages** with no `NaN` or
`undefined`, all three categories and emojis present, plus live reviews and 13
live orders for customer 1.

Note for issue 10's "deobfuscated stack trace in Frontend O11y" check: the silver
lining above is now spent — this crash will stop appearing once the fixed bundle
deploys. The two frontend-owned planted faults (`/lens-care`, `/slow-page`) remain
as intentional error sources for that check.

### Deployed and verified live (2026-08-07)

Commit `c333995` pushed to `main`; CI run 31163826210 green, including the source-map
upload (`index-BDhlgofM.js.map`, bundle-id `c333995e411d…`). Deployed with
`deploy-shop.sh --frontend-tag sha-c333995` (helm revision 2). The pinned tag matters:
with the default `latest` the Deployment spec is unchanged, so helm computes no diff
and never rolls the pod despite `pullPolicy: Always` — the trap issue 11 hit. Frontend
and loadgen both rolled; backend and browserloop correctly untouched.

The k6 fix needed no image — `--set-file loadgen.script` re-injects it from the working
tree, and the chart's `checksum/script` pod annotation rolled the loadgen automatically.
Confirmed in-cluster: the ConfigMap now reads
`const CATEGORIES = ['', 'TELESCOPE', 'BINOCULARS', 'MAGNIFIER']`.

Faro proves the crash is actually gone in a real browser. Over a 25-minute window
spanning the rollout, querying `{app_id="6986"}` on the Grafana Cloud Loki:

| app_version | signals | exceptions |
|---|---|---|
| `c333995…` (new) | 24, across `/` and `/products/1` | **0** |
| `17ce414…` (old) | — | 18 |

`/` is the exact route that threw on every load, and `/products/1` exercises the detail
and reviews mapping. The old bundle's last recorded crash was 08:57:32 UTC, two minutes
before the rollout.
