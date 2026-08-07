# Backend logs ingested twice — OTLP vs pod scrape, and where to make the cut

> **Sources & versions.** All sources accessed **2026-08-07**. The k8s-monitoring chart facts come from
> the **published chart artifact at version 4.3.2** — `helm pull grafana/k8s-monitoring --version 4.3.2`
> into a scratch directory, then read from `charts/feature-pod-logs-via-loki/values.yaml`,
> `charts/feature-application-observability/values.yaml`, and the feature templates. Where a claim is
> load-bearing it was additionally **verified by rendering** (`helm template` with this repo's actual
> destination/collector shape) rather than read off the templates alone; those are marked *rendered*.
> Note that `README.md` is in the chart's `.helmignore`, so the packaged artifact has none — the values
> files and templates *are* the schema of record here, and GitHub links below point at `main`, which was
> at chart version 4.3.2 on the access date. Grafana Cloud docs are unversioned rolling pages.
> Helm CLI used: v4.2.3. `helm search repo grafana/k8s-monitoring --versions` shows **4.3.2 is the newest
> published version**, so "a later 4.x fixed this" is not available as an option today.

## Summary

Both paths are technically viable, but they are not symmetric, and the asymmetry is at the *platform*
layer rather than the app layer.

- **Path A (exclude the pod from the stdout scrape)** has **no first-class exclusion knob** in
  `podLogsViaLoki` at 4.3.2 — no `excludePods`, no `filters.labels`, no `filters.annotations`. What it
  does have is an **always-on relabel rule that drops any pod whose `logs.grafana.com/pods.enabled`
  annotation is `false`/`no`/`skip`**, plus `extraDiscoveryRules` for raw Alloy relabel rules. The
  annotation is the intended per-workload opt-out and it is convention-keyed, so it *can* be a one-time
  platform decision — but the annotation has to be written onto every OTel-instrumented pod template.
- **Path B (drop the OTLP log export)** has a **single platform-layer switch**:
  `applicationObservability.logs.enabled: false`, which removes the logs pipeline from the Alloy OTLP
  receiver while leaving traces and metrics untouched. One line in `k8s-monitoring.tf`, no per-app work,
  never needs repeating.
- The decisive question is what Path B costs. It costs **trace↔log correlation and the App O11y Logs
  tab in their working form**. App Observability's log query is configurable enough that a pod-scraped
  stream *can* be pointed at (the chart already emits `service_name`/`service_namespace`/`job` labels on
  scraped streams), but making it *equivalent* requires a Spring logback pattern change, an Alloy parsing
  stage, and a per-service query reconfiguration in the Cloud UI — three moving parts to recover
  something the OTLP path gives for free.
