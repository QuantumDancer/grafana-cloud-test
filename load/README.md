# Load generation

Two scripts, two different jobs — see each file's own header comment for the
full reasoning, this is the request-mix summary (issue 08's "Done" criterion).

## `k6/shop-load.js` — HTTP load

Runs continuously in-cluster (`charts/shop`'s `loadgen` Deployment) and
occasionally as a manual `k6 cloud` run against `https://shop.rottlr.de`
(same file, env-switched `BASE_URL`). Every iteration:

| Step | Endpoint | Always/conditional | Purpose |
|---|---|---|---|
| Browse/search | `GET /api/products?search=&category=&page=` | always | Catalog browsing. ~60% of iterations add a search term; of those, ~40% use a deliberately common/short substring (`a`, `e`, `pro`, `the`, `lens`) that maximizes rows matched by `FAULT_SLOW_SEARCH`'s unanchored `ILIKE '%term%'`, the rest use realistic product terms. |
| Product detail | `GET /api/products/{id}`, `GET /api/products/{id}/reviews` | always | Random product in `[1, 1000]`. |
| Checkout | `POST /api/orders` | ~30% of iterations | Random customer in `[1, 10000]`, 1-3 units of the last-viewed product. Tolerates `201` (placed), `409` (out of stock — a real possible outcome, not a bug), and `500` (`FAULT_CHECKOUT_ERRORS`'s simulated ~2% payment failure) as all "expected"; only genuinely unexpected statuses count against the error-rate metric. |
| Order history | `GET /api/customers/{id}/orders` | ~20% of iterations | Random customer in `[1, 10000]`. This is the endpoint `FAULT_N_PLUS_ONE` lives on. |

VUs ramp `1 → 5 → 0` over a 14-minute window (`options.scenarios.shop_traffic`,
overridable via the `VUS` env var); every iteration also scales its own sleep
duration by a `diurnalSleepMultiplier()` read from the wall-clock hour (full
pace 09:00-21:00, half pace in the morning/evening shoulders, quarter pace
00:00-06:00) — that's this script's time-of-day variation, chosen over a
literal 24h stage ramp so the same script stays a short, cheap, restartable
run both in-cluster and for an occasional `k6 cloud` invocation. See the
in-cluster continuity mechanism note in `charts/shop/templates/loadgen.yaml`
(the script's own bounded duration + the Pod's `restartPolicy: Always` is
what makes this "continuous" over a multi-day baseline run, not an
internal infinite loop).

Validated with `k6 inspect` (options/thresholds parse) and a real `k6 run`
against a local stub HTTP server (see final report for the exact commands and
output) — no live backend was available in this sandbox to exercise the
planted faults themselves end-to-end.

## `browser/shop-browser.js` — Faro traffic loop

The **only** source of Frontend Observability telemetry besides a real
visitor — `shop-load.js` never loads a browser, so it produces zero Faro
data. Runs continuously in-cluster (`charts/shop`'s `browserloop`
Deployment, `docker.io/grafana/k6:2.1.0-with-browser`) driving a real
Chromium via k6's browser module, one page pass every ~2-5 minutes (low
frequency by design — see the script's own header comment):

1. Load the catalog at `https://shop.rottlr.de` (**must** be the public
   hostname, never an in-cluster Service URL — the hosted Faro Collector's
   `allowed_origins` allowlist only contains this hostname, so anything else
   gets every beacon CORS-dropped; see the script's own comment and
   `charts/shop/values.yaml`'s `browserloop.targetUrl`).
2. Open a product from the catalog grid.
3. Add it to the cart, follow "View cart".
4. Proceed to checkout, place the order (accepts whichever of the three
   planted outcomes — success / out of stock / simulated 500 — comes back;
   all three are a completed, Faro-worthy interaction).
5. On ~25% of passes, also visit `/lens-care` and click through to the
   planted JS render error (`FAULT #1`), exercising `FaroErrorBoundary`'s
   error-reporting path. Not every pass, so Frontend Observability's error
   rate doesn't read as "this app is always broken."

Every step is wrapped so one failed locator doesn't abort the whole pass —
better to keep the loop running and generating *some* telemetry each cycle
than to have Faro traffic go silent over one transient hiccup.

Validated with `k6 inspect` only (scenario/options parse) — this sandbox has
no Chromium/Docker available to actually launch the browser and click
through the real frontend; review/smoke-test this one against a live
deployment before relying on it.

## Both scripts

- No Node APIs (`fs`, `path`, ...) — only k6's own built-in modules, so both
  stay valid for `k6 cloud`/cloud execution.
- Both read their target from an env var (`BASE_URL` / `TARGET_URL`) rather
  than a hardcoded host, letting `scripts/deploy-shop.sh` point the in-cluster
  copies at internal Service DNS while a manual cloud run points at the
  public hostname.
