# Grafana Cloud Frontend Observability — capabilities and React/Faro instrumentation

- **Accessed:** 2026-08-06
- **Primary sources:** grafana.com/docs (Grafana Cloud > Monitor applications > Frontend Observability), grafana.com product/pricing pages, github.com/grafana/faro-web-sdk, github.com/grafana/k8s-monitoring-helm, Grafana Alloy reference docs.
- **Versions referenced:** `@grafana/faro-react` / `@grafana/faro-web-tracing` (current npm releases; exact version numbers not pinned in docs — UNVERIFIED), React Router v4–v7 support, Grafana Alloy `faro.receiver` (latest docs), k8s-monitoring Helm chart `main` branch (v4 line).

## Summary

Frontend Observability is Grafana Cloud's Real User Monitoring (RUM) application. The open-source **Faro Web SDK** runs in the browser and sends performance metrics, logs, errors, events, and traces to the Grafana-hosted **Faro Collector endpoint**, which processes them (including stack-trace deobfuscation via uploaded source maps) and feeds the curated Frontend Observability app UI ([intro](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/introduction/), [how it works](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/introduction/how-it-works/)). The **app UI, hosted collector, private source-map upload service, prebuilt alerting, SLOs, and the Application Observability trace correlation** are Grafana Cloud features; the SDK itself plus a self-run Alloy `faro.receiver` writing to Loki/Tempo is the OSS-achievable subset ([product page](https://grafana.com/products/cloud/frontend-observability/), [faro.receiver](https://grafana.com/docs/alloy/latest/reference/components/faro/faro.receiver/)). For a React app, instrumentation is `@grafana/faro-react` (router instrumentation for React Router v4–v7, `FaroErrorBoundary`, component profiler, SSR support) plus `TracingInstrumentation` from the web-tracing package to propagate W3C `traceparent` headers to a Spring Boot backend ([faro-react setup](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/faro-react/), [tracing](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/tracing-instrumentation/)).

## 1. Capabilities / testable subfeatures of the Cloud app

Doc tree: [overview](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/) → introduction, quickstart, get-started, instrument, configure, visualize-data, integrate, create-alerts, settings-and-policies, references.

### Telemetry captured (Faro Web SDK, automatic)

Real-user performance data, JavaScript errors, browser/console logs, client-side traces, user interactions, page views/navigation, session data — captured automatically by the SDK and sent to Grafana Cloud ([introduction](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/introduction/), [instrument index](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/)). Instrumentation topics listed in the docs: page tracking, view tracking (SPA view changes), navigation events, session tracking, user actions, performance instrumentation, Web Vitals, tracing, error tracking, console capture, and custom signals (custom events, logs, measurements) ([instrument index](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/)).

### App UI views (each is an independently testable subfeature)

All under [visualize-data](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/visualize-data/):

| View | What it shows | Source |
|---|---|---|
| Performance | Application performance metrics incl. Web Vitals | [performance](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/visualize-data/performance/) |
| Errors overview + Errors | View/filter application errors, analyze error patterns; deobfuscated stack traces with source maps | [error-awareness](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/visualize-data/error-awareness/), [errors](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/visualize-data/errors/) |
| Sessions | Individual user sessions and journeys: session attributes, an **event-based user-journey timeline** (session_start, view_changed, `faro.performance.navigation` with network/render/cache breakdown, errors), correlated backend traces; filter by `page_url`, `browser_*`. **No video-style session replay** — it's an event timeline | [sessions](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/visualize-data/sessions/) |
| User Actions | User interactions and behavior patterns | [user-actions](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/visualize-data/user-actions/) |
| HTTP Insights | API calls and network requests | [http-insights](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/visualize-data/http-insights/) |
| Geolocation insights + tab | Geographic distribution of traffic/sessions/errors | [geolocation](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/visualize-data/geolocation/), [geolocation-tab](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/visualize-data/geolocation-tab/) |
| Custom tabs (experimental) | Surface your own Grafana dashboards inside the app | [custom-tabs](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/visualize-data/custom-tabs/) |

### Web Vitals

Core Web Vitals (LCP, FID, CLS) plus TTFB, FCP, INP are tracked and are alertable ([create-alerts](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/create-alerts/); Web Vitals instrumentation listed at [instrument index](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/)).

### Geolocation

