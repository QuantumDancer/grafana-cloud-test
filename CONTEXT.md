# Grafana Cloud Test Stack

A disposable EKS-based environment whose only purpose is to exercise Grafana Cloud's
Cloud-exclusive observability features (Kubernetes, Application, Frontend, and Database
Observability) with realistic, continuously generated telemetry.

## Language

**Ephemeral cluster**:
The EKS Auto Mode cluster, created and destroyed per working session. Nothing on it is
precious; everything must be reproducible from this repo.
_Avoid_: dev cluster, staging

**Shop**:
The three-tier demo application (React frontend, Spring Boot backend, PostgreSQL) whose
sole purpose is to generate telemetry. It sells observation gear — telescopes, binoculars,
magnifying glasses — and lives at shop.rottlr.de. Entities: Product, Customer, Order,
OrderItem, Review.
_Avoid_: the app, demo app, sample app

**Planted fault**:
A defect built into the Shop on purpose — a slow query, an N+1 endpoint, a sporadic
error — so the observability features have real problems to surface.
_Avoid_: bug, issue

**Session**:
One working period during which the ephemeral cluster exists — spin up, use, tear down.
Telemetry outlives a session (it lives in Grafana Cloud); cluster state does not.

**Baseline run**:
A deliberate multi-day session left running so that Grafana Cloud's ML, anomaly-baseline,
and forecasting features accumulate enough continuous data to activate.

**Platform**:
The tofu-managed in-cluster foundation: k8s-monitoring chart, CloudNativePG, cert-manager,
Envoy Gateway, external-dns. Deployed and destroyed with the cluster, distinct from the Shop.
_Avoid_: infra (that's the AWS layer), base

**Load generator**:
The in-cluster k6 workload that produces continuous HTTP/API traffic against the Shop
backend.
_Avoid_: traffic generator, stress test

**Browser loop**:
The in-cluster headless-browser workload that drives the Shop frontend like a user,
producing the Faro telemetry that Frontend Observability needs. Distinct from the load
generator: HTTP-only load produces no frontend telemetry.
_Avoid_: synthetic user, bot
