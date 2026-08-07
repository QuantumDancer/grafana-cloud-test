# End-to-end validation

Status: ready-for-human
Blocked by: 04, 07, 08, 09

Run a full session (`start.sh` → deploy → load running) and verify each Grafana Cloud
surface per the spec's Validation section, checking off:
- [ ] Kubernetes Monitoring: cluster, workloads, cost tabs populated
- [ ] Application Observability: service map, RED, N+1 waterfall, checkout error traces
- [ ] Frontend Observability: Web Vitals, JS errors, sessions from the browser loop
- [ ] Database Observability: slow ILIKE query in query performance, explain plan visible
- [ ] Trace→query linking (App O11y span → DB O11y sample)
- [ ] Cloud k6: one completed cloud run
- [ ] Synthetic Monitoring: both checks green
- [ ] `stop.sh` leaves nothing behind (AWS console + Grafana Cloud + Cloudflare records)
Then schedule the multi-day baseline run for ML/anomaly/forecast features.

Requires human: Grafana Cloud UI checks, judgment on "looks right".

## First validation session — 2026-08-07

User-driven UI pass plus four read-only agent investigations against the live stack. Every
defect found is filed as its own ticket; this list records the verdict per surface.

- **Kubernetes Monitoring** — cluster and workload tabs populate correctly. Cost is empty
  because cost collection was never deployed → issue 19.
- **Application Observability** — service map and RED work. N+1 waterfall **confirmed**
  on trace `a835d5c3b2d1c231c986f1a14651b059`: 51 spans, a 1→10→32 fanout, ~71% of a
  10.57 ms request spent in 45 sub-millisecond round trips. Two cosmetic-looking problems
  share one cause (pre-stable DB semconv attributes) → issue 23: the database renders as
  `shop-db-rw.shop`, and the 44 child spans all read `SELECT shop`. The garbled
  `line_format` in the logs view is a Grafana-side rendering defect → issue 28. Backend
  logs also turn out to be ingested twice → issue 24.
- **Frontend Observability** — Web Vitals, JS errors and browser-loop sessions all
  present. Deobfuscated stack traces do **not** work, for two independent reasons →
  issue 22 (no `app.bundleId` on the wire; errors arrive console-derived rather than as
  real exceptions). Session coverage is also narrower than it looks — the browser loop's
  cart/checkout/lens-care steps have never executed → issue 27.
- **Database Observability** — pipeline healthy and metrics arriving, but both criteria
  fail: no slow ILIKE because the query genuinely isn't slow at 1000 rows → issue 21;
  explain plans fail because the collector role lacks SELECT → issue 20.
- **Trace→query linking** — could not be verified. Our spans lack any query-identity
  attribute, and no public documentation for a span → query-sample link could be found.
  Treat as *unverifiable* rather than failed until the feature is confirmed to exist;
  issue 23 is the prerequisite either way.
- **Cloud k6** — one run completed, failing its Metric Tags threshold on URL cardinality
  → issue 25.
- **Synthetic Monitoring** — `shop-health` green. `shop-homepage-browser` has failed
  every execution since creation → issue 26.
- **`stop.sh` teardown** — still to be tested at the end of this session. Pair it with
  issue 12 (k6 run-history-on-destroy), which needs the IDs noted *before* teardown.

Not yet done: the multi-day baseline run for ML/anomaly/forecast features.