IP-based reverse lookup using MaxMind GeoLite2; enriches sessions with continent/country/region/city/network attributes (additive filter levels). **Off by default** — enable per app under Frontend > Settings > Geolocation, choose specificity level; a country denylist is available; you assume GDPR/ePrivacy/CCPA disclosure responsibility ([geolocation](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/visualize-data/geolocation/)).

### Alerting

Enabling alerting makes Grafana Cloud create **data-source-managed recording rules** that generate metric series keyed on the app's `app-id`, feeding Grafana-managed alert rules. Alertable: new errors / rising error counts, Core Web Vitals (LCP, FID, CLS) + TTFB/FCP/INP, day-over-day trend comparisons ([create-alerts](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/create-alerts/)).

### Settings & policies

- **SLOs** on frontend targets (TTFB, error rates, Web Vitals) ([slo-create](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/settings-and-policies/slo-create/)).
- **RBAC** for who can view/edit/manage Frontend Observability apps ([rbac](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/settings-and-policies/rbac/)).
- **Data privacy** controls to prevent PII collection ([data-privacy](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/settings-and-policies/data-privacy/)).

### Integrations (frontend ↔ backend correlation)

- **Application Observability integration** — end-to-end browser→backend tracing, frontend-error↔backend-issue correlation ([integrate](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/integrate/)). Mechanics ([apm-integration](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/integrate/apm-integration/)):
  - Prereqs: Faro SDK **with the web-tracing package enabled** in the frontend; backend instrumented with the OpenTelemetry SDK.
  - Backend must return a **`Server-Timing: traceparent;desc="00-<traceId>-<spanId>-01"` response header**; the RUM instrumentation picks it up automatically.
  - UI: a **Services** action next to requests in a session jumps to the backend trace in Application Observability, and backend traces link back to the originating user session. Missing Services action = incomplete backend instrumentation.
  - For the demo app this means the Spring Boot backend needs an OTel Java agent/SDK *and* a filter adding the `Server-Timing` header (Spring specifics not covered by Grafana docs — UNVERIFIED how much the OTel Java agent emits this automatically).
