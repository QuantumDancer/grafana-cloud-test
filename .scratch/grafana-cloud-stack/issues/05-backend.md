# Shop backend (Spring Boot)

Status: ready-for-agent

`apps/backend/`: latest stable Java LTS + Spring Boot + Maven. REST API under `/api`:
products (list/search/detail), customers (minimal), orders (create=checkout, history per
customer), reviews (per product), `/api/health`. Postgres via JPA; Flyway migrations for
schema + seed (~1k products / ~10k customers / ~100k orders; observation-gear product data —
telescopes/binoculars/magnifiers with magnification/aperture/price attributes).
Planted faults per spec (`FAULT_SLOW_SEARCH`, `FAULT_N_PLUS_ONE`, `FAULT_CHECKOUT_ERRORS`,
`FAULT_MEMORY_LEAK`), env-toggleable, default ON, each documented in code where planted.
Unit tests for the fault toggles + a couple of service tests. Multi-stage Dockerfile whose
runtime layer includes the Grafana OpenTelemetry Java distro agent wired via
`JAVA_TOOL_OPTIONS`; OTLP endpoint/resource attrs from env (`service.namespace=shop`,
`deployment.environment=test`). Verify current versions (Java LTS, Spring Boot, Grafana OTel
distro + its Spring Boot compat) against upstream docs before pinning.

Done: `mvn verify` passes; `docker build` succeeds; app runs against local Postgres
(docker compose file for local dev acceptable) and serves seeded data.
