# Grafana Cloud test stack — spec

Confirmed in the 2026-08-06 grilling session. Glossary: `/CONTEXT.md`. Research: `/docs/research/`.
Decisions with trade-offs worth remembering: `/docs/adr/`.

## Goal

Exercise Grafana Cloud's Cloud-exclusive observability features — Kubernetes Monitoring,
Application Observability, Frontend Observability, Database Observability, plus cloud k6 and
Synthetic Monitoring — with realistic, continuously generated telemetry from a disposable stack.

## Infrastructure

- Ephemeral **EKS Auto Mode** cluster, `eu-central-1`, provisioned with **OpenTofu**.
- **Local tofu state**, `.gitignore`d (ADR-0001). Secrets in untracked `*.auto.tfvars`.
- Ordered components under `infra/`, orchestrated by `scripts/start.sh` / `scripts/stop.sh`
  (pattern: `idp-terraform-aws-infra` — access entries, Pod Identity, default tags,
  remote-state-free output passing between components via `terraform_remote_state` with local backend).
- Component order: `10-network` → `20-cluster` → `30-grafana-cloud` → `40-platform`.
  Reverse for destroy. Grafana Cloud component holds resources that die with the session
  (tokens, SM checks, k6 tests); the Faro app and k6 installation/project live there too but
  are cheap to recreate — the **stack itself is never created/destroyed** (ADR-0003).

## Platform layer (in tofu via helm_release, component `40-platform`)

Ordering inside the component matters: operators/CRDs before CRs before chart values that
reference their outputs.

1. cert-manager + `letsencrypt` ClusterIssuer (ACME **DNS-01 via Cloudflare**).
2. Envoy Gateway (Auto Mode provisions the NLB) + Gateway API `Gateway` with TLS listener,
   cert from cert-manager `Certificate` for `shop.rottlr.de`.
3. external-dns (Cloudflare; sources: `gateway-httproute`, `service`) — records self-clean on teardown.
4. CloudNativePG operator, then PostgreSQL `Cluster` CR: latest stable PG,
   `pg_stat_statements`, `compute_query_id=on`, `track_activity_query_size=4096`,
   `db-o11y` user with `pg_monitor` (Database Observability requirements).
5. **k8s-monitoring chart v4**: `clusterMetrics`, `clusterEvents`, `podLogs`,
   `applicationObservability` (OTLP receivers + k8s enrichment),
   `integrations.postgresql` with `databaseObservability.enabled: true`,
   destinations = Grafana Cloud endpoints from tofu-created access-policy tokens.

Prior art to crib from: `idp-argocd-platform-apps` (cert-manager-config, external-dns,
networking-config charts) and `idp-terraform-aws-infra` (helm provider wiring, exec auth).

## The Shop

Three-tier demo app selling observation gear (telescopes, binoculars, magnifying glasses).
Single hostname **`shop.rottlr.de`**; HTTPRoute sends `/api` to the backend, rest to the frontend.
Entities: Product, Customer, Order, OrderItem, Review.
Seed via Flyway migrations in the backend: ~1k products, ~10k customers, ~100k orders.

- **Backend**: latest stable Java LTS + Spring Boot + Maven. Instrumented with the
  **Grafana OpenTelemetry Java distribution** agent (`JAVA_TOOL_OPTIONS`), OTLP → chart's
  `applicationObservability` receiver. Resource attrs: `service.name`, `service.namespace=shop`,
  `deployment.environment=test`.
- **Frontend**: TypeScript + React + Vite + React Router v7 + `@grafana/faro-react` +
  `@grafana/faro-web-tracing` → **hosted Faro Collector** (endpoint + app key injected at
  runtime via config endpoint or build-time env).
- **Planted faults**, each toggleable via env var (default ON):
  1. `FAULT_SLOW_SEARCH` — product search uses unanchored `ILIKE '%term%'` on unindexed column.
  2. `FAULT_N_PLUS_ONE` — order-history endpoint loads items/products per-order.
  3. `FAULT_CHECKOUT_ERRORS` — checkout 500s ~2% of requests (simulated payment provider).
  4. `VITE_FAULT_FRONTEND` — one route throws a JS error on interaction; one page renders slowly.
  5. `FAULT_MEMORY_LEAK` — slow heap leak; liveness probe restarts the pod (sawtooth).

## Deployment model (ADR-0002)

Hybrid: tofu owns AWS + Platform; the Shop deploys via `helm upgrade -i` from
`scripts/deploy-shop.sh`. **One chart** (`charts/shop/`) with per-component enable flags:
frontend, backend, loadgen, browserloop. DB is Platform, not Shop.

## Load

- In-cluster **k6** (primary, continuous, modest VUs with daily variation) — scripts in `load/`.
- In-cluster **browser loop** (k6 browser or Playwright) driving the frontend for Faro telemetry.
- **Cloud k6**: terraformed installation/project/test (+ optional schedule); occasional runs
  via `k6 cloud`. Free tier: 500 VUh/month; browser = 10× VUh.
- **Synthetic Monitoring** (terraformed, dies with session): 1 HTTP check 5 min × 2 probes,
  1 browser check 15 min × 1 probe (stays inside free tier).

## CI (GitHub Actions)

Build + unit-test frontend and backend on push to main (path-filtered); push images to GHCR
(public repo) tagged `sha-<shortsha>` + `latest`; upload frontend source maps to Faro
(Faro token = the only GitHub secret). **CI never touches the cluster or tofu.**

## Grafana Cloud account facts

Free tier; single existing stack shared with home-lab Linux VM monitoring (metrics + logs
only, no conflict expected). Stack slug/region via untracked tfvars.

## Recorded assumptions

- Shop display name: "Spyglass".
- `deployment.environment=test` everywhere.
- NAT: decide fck-nat vs no-NAT at implementation after checking Auto Mode subnet requirements.
- Exact versions (Java/Spring Boot/React/chart) verified at implementation time; "latest stable".

## Validation

Done = each of the six Grafana Cloud surfaces shows live data during a session:
Kubernetes Monitoring (cluster/workloads/cost tabs), Application Observability (service map,
RED, traces incl. N+1 waterfall + checkout errors), Frontend Observability (Web Vitals,
errors, sessions), Database Observability (query performance incl. slow ILIKE, explain plans),
cloud k6 (one completed cloud run), Synthetic Monitoring (checks green). A multi-day
**baseline run** near the end feeds ML/anomaly/forecast features.