- **Knowledge Graph / root-cause analysis** — entity-relationship mapping, automated RCA workbench integration ([asserts-integration](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/integrate/asserts-integration/)).
- Marketing page additionally claims custom dashboards over the underlying Cloud Logs/Traces/Prometheus data and automatic error grouping ("group similar errors automatically … down to the specific line of code") ([product page](https://grafana.com/products/cloud/frontend-observability/)). The same page says "Recreate user sessions" — per the Sessions docs this is the event timeline, not video replay ([sessions](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/visualize-data/sessions/)).

## 2. React instrumentation with Faro

### Packages

- `@grafana/faro-react` — Faro Web SDK distribution for React: everything in the core web SDK plus router instrumentation, ErrorBoundary, component profiler ([faro-react docs](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/faro-react/), [package README](https://github.com/grafana/faro-web-sdk/blob/main/packages/react/README.md)).
- `@grafana/faro-web-tracing` — OpenTelemetry-based tracing integration ([package README](https://github.com/grafana/faro-web-sdk/blob/main/packages/web-tracing/README.md)).

### Basic setup ([quickstart/react](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/quickstart/react/))

```sh
npm i @grafana/faro-react
```

```ts
import { initializeFaro } from '@grafana/faro-react';

initializeFaro({
  url: 'my/collector/url',   // from the app's Web SDK Configuration tab
  app: { name: 'my-react-app' },
});
```

App registration: in the Grafana Cloud stack go to **Frontend > Frontend Apps > Create new**; supply app name, **CORS allowed origin** (`localhost` OK for dev), optional default attributes; copy the generated collector URL ([quickstart/react](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/quickstart/react/)).

### Router instrumentation

Supports **React Router v4–v7**, including the data router API; dedicated setup pages exist for v7 (data/non-data router), v6 (data/non-data + upgrade), and v4/v5 ([faro-react index](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/faro-react/), [v4-v5](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/faro-react/v4-v5/), [v6-no-data-router](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/faro-react/v6-no-data-router/)). Data-router pattern:

```ts
const reactBrowserRouter = createBrowserRouter([...]);
const browserRouter = withFaroRouterInstrumentation(reactBrowserRouter);
```

([quickstart/react](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/quickstart/react/))

### Error boundary ([error-boundary](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/faro-react/error-boundary/))

`<FaroErrorBoundary>` (or `withErrorBoundary(App)` HOC) wraps React's error boundary and sends a Faro error event containing the error message, the **React component stack**, and the boundary name. Requires `ReactIntegration()` in the Faro init. Props: `fallback` (element or `(error, reset) => ...`), `pushErrorOptions` (type + context), `beforeCapture`, `onError`, `onMount`/`onUnmount`/`onReset`.

### Component profiler and SSR

- **Component profiling** (`withFaroProfiler`): monitors component renders and mount/unmount timing ([component-profiler](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/faro-react/component-profiler/), [react README](https://github.com/grafana/faro-web-sdk/blob/main/packages/react/README.md)).
- **SSR**: a dedicated guide covers initializing Faro for React server-side rendering ([server-side-rendering](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/faro-react/server-side-rendering/)). Note: **source-map upload tooling supports client-side-rendered apps only** ([sourcemap-uploads](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/configure/sourcemap-uploads/)). For the plain CSR React demo app this is irrelevant.

### Session tracking config ([session-tracking](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/session-tracking/))

`sessionTracking` init options: `enabled`, `persistent` (Local Storage "tracked" sessions vs Session Storage "volatile"), `maxSessionPersistenceTime` (default 15 min + 1 min buffer), `samplingRate` (0–1, default 1 = 100%), `onSessionChange`, custom `generateSessionId()`. Sessions live max 4 h or until 15 min inactivity; a new session records `previousSession`. `setSession()` updates metadata (e.g. user id) without rotating the session.

### Distributed tracing to the Spring Boot backend ([tracing-instrumentation](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/tracing-instrumentation/))

Not enabled by default. Add `TracingInstrumentation` to `instrumentations` alongside `getWebInstrumentations()`. It bundles OTel's `@opentelemetry/instrumentation-fetch` and `@opentelemetry/instrumentation-xml-http-request` and uses `W3CTraceContextPropagator`, adding a **`traceparent` header to fetch requests**. Cross-origin backends must be listed:

```ts
new TracingInstrumentation({
  propagateTraceHeaderCorsUrls: [/api\.example\.com/],
});
```

Consequence for the demo (standard CORS, not stated in Grafana docs — UNVERIFIED there): if the React app calls the Spring Boot API cross-origin, the backend's CORS config must allow the `traceparent` request header (`Access-Control-Allow-Headers`) and expose `Server-Timing` for the correlation feature. An OTel-JS integration path also exists for apps already using OpenTelemetry-JS ([opentelemetry-js](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/opentelemetry-js/)).

## 3. Ingestion path options

### Option A — Grafana Cloud hosted Faro Collector (what the Cloud docs use)

The per-app **collector URL** generated when creating a Frontend App is the documented path for Cloud users; the hosted Collector Endpoint receives SDK data, applies processing such as stack-trace transformation, and applies **rate limiting (rate-limited data is currently dropped)** ([quickstart/react](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/quickstart/react/), [how-it-works](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/introduction/how-it-works/)). Domain allowlisting is the per-app **CORS allowed origins** list set at app creation ([quickstart/react](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/quickstart/react/)). This is the path that lights up the Frontend Observability app UI and source-map deobfuscation.

### Option B — self-run Alloy `faro.receiver` (OSS path)

Alloy's [`faro.receiver`](https://grafana.com/docs/alloy/latest/reference/components/faro/faro.receiver/) accepts Faro SDK payloads over HTTP (default `127.0.0.1:12347`): `cors_allowed_origins`, optional `api_key` (checked against `X-API-Key`), `max_allowed_payload_size` (default 5 MiB), global/per-app rate limiting, `extra_log_labels`, and **its own source-map download/caching for deobfuscating minified stack traces**; outputs logs to Loki receivers and traces to OTel-compatible consumers (Tempo/OTLP). This works with plain Loki+Tempo (OSS Grafana) — but does not provide the Cloud app UI.

### k8s-monitoring Helm chart (v4) status

- The chart's `applicationObservability` feature opens OTLP receiver ports (gRPC 4317 / HTTP 4318) — **no Faro receiver among its receivers** ([collector reference](https://grafana.com/docs/grafana-cloud/monitor-infrastructure/kubernetes-monitoring/configuration/helm-chart-config/helm-chart/collector-reference/), [values.yaml](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/values.yaml) — no `faro` keys present, verified 2026-08-06 via GitHub code search).
- Feature request [issue #1791](https://github.com/grafana/k8s-monitoring-helm/issues/1791) ("Frontend Observability feature utilizing Faro") is closed `state_reason: completed`, but the corresponding [PR #1895](https://github.com/grafana/k8s-monitoring-helm/pull/1895) ("Feature: Frontend Observability with Faro") was **closed unmerged** (verified via GitHub API 2026-08-06); an earlier v2-era request is [issue #1179](https://github.com/grafana/k8s-monitoring-helm/issues/1179). Net: **no first-class Faro receiver in the chart today**; running one in-cluster means hand-written `faro.receiver` Alloy config (e.g. via the chart's Alloy extra-config mechanism — exact values key UNVERIFIED) or a standalone Alloy.

### Recommendation signal

For Grafana Cloud users all Frontend Observability docs (quickstart, get-started, source maps) assume the **hosted collector**; the Alloy receiver is documented only in the Alloy component reference as the self-hosted path ([quickstart/react](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/quickstart/react/), [faro.receiver](https://grafana.com/docs/alloy/latest/reference/components/faro/faro.receiver/)). For this test project: use the hosted collector to exercise the Cloud-only app; the Alloy path is itself a testable "OSS-equivalent" comparison item.

## 4. Source map upload workflow ([sourcemap-uploads](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/configure/sourcemap-uploads/))

- Purpose: uploaded maps stay **private in Grafana Cloud** (never publicly hosted); the Collector uses them to deobfuscate minified stack traces into original file/function/line ([sourcemap-uploads](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/configure/sourcemap-uploads/), [what's new: private source map uploads](https://grafana.com/whats-new/2024-06-17-frontend-observability-private-source-map-uploads/)).
- Three methods:
  1. **Bundler plugins** — `@grafana/faro-webpack-plugin`, `@grafana/faro-rollup-plugin` (Rollup/Vite), `@grafana/faro-esbuild-plugin` (experimental). Config: `appName`, `appId`, `stackId`, `endpoint` (from Frontend Observability > Settings > Source Maps), `apiKey` (Cloud access-policy token with `sourcemaps:read`/`sourcemaps:write`/`sourcemaps:delete` scopes), `gzipContents`. Default max upload 30 MB per batch ([bundlers](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/configure/sourcemap-uploads/bundlers/)).
  2. **Faro CLI** — upload independent of the build ([cli](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/sourcemap-uploads/cli/)).
  3. **cURL / raw API** — for environments where plugins don't fit ([sourcemap-upload-curl](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/sourcemap-uploads/sourcemap-upload-curl/)).
- Limitation: **client-side-rendered apps only** — no SSR source-map support ([sourcemap-uploads](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/configure/sourcemap-uploads/)). Troubleshooting page: [troubleshooting](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/sourcemap-uploads/troubleshooting/).

## 5. Cloud-only vs OSS-achievable

| Piece | Cloud-only? | Evidence |
|---|---|---|
| Faro Web SDK (`faro-react`, `web-tracing`) | **OSS** (Apache-licensed, works against any Faro endpoint / OTel backend) | [faro-web-sdk repo](https://github.com/grafana/faro-web-sdk); how-it-works notes data can go to Grafana Cloud "or an OpenTelemetry-compatible backend" ([how-it-works](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/introduction/how-it-works/)) |
| Ingestion endpoint | Both: hosted Faro Collector (Cloud) or self-run Alloy `faro.receiver` → Loki/Tempo (OSS) | [quickstart/react](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/quickstart/react/), [faro.receiver](https://grafana.com/docs/alloy/latest/reference/components/faro/faro.receiver/) |
| Frontend Observability app UI (Performance/Errors/Sessions/User Actions/HTTP Insights/Geolocation/Custom tabs) | **Cloud-only** — documented and sold exclusively as a Grafana Cloud product; no OSS distribution mentioned anywhere | [product page](https://grafana.com/products/cloud/frontend-observability/), docs living under grafana-cloud ([overview](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/)) |
| Private source-map upload + server-side deobfuscation service | **Cloud-only** (OSS near-equivalent: `faro.receiver`'s own sourcemap download/cache) | [sourcemap-uploads](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/configure/sourcemap-uploads/), [faro.receiver](https://grafana.com/docs/alloy/latest/reference/components/faro/faro.receiver/) |
| Prebuilt alerting recording rules per `app-id`, SLOs, RBAC, geolocation enrichment, data-privacy policies | **Cloud-only** (features of the Cloud app/stack) | [create-alerts](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/create-alerts/), [settings-and-policies](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/settings-and-policies/) |
| Session↔backend-trace correlation UI (Services action), Knowledge Graph RCA | **Cloud-only** (requires Application Observability, itself a Cloud app) | [apm-integration](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/integrate/apm-integration/), [integrate](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/integrate/) |
| Raw data exploration (Loki/Tempo queries over Faro data, custom dashboards) | Achievable in OSS with self-hosted pipeline; in Cloud the product markets custom dashboards over Cloud Logs/Traces/metrics | [product page](https://grafana.com/products/cloud/frontend-observability/) |

The docs never contain an explicit sentence "Frontend Observability is Cloud-only"; the classification above is inferred from the product being sold and documented solely under Grafana Cloud (noted as inference, all sources cited).

## 6. Pricing / retention / limits for a test project

- **Pricing:** Free tier includes **50k sessions/month** (no credit card); Pro: $0.75 per 1k sessions beyond the included 50k + $19/month platform fee ([product page](https://grafana.com/products/cloud/frontend-observability/), [pricing](https://grafana.com/pricing/)). Grafana's billing doc explains the Frontend Observability invoice (Session Ingestion Rate, Total Sessions Ingested/day dashboards) ([frontend-observability-invoice](https://grafana.com/docs/grafana-cloud/cost-management-and-billing/manage-invoices/understand-your-invoice/frontend-observability-invoice/)); a billing model of $0.75/1k sessions + $0.50/GB logs + $0.50/GB traces without telemetry credits appeared in search summaries of Grafana billing docs — exact page UNVERIFIED.
- **Session accounting:** a billed session = user time in a Frontend App; ends after max 4 h or 15 min inactivity ([frontend-observability-invoice](https://grafana.com/docs/grafana-cloud/cost-management-and-billing/manage-invoices/understand-your-invoice/frontend-observability-invoice/), matching SDK behavior in [session-tracking](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/session-tracking/)). A load generator that opens browser sessions counts against this — `sessionTracking.samplingRate` can throttle signal volume ([session-tracking](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/session-tracking/)).
- **Retention:** Grafana Cloud logs/traces retention of 14 days (free) / 30 days (paid) was reported in Grafana billing-doc search results — exact source page UNVERIFIED; ample for a temporary test cluster either way.
- **Rate limiting:** the hosted collector rate-limits and **drops** over-limit data ([how-it-works](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/introduction/how-it-works/)). Source-map batch limit 30 MB ([bundlers](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/configure/sourcemap-uploads/bundlers/)); Alloy receiver default payload cap 5 MiB ([faro.receiver](https://grafana.com/docs/alloy/latest/reference/components/faro/faro.receiver/)).

## 7. Suggested testable-subfeature menu (derived from the above)

Cloud-only (the point of the exercise): Web Vitals/Performance view; error grouping + private source-map deobfuscation (bundler plugin and/or CLI); Sessions/user-journey timeline; User Actions; HTTP Insights; Geolocation (needs explicit enable + a public egress IP); frontend alerting recording rules; frontend SLOs; RBAC; data-privacy/PII controls; session↔Application Observability trace correlation (needs OTel on Spring Boot + `Server-Timing` header); Knowledge Graph RCA; custom tabs (experimental); billing/usage dashboards. OSS-comparable control group: same Faro SDK pointed at an in-cluster Alloy `faro.receiver` → Loki/Tempo (manual Alloy config; not a k8s-monitoring chart feature).

## Open questions

1. **Spring Boot `Server-Timing` header**: does the OpenTelemetry Java agent emit `Server-Timing: traceparent;...` automatically, or is a custom filter needed? Grafana docs show only an Express example ([apm-integration](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/integrate/apm-integration/)). UNVERIFIED — check OTel Java agent docs / test empirically.
2. **Exact hosted-collector rate limits** (req/s, payload size) are not published in the pages reviewed ([how-it-works](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/introduction/how-it-works/)). UNVERIFIED.
3. **k8s-monitoring chart Faro support timing**: issue [#1791](https://github.com/grafana/k8s-monitoring-helm/issues/1791) closed "completed" while PR [#1895](https://github.com/grafana/k8s-monitoring-helm/pull/1895) closed unmerged — whether a successor implementation is planned/landed elsewhere is unclear; re-check chart releases before assuming.
4. **Retention specifics for Faro-derived logs/traces in Cloud** — governed by the stack's logs/traces retention; exact current numbers/page UNVERIFIED (see §6).
5. Whether the Sessions "user journey" offers any aggregate journey/funnel visualization beyond the per-session timeline is not clear from the docs reviewed ([sessions](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/visualize-data/sessions/)).
