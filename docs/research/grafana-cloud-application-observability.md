# Grafana Cloud Application Observability — capabilities and Spring Boot instrumentation

> **Sources & versions.** All sources accessed **2026-08-06**. Grafana Cloud docs are unversioned
> rolling ("latest") pages under `grafana.com/docs/grafana-cloud/`. The k8s-monitoring Helm chart
> facts come from the `main` branch of `grafana/k8s-monitoring-helm`, which was at **chart version
> 4.3.2** on the access date ([Chart.yaml](https://raw.githubusercontent.com/grafana/k8s-monitoring-helm/main/charts/k8s-monitoring/Chart.yaml)).
> Sub-page summaries were extracted via automated fetch; quotes are verbatim from the fetched pages.

## Summary

Application Observability is Grafana Cloud's OpenTelemetry-native APM app: OTel SDKs instrument the
app, Grafana Alloy acts as the collector/gateway, and ready-made Cloud UI (service inventory,
service map, per-service RED dashboards, runtime views, automatic baselining) sits on top
([intro](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/)).
The app itself is **Cloud-only** (billed per host hour on Pro/Enterprise, included in the Free tier
with limits) ([product page](https://grafana.com/products/cloud/application-observability/)),
while its raw ingredients — Tempo metrics-generator span metrics, TraceQL, exemplars — are
achievable in OSS. For a Spring Boot backend, Grafana's own docs recommend their **Grafana
OpenTelemetry distribution for Java** (`grafana-opentelemetry-java`), a `-javaagent` wrapper of the
upstream OTel Java agent that emits traces, JVM metrics, and logs over OTLP with Grafana-tuned
defaults ([JVM setup guide](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/instrument/jvm/)).
In the planned EKS + k8s-monitoring-v4 setup, the chart's `applicationObservability` feature
deploys an Alloy OTLP gateway the app points at, and the `autoInstrumentation` feature optionally
adds Beyla (eBPF) as a zero-code contrast case.

## 1. Application Observability capabilities (the testable menu)

The user manual documents four top-level surfaces plus configuration
([manual index](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/manual/)):

| Subfeature | What it gives you | Source |
|---|---|---|
| **Service inventory** | Lists all services sending traces; "out-of-the box, top-down view showing the aggregated RED (request rate, error, duration) metrics of all services", with filtering and high-level health | [inventory](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/manual/inventory/) |
| **Service map** | Graph of related services "using the Tempo Metrics-generator and the Node Graph panel"; nodes are services (API, database), edges are relationships | [map](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/manual/map/) |
| **Service overview** | Per-service RED panels ("Rate: the number of requests per second", "Errors: the number of errors per second", "Duration: the 95th percentile request duration"), duration histogram, time-frame comparison (dotted historical lines), **"Outbound & databases and Inbound"** dependency tables, **Operations** table with per-operation RED trends; tabs for **Traces**, **Logs**, **Runtime**, and **Service map** | [service overview](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/manual/service/) |
| **Runtime tab (JVM view)** | Dedicated Runtime tab with "various CPU and memory utilization graphs" for services auto-instrumented with OpenTelemetry in **Java**, .NET, or Go; requires `telemetry.sdk.language` resource attribute plus span metrics | [service overview](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/manual/service/) |
| **Automatic baseline (anomaly bands)** | Compares RED metrics of services/operations "against historic upper and lower thresholds"; anomaly band from historic standard deviation (errors: upper threshold only); needs ~24h of data ("Initially it takes 24 hours for enough data to accumulate"), one selected environment (`deployment_environment` label required), and "incur[s] additional costs based on Grafana's regular pricing" | [automatic baseline](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/manual/automatic-baseline/) |
| **Errors** | Error tracking in App Observability is the RED "Errors" dimension (inventory, overview panels, baseline upper threshold) — the docs read for this research show **no separate error-grouping subproduct** inside App Observability | [service overview](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/manual/service/) |
| **Database visibility** | Via the service overview's "Outbound & databases" table (databases appear as downstream nodes from client spans). A fuller "Database Observability" exists as a separate Grafana Cloud product | [service overview](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/manual/service/), [product page](https://grafana.com/products/cloud/slo/) (product listing page also advertises Database Observability) |
| **Knowledge graph / root-cause** | Product page headline: "Find root causes faster with the knowledge graph" — this is the Cloud knowledge-graph/Asserts integration, adjacent to App Observability | [product page](https://grafana.com/products/cloud/application-observability/) |
| **Un-instrumented services** | "Un-instrumented services display limited metrics, from what the plugin is able to discover" — useful to observe before/after instrumenting | [service overview](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/manual/service/) |

**SLO integration.** Grafana SLO is a separate Cloud-only app (Alerts & IRM → SLO) with a guided
wizard, generated SLO dashboards, recording rules, and error-budget alerts
([Grafana SLO docs](https://grafana.com/docs/grafana-cloud/alerting-and-irm/slo/),
[create SLOs](https://grafana.com/docs/grafana-cloud/observe-and-act/alert-and-measure-reliability/slo/create/)).
An SLO can be built on the span-derived RED metrics App Observability produces. A direct
"create SLO from this service" button inside App Observability is **UNVERIFIED** (not found in the
pages fetched; the documented SLO-from-observability-app flow found is for Frontend Observability:
[slo-create](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/settings-and-policies/slo-create/)).

## 2. Spring Boot (Java) instrumentation options

Grafana's App Observability instrumentation index lists exactly two Java paths — the Grafana
OpenTelemetry Java distribution ("JVM agent", "no code changes") and Beyla eBPF ("all languages and
frameworks") — plus the OpenTelemetry Operator for Kubernetes
([instrument index](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/instrument/)).
The JVM setup guide states Grafana's recommendation: "Grafana Labs recommends that you set up
OpenTelemetry components … using one of the Grafana Cloud setup guides", i.e. the Grafana
distribution ([JVM guide](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/instrument/jvm/)).

| Option | Mechanism | Traces | Metrics (incl. JVM) | Logs / correlation | Notes |
|---|---|---|---|---|---|
| **Grafana OpenTelemetry distribution for Java** (`grafana/grafana-opentelemetry-java`) — *Grafana's documented recommendation* | `-javaagent:grafana-opentelemetry-java.jar`, zero code changes | Yes (auto-instrumentation of popular libraries) | Yes — "automatically captures JVM metrics, traces, and logs"; **Data Saver** (`GRAFANA_OTEL_APPLICATION_OBSERVABILITY_METRICS=true`) drops metrics App Observability doesn't use to cut cost | "configures all exporters, including the logs exporter, to otlp by default" → logs arrive with trace context | Wrapper of the upstream agent ("fully compatible", migration = env-var changes); Java 8+, Spring Boot 2.7+ ("older versions mostly work"); versions track upstream 1:1 (latest release v2.30.0 bundling `opentelemetry-javaagent` v2.30.0 — exact release date UNVERIFIED) ([repo](https://github.com/grafana/grafana-opentelemetry-java), [releases](https://github.com/grafana/grafana-opentelemetry-java/releases), [JVM guide](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/instrument/jvm/)) |
| **Upstream OpenTelemetry Java agent** (`opentelemetry-java-instrumentation`) | `-javaagent` on "any Java 8+ application"; "dynamically injects bytecode to capture telemetry from many popular libraries and frameworks" (inbound requests, outbound HTTP, DB calls) | Yes | Yes (agent captures runtime metrics; details on the linked Supported Libraries pages) | Log appender/MDC correlation exists upstream but was not on the fetched page — UNVERIFIED here | Vendor-neutral baseline; Grafana distro adds Grafana defaults + Data Saver on top ([OTel agent docs](https://opentelemetry.io/docs/zero-code/java/agent/)) |
| **OpenTelemetry Spring Boot starter** | Spring Boot dependency + `application.properties`/`yml` config, no agent | Yes | Yes (less out-of-the-box coverage: agent "provides more out of the box instrumentation") | Configurable via Spring config | Use when: "Spring Boot Native image applications for which the OpenTelemetry Java agent does not work", agent "startup overhead exceeding your requirements", or another Java agent is already attached ([starter docs](https://opentelemetry.io/docs/zero-code/java/spring-boot-starter/)). Not listed in Grafana's App Observability instrumentation docs ([instrument index](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/instrument/)) |
| **Beyla / OpenTelemetry eBPF Instrumentation** (zero-code, out-of-process) | eBPF, deployed by the k8s-monitoring chart's `autoInstrumentation` feature | Yes (distributed traces since Beyla 2; HTTP/S and gRPC) | RED metrics only — **no JVM runtime metrics** ("generic metrics and transaction level trace span information", no deep runtime metrics or custom telemetry) | No log correlation | Kernel 5.8+ with BTF (RHEL8 4.18 backports OK), admin rights; weak on "reactive/asynchronous frameworks (especially Java reactive)" — relevant if the Spring Boot app uses WebFlux ([Beyla docs](https://grafana.com/docs/beyla/latest/)). Beyla was donated to OpenTelemetry as **OpenTelemetry eBPF Instrumentation (OBI)**; Beyla continues as Grafana's distribution of OBI ([donation blog](https://grafana.com/blog/opentelemetry-ebpf-instrumentation-beyla-donation/), [OBI first release](https://opentelemetry.io/blog/2025/obi-announcing-first-release/)) |

**Recommendation per Grafana's own docs:** attach the **Grafana OpenTelemetry Java distribution**
as a `-javaagent` — it is the only SDK path Grafana's App Observability docs document for Java, it
lights up all App Observability surfaces (traces → span metrics → RED, JVM Runtime tab via
`telemetry.sdk.language`, OTLP logs for the Logs tab), and its Data Saver reduces Cloud metrics
cost ([JVM guide](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/instrument/jvm/),
[repo](https://github.com/grafana/grafana-opentelemetry-java)). Beyla is worth deploying *in
addition* on one service to compare eBPF vs SDK telemetry — Grafana argues the approaches are
complementary ([blog](https://grafana.com/blog/why-opentelemetry-instrumentation-needs-both-ebpf-and-sdks/), blog = positioning, not docs).

### Required configuration (Spring Boot container env)

From the JVM setup guide ([source](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/instrument/jvm/)):

- `OTEL_RESOURCE_ATTRIBUTES` carrying `service.name`, `service.namespace`, `deployment.environment`
- `OTEL_EXPORTER_OTLP_ENDPOINT` (the Alloy gateway in-cluster, or Grafana Cloud OTLP endpoint directly)
- `OTEL_EXPORTER_OTLP_PROTOCOL="http/protobuf"`
- `OTEL_EXPORTER_OTLP_HEADERS` for auth (only when sending directly to Grafana Cloud)

Semantic-convention requirements on the resulting data
([metrics & labels](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/setup/metrics-labels/)):

- `service.name` + `service.namespace` → concatenated into the Prometheus `job` label App Observability keys on.
- `deployment_environment` label — "essential for baselines functionality" (environment filtering, automatic baseline).
- Span metrics must exist with `span_kind`, `status_code`, `le` labels; expected metric names depend
  on the generator: `traces_spanmetrics_latency*` (Tempo metrics-generator / Beyla) or
  `traces_span_metrics_duration_seconds*` (OTel Collector ≥ v0.109 / Alloy ≥ v1.5.0).
- Host-identifying attributes (`k8s.node.name`, `host.id`, or `grafana.host.id`) feed per-host billing.

## 3. Telemetry pipeline on EKS (k8s-monitoring chart v4)

Two documented ways for the Spring Boot app's OTLP data to reach Grafana Cloud:

1. **Alloy gateway via the chart's `applicationObservability` feature (the intended path).**
   Enabling it deploys an Alloy receiver service with OTLP gRPC (4317) and OTLP HTTP (4318)
   receivers (Jaeger and Zipkin variants also available); the pipeline applies filter processors,
   resource/span/log transformations, batching (8192 items / 2 s), **Kubernetes metadata
   enrichment** (pod labels/annotations), and **service-name alignment with OTel conventions**
   ("makes `service.name` consistent across metrics, logs, traces, and profiles")
   ([feature README](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/charts/feature-application-observability/README.md)).
   The app just sets `OTEL_EXPORTER_OTLP_ENDPOINT` to the in-cluster Alloy service; Alloy handles
   Cloud auth. Minimal values:

   ```yaml
   applicationObservability:
     enabled: true
     receivers:
       otlp:
         grpc:
           enabled: true
   ```

2. **Direct OTLP to the Grafana Cloud endpoint** — set `OTEL_EXPORTER_OTLP_ENDPOINT` +
   `OTEL_EXPORTER_OTLP_HEADERS` (auth) on the app itself
   ([JVM guide](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/instrument/jvm/)).
   Loses the chart's k8s enrichment and central batching/filtering; fine as a fallback test.

**eBPF auto-instrumentation add-on.** The chart's `autoInstrumentation` feature deploys Beyla
(feature README pins Beyla chart/app version 1.16.10 — which of the two this number refers to is
UNVERIFIED), producing RED metrics plus `application_service_graph`, `application_span`, and
`application_host` features; `beyla.deliverTracesToApplicationObservability` (default `true`)
forwards Beyla traces into the `applicationObservability` OTLP receiver — with it disabled, "only
metrics (RED metrics) from the instrumented applications will be collected"
([feature README](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/charts/feature-auto-instrumentation/README.md)).

## 4. Cloud-only vs OSS-achievable

| Feature | Status |
|---|---|
| Application Observability app (inventory, map UI, service overview, Runtime tab) | **Cloud-only** product, priced per host hour ("$0.025/host hour"), included in Free/Pro/Enterprise plans ([product page](https://grafana.com/products/cloud/application-observability/)) |
| Automatic baseline / anomaly bands | **Cloud-only** (feature of the Cloud app; also billed as extra metric series) ([baseline docs](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/manual/automatic-baseline/), [product page](https://grafana.com/products/cloud/application-observability/) lists "Automatic anomaly detection via performance metric baselining") |
| Grafana SLO app (wizard, generated dashboards, error-budget alerts) | **Cloud-only** ([SLO docs](https://grafana.com/docs/grafana-cloud/alerting-and-irm/slo/)) |
| Grafana Cloud k6 + Traces correlation | **Cloud** ([k6/Tempo integration](https://grafana.com/docs/grafana-cloud/testing/k6/analyze-results/integration-with-grafana-cloud-traces/)) |
| Knowledge graph root-cause views | **Cloud** ([product page](https://grafana.com/products/cloud/application-observability/)) |
| Span metrics (RED) via Tempo metrics-generator, TraceQL, node-graph panels, exemplars, Beyla/OBI, OTel Java agent, Pyroscope span profiles | **OSS-achievable** — the underlying components are open source ([map docs](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/manual/map/) name Tempo metrics-generator + Node Graph; [Beyla](https://grafana.com/docs/beyla/latest/); [exemplars](https://grafana.com/docs/grafana/latest/fundamentals/exemplars/); [Pyroscope span profiles](https://grafana.com/docs/pyroscope/latest/configure-client/trace-span-profiles/java-span-profiles/)) — but the curated App Observability UX on top is not |

So the differentiated things to exercise are: the App Observability app itself (inventory/map/
overview/Runtime tab), automatic baseline, Grafana SLO, Cloud k6 trace correlation, and knowledge
graph — the rest is validation of a pipeline you could also run in OSS.

## 5. Adjacent Cloud features worth testing alongside

- **TraceQL / Tempo-backed Traces tab** — the service overview's Traces tab searches distributed
  traces; the service map is fed by Tempo metrics-generator
  ([service overview](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/manual/service/),
  [map](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/manual/map/)).
- **Exemplars** — star markers on Prometheus panels linking a metric sample to a trace ID in Tempo;
  requires exemplar support enabled on the Prometheus data source
  ([exemplars fundamentals](https://grafana.com/docs/grafana/latest/fundamentals/exemplars/)).
  Whether the Java agent's histogram exemplars flow end-to-end through the Alloy gateway into Cloud
  Metrics by default is UNVERIFIED — good candidate for an experiment.
- **Pyroscope span profiles for Java (traces → flame graphs)** — add the Pyroscope Java SDK, the
  OTel Java agent, and the `otel-profiling-java` bridge ("By adding the OTel Java agent and the
  Pyroscope OTel Java Agent extension, you can enrich your profiles with span IDs"); Grafana then
  shows flame graphs scoped to individual trace spans (CPU `itimer`/`cpu` and `wall` events);
  documented as working with Grafana Cloud Profiles via `PYROSCOPE_SERVER_ADDRESS` +
  basic-auth env vars ([java-span-profiles](https://grafana.com/docs/pyroscope/latest/configure-client/trace-span-profiles/java-span-profiles/)).
  Interaction with the *Grafana* Java distro (instead of the upstream agent) is UNVERIFIED.
- **Grafana Cloud k6 ↔ Traces** — the load generator could be a Cloud k6 test using the
  `http-instrumentation-tempo` jslib (`instrumentHTTP`, W3C `traceparent` propagation) so k6
  generates trace IDs that propagate into the Spring Boot backend, and test results correlate with
  server-side traces ([k6/Cloud Traces integration](https://grafana.com/docs/grafana-cloud/testing/k6/analyze-results/integration-with-grafana-cloud-traces/),
  [jslib docs](https://grafana.com/docs/k6/latest/javascript-api/jslib/http-instrumentation-tempo/)).
- **Grafana SLO on the backend's RED metrics** — wizard-driven SLI/SLO with generated dashboards
  and recording rules ([create SLOs](https://grafana.com/docs/grafana-cloud/observe-and-act/alert-and-measure-reliability/slo/create/)).

## Open questions

1. **SLO-from-service shortcut**: does the App Observability service overview offer a direct
   "create SLO" action (as Frontend Observability does), or must the SLO wizard be pointed at the
   span metrics manually? Not answered by fetched docs.
2. **Exemplars end-to-end**: are exemplars emitted by the (Grafana) Java agent preserved through
   the k8s-monitoring Alloy pipeline into Grafana Cloud Metrics by default?
3. **`deployment.environment` vs `deployment.environment.name`**: the setup docs speak in terms of
   the resulting `deployment_environment` *label*; which OTel resource attribute spelling current
   semconv/Alloy maps to it should be confirmed empirically (the JVM guide uses
   `deployment.environment`).
4. **Beyla version in chart v4**: whether "1.16.10" in the feature README is the Beyla app version
   or the Beyla Helm subchart version (Beyla app releases are 2.x).
5. **Grafana Java distro + Pyroscope bridge**: the span-profiles doc assumes the upstream OTel
   agent; compatibility of `otel-profiling-java` with `grafana-opentelemetry-java` untested.
6. **Free-tier limits** for App Observability host-hours were not itemized on the fetched product
   page.
