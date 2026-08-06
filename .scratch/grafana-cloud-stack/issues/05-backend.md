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

## Comments

2026-08-06: Completed (executor + main session verification; backend commit). Java 25,
Spring Boot 4.1, PG 18, Grafana OTel distro 2.30. 16/16 unit tests + Testcontainers
integration tests green against the podman socket; image builds with podman (453 MB).
Extra: `SELECT ... FOR UPDATE` on checkout stock rows (oversell guard + lock-contention
demo for DB O11y).
