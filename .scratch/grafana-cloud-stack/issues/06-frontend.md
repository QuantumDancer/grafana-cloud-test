# Shop frontend (React)

Status: ready-for-agent

`apps/frontend/`: TypeScript + React + Vite + React Router v7. Pages: product catalog with
search, product detail (+reviews), cart, checkout, order history. Display name "Spyglass";
same-origin API calls to `/api`. Faro: `@grafana/faro-react` (router instrumentation,
FaroErrorBoundary) + `@grafana/faro-web-tracing`; collector URL/app key via runtime config
(env-injected at container start — not baked into the bundle) so the image is
environment-agnostic. Planted faults per spec behind `VITE_FAULT_FRONTEND`/runtime flag:
one route throwing on interaction, one artificially slow page. Unit tests (vitest) for a few
components. Dockerfile: build → nginx (or similar) serving static assets + config injection;
source maps emitted for CI upload (kept out of the served image).
Verify current versions (React, Vite, faro-react router-v7 support) before pinning.

Done: `pnpm test` + `pnpm build` pass; `docker build` succeeds; app usable against a local
backend; Faro init verified (events visible in network tab against a dummy collector URL).
