# Backend logs are ingested twice, under two different service names

Status: ready-for-agent

Every backend log line reaches Grafana Cloud through two independent paths:

1. **OTLP** — the Grafana OTel Java distro's logback appender ships a bare message body
   plus structured metadata, landing as `service_name="spyglass-backend"`,
   `service_namespace="shop"`.
2. **Pod scrape** — `podLogsViaLoki` (`infra/40-platform/k8s-monitoring.tf:102`) tails the
   same container's stdout into a second stream: `{cluster="spyglass", namespace="shop",
   container="backend", job="shop/backend", service_name="backend", stream="stdout"}`,
   carrying the full Spring console format (timestamp + level + logger).

Two consequences, the second worse than the first:

- **Double log spend** on a free-tier stack.
- **Split identity.** App Observability correlates logs by service name, so it sees only
  the OTLP half. The stdout half is discoverable only as a separate `backend` service.
  Anyone searching the logs finds each line twice, in two different shapes, under two
  names — which is exactly the sort of thing that wastes an incident.

## Fix — pick one path, and it should be OTLP

The OTLP stream is the one already correlated with traces (it carries `trace_id`/`span_id`
in structured metadata) and is what App O11y consumes. The remedy is to stop scraping the
backend's stdout specifically — not to disable `podLogsViaLoki` wholesale, since it is the
only log source for every workload that is *not* OTel-instrumented (Postgres, Alloy,
cert-manager, the loadgen).

So this needs a namespace/pod exclusion in the `podLogsViaLoki` config in
`infra/40-platform/k8s-monitoring.tf` scoped to the OTel-instrumented workloads. The
frontend should be checked at the same time — it may have the same duplication.

Done: a given backend log line appears exactly once in Loki, correlated to its trace.

## Comments

2026-08-07: Found incidentally while investigating the App O11y logs view during the
issue-10 validation session — nobody was looking for it. Both streams verified present
and carrying the same lines in different formats.