- **Workload identity is *not* a discriminator between the paths.** A scraped stream can carry
  `service_name="spyglass-backend"`: the chart's `service_name` chain puts the pod annotation
  `resource.opentelemetry.io/service.name` **first**, ahead of `app.kubernetes.io/name` and the container
  name, at default settings — so one annotation aligns the scrape with the OTel identity, with no
  Deployment rename and no chart flag
  ([§5](#5-workload-identity--how-service_name-is-decided-and-whether-one-annotation-is-enough)). The same
  annotation is honoured by all three pod-logs features and by profiling, is gated behind an
  off-by-default flag in `applicationObservability`, and is **not supported at all by `clusterMetrics`**
  — which carries no service identity to begin with, so nothing is lost there.

**The evidence supports Path A** — keep OTLP, exclude the instrumented pods from the scrape — with the
annotation as the mechanism and a documented convention so it stays a one-time decision. See
[§8](#8-recommendation).

---

## 1. The pipeline as actually configured (confirmed from source)

Nothing bypasses Alloy. Both copies of a backend log line traverse the in-cluster collectors, and they
land in the same Grafana Cloud Loki tenant by two different routes:

| | OTLP path | Pod scrape path |
|---|---|---|
| Producer | Grafana OTel Java distro's logback appender (`-javaagent`, baked into the backend image) | container stdout → `/var/log/pods/*/*.log` on the node |
| Exporter target | `http://k8s-monitoring-alloy-metrics.monitoring.svc.cluster.local:4318` (`charts/shop/values.yaml:97`) | — |
| Alloy component | `applicationObservability` OTLP HTTP receiver on `alloy-metrics` | `discovery.kubernetes` → `discovery.relabel "filtered_pods"` → `local.file_match` → `loki.source.file` → `loki.process "pod_logs"` on `alloy-logs` |
| Destination (*rendered*) | `logs_destinations = [otelcol.processor.attributes.grafanacloudotlp.input]` | `logs_destinations = [loki.write.grafanacloudloki.receiver]` |
| Lands in Loki as | via the Cloud **OTLP gateway** | via the Cloud **Loki push API** |

The destination split is not a coincidence: the parent chart resolves the App O11y feature's destinations
with `"ecosystem" "otlp"` and the pod-logs feature's with the Loki ecosystem
([`templates/features/_feature_application_observability.tpl:6`](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/templates/features/_feature_application_observability.tpl)).
So even though `destinations.grafanaCloudLoki` and `destinations.grafanaCloudOtlp` are both
logs-capable and neither feature filters destinations explicitly in `infra/40-platform/k8s-monitoring.tf`,
**OTLP logs do not also fan out to the Loki destination**. There are exactly two copies, not three.
*(Verified by rendering the chart with this repo's destination map; see the table row marked rendered.)*

Why the scraped stream is named `backend` and the OTLP stream `spyglass-backend`: with
`alignServiceNameWithOTelSemConv` left at its default `false`, the scrape's `service_name` detection chain
is *pod annotation `resource.opentelemetry.io/service.name` → pod label `app.kubernetes.io/name` →
container name*
([`_discovery.alloy.tpl`](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/charts/feature-pod-logs-via-loki/templates/_discovery.alloy.tpl)).
The backend pod template sets neither the annotation nor `app.kubernetes.io/name` (it sets
`app.kubernetes.io/component` and `app.kubernetes.io/instance`, `charts/shop/templates/backend-deployment.yaml:17-19`),
so the chain falls all the way through to the container name, `backend`. The OTLP stream carries
`OTEL_SERVICE_NAME=spyglass-backend`. That is the whole of the split identity — it is a label-detection
miss, not a product limitation.

---

## 2. Path A — exclude the backend from `podLogsViaLoki`

### 2.1 The complete set of discovery/selection knobs at 4.3.2

From [`charts/feature-pod-logs-via-loki/values.yaml`](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/charts/feature-pod-logs-via-loki/values.yaml)
(the packaged 4.3.2 artifact; `values.schema.json` in the same directory types every one of these but
declares no defaults, so the defaults below are the values-file defaults):

| Key path | Type | Default | Selector language | Effect |
|---|---|---|---|---|
| `podLogsViaLoki.namespaces` | array of string | `[]` (all) | Kubernetes namespace **names** | Rendered into `discovery.kubernetes "pods" { namespaces { names = [...] } }` — server-side allow-list |
| `podLogsViaLoki.excludeNamespaces` | array of string | `[]` | namespace names, `\|`-joined into a **regex** | `rule { source_labels = ["namespace"] regex = "a\|b" action = "drop" }` |
| `podLogsViaLoki.labelSelectors` | map, values string or array | `{}` | **Kubernetes label selector** (`k=v`, or `k in (a,b)` for array values) | Rendered into `discovery.kubernetes` `selectors { role = "pod" label = "…" }` — server-side, **inclusive only, no negation** |
| `podLogsViaLoki.nodeSelectors` | map | `{}` | node label selector | same, `role = "node"` |
| `podLogsViaLoki.discoveryMethod` | string | `"all"` | `"all"` \| `"annotation"` | `"annotation"` inverts to opt-in: adds a `keep` rule requiring a non-empty annotation value |
| `podLogsViaLoki.annotationSelector` | string | `"logs.grafana.com/pods.enabled"` | pod annotation **name** | the annotation both the opt-in `keep` and the always-on `drop` rule read |
| `podLogsViaLoki.extraDiscoveryRules` | string (raw Alloy) | `""` | Alloy `discovery.relabel` `rule { … }` blocks | appended **verbatim at the end** of `discovery.relabel "filtered_pods"` |
| `podLogsViaLoki.extraLogProcessingStages` | string (raw Alloy, Helm-`tpl`-ed) | `""` | Alloy `loki.process` stage blocks | appended into `loki.process "pod_logs"`, after CRI parsing and structured metadata |

Two things are conspicuously **absent** and worth stating plainly: there is **no `excludePods`, no
`podSelectors`, no negative `labelSelectors`, and no `filters:` block** in this feature at 4.3.2. Any
exclusion narrower than a whole namespace goes through either the annotation or `extraDiscoveryRules`.

### 2.2 The mechanism the chart actually intends: the falsy annotation

This rule is emitted **unconditionally**, regardless of `discoveryMethod`
([`_discovery.alloy.tpl`](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/charts/feature-pod-logs-via-loki/templates/_discovery.alloy.tpl)):

    rule {  // Drop anything with a "falsy" annotation value
      source_labels = ["__meta_kubernetes_pod_annotation_logs_grafana_com_pods_enabled"]
      regex = "(false|no|skip)"
      action = "drop"
    }

*(That is the rendered form — the template writes the label name through the `pod_annotation` /
`escape_label` helpers, which replace `-`, `.` and `/` with `_`
([`_helpers.tpl`](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/charts/feature-pod-logs-via-loki/templates/_helpers.tpl)).
Verified against `helm template` output.)*

So the minimal, zero-Alloy-syntax exclusion is a **pod-template annotation on the backend Deployment**,
with no change to `k8s-monitoring.tf` at all:

```yaml
# charts/shop/templates/backend-deployment.yaml — pod template metadata
spec:
  template:
    metadata:
      annotations:
        # This container's logs already reach Grafana Cloud over OTLP via the Grafana
        # OTel Java agent's logback appender. Opt out of the node-level stdout scrape
        # so each line is ingested once, under one service identity.
        logs.grafana.com/pods.enabled: "false"
      labels:
        app.kubernetes.io/component: backend
        app.kubernetes.io/instance: {{ .Release.Name }}
```

Scope: this is **pod-level, not container-level** — it drops every container in the pod. The backend pod
has exactly one container (`charts/shop/templates/backend-deployment.yaml:21-22`), so that is precisely
the intended scope here. Every other pod in `shop` (Postgres, loadgen, browserloop, frontend) is
untouched, as is every pod in every other namespace.

### 2.3 If you want the change confined to the platform layer: `extraDiscoveryRules`

`extraDiscoveryRules` is a raw Alloy string appended at the very end of `discovery.relabel "filtered_pods"`,
*after* the chart has already normalized labels. That is what makes a container-precise rule easy —
you can match on `namespace` and `container` directly rather than on `__meta_*`:

```hcl
podLogsViaLoki = {
  enabled   = true
  collector = "alloy-logs"

  # The backend ships its logs over OTLP (Grafana OTel Java agent → applicationObservability
  # receiver → Grafana Cloud), so scraping its stdout as well would ingest every line twice
  # under two different service identities. Drop just that container; everything else in the
  # shop namespace (Postgres, loadgen) has no other log path and must keep being scraped.
  extraDiscoveryRules = <<-EOT
    rule {
      source_labels = ["namespace", "container"]
      separator = "/"
      regex = "shop/backend"
      action = "drop"
    }
  EOT
}
```

*Rendered and verified:* this lands as the final `rule { … }` block inside
`discovery.relabel "filtered_pods"`, immediately before the closing brace, with `namespace` and
`container` already populated by the chart's own earlier rules.

### 2.4 Which labels exist when an `extraDiscoveryRules` rule runs

Two families, both usable:

1. **Kubernetes SD meta labels** for `role = "pod"`, from Alloy's `discovery.kubernetes`
   ([Alloy reference](https://grafana.com/docs/alloy/latest/reference/components/discovery/discovery.kubernetes/)):
   `__meta_kubernetes_namespace`, `__meta_kubernetes_pod_name`, `__meta_kubernetes_pod_uid`,
   `__meta_kubernetes_pod_label_<name>`, `__meta_kubernetes_pod_labelpresent_<name>`,
   `__meta_kubernetes_pod_annotation_<name>`, `__meta_kubernetes_pod_annotationpresent_<name>`,
   `__meta_kubernetes_pod_container_name`, `__meta_kubernetes_pod_container_id`,
   `__meta_kubernetes_pod_container_image`, `__meta_kubernetes_pod_container_init`,
   `__meta_kubernetes_pod_container_port_{name,number,protocol}`,
   `__meta_kubernetes_pod_controller_kind`, `__meta_kubernetes_pod_controller_name`,
   `__meta_kubernetes_pod_{host_ip,ip,node_name,phase,ready}`.
   **Container environment variables are not among them** — there is no `__meta_kubernetes_pod_container_env_*`.
   A rule of the form "exclude any container that has `OTEL_*` set" is therefore **not expressible** at
   this stage. (Label/annotation names are escaped: `-`, `.`, `/` → `_`.)

2. **Chart-normalized labels**, already set by the rules above the injection point (source:
   [`_discovery.alloy.tpl`](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/charts/feature-pod-logs-via-loki/templates/_discovery.alloy.tpl)):
   `namespace`, `pod`, `container`, `job` (`<namespace>/<container>`), `tmp_container_runtime`,
   `service_name`, `service_namespace`, `service_instance_id`, `app_kubernetes_io_name`, `__path__`,
   plus anything `labelmap`ped from `__meta_kubernetes_pod_annotation_resource_opentelemetry_io_(.+)`.

### 2.5 Version caveat — the knob you might expect exists, but on the sibling feature

Chart **4.3.0** added exactly the first-class knob this problem wants:

> "Add a `filters` option to the Pod Logs via OpenTelemetry feature for dropping pod logs based on the
> pod's annotations or labels. Set `filters.annotations` or `filters.labels` to a map of Kubernetes
> annotation/label key to the value that should drop the log, or `null` to drop whenever the
> annotation/label is present. A pod's logs are dropped if any configured filter matches." (#2846)
> — [`CHANGELOG.md`, 4.3.0](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/CHANGELOG.md)

It was added to **`podLogsViaOpenTelemetry`** (`feature-pod-logs-via-opentelemetry`), and **not** to
`podLogsViaLoki`. Confirmed by grep against the 4.3.2 artifact: `filters:` with `annotations`/`labels`
appears in `charts/feature-pod-logs-via-opentelemetry/values.yaml:75-84` and has **zero occurrences**
anywhere in `charts/feature-pod-logs-via-loki/`. Since 4.3.2 is the newest published version, there is
no later 4.x to upgrade into for this. Switching features to get the knob would change the whole log
shape and destination ecosystem — not a proportionate move.

### 2.6 Can Path A be a one-time platform decision? (partly)

The exclusion cannot be expressed as a single central rule keyed on "is OTel-instrumented", because the
one signal that means *instrumented* in this repo — `OTEL_*` container env — is invisible to discovery
(§2.4). What *is* expressible centrally is a rule keyed on a **convention you adopt**, since pod labels
and annotations are fully visible. Two shapes, both one-time in the platform config:

**(a) Use the chart's own convention.** No `k8s-monitoring.tf` change at all; the policy is "any workload
that exports logs over OTLP carries `logs.grafana.com/pods.enabled: "false"` on its pod template". This
is the mechanism the chart ships and documents, it survives chart upgrades, and it is discoverable from
the workload manifest — someone reading `backend-deployment.yaml` sees why its logs aren't scraped.

**(b) Key on the OTel semantic-convention annotation.** If every instrumented workload is made to carry
`resource.opentelemetry.io/service.name`, one central rule covers all of them:

```hcl
extraDiscoveryRules = <<-EOT
  # Any pod that declares an OTel service name is instrumented and ships its own logs
  # over OTLP; scraping its stdout too would double-ingest every line.
  rule {
    source_labels = ["__meta_kubernetes_pod_annotationpresent_resource_opentelemetry_io_service_name"]
    regex = "true"
    action = "drop"
  }
EOT
```

This is *more* central but strictly worse here for two reasons. First, the backend does not currently set
that annotation (it uses `OTEL_SERVICE_NAME` env), so adopting it is the same per-workload edit as (a),
just with a less obvious meaning. Second, the same annotation is read by the chart's `service_name`
detection chain and, in App O11y, by `processors.k8sattributes.otelAnnotations` — overloading it as a
scrape-exclusion key couples two unrelated behaviours. *Snippet (b) is written from the documented meta-label
set and the chart's own `labelmap` regex; unlike snippet (a) and §2.3 it was **not** render-verified against
a live pod carrying the annotation.*

Either way, the recurring cost is one annotation per newly instrumented workload — a line in a pod
template, not a platform change. That is a genuine cost, but a small and local one.

---

## 3. Path B — drop or reshape the OTLP log export

### 3.1 App-side: disable the logs signal only

The Grafana distribution is a wrapper: "You can configure the Grafana OpenTelemetry distribution for Java,
which supports all upstream Java agent configuration. **Our distribution configures all exporters,
including the logs exporter, to `otlp` by default.**"
([Grafana Java agent docs](https://grafana.com/docs/opentelemetry/instrument/grafana-java/)). Reading the
distro source confirms it adds no exporter defaults of its own — its entire default-property set is three
instrumentation tweaks (`micrometer.base-time-unit`, `log4j-appender.experimental-log-attributes`,
`logback-appender.experimental-log-attributes`), in
[`GrafanaAutoConfigCustomizerProvider.java`](https://github.com/grafana/grafana-opentelemetry-java/blob/main/custom/src/main/java/com/grafana/extensions/GrafanaAutoConfigCustomizerProvider.java).
The `otlp` default therefore comes from upstream SDK autoconfiguration, and upstream's switch applies:

> `OTEL_LOGS_EXPORTER` — "Comma-separated list of log record exporters. Known values include `otlp`,
> `console`, `logging-otlp`, `none`." Default: `otlp`
> — [OpenTelemetry Java configuration](https://opentelemetry.io/docs/languages/java/configuration/)

`OTEL_TRACES_EXPORTER` and `OTEL_METRICS_EXPORTER` are independent properties with the same `otlp`
default (same page), so:

```yaml
- name: OTEL_LOGS_EXPORTER
  value: "none"     # traces and metrics keep their otlp default, untouched
```

is the exact, minimal way to silence the logs signal only. The logback appender instrumentation still
runs and still feeds log records into the SDK's `LoggerProvider`; with no exporter configured they are
simply not exported. To stop the appender itself, the agent's generic per-instrumentation switch applies
— `otel.instrumentation.[name].enabled` / `OTEL_INSTRUMENTATION_[NAME]_ENABLED`, "converting dashes to
underscores for environment variables"
([suppressing specific instrumentation](https://opentelemetry.io/docs/zero-code/java/agent/disable/)) —
and the instrumentation name is `logback-appender`, per the distro's own
[`Instrumentations.java:31`](https://github.com/grafana/grafana-opentelemetry-java/blob/main/custom/src/main/java/com/grafana/extensions/instrumentations/Instrumentations.java),
giving `OTEL_INSTRUMENTATION_LOGBACK_APPENDER_ENABLED=false`. *Which of the two is preferable is a
judgement call the sources don't settle; `OTEL_LOGS_EXPORTER=none` is the signal-level switch and is what
the OTel docs frame as such.* Note that neither affects the **logback MDC** instrumentation, which is a
separate component (§4.2).

**This is per-application configuration** — one env var per instrumented workload. It does not scale any
better than Path A's annotation.

### 3.2 Platform-side: `applicationObservability.logs.enabled: false`

There **is** a one-line platform switch, and this is the strongest argument Path B has. From
[`charts/feature-application-observability/values.yaml`](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/charts/feature-application-observability/values.yaml)
at 4.3.2:

| Key path | Type | Default | Effect |
|---|---|---|---|
| `applicationObservability.logs.enabled` | boolean | `true` | Gates the entire logs pipeline for the OTLP/Jaeger/Zipkin receivers |
| `applicationObservability.logs.filters.log_record` | array of OTTL condition strings | `[]` | Selective drop via `otelcol.processor.filter`; `processors.filter.errorMode` defaults to `ignore` |
| `applicationObservability.logs.transforms.{resource,log}` | arrays of OTTL statements | `[]` | Reshape rather than drop |
| `applicationObservability.logs.transforms.labels` | array | `["cluster","namespace","job","pod"]` | Which attributes become Loki stream labels |
| `applicationObservability.metrics.enabled` / `.traces.enabled` | boolean | `true` | Independent — unaffected by the logs switch |

*Rendered and verified:* setting `applicationObservability.logs.enabled = false` in this repo's
configuration removes exactly the log legs of the pipeline and nothing else. The diff against the default
render is the removal of `logs = […]` outputs from the OTLP receiver, resource-detection, k8sattributes,
transform and batch processors, the `logs = argument.logs_destinations.value` terminal, and the
Loki-label `log_statements` block. Metric and trace legs are byte-identical. Under this setting the
backend can keep exporting OTLP logs; Alloy accepts and discards them at the receiver.

`logs.filters.log_record` is the narrower variant — it would let you keep OTLP logs generally and drop
only those from one `service.name`, which is a platform-layer expression of a per-app decision. It was
not render-verified with a concrete OTTL condition; the values file documents it as a pass-through to
[`otelcol.processor.filter`](https://grafana.com/docs/alloy/latest/reference/components/otelcol/otelcol.processor.filter/).

### 3.3 What Path B gives up

- **Trace↔log correlation, as shipped.** The OTLP records carry `trace_id`/`span_id` because the agent's
  logback appender attaches the active span context. The scraped stream carries none: the chart's
  `loki.process "pod_logs"` does CRI/docker envelope parsing, sets `flags`/`stream` labels, drops
  `filename`, and attaches structured metadata for `k8s.pod.name` / `pod` / `service.instance.id` — and
  nothing else ([`_processing.alloy.tpl`](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/charts/feature-pod-logs-via-loki/templates/_processing.alloy.tpl)).
  The log body is the raw Spring console line, unparsed. Not even the level is extracted.
- **The App O11y Logs tab in its default form.** See §4 — recoverable, but not for free.
- **The structured attributes App O11y's default line formatter expects** —
  `.severity`, `.resources_service_instance_id`, `.attributes_thread_name`,
  `.instrumentation_scope_name`, `.traceid`, `.body` (§4.1). Only `service_instance_id` survives the
  scrape path natively.

---

## 4. The decisive question: can a pod-scraped stream satisfy Application Observability?

**Partly, and only with work.** Grafana's own docs are unusually explicit here, which makes this
answerable rather than speculative.

### 4.1 App O11y's log query is configurable, and it knows about both ingestion paths

From [Configure Application Observability](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/manual/configure/),
verbatim:

> "Select a log query format that matches your logs ingestion path… Use the "Loki exporter" query if you
> are exporting logs directly to Loki using the OpenTelemetry Collector Loki Exporter or the Alloy
> `otelcol.exporter.loki`. Use the "OTLP gateway / native Loki OTLP query" mode if you are exporting logs
> via the Grafana OTLP endpoint. **The log query format needs to match the log storage and query format
> used by the ingestion method.**"

The queries themselves are editable, with variables `$job`, `$serviceName`, and — when `service.namespace`
is present — `$serviceNamespace` (same page); per-service overrides add `$environmentAttribute`,
`$environmentValue`, `$traceIDFilter`, `$spanIDFilter`
([Configure at the service level](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/manual/configure-per-service/)).

This matters because the scraped stream is **not** identity-less. The chart already sets `service_name`,
`service_namespace`, `job` and `pod` as **stream labels** on scraped pod logs (§1). So a custom LogQL
query keyed on `$serviceName`/`$serviceNamespace` would find them. The two obstacles are:

1. **The value mismatch** — `service_name="backend"` vs the trace side's `spyglass-backend`. Fixable
   without touching the chart, by annotating the pod with
   `resource.opentelemetry.io/service.name: spyglass-backend`, which is first in the chart's detection
   chain — full precedence order and the exact rendered rule in [§5.1](#51-podlogsvialoki--the-full-precedence-order-at-432).
   This is the cheap, targeted fix if the scrape is kept.
2. **The shape mismatch** — the default line formatter is written against OTLP-shaped fields:

       line_format "…{{if .severity}}…{{end}} [{{.resources_service_instance_id}}{{if .attributes_thread_name}}/…{{end}}] {{if .instrumentation_scope_name}}…{{end}}{{if .traceid}} [traceid={{.traceid}}]{{end}}: {{.body}}"

   A scraped Spring console line has none of `severity`, `attributes_thread_name`,
   `instrumentation_scope_name`, `traceid`, or a separate `body`. The formatter would degrade to
   near-nothing unless the query and formatting are rewritten per service.

### 4.2 Trace/span filtering: possible, three moving parts

> "**Requirements:** Your logs must include the trace ID and/or span ID fields, typically as `traceid` and
> `spanid` attributes, for these filters to work. Ensure that your log ingestion pipeline is configured to
> include these fields… Most logging auto-instrumentation libraries automatically add `traceid` and
> `spanid` attributes to your logs, so these filters work out of the box for most users."
> — [Configure Application Observability](https://grafana.com/docs/grafana-cloud/monitor-applications/application-observability/manual/configure/)

For a scraped stdout stream that is a three-step build:

1. **Get the IDs into the printed line.** The agent's MDC instrumentation already injects them —
   "The OTel Java agent injects several pieces of information about the current span into each logging
   event's MDC copy: `trace_id` …, `span_id` …, `trace_flags` …", and for Spring Boot the documented
   recipe is a one-line property
   ([logger MDC auto-instrumentation](https://github.com/open-telemetry/opentelemetry-java-instrumentation/blob/main/docs/logger-mdc-instrumentation.md)):

       logging.pattern.level = trace_id=%mdc{trace_id} span_id=%mdc{span_id} trace_flags=%mdc{trace_flags} %5p

2. **Parse them back out in Alloy.** `podLogsViaLoki.extraLogProcessingStages` (raw `loki.process` stages,
   Helm-`tpl`-ed) would need a `stage.regex`/`stage.logfmt` plus a `stage.structured_metadata` to promote
   `traceid`/`spanid` — structured metadata rather than labels, since trace IDs are unbounded cardinality.
   *Not verified end-to-end here; the knob exists and the stage types exist, but no rendered proof that
   the resulting field names satisfy App O11y's filter was obtained.*
3. **Rewrite the per-service log query and formatting** in the Cloud UI to match.

Each step is documented and each is plausible. Collectively they replace something that currently works
by default with three pieces of bespoke configuration that must be kept in sync across Spring config,
Terraform, and Cloud UI state that lives outside version control. That last point is the one that decides
it: **step 3 is not in this repository**, so a rebuild of the stack would silently lose it.

---

## 5. Workload identity — how `service_name` is decided, and whether one annotation is enough

This section answers the question directly, because it determines whether the inversion (pod scrape as
the surviving log path) can carry the canonical OTel identity `spyglass-backend`.

**Short answer: yes for logs, by a pod annotation, with no Deployment rename — and the annotation is
first in precedence at the chart's default settings, so no chart flag is needed either. But the
mechanism is *not* uniform across features: `clusterMetrics` has no such hook, and
`applicationObservability` reads the annotation only behind a flag that is off by default.**

### 5.1 `podLogsViaLoki` — the full precedence order at 4.3.2

Emitted **unconditionally** into `discovery.relabel "filtered_pods"` (both branches of
`alignServiceNameWithOTelSemConv` include it), source
[`_discovery.alloy.tpl`](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/charts/feature-pod-logs-via-loki/templates/_discovery.alloy.tpl),
*rendered and verified*:

| Stream label | Precedence, first non-empty wins |
|---|---|
| `service_name` (default, `alignServiceNameWithOTelSemConv: false`) | 1. pod annotation `resource.opentelemetry.io/service.name` → 2. pod label `app.kubernetes.io/name` → 3. **container name** |
| `service_name` (`alignServiceNameWithOTelSemConv: true`) | 1. pod annotation `resource.opentelemetry.io/service.name` → 2. pod label `app.kubernetes.io/instance` → 3. pod label `app.kubernetes.io/name` → 4. owner workload name (ReplicaSet pod-template hash stripped, so a Deployment resolves to the Deployment name) → 5. pod name → 6. container name |
| `service_namespace` | 1. pod annotation `resource.opentelemetry.io/service.namespace` → 2. pod namespace |
| `service_instance_id` | 1. pod annotation `resource.opentelemetry.io/service.instance.id` → 2. `<namespace>.<pod>.<container>` |

The "first non-empty" is done with a single relabel rule per label — the candidate meta-labels are joined
with `separator = ";"` and reduced by `regex = "^(?:;*)?([^;]+).*$"`, `replacement = "$1"`. Rendered form
for the default case:

    rule {
      source_labels = [
        "__meta_kubernetes_pod_annotation_resource_opentelemetry_io_service_name",
        "__meta_kubernetes_pod_label_app_kubernetes_io_name",
        "__meta_kubernetes_pod_container_name",
      ]
      separator = ";"
      regex = "^(?:;*)?([^;]+).*$"
      replacement = "$1"
      target_label = "service_name"
    }

There is one more rule worth knowing about, emitted just after the three detection rules above:

    rule {
      action = "labelmap"
      regex = "__meta_kubernetes_pod_annotation_resource_opentelemetry_io_(.+)"
    }

So **any** `resource.opentelemetry.io/*` pod annotation becomes a Loki stream label of the same
(underscore-escaped) name — `resource.opentelemetry.io/deployment.environment` →
`deployment_environment`, and so on. The chart treats that annotation namespace as the general-purpose
per-workload identity override for scraped logs, not just for `service.name`.

**So the correction to the working assumption: it is the `resource.opentelemetry.io/*` annotations that
carry identity, and `app.kubernetes.io/name` is only a *fallback* below them** — not a peer. The
annotation is a per-workload override that needs no Deployment rename, no label change, and no chart
flag. For the backend that is:

```yaml
# charts/shop/templates/backend-deployment.yaml — pod template metadata
spec:
  template:
    metadata:
      annotations:
        # The canonical identity of this workload is its OTel service.name, not its
        # Kubernetes workload name. This makes the scraped log stream agree with the
        # traces and OTLP logs instead of calling the same service "backend".
        resource.opentelemetry.io/service.name: spyglass-backend
        resource.opentelemetry.io/service.namespace: shop
```

That yields `service_name="spyglass-backend"`, `service_namespace="shop"` on the scraped stream, matching
the OTLP side exactly. `service_namespace` already resolves to `shop` from the pod namespace, so the
second annotation is belt-and-braces; it is worth setting explicitly anyway, since it makes the identity
legible in the manifest rather than incidental to where the pod happens to live.

### 5.2 Which other features honour the same annotation

Grepping the whole 4.3.2 artifact for `resource.opentelemetry.io` / `resource_opentelemetry_io` gives an
exact answer:

| Feature | Honours `resource.opentelemetry.io/service.name`? | How |
|---|---|---|
| `podLogsViaLoki` | **Yes, unconditionally** | relabel chain, §5.1 |
| `podLogsViaKubernetesApi` | Yes | `_common_pod_discovery.alloy.tpl` — same pattern |
| `podLogsViaOpenTelemetry` | Yes | `_module.alloy.tpl` |
| `profiling` (eBPF / Java / pprof) | Yes | `_ebpf.tpl`, `_java.tpl`, `_pprof.tpl` |
| `applicationObservability` | **Only behind a flag** — see §5.3 | `otelcol.processor.k8sattributes` `otel_annotations = true` |
| `clusterMetrics` | **No — zero occurrences** in `charts/feature-cluster-metrics/` | n/a |
| everything else (`hostMetrics`, `annotationAutodiscovery`, `integrations`, `clusterEvents`, `nodeLogs`, `costMetrics`) | No occurrences | n/a |

**So "one annotation gives a workload a single consistent identity across all its signals" is not true
chart-wide.** It is true across **logs (all three flavours) and profiles**, which is the part that
matters for this decision. It is conditionally true for App O11y (§5.3). It is **false for
`clusterMetrics`** — but that is not really a cost, because cluster metrics have no `service_name`
concept to align in the first place: they come from kube-state-metrics, cAdvisor and node-exporter and are
keyed by `namespace`/`pod`/`container`/workload labels. There is no identity there being set *wrongly*;
there is simply no identity dimension. Worth stating plainly so nobody spends time hunting for the knob.

### 5.3 `applicationObservability` — same annotation, but gated, and it is not needed here

The App O11y feature reads `resource.opentelemetry.io/*` pod annotations through the k8sattributes
processor, but the chart only emits `otel_annotations = true` when
`processors.k8sattributes.otelAnnotations: true` **or** `alignServiceNameWithOTelSemConv: true`
([`_processor_k8sattributes.tpl:52-54`](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/charts/feature-application-observability/templates/_processor_k8sattributes.tpl)).
Both default to `false`, and neither is set in `infra/40-platform/k8s-monitoring.tf`. With
`alignServiceNameWithOTelSemConv: true`, a fallback chain runs in `otelcol.processor.transform`
([`_processor_transform.tpl`](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/charts/feature-application-observability/templates/_processor_transform.tpl)):

> "Set service.name by choosing the first value found from the following ordered list: service.name as
> reported by the application or set from the `resource.opentelemetry.io/service.name` annotation;
> `pod.label[app.kubernetes.io/instance]`; `pod.label[app.kubernetes.io/name]`; `k8s.workload.name`
> (Deployment, StatefulSet, DaemonSet, CronJob, Job, …); `k8s.pod.name`"

with `overrideUnknownServiceNames: true` (new in 4.3.2) additionally deleting an SDK-default
`unknown_service*` first so the fallback can fire.

For this stack none of that is needed: the backend sets `OTEL_SERVICE_NAME=spyglass-backend` directly, so
the OTLP path already reports the canonical identity and the fallback chain would never be reached.

**UNVERIFIED:** whether `otel_annotations = true` would *override* a `service.name` the SDK already
reported, or only fill it when absent. The chart's own comment ("when not set by the application or by the
`resource.opentelemetry.io/*` pod annotations") reads as though both are "already set" sources that the
fallback defers to, implying no override — but that is upstream
[`otelcol.processor.k8sattributes`](https://grafana.com/docs/alloy/latest/reference/components/otelcol/otelcol.processor.k8sattributes/)
behaviour, not something the chart states. It only matters if the annotation and `OTEL_SERVICE_NAME` are
ever allowed to disagree, which is a good reason to keep them equal by convention.

### 5.4 What this does to the trade-off

The identity objection to inverting the paths **dissolves**. A scraped stream can carry
`service_name="spyglass-backend"` / `service_namespace="shop"` for the cost of one annotation, using the
chart's default settings — the same order of effort as Path A's exclusion annotation, in the same place
in the same file. Identity is no longer an argument for either path.

What survives as the argument against the inversion is everything in [§4.2](#42-tracespan-filtering-possible-three-moving-parts):
the scraped body is an unparsed Spring console line with no `severity`, no `traceid`/`spanid`, and no
`body` field, so trace↔log correlation and App O11y's default line formatting have to be rebuilt across a
Spring logging pattern, an Alloy `extraLogProcessingStages` parser, and a per-service query configuration
in the Cloud UI that is not stored in this repository.

---

## 6. Cost

Grafana Cloud Logs bills on written volume: **"The total number of GBs written to Grafana Cloud on a
monthly basis"**, at $0.40/GB after a 50 GB free allotment, with billable GB taken as the max of written
GB or queried GB ÷ the fair-use query ratio
([Understand your Logs, Traces, and Profiles invoices](https://grafana.com/docs/grafana-cloud/cost-management-and-billing/manage-invoices/understand-your-invoice/logs-invoice/)).

So eliminating one of two duplicate copies **roughly halves** the backend's log spend either way. What
the sources do **not** support is a claim about which copy is cheaper for the *same* line. The invoice
page gives no breakdown of what constitutes a written GB — whether stream labels, structured metadata,
or only the line body count toward it. It is intuitive that the scraped line (full Spring console prefix:
ISO timestamp, level, PID, thread, logger) is larger on the wire than the bare OTLP body, but the OTLP
record carries its own resource attributes and structured metadata, and no primary source quantifies
either side. **Marked UNVERIFIED** — do not use "the OTLP body is smaller" as an argument. On a
free-tier stack under the 50 GB allotment the difference is very likely nil in absolute terms anyway.

---

## 7. Other options the sources genuinely support

- **Fix the identity without deduplicating.** Annotating the backend pod with
  `resource.opentelemetry.io/service.name: spyglass-backend` collapses the two service names into one
  (§5.1). This does not fix double ingestion, but it is a one-line change that removes the *worse* of the
  two consequences the issue names — the split identity — and is worth doing regardless of which path is
  taken, if any OTel-instrumented workload is ever left scraped.
- **Structured stdout instead of OTLP logs.** The chart supports it (`extraLogProcessingStages` for a
  `stage.json`, `structuredMetadata` mappings) and App O11y supports querying it ("Loki exporter" query
  mode). It is a coherent architecture — but it is Path B plus a Spring logging-format migration, and it
  inherits every one of §4's three moving parts. Not warranted here.
- **`applicationObservability.logs.filters.log_record`** as an Alloy-side selective drop (§3.2). Real,
  documented, but it expresses a per-service decision in central OTTL, which is a worse place to read it
  from than the workload manifest.
- **Alloy-side dedup across the two streams** — no such mechanism was found in the chart or in Alloy's
  component reference. The two streams are produced by different Alloy instances (`alloy-metrics` and
  `alloy-logs`) with no shared pipeline stage, so there is nowhere to compare them. **Not supported by
  any primary source; do not pursue.**

---

## 8. Recommendation

**Take Path A: keep OTLP, exclude the backend pod from the stdout scrape, using
`logs.grafana.com/pods.enabled: "false"` on the backend Deployment's pod template (§2.2).**

The reasoning, in order of weight:

1. **Path B's platform-wide switch is real but too broad.** `applicationObservability.logs.enabled: false`
   turns off OTLP logs for *every* instrumented workload, present and future, at the collector. That is
   the only thing making Path B a one-time decision — and it is also what makes it wrong. It forecloses
   the App O11y Logs tab for the whole cluster in order to solve a duplication that today affects one
   pod. The one-time-ness is bought by over-reaching.
2. **What Path A costs to repeat is one annotation per instrumented workload**, in the same file where a
   reader already sees the `OTEL_*` env that causes the duplication. That is where the fact belongs. The
   scaling worry is real but small, and the chart's annotation is exactly the convention-keyed mechanism
   Grafana designed for it — it is not a workaround.
3. **The OTLP stream is the one that works by default.** Trace↔span↔log correlation, the Logs tab's
   default query and line formatting, `severity`, thread name, instrumentation scope — all present with no
   configuration. Reproducing them on the scrape path takes a Spring pattern change, an Alloy parsing
   stage, and per-service Cloud UI configuration that lives outside this repository (§4.2, step 3). For a
   stack whose whole purpose is to exercise Grafana Cloud's products, deliberately degrading its APM log
   surface is the wrong trade.
4. **Identity does not decide it, in either direction.** The `resource.opentelemetry.io/service.name`
   annotation would give a scraped stream the canonical `spyglass-backend` identity at default chart
   settings (§5.1), so "the scrape can't carry the right name" is not an argument against the inversion —
   and equally, keeping OTLP does not *earn* points for identity. Argument 3 is what carries the decision,
   not argument 4.
5. **Cost is a wash between the paths** — both remove one of two copies, and no source supports a
   per-line size claim (§6). Cost should not be allowed to cast a vote here.

Concretely, for issue 24:

- Add `logs.grafana.com/pods.enabled: "false"` to the pod-template annotations in
  `charts/shop/templates/backend-deployment.yaml`, with a comment naming the OTLP path as the reason.
- Leave `podLogsViaLoki` in `infra/40-platform/k8s-monitoring.tf` untouched — no `extraDiscoveryRules`,
  no namespace exclusion. Postgres, loadgen, browserloop, frontend, Alloy and cert-manager keep their
  only log path.
- Record the convention (§2.6a) somewhere durable — `CONTEXT.md` or an ADR — so the next instrumented
  workload gets the annotation without rediscovering this note. If the canonical-identity rule is being
  written down anyway, pair it with `resource.opentelemetry.io/service.name` (§5.1) as the standing way a
  workload declares its name to *every* signal that has one, so the convention is "declare your OTel
  identity, then opt out of the scrape" rather than two unrelated annotations.
- Acceptance: `{namespace="shop", container="backend"}` returns nothing in Loki; App O11y's
  `spyglass-backend` Logs tab still shows lines and trace filtering still works.

If §2.3's Terraform-side `extraDiscoveryRules` is preferred instead — keeping platform policy in the
platform layer — it is equally correct and render-verified. It trades discoverability from the workload
manifest for centralization, and it hard-codes `shop/backend` in `k8s-monitoring.tf`. Both are defensible;
the annotation is recommended because the reason for the exclusion lives next to its cause.

### Residual risks and unknowns

- **The annotation drop was verified in the rendered Alloy config, not against a live cluster.** The rule
  is unconditional and the label name was confirmed by rendering, so the risk is low, but the acceptance
  check above is what actually closes it.
- **Chart-upgrade exposure is different for the two Path A variants.** The annotation is the chart's own
  documented convention and should survive; `extraDiscoveryRules` is raw Alloy appended into a template
  whose surrounding rules could change, so a future 4.x could in principle move the labels it matches on.
- **No first-class knob exists today and none is coming in 4.x** (4.3.2 is current). If Grafana back-ports
  `filters.annotations`/`filters.labels` from `podLogsViaOpenTelemetry` to `podLogsViaLoki` in a later
  release, that would be the cleaner central expression of §2.6 and worth revisiting.
- **The per-line billed-volume comparison is UNVERIFIED** (§6) and should not be cited.
- **Step 2 of §4.2** — that Alloy-parsed `traceid`/`spanid` structured metadata actually satisfies App
  O11y's `$traceIDFilter` — was not verified. It only matters if Path B is reconsidered.
- **Whether `otel_annotations` overrides an SDK-reported `service.name`** in `applicationObservability` is
  UNVERIFIED (§5.3). Keeping `OTEL_SERVICE_NAME` and `resource.opentelemetry.io/service.name` equal by
  convention makes the question moot; letting them diverge would make it a live risk.
- **Frontend/Postgres/loadgen are unaffected**, per the issue's own triage and confirmed here: the
  frontend container is nginx with no `OTEL_*` env, so it has exactly one log path.

---

## 9. Follow-ups

### 9.1 Does Grafana Cloud already surface double ingestion as a finding? — No

**Nothing in Grafana Cloud detects duplicate ingestion.** Every candidate was checked against Grafana's
own docs and each measures something adjacent:

| Surface | What it actually detects | Duplicate detection? |
|---|---|---|
| **Adaptive Logs** | Groups lines into **patterns**, then "checks which log patterns you actually query over the past 15 days"; recommends a per-pattern **drop rate** from *query frequency* + *ingest volume*, recalculated every 24 h over a rolling 15-day window, with a 7-day warm-up before any recommendation exists ([introduction](https://grafana.com/docs/grafana-cloud/adaptive-telemetry/adaptive-logs/introduction/), [manage recommendations](https://grafana.com/docs/grafana-cloud/adaptive-telemetry/adaptive-logs/manage-recommendations/)) | **No.** Nothing about duplicates or one service's lines appearing under two names |
| **Log Volume Explorer** | "a **read-only view** of log volume that provides a **best estimate** of where your log traffic is coming from" — pick a label, see estimated volume by its values; explicitly "not recommended for billing-related volume matching" ([docs](https://grafana.com/docs/grafana-cloud/cost-management-and-billing/analyze-costs/logs-costs/analyze-log-ingestion-log-volume-explorer/)) | **No** — volume attribution only |
| **Cardinality Management** | "how **metric names and labels** are distributed across the **time series** data sent to Grafana Cloud" ([usage docs](https://grafana.com/docs/grafana-cloud/cost-management-and-billing/understand-usage-cost/)) | **No** — metrics, not logs |
| **Application Observability** | Nothing resembling a "logs not correlated" or "duplicate log source" check appears anywhere in the App O11y docs read for this note | **No** |
| **Loki itself** | Deduplicates only *exact* duplicates: "If the incoming line exactly matches the previously received line (matching both the previous timestamp and log text), the incoming line will be treated as an exact duplicate and ignored", and at query time by "the same nanosecond timestamp, label set, and log message" ([Loki components](https://grafana.com/docs/loki/latest/get-started/components/)) | **Not for this case** — see below |

That last row is the one that closes the question. Loki's dedup requires an identical label set **and**
identical text. Our two copies differ in **both**: `service_name="spyglass-backend"` vs `"backend"`
(different stream), and a bare OTLP body vs the full Spring console line (different text). Loki will
therefore never collapse them, and by design will not report them.

**On what the user probably saw.** The most likely candidate is **Log Volume Explorer** with the label
set to `service_name`: it would show `backend` and `spyglass-backend` side by side with suspiciously
similar volumes, which reads exactly like "the same logs, twice, under two names". Adaptive Logs' pattern
list is a weaker second candidate for the same reason — the same pattern would appear against two
services. But in both cases the *tool* reports volume and patterns; the *duplication* is an inference a
human draws from the display. **This is a reconstruction, not a documented feature — treat it as
UNVERIFIED**, and do not tell anyone Grafana flagged the problem.

**As a standing drift check: no.** Log Volume Explorer is UI-only and read-only in the docs (no API
mentioned), gives a "best estimate", and is not alertable. Adaptive Logs needs Adaptive Telemetry and has
a 7-day warm-up before it says anything. A real drift check has to be built by hand — a Loki alert rule
on something like a `count by (service_name)` comparison, or simply asserting that
`{namespace="shop", container="backend"}` stays empty (the §8 acceptance check, promoted to an alert).
That is cheap and exact, and does not depend on any Cloud feature.

### 9.2 `extraDiscoveryRules` keyed on the identity annotation — confirmed correct

All four sub-questions, answered from the 4.3.2 artifact and verified by rendering.

**Label name.** The chart's `escape_label` helper is
`{{ . | replace "-" "_" | replace "." "_" | replace "/" "_" }}`, and `pod_annotation` prefixes
`__meta_kubernetes_pod_annotation_`
([`_helpers.tpl`](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/charts/feature-pod-logs-via-loki/templates/_helpers.tpl)).
So `resource.opentelemetry.io/service.name` → dots **and** slashes **and** dashes to underscores →

    __meta_kubernetes_pod_annotation_resource_opentelemetry_io_service_name

This is not inferred: the chart's *own* `service_name` detection rule emits that exact string, confirmed
in rendered output (§5.1).

**Is the meta-label still live at the injection point?** **Yes.** `extraDiscoveryRules` is injected
*inside* the same `discovery.relabel "filtered_pods"` component, as the final rules before its closing
brace — so every label the component started with is still present. Two independent confirmations: the
chart's own rules reference `__meta_kubernetes_pod_annotation_resource_opentelemetry_io_service_name`
and `__meta_kubernetes_pod_annotation_kubernetes_io_config_mirror` *earlier in the same block*, and
grepping the feature's templates for `labeldrop`/`labelkeep` returns **only** the `stage.label_drop` in
`loki.process` — a later component, dropping only `filename` and `tmp_container_runtime`. Nothing strips
`__meta_*` beforehand.

**Copy-pasteable snippet** (render-verified: it lands as the last `rule { … }` inside `filtered_pods`):

```hcl
podLogsViaLoki = {
  enabled   = true
  collector = "alloy-logs"

  # Any pod that declares an OTel service name is instrumented and ships its own logs
  # over OTLP; scraping its stdout too would ingest every line twice under two service
  # identities. One rule, so no per-workload exclusion is needed — a workload opts out
  # of the scrape by the same annotation that declares its identity.
  extraDiscoveryRules = <<-EOT
    rule {
      source_labels = ["__meta_kubernetes_pod_annotation_resource_opentelemetry_io_service_name"]
      regex = ".+"
      action = "drop"
    }
  EOT
}
```

Relabel `regex` is fully anchored, so `.+` means "any non-empty value" — exactly the requested semantics.
For "annotation present regardless of value" (including an empty one), use
`__meta_kubernetes_pod_annotationpresent_resource_opentelemetry_io_service_name` with `regex = "true"`
instead; that label is documented for the pod role
([`discovery.kubernetes`](https://grafana.com/docs/alloy/latest/reference/components/discovery/discovery.kubernetes/)),
though this variant was not separately render-tested.

**Pod template, not Deployment metadata — yes, and the same for `logs.grafana.com/pods.enabled`.** Both
annotations are read from the **Pod** object: `discovery.kubernetes` runs with `role = "pod"` and exposes
"`__meta_kubernetes_pod_annotation_<annotationname>`: Each annotation from **the Pod object**"
(Alloy reference, above). Kubernetes creates those Pods from the workload's pod template — "Each
controller for a workload resource uses the `PodTemplate` inside the workload object to make actual Pods"
([Kubernetes Pods concepts](https://kubernetes.io/docs/concepts/workloads/pods/)). An annotation written
at `Deployment.metadata.annotations` stays on the Deployment and never reaches the Pod, so it would be
invisible to discovery. **It must go at `spec.template.metadata.annotations`.** *(The chain — pods are
built from the PodTemplate, and Alloy reads Pod-object annotations — is documented; the conclusion "so
Deployment-level annotations are not visible here" is a direct consequence rather than a verbatim quote.)*
Both example snippets in this note (§2.2, §5.1) are already written at pod-template level.

**Caveat before adopting this rule.** It is mechanically correct, but it overloads one annotation with two
meanings — *"this is my identity"* and *"do not scrape me"*. That is fine while every instrumented
workload wants both. It breaks for a Python service that wants the identity but must stay on the scrape
(§9.3). See Open question 4; the two-annotation form (identity via `resource.opentelemetry.io/service.name`,
exclusion via `logs.grafana.com/pods.enabled`) does not have this failure mode, at the cost of not being a
single central rule.

### 9.3 OpenTelemetry Python logs — not stable, and correlation is opt-in

**The logs signal in OTel Python is `Development`, not stable**, and the project says so with an explicit
breaking-change warning
([opentelemetry-python README](https://github.com/open-telemetry/opentelemetry-python/blob/main/README.md)):

| Signal | Status |
|---|---|
| Traces | Stable |
| Metrics | Stable |
| Logs | **Development\*** |

> "\***Breaking Changes** … We are working on stabilizing the Log signal which would require making
> deprecations and breaking changes. We will try to reduce the releases that may require an update to your
> code, especially for instrumentations or for SDK developers."

The language-status page agrees — Python's logs column is
[Development](https://opentelemetry.io/docs/languages/python/), against Stable for traces and metrics.
Note this is *Python's implementation* status; the OTel **specification's** logs status is a separate
question and was not checked here.

**The logging bridge is in flux right now.** The SDK's own `LoggingHandler` and the
`OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED` env var that gates it are **deprecated**, with the
SDK emitting a `DeprecationWarning` pointing users at the contrib package instead:

> "The `OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED` environment variable and the `LoggingHandler`
> in `opentelemetry-sdk` that it controls are deprecated. Install `opentelemetry-instrumentation-logging`
> package instead."
> — [`opentelemetry-sdk/.../_configuration/__init__.py`](https://github.com/open-telemetry/opentelemetry-python/blob/main/opentelemetry-sdk/src/opentelemetry/sdk/_configuration/__init__.py)

and in the same file that env var **defaults to `"false"`** — so the SDK does not attach a log handler
unless you ask it to. The replacement, `opentelemetry-instrumentation-logging`, "automatically instruments
Python logging system with an handler to convert log messages into OpenTelemetry logs. You can disable
this setting `OTEL_PYTHON_LOG_AUTO_INSTRUMENTATION` to `false`"
([contrib `logging/__init__.py`](https://github.com/open-telemetry/opentelemetry-python-contrib/blob/main/instrumentation/opentelemetry-instrumentation-logging/src/opentelemetry/instrumentation/logging/__init__.py)).

**Trace correlation is explicitly opt-in, and uses different field names than Java.** Same source,
verbatim: *"Trace context injection is **opt-in**. Pass `inject_trace_context=True` to add `otelSpanID`,
`otelTraceID`, `otelTraceSampled`, and `otelServiceName` to every log record"*, or set
`set_logging_format=True` / `OTEL_PYTHON_LOG_CORRELATION=true`. Contrast the Java agent, which injects
`trace_id` / `span_id` / `trace_flags` into MDC (§4.2), and Grafana App O11y, which expects `traceid` /
`spanid` (§4.2). **Three different spellings of the same two fields** — any cross-language log-correlation
convention has to normalise them, most cheaply in Alloy.

**Consequence for the policy.** "Instrumented workloads ship logs via OTLP, and are excluded from the pod
scrape" is honourable by Spring Boot today, on stable, zero-config ground. For Python it is *possible* but
rests on a `Development`-status signal whose bridge was just deprecated and re-homed, with correlation off
by default. **Python should get a documented exception**: keep those services on the stdout scrape (so
they keep the `podLogsViaLoki` path and simply do not carry the exclusion annotation), and revisit when
Python's logs signal reaches Stable. Note that under the §9.2 rule this exception is automatic and needs
no special-casing — a Python service that does not export OTLP logs also has no reason to carry
`resource.opentelemetry.io/service.name`… except that it *would* want that annotation for identity
alignment. **That is a genuine conflict in the §9.2 design and is called out in Open question 4 below.**

---

## Open questions

1. `alignServiceNameWithOTelSemConv: true` (chart 4.3.0+, default `false`) is **not** the central fix for
   the identity split it first looks like — on this chart it would make things worse, and that is worth
   recording. Its chain puts pod label `app.kubernetes.io/instance` second, above `app.kubernetes.io/name`
   and the workload name (§5.1). Every pod the shop chart renders carries
   `app.kubernetes.io/instance: {{ .Release.Name }}`, and the release name is the fixed string `spyglass`
   (`scripts/deploy-shop.sh:12`, and `charts/shop/templates/_helpers.tpl` documents the chart as
   single-install under that name). So enabling the flag would give the backend **and** the frontend
   **and** the loadgen the same `service_name="spyglass"` — collapsing four workloads into one identity
   rather than naming any of them correctly. The explicit
   `resource.opentelemetry.io/service.name` annotation sits above that label in the same chain and is the
   right instrument. *(Derived by reading the chain against this repo's manifests; not confirmed against a
   live cluster, since enabling the flag was out of scope.)*
2. Whether Grafana Cloud's OTLP gateway applies any transformation to log bodies before they land in
   Loki (relevant only to the §6 volume comparison) — not documented on any page read here.
3. Whether App O11y's per-service log query configuration is exportable/managed as code (Terraform, API).
   If it is, §4.2 step 3's "lives outside version control" objection weakens considerably, and Path B
   becomes more defensible. Not investigated.
4. **Should scrape-exclusion be keyed on the identity annotation, or stay a separate annotation?** §9.2
   proves the one-rule form works; §9.3 shows where it fails. A Python service in a mixed estate wants
   `resource.opentelemetry.io/service.name` (so its scraped stream is named correctly) but must *not* be
   excluded from the scrape, because OTel Python's logs signal is still `Development` and its bridge was
   just deprecated and re-homed. Keying exclusion on the identity annotation would silence exactly the
   services that most need the scrape. Two ways out — keep the annotations separate (identity and
   exclusion decided independently, per workload, as recommended in §8), or key the central rule on a
   dedicated third annotation meaning "ships its own logs". **This is a design decision for the
   orchestrator, not a research finding**; the evidence says only that the one-annotation form is
   mechanically sound and semantically overloaded.
