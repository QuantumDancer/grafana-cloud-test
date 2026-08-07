# Spyglass — frontend

A demo web shop for observation gear (telescopes, binoculars, magnifying
glasses). Its purpose is generating Grafana Faro frontend-observability
telemetry — page loads, route changes, fetches, Web Vitals, JS errors,
sessions — not being a real storefront.

## Stack and pinned versions

Verified against the npm registry and upstream docs on 2026-08-06:

| Package | Version | Notes |
|---|---|---|
| `react` / `react-dom` | 19.2.8 | Latest stable. |
| `vite` | 8.2.0 | Latest stable. |
| `@vitejs/plugin-react` | 6.0.4 | |
| `react-router-dom` | 7.18.2 | React Router v7 as required by the brief. Note: a `react-router` v8 already exists on npm, but `react-router-dom` (which still bundles `createBrowserRouter`/`RouterProvider` for non-framework Vite apps) hasn't moved past the 7.x line yet — pinning to 7.18.2 keeps both packages' majors aligned and matches what Faro's router instrumentation documents support for ("React Router v4–v7"). |
| `@grafana/faro-react` / `@grafana/faro-web-tracing` | 2.9.0 | Both packages release in lockstep. |
| `typescript` | ~6.0.2 | **Deliberately not bumped to the 7.x line** even though `typescript@7.0.2` is on npm — `pnpm create vite`'s own `react-ts` template (as of this build) still pins `~6.0.2`, and TS 7 is the new from-scratch native (Go-ported) compiler; staying on the version the scaffolding tool itself chose avoids being the first to find any ecosystem-compat gap in a demo project. Revisit once the template itself moves. |
| `vitest` | 4.1.10 | |
| `@testing-library/react` | 16.3.2 | |
| `msw` | 2.15.0 | |
| `eslint` | 10.8.0 | Flat config (`eslint.config.js`). |

Package manager: **pnpm** (`packageManager: pnpm@11.20.0` pinned in
`package.json`; corepack wasn't usable inside this build's sandbox, so pnpm
was installed via `npm install -g pnpm` instead — either path produces the
same lockfile).

### React Router v7 + Faro compatibility note

Faro's router instrumentation for the v6/v7 **data router** API
(`createBrowserRouter`) is:

```ts
new ReactIntegration({
  router: createReactRouterV7DataOptions({ matchRoutes }),
})
```

