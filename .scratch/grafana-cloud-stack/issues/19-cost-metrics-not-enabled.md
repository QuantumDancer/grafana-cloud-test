# Kubernetes Monitoring cost tab is empty — cost collection was never deployed

Status: ready-for-agent

The Cost tab shows empty panels or $0 because nothing has ever collected cost metrics.
This is not a data-latency or short-runtime problem: **zero** series exist, not sparse ones.

## Evidence

- `infra/40-platform/k8s-monitoring.tf:19-169` — the `values` block has no `costMetrics`
  key at all. `telemetryServices` (`:88-95`) declares only `kube-state-metrics` and
  `node-exporter`; no `opencost`. Chart 4.3.2 defaults both `costMetrics.enabled` and
  `telemetryServices.opencost.deploy` to `false`.
- Repo-wide grep for `cost|opencost|billing|cur` over `locals.tf`, `variables.tf`,
  `terraform.auto.tfvars` → 0 matches.
- Live cluster: no opencost/kubecost/kepler pod in any namespace; the rendered
  `k8s-monitoring-alloy-metrics` config contains 0 cost-related components.
- Grafana Cloud: a query for all 25 metrics in the chart's own `opencost.yaml`
  allow-list returns empty, while control queries on the same datasource return
  `kube_pod_info` = 21 series, `node_cpu_seconds_total` = 190, `up` = 17.

An AWS CUR/billing integration is **not** required: OpenCost reads
`node.spec.providerID` and applies AWS public on-demand pricing unaided. CUR only
improves accuracy for spot/RI/negotiated rates.

## Fix

In `infra/40-platform/k8s-monitoring.tf`, add to the `values` yamlencode:

1. `costMetrics = { enabled = true, collector = "alloy-metrics" }`
2. A `telemetryServices.opencost` entry: `deploy = true`,
   `metricsSource = "grafanaCloudPrometheus"`, `opencost.exporter.defaultClusterId`
   equal to `cluster.name` (`spyglass`), plus `opencost.prometheus.external.url` and
   basic-auth credentials.

## Blocking prerequisite — needs resolving first

OpenCost must **query** a Prometheus-compatible endpoint, not merely remote-write to
one. The 30-grafana-cloud remote state exposes no query URL — its outputs are
`destinations_token, faro_*, k6_project_id, loki_url, loki_username, otlp_url,
otlp_username, prometheus_remote_write_url, prometheus_username, stack_id, tempo_*`.

The URL itself is derivable inside `locals.tf` by trimming `/push` from the
remote-write URL (`…/api/prom/push` → `…/api/prom`), which keeps that part of the
change in 40-platform. **Unverified**: whether `destinations_token` carries Prometheus
*read* scope. If it is write-only, 30-grafana-cloud must mint a read-scoped token
first, making this a two-component change.

Done: the Cost tab populates with non-zero values, and `opencost_*` /
`node_total_hourly_cost` series are present in Grafana Cloud.

## Comments

2026-08-07: Filed from the issue-10 validation session. Root-caused by a read-only
recon agent against the live cluster and Grafana Cloud; nothing was changed.
