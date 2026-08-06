# Spyglass Backend

A Spring Boot backend for **Spyglass**, a demo web shop selling observation gear (telescopes,
binoculars, magnifying glasses). Its actual job isn't selling anything — it's generating rich,
realistic telemetry (traces, JVM metrics, DB queries) for exercising Grafana Cloud, including a
set of toggleable planted faults that misbehave in specific, demonstrable ways.

## Versions

Verified against upstream docs/releases at the time this was built (see
`docs/research/grafana-cloud-application-observability.md` at the repo root for the fuller
Grafana Cloud instrumentation research this build follows):

| Component | Version | Why |
|---|---|---|
| Java | 25 (LTS) | Latest LTS; Spring Boot 4.1 gives it first-class support while keeping a Java 17 baseline. |
| Spring Boot | 4.1.0 | Latest stable release (Spring Framework 7 / Jakarta EE 11) at time of writing. |
| PostgreSQL | 18 | Latest stable major version. |
| Flyway | 12.4.0 (via Spring Boot's dependency management) | Schema + seed data migrations. |
| Grafana OpenTelemetry Java distribution | 2.30.0 | Grafana's documented recommendation for instrumenting a JVM app for Application Observability — a `-javaagent` wrapper of the upstream OTel Java agent; see the Dockerfile. |
| Testcontainers | 2.0.5 (via Spring Boot's dependency management) | Real-Postgres integration tests. Note: Testcontainers 2.x renamed its module artifacts with a `testcontainers-` prefix (e.g. `org.testcontainers:testcontainers-postgresql` instead of the 1.x `org.testcontainers:postgresql`) — see the comment in `pom.xml`. |

Spring Boot 4.1's per-feature test starters (`spring-boot-starter-webmvc-test`,
`spring-boot-starter-data-jpa-test`, etc.) replaced the old single
`spring-boot-starter-test` for feature-specific test *support* — but JUnit Jupiter, Mockito, and
AssertJ themselves still live in `spring-boot-starter-test`, which is why `pom.xml` still pulls
it in alongside the feature-specific ones.

## Domain

`Product` (telescope / binoculars / magnifier, with magnification, aperture, price, stock),
`Customer`, `Order` + `OrderItem`, `Review`. Schema and ~1,000 products / ~10,000 customers /
~100,000 orders (1-5 items each) / reviews on ~30% of products are all seeded by Flyway
migrations under `src/main/resources/db/migration/` — see those files for how the generator
works (deterministic, set-based SQL using `generate_series` + `hashtext()`, not row-by-row
inserts, so it completes in seconds).

## REST API (`/api`)

- `GET /api/health` — cheap liveness/readiness, does no DB work (see `HealthController`).
- `GET /api/products?search=&category=&page=`
- `GET /api/products/{id}`, `GET /api/products/{id}/reviews`
- `POST /api/orders` — `{"customerId": 1, "items": [{"productId": 1, "quantity": 2}]}` → 201 with
  the created order, or 409 if any item is out of stock.
- `GET /api/customers/{id}/orders` — order history with items + product names.

## Planted faults

Every fault below defaults to **ON** (an absent env var means "on") — the image is meant to
misbehave out of the box. Set the corresponding variable to `false` to see the fixed behavior.
See the code comment at each plant site (referenced below) for exactly what it demonstrates.

| Env var | Default | What it does | Plant site |
|---|---|---|---|
| `FAULT_SLOW_SEARCH` | `true` | Product search matches `description` with an unanchored `ILIKE '%term%'` that can't use any index (forced sequential scan); OFF switches to an anchored `lower(description) LIKE 'term%'` that uses the btree index created in `V1__schema.sql` either way. | `ProductRepository` (`searchSlow`/`searchFast`), selected in `ProductService.search` |
| `FAULT_N_PLUS_ONE` | `true` | Order history loads each order's items and each item's product with separate lazy-loaded queries (1 + N + M queries); OFF uses one query with `JOIN FETCH`. | `OrderRepository` (`findByCustomerIdOrderByCreatedAtDesc` vs. `findByCustomerIdWithItemsAndProducts`), selected in `CustomerOrderService.getOrderHistory` |
| `FAULT_CHECKOUT_ERRORS` | `true` | ~2% of checkouts throw a simulated payment-provider 500 **after** the order's DB transaction has already committed, so traces show real successful spans followed by an application-level error. | `OrderService.checkout` / `OrderService.shouldSimulatePaymentFailure` |
| `FAULT_MEMORY_LEAK` | `true` | A scheduled task appends a small byte-array chunk to an in-memory list every 10 seconds and never releases it, growing heap usage slowly until the liveness probe eventually restarts the pod (a sawtooth memory graph). Rate configurable via `FAULT_MEMORY_LEAK_MB_PER_MIN` (default `2`). | `MemoryLeakSimulator` |

## Local development

```bash
docker compose up --build
```

This builds the app image (see `Dockerfile`) and starts it alongside a `postgres:18` container
with `pg_stat_statements` preloaded (via `db-init/001-pg-stat-statements.sql` +
`shared_preload_libraries` in `compose.yaml`) — useful for exercising Grafana Cloud Database
Observability against this stack later. Flyway runs the schema + seed migrations automatically
on startup; seeding completes in a few seconds. The API is then available at
`http://localhost:8080/api/...`.

`compose.yaml` does **not** wire up an OTLP collector — the image's `OTEL_EXPORTER_OTLP_ENDPOINT`
default (`http://localhost:4318`) resolves to nothing useful inside the `backend` container as
shipped. Point it at a real collector/Alloy instance (or Grafana Cloud's OTLP endpoint directly,
with `OTEL_EXPORTER_OTLP_HEADERS` for auth) via an env override to actually see telemetry locally;
in the target EKS deployment this is expected to point at the k8s-monitoring chart's in-cluster
Alloy gateway instead.

### Running without Docker Compose

Point a local (or remote) Postgres at the app via the standard `SPRING_DATASOURCE_*` env vars,
then:

```bash
./mvnw spring-boot:run
```

## Tests

```bash
./mvnw verify
```

Two kinds of tests:

- **Unit tests** (always run, no Docker needed): fault-toggle defaults and env-var binding
  (`FaultPropertiesBindingTest`), the memory-leak rate math (`MemoryLeakSimulatorTest`), the
  checkout error-injection threshold with an injected `Random`
  (`OrderServiceCheckoutFaultTest`), and which repository query each fault selects
  (`ProductServiceSearchPathTest`, `CustomerOrderServiceFetchPathTest`).
- **Integration tests** (tagged `@Tag("integration")`, real Postgres via Testcontainers):
  `ProductRepositorySearchIntegrationTest` (the actual ILIKE/index semantics the slow-search
  fault depends on — deliberately not run against H2, whose LIKE semantics don't match
  Postgres's) and `OrderCheckoutIntegrationTest` (checkout stock decrement, out-of-stock
  rejection, and that the N+1 vs. fetch-join paths return identical data). These are **excluded
  by default** via the `excludedGroups` Surefire configuration in `pom.xml` — a plain
  `./mvnw verify` skips them. Run them explicitly with:

  ```bash
  ./mvnw verify -Pintegration-tests
  ```

  on a machine where Docker is available. This project's sandboxed dev environment does not have
  Docker, so these integration tests were written and compiled but not executed here — the
  8 unit tests (16 total `@Test` methods) above were run and pass; see the final report for
  exact counts.

## Deviations from the brief

- No dedicated `OrderItemRepository`: `OrderItem` rows are only ever created/mutated through
  `Order`'s cascading `@OneToMany`, so a separate repository would have no callers.
- The out-of-stock check locks the product row (`ProductRepository.findByIdForUpdate`, a
  `SELECT ... FOR UPDATE`) for the duration of the checkout transaction — not asked for
  explicitly, but without it two concurrent checkouts against the same low-stock product could
  both pass the stock check and oversell it; the lock also gives Database Observability a
  realistic lock-wait scenario to show under concurrent synthetic load.