paired with `withFaroRouterInstrumentation(router)` wrapping the router
returned by `createBrowserRouter` (see `src/router.tsx`). One correction
versus the prose on Grafana's own docs page: `TracingInstrumentation`'s
`propagateTraceHeaderCorsUrls` option is **not** top-level — it lives under
`instrumentationOptions.propagateTraceHeaderCorsUrls` per the package's own
`.d.ts` (verified directly against `node_modules/@grafana/faro-web-tracing`,
since the docs example doesn't compile as written against 2.9.0).

## Runtime configuration (Faro collector URL / app key)

The Faro collector URL and app key are per-environment values, not build-time
constants — baking them into the JS bundle would mean rebuilding the image
per environment and would leak the app key into a public bundle anyone can
read. Instead:

1. `index.html` loads `/config.js` in a plain `<script>` tag *before* the
   app's module bundle.
2. That script sets `window.__SPYGLASS_CONFIG__ = { faroCollectorUrl, faroAppKey, appEnvironment, faultsEnabled }`.
3. `src/config.ts`'s `loadRuntimeConfig()` reads that global (falling back to
   safe defaults if it's missing) before `main.tsx` calls `initFaro()`.

- **Local dev / `vite build` output run outside the container:**
  `public/config.js` is a static file with an empty collector URL — Faro
  initialization is skipped gracefully (see `initFaro` in `src/faro.ts`), so
  the app runs standalone with no Grafana Cloud credentials.
- **The container:** `docker/docker-entrypoint.sh` runs as one of
  `nginxinc/nginx-unprivileged`'s `/docker-entrypoint.d/` startup hooks and
  regenerates `/usr/share/nginx/html/config.js` from environment variables
  every time the container starts, before nginx begins serving:
  - `FARO_COLLECTOR_URL` (empty ⇒ Faro disabled)
  - `FARO_APP_KEY`
  - `APP_ENVIRONMENT` (default `test`)
  - `FAULTS_ENABLED` (default `true`)

`config.js` is served with `Cache-Control: no-store` (see `docker/nginx.conf`)
since, unlike the hashed/immutable JS and CSS bundles, it must be re-fetched
on every load.

## Planted faults

Both are gated by the single `faultsEnabled` runtime flag above (default
`true`):

1. **Lens Care Guide** (`/lens-care`) — a "Load detailed coating chart"
   button. Clicking it sets state that causes the *next render* to throw
   (not the click handler itself — React error boundaries, Faro's included,
   only intercept errors from rendering/lifecycle, never from event handler
   bodies). The root-level `FaroErrorBoundary` in `main.tsx` reports the
   error to Faro and *then* renders its fallback — the ordering that
   proves Faro sees the error rather than having it swallowed first.
2. **Deep Sky Almanac** (`/slow-page`) — renders several thousand rows, each
   re-running a deliberately wasteful synchronous computation on every
   render (including on every keystroke in its filter box). Produces a slow
   first paint (bad LCP) and a blocked main thread on interaction (bad INP).
   With faults disabled it renders a short, fast list instead.

## Backend API and mock fallback

Every request is a relative `/api/...` path — same-origin, no CORS — per the
brief:

- `GET /api/products?search=&category=&page=`
- `GET /api/products/{id}`, `GET /api/products/{id}/reviews`
- `POST /api/orders` → `201` / `409` (out of stock) / occasional planted
  `500`, surfaced in the checkout UI as a distinct, honest message for each
  (see `CheckoutOutcome` in `src/types/domain.ts` and `CheckoutPage.tsx`)
- `GET /api/customers/{id}/orders`

### Wire format vs. view models

The backend's response schemas are **not** the shapes the components render,
and the two are kept deliberately apart in three files:

| File | Owns |
|---|---|
| `src/types/wire.ts` | What the Spring backend actually sends — transcribed from live responses and cross-checked against its DTO records. Imported only by `mapping.ts` and the mocks. |
| `src/types/domain.ts` | What the UI wants — dollars, display category labels, 1-based pages, `author`/`comment`. |
| `src/api/mapping.ts` | The translation, in one auditable place. |

The differences it absorbs: integer `priceCents` → dollars; `TELESCOPE` →
`Telescopes` (and back, for the filter parameter); Spring's `Page` envelope
(`content`, 0-based `number`, `totalElements`) → `items`/1-based
`page`/`totalItems`; `authorName`/`text` → `author`/`comment`;
`totalCents`/`createdAt` → `total`/`placedAt`; and the `emoji`, which the
backend has no concept of and which is derived from the category client-side.

This exists because it once didn't. The frontend was built against an invented
wire shape, the MSW mocks agreed with the invention, every test passed, and the
first real browser-to-backend request crashed the catalog on
`a.items is undefined` (`.scratch/grafana-cloud-stack/issues/15-*`). So the
mocks now serve the **backend's** shape — including the full `PageImpl`
envelope and the `{"error": …}` bodies `ApiExceptionHandler` returns — and
`src/api/client.test.ts` asserts the mapping against payloads captured verbatim
from the live backend. If the backend's format changes, re-capture those
fixtures; that file is the contract.

One deliberate divergence: the mock pages at 6 products where the real backend
pages at 20, so the 15 fixture products still span three pages and the
pagination controls stay exercisable. Page *size* is backend policy, not part
of the response shape the frontend has to agree with.

**Dev-server proxy:** `vite.config.ts` proxies `/api` to
`VITE_BACKEND_URL` (default `http://localhost:8080`) when running `pnpm dev`
against a real backend.

**Standalone mock fallback (MSW):** when `pnpm dev` runs with no
`VITE_BACKEND_URL` set, `src/main.tsx` starts an MSW **browser** worker
(`src/mocks/browser.ts`) that intercepts `/api` calls at the network layer —
so the proxy target above is never actually dialed in that mode. The same
handlers (`src/mocks/handlers.ts`) back an MSW **node** server
(`src/mocks/server.ts`) used by every vitest test, so "the mock backend" has
one definition shared by dev and tests rather than two that can drift. Mock
data (15 products across the three categories, reviews, an in-memory order
store) lives in `src/mocks/fixtures.ts`.

The built/containerized app never starts the mock worker — nginx is assumed
to sit behind something (an ingress, a sidecar) that routes `/api` to the
real backend; this frontend container doesn't attempt that routing itself
(see **Deviations** below).

## Running it

```sh
pnpm install
pnpm dev          # http://localhost:5173, mocked backend by default
pnpm test         # vitest run
pnpm build        # tsc -b && vite build
pnpm lint         # eslint .
```

Against a real backend: `VITE_BACKEND_URL=http://localhost:8080 pnpm dev`.

## Container

```sh
docker build -t spyglass-frontend .
docker run -p 8080:8080 \
  -e FARO_COLLECTOR_URL=https://faro-collector-....grafana.net/collect/... \
  -e FARO_APP_KEY=... \
  -e APP_ENVIRONMENT=test \
  spyglass-frontend
```

Source maps are emitted during the build (`vite.config.ts`'s
`build.sourcemap: true`) but moved out of `dist/` before the runtime stage
copies it in, so the served image never contains them. CI can pull just the
maps via buildkit's export target:

```sh
docker build --target sourcemaps --output type=local,dest=./sourcemaps .
```

*Not verified in this environment* — the sandbox this was built in has no
`docker` binary. The Dockerfile, `docker/nginx.conf`, and
`docker/docker-entrypoint.sh` (POSIX `sh`, passes `shellcheck -s sh`) should
be reviewed/built for real before relying on them.

## Deviations from the brief / things to scrutinize

- **`/api` routing in the container**: the brief's "no CORS" / same-origin
  requirement is satisfied by nginx serving both the static app and (in a
  real deployment) sitting behind whatever routes `/api` to the backend by
  path — this Dockerfile does not add an nginx `proxy_pass` for `/api`
  itself, since no backend service address/discovery convention was given.
  If same-origin needs to hold *without* an external router, add a
  `location /api { proxy_pass ...; }` block to `docker/nginx.conf` with a
  `BACKEND_URL`-style env var wired through the entrypoint script.
- **Planted 500 in the mock backend**: the brief describes the occasional
  500 as an existing real-backend fault, not one of the two frontend-owned
  `faultsEnabled` faults. The MSW mock reproduces it anyway (a flat 10%
  chance on `POST /api/orders`, unconditional on `faultsEnabled`) purely so
  the "honest failed checkout" UI path is exercisable when running
  standalone — worth confirming this rate/placement is what's wanted.
  Real occurrence rate/logic lives entirely in the backend once one exists.
  See `src/mocks/handlers.ts`.
- **Order history without login**: there's no auth, so `/orders` prompts for
  a customer id to look up (see `src/routes/OrderHistoryPage.tsx`);
  `/orders/:customerId` is pre-filled automatically after a successful
  checkout for that session (`src/state/CustomerContext.tsx`, session-only,
  not persisted).
- **`react-router-dom` vs. plain `react-router`**: pinned to the
  `react-router-dom` package rather than importing everything from
  `react-router` directly, since it's what still ships `createBrowserRouter`
  for a plain (non-framework-mode) Vite app in the v7 line — see the version
  table above.
- **`magnification` / `apertureMm` are received but not rendered**: both are on
  the wire and modelled in `src/types/wire.ts`, but the mapping layer doesn't
  carry them into the view model and no component shows them. The seeded
  descriptions mention both in prose, so nothing is hidden from a shopper — a
  spec table on the detail page would be a cheap addition if wanted.
- Reasonable assumptions made without stopping to ask (per default when run
  unattended): page size of 6 products in the mock catalog endpoint; a fixed
  3-category set (Telescopes/Binoculars/Magnifying Glasses) with 15 seed
  products; nginx image pinned to `nginxinc/nginx-unprivileged:1.27-alpine`
  (verify this is still the current stable tag before real deployment).
