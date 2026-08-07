# One ingestion path per signal: instrumented workloads ship logs via OTLP

Every signal has exactly one ingestion path, chosen once at the platform layer, and the rule that
picks it is a property of the workload: an instrumented workload — one carrying an OTel SDK —
ships all its signals through OTLP; every other workload is collected by the Platform; no workload
does both. The reasoning behind it, and the sentence to remember if the mechanism below is ever
replaced: the application declares its identity, the Platform decides its transport.

Concretely, `podLogsViaLoki` stays enabled by default so that Postgres, Alloy, cert-manager, the
load generator and every vendor image keep being collected without cooperation, and a single
`extraDiscoveryRules` entry in `infra/40-platform/k8s-monitoring.tf` drops any pod annotated
`telemetry.rottlr.de/logs: otlp`. Separately, a workload declares its identity with the pod
annotation `resource.opentelemetry.io/service.name`, which the chart already honours as the
highest-precedence source of `service_name` for a scraped stream (ahead of the
`app.kubernetes.io/name` label and the container name) — so a workload keeps one name across
traces, metrics and logs without renaming its Deployment. Both annotations belong on the pod
template (`spec.template.metadata.annotations`), not on the Deployment's own metadata; Alloy reads
them from the Pod object, and an annotation in the wrong metadata block fails silently.

The two annotations are deliberately kept separate even though it is tempting to key the exclusion
rule on the identity annotation and save application teams a line. They mean different things —
"this is who I am" versus "I ship my own logs" — and Python is exactly where they come apart. OTel
Python's log signal is `Development`, not stable: its `LoggingHandler` is deprecated in favour of a
separate instrumentation package, `OTEL_PYTHON_LOGGING_AUTO_INSTRUMENTATION_ENABLED` defaults to
`false`, and trace-context injection is opt-in. A Python service is therefore an instrumented
workload for traces and metrics while its logs must still come off stdout, and a rule keyed on
identity would silence precisely those services.

That makes Python a documented exception with a closing condition rather than a permanent carve-out:
when OTel Python's log signal stabilizes, Python services gain the `telemetry.rottlr.de/logs: otlp`
annotation and the exception expires. The stdout parsing pipeline they need in the meantime is a
transition mechanism, not the target state.

Considered: dropping OTLP logs collector-side with `applicationObservability.logs.enabled: false`
(rejected — it is genuinely one line and genuinely impossible for an application team to violate,
but it degrades the self-built user-facing services, which have the most to lose, in order to buy a
uniformity that benefits only the workloads gaining nothing from it). The twelve-factor position,
that applications write logs and do not ship them (rejected — it is the obvious objection to this
decision and deserves an answer: stdout scraping is the compatibility path for what has not reached
OTLP yet, and standardizing a platform on it would mean building for the direction the ecosystem is
moving away from, then migrating back). Per-pod opt-out with the chart's built-in
`logs.grafana.com/pods.enabled: "false"` (rejected — it works today with no platform config at all,
but leaks a collector-vendor annotation name into every application manifest, so changing collectors
would mean editing every workload). Stamping the annotation from a mutating admission policy
(rejected for now only because there is no policy engine in the cluster — it is the one shape that
is enforced by construction rather than by convention, since container environment is visible to an
admission webhook but not to Alloy's discovery, and it is the right upgrade if a policy engine ever
lands).

Consequences worth stating because they are not visible in the config. Nothing in Grafana Cloud
detects a workload that has drifted back onto two paths — Adaptive Logs recommends drop rates from
query frequency and volume with no concept of duplication, Log Volume Explorer is a UI-only
estimate, Cardinality Management covers metrics only, and Loki's own dedup collapses lines only when
timestamp, label set *and* text all match, which two differently-shaped copies never will. The drift
check is therefore ours to build as a Loki alert, and this design is convention-enforced, which is
the shape that produced the original duplication. Scraped logs also arrive entirely unparsed, so the
Alloy processing stage that serves Python and vendor workloads has to normalise three spellings of
the same two fields — Java MDC writes `trace_id`/`span_id`, Python's bridge writes
`otelTraceID`/`otelSpanID`, and Application Observability expects `traceid`/`spanid` — and each
scraped service additionally needs its App Observability log query pointed at Loki through the Cloud
UI, which this repo cannot reproduce. Finally, do not reach for
`alignServiceNameWithOTelSemConv: true` to solve identity: its precedence chain consults
`app.kubernetes.io/instance` second, and every Shop pod carries `instance: spyglass`, so backend,
frontend and load generator would collapse into a single `service_name="spyglass"`.

The `telemetry.rottlr.de/` domain is a placeholder for the real platform's own; the point is that it
is not the collector vendor's.
