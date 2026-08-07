# Grafana Cloud cost metrics — OpenCost prerequisites for issue 19

- **Accessed:** 2026-08-07
- **Primary sources:** Grafana Cloud documentation (`grafana.com/docs/grafana-cloud/…`); the `grafana/k8s-monitoring-helm` chart source at the exact tag this repo pins (`k8s-monitoring-4.3.2`); `opencost/opencost` source at `v1.121.0` (the appVersion that tag ships) and `opencost.io/docs`; `grafana/terraform-provider-grafana` source at `v4.44.0`; this repo's own Terraform.
- **Empirical work:** one authenticated read-only `GET` against this stack's Prometheus query endpoint (plus three calibration probes), and six local `helm template` renders of chart 4.3.2. Nothing was applied, deployed, or mutated.
- **Versions referenced:** k8s-monitoring chart **4.3.2** (`infra/40-platform/k8s-monitoring.tf:16`); vendored OpenCost Helm chart **2.5.28**; OpenCost **1.121.0**; `grafana/grafana` provider **~> 4.44**.

## Summary

**The `destinations_token` is write-only. Issue 19 must take the write-only branch.** This is verified twice over:

1. **By source.** The access policy behind that token requests `scopes = ["metrics:write", "logs:write", "traces:write"]` — `infra/30-grafana-cloud/destinations.tf:17`. There is no `metrics:read`. The file's own header comment says so deliberately: "The chart only ever pushes … so this token carries write-only scopes."
2. **By probe.** `GET https://prometheus-prod-24-prod-eu-west-2.grafana.net/api/prom/api/v1/query?query=up` with `prometheus_username` + `destinations_token` returns **401** with body `{"status":"error","error":"authentication error: invalid scope requested"}`. A control probe with the same username and a deliberately corrupted token returns a *different* 401 — `"invalid authentication credentials"` — which proves the token itself is valid and it is specifically the scope that is missing. (`/api/v1/labels` returns the same scope error; a `HEAD` on the push endpoint returns 405, not 401, so the credential is good for the write path.)

**But the issue's write-only branch, as written, will not install.** The chart's guided setup does not accept an arbitrary second credential: it *validates that OpenCost points at the metrics destination's own Kubernetes Secret* — `telemetryServices.opencost.opencost.prometheus.existingSecretName` must equal the name the chart generates for the `grafanaCloudPrometheus` destination, or the install fails ([`_validate.tpl:283-292`](https://github.com/grafana/k8s-monitoring-helm/blob/k8s-monitoring-4.3.2/charts/k8s-monitoring/charts/telemetry-services/templates/_validate.tpl#L283-L292); reproduced locally, §3.2). So "mint a read token and hand it to OpenCost" is only possible by opting *out* of the guided setup. That leaves two real shapes, both two-component changes:

- **Option A — widen the existing policy (recommended).** Add `metrics:read` to `grafana_cloud_access_policy.destinations.scopes`. One line in `destinations.tf`, and the entire 40-platform side is then the documented seven-key block with no `custom` mode. Verified from provider source that `scopes` is **not** `ForceNew` and is updated in place via `PostAccessPolicy`, and that the token resource keys only off `access_policy_id` — so **the token is not rotated** and 40-platform needs no re-apply for credentials ([`resource_cloud_access_policy.go:116-124, 271-298`](https://github.com/grafana/terraform-provider-grafana/blob/v4.44.0/internal/resources/cloud/resource_cloud_access_policy.go#L116-L124), [`resource_cloud_access_policy_token.go:213-217`](https://github.com/grafana/terraform-provider-grafana/blob/v4.44.0/internal/resources/cloud/resource_cloud_access_policy_token.go#L213-L217)). Cost: the shared push token gains read access to all stack metrics.
- **Option B — separate read token + `metricsSource: custom`.** Mint a `metrics:read` policy/token in 30-grafana-cloud, expose it, create a Secret in 40-platform, and set `telemetryServices.opencost.metricsSource: custom` plus `existingSecretName` pointing at *that* Secret. Verified to render cleanly (§3.3). Cost: you lose the guided setup's validation, and 40-platform grows a Secret resource.

This is a maintainer's least-privilege-vs-simplicity call, not a technical unknown. Both are proven to work at the chart level.

**Two other corrections to the issue.** (a) The query URL does not need to be derived by string-trimming: `data.grafana_cloud_stack` already exposes `prometheus_remote_endpoint`, which for this stack is exactly `https://prometheus-prod-24-prod-eu-west-2.grafana.net/api/prom` — 30-grafana-cloud only has to add an output (§2). (b) The issue's `values` list omits `existingSecretName`, which is mandatory (§3.1).

---

## 1. Token scope

### 1.1 Which scope strings exist

Grafana Cloud scopes are `service:permission` pairs. The [access policies scope reference](https://grafana.com/docs/grafana-cloud/security-and-account-management/authentication-and-permissions/access-policies/) lists, under its **Scopes** heading, four metrics scopes:

| Scope | Documented meaning |
|---|---|
| `metrics:read` | "Read metrics from a Grafana Cloud stack." |
| `metrics:write` | "Write metrics to a Grafana Cloud stack." |
| `metrics:delete` | "Delete metrics from a Grafana Cloud stack." |
| `metrics:import` | "Import metrics to a Grafana Cloud stack." |

"A *scope* defines which permissions a token has" (same page). Read and write are distinct scopes; holding one does not imply the other. The Grafana provider does not validate against an allow-list — it only checks the `service:permission` shape ([`validateCloudAccessPolicyScope`](https://github.com/grafana/terraform-provider-grafana/blob/v4.44.0/internal/resources/cloud/resource_cloud_access_policy.go#L351-L357)), so a typo'd scope would be rejected by the API, not by `tofu plan`.

### 1.2 What this repo requests

`infra/30-grafana-cloud/destinations.tf:10-23` creates one stack-realm policy for the chart's destinations:

    scopes = ["metrics:write", "logs:write", "traces:write"]

`grafana_cloud_access_policy_token.destinations` (`destinations.tf:25`) mints the token from that policy, and `outputs.tf:67` exports it as `destinations_token` — its description already says "(metrics:write, logs:write, traces:write)". 40-platform uses that one token as the basic-auth password for all three destinations (`infra/40-platform/k8s-monitoring.tf:35, 44, 55`).

For contrast, the sibling policy in `frontend-observability.tf` shows this repo already discovered empirically that Grafana Cloud enforces scope families strictly ("the sourcemap API 401s … on `frontend-observability:*` alone"). The same enforcement is what the probe below hits.

### 1.3 Probe results

All four calls used `prometheus_username` = `2244577` from `tofu output`, against host `https://prometheus-prod-24-prod-eu-west-2.grafana.net`.

| Request | Credential | Result |
|---|---|---|
| `/api/prom/api/v1/query?query=up` | real token | `401` `authentication error: invalid scope requested` |
| `/api/prom/api/v1/labels` | real token | `401` `authentication error: invalid scope requested` |
| `/api/prom/api/v1/query?query=up` | corrupted token | `401` `authentication error: invalid authentication credentials` |
| `/api/prom/push` (HEAD) | real token | `405` — routed and authenticated, wrong method |

The two distinct 401 bodies are the decisive evidence: Grafana Cloud distinguishes a bad credential from a good credential with insufficient scope, and this token produces the latter. **Write-only, confirmed.**

Grafana's own docs state the requirement directly: querying needs "a Grafana Cloud access policy token with `metrics:read` scope" ([Query metrics using HTTP APIs](https://grafana.com/docs/grafana-cloud/send-data/metrics/metrics-prometheus/query-http-api/)).

---

## 2. Query URL derivation

### 2.1 What the docs say

[Query metrics using HTTP APIs](https://grafana.com/docs/grafana-cloud/send-data/metrics/metrics-prometheus/query-http-api/) documents the derivation as: "Start with the remote write endpoint URL. Remove the `/api/prom/push` suffix. Add the `/prometheus` suffix." — producing e.g. `https://prometheus-us-central1.grafana.net/prometheus`. Authentication is basic auth with "Username: your metrics instance ID (the endpoint user value). Password: your Grafana Cloud access policy token."

Note the host: it is the `prometheus-prod-NN-…grafana.net` remote-write host, **not** `https://<stack>.grafana.net`. The latter is the Grafana instance and authenticates with Grafana API keys, not the metrics instance id.

### 2.2 `/api/prom` vs `/prometheus`

The chart's guided setup derives `/api/prom`, not `/prometheus`, by regex ([`_validate.tpl:228-234`](https://github.com/grafana/k8s-monitoring-helm/blob/k8s-monitoring-4.3.2/charts/k8s-monitoring/charts/telemetry-services/templates/_validate.tpl#L228-L234)):

    {{- if regexMatch "/api/prom/push" $destination.url }}
      {{- $openCostMetricsUrl = (regexReplaceAll "^(.*)/api/prom/push$" $destination.url "${1}/api/prom") }}

So the issue's "trim `/push`" derivation is not merely plausible — it is what the chart itself computes and prints. Both prefixes are live on this stack: `/prometheus/api/v1/query` and `/api/prom/api/v1/query` both returned the scope-error 401, while a nonsense path (`/totally/bogus/path`) returned a plain `404 page not found`. Since auth is evaluated only on routed paths, the 401s prove both prefixes are valid routes. Either works; **use `/api/prom`** so the value matches what the chart's own error message tells you to set.

### 2.3 The stack data source already exposes it

The issue says the query URL "is derivable inside `locals.tf` by trimming `/push`". No trimming is needed. `data.grafana_cloud_stack.this` carries a first-class attribute:

    prometheus_remote_endpoint       = https://prometheus-prod-24-prod-eu-west-2.grafana.net/api/prom
    prometheus_remote_write_endpoint = https://prometheus-prod-24-prod-eu-west-2.grafana.net/api/prom/push
    prometheus_url                   = https://prometheus-prod-24-prod-eu-west-2.grafana.net

(read from `infra/30-grafana-cloud/terraform.tfstate`; the data source is already in state, so this costs nothing). Since the write-only verdict already forces a 30-grafana-cloud change, adding

    output "prometheus_query_url" { value = data.grafana_cloud_stack.this.prometheus_remote_endpoint }

is strictly better than string surgery in 40-platform's `locals.tf`: no regex, no assumption that the push path stays `/api/prom/push`, and it matches the existing outputs' contract style (`data.tf:35-45` documents that contract).

---

## 3. Chart contract at 4.3.2

Everything in this section was reproduced locally with `helm template` against the packaged `grafana/k8s-monitoring` 4.3.2 chart, using values that mirror `infra/40-platform/k8s-monitoring.tf` (cluster name `spyglass`, destination named `grafanaCloudPrometheus`, release/namespace `k8s-monitoring`/`monitoring`).

### 3.1 The complete required key set

    costMetrics = {
      enabled   = true
      collector = "alloy-metrics"
    }

    telemetryServices = {
      opencost = {
        deploy        = true
        metricsSource = "grafanaCloudPrometheus"
        opencost = {                                  # note the doubled key
          exporter = {
            defaultClusterId = "spyglass"             # must equal cluster.name
          }
          prometheus = {
            existingSecretName = "grafanacloudprometheus-k8s-monitoring"
            external = {
              url = "https://prometheus-prod-24-prod-eu-west-2.grafana.net/api/prom"
            }
          }
        }
      }
    }

The doubled `opencost.opencost` is real, not a typo: `telemetryServices` is an alias for the `telemetry-services` subchart, which in turn declares the upstream `opencost` chart as a dependency, so upstream OpenCost values nest one level deeper ([`telemetry-services/Chart.yaml` dependencies](https://github.com/grafana/k8s-monitoring-helm/blob/k8s-monitoring-4.3.2/charts/k8s-monitoring/charts/telemetry-services/Chart.yaml), pulling `opencost` 2.5.28 from `oci://ghcr.io/opencost/charts`). The chart's own README shows the same shape ([feature-cost-metrics README, "Usage"](https://github.com/grafana/k8s-monitoring-helm/blob/k8s-monitoring-4.3.2/charts/k8s-monitoring/charts/feature-cost-metrics/README.md)).

**Verdict on the fields the issue names:**

| Field named in the issue | Exists at 4.3.2? | Notes |
|---|---|---|
| `costMetrics.enabled` | yes | [`values.yaml:147`](https://github.com/grafana/k8s-monitoring-helm/blob/k8s-monitoring-4.3.2/charts/k8s-monitoring/values.yaml#L147), default `false` — issue correct |
| `costMetrics.collector` | yes | [`values.yaml:161`](https://github.com/grafana/k8s-monitoring-helm/blob/k8s-monitoring-4.3.2/charts/k8s-monitoring/values.yaml#L161) |
| `telemetryServices.opencost.deploy` | yes | [`values.yaml:614`](https://github.com/grafana/k8s-monitoring-helm/blob/k8s-monitoring-4.3.2/charts/k8s-monitoring/values.yaml#L614), default `false` — issue correct |
| `telemetryServices.opencost.metricsSource` | yes | [`telemetry-services/values.yaml:140`](https://github.com/grafana/k8s-monitoring-helm/blob/k8s-monitoring-4.3.2/charts/k8s-monitoring/charts/telemetry-services/values.yaml#L140). A *second*, unrelated `costMetrics.opencost.metricsSource` also exists ([`feature-cost-metrics/values.yaml:48`](https://github.com/grafana/k8s-monitoring-helm/blob/k8s-monitoring-4.3.2/charts/k8s-monitoring/charts/feature-cost-metrics/values.yaml#L48)) — do not set that one for the deploy path |
| `…opencost.exporter.defaultClusterId` | yes | [`telemetry-services/values.yaml:158`](https://github.com/grafana/k8s-monitoring-helm/blob/k8s-monitoring-4.3.2/charts/k8s-monitoring/charts/telemetry-services/values.yaml#L158) |
| `…opencost.prometheus.external.url` | yes | [`telemetry-services/values.yaml:209`](https://github.com/grafana/k8s-monitoring-helm/blob/k8s-monitoring-4.3.2/charts/k8s-monitoring/charts/telemetry-services/values.yaml#L209) |
| "basic-auth credentials" under `external` | **no** | There is no inline username/password under `external`. Credentials come from a Secret: `…prometheus.existingSecretName` + `username_key` (default `username`) + `password_key` (default `password`) ([`telemetry-services/values.yaml:191-200`](https://github.com/grafana/k8s-monitoring-helm/blob/k8s-monitoring-4.3.2/charts/k8s-monitoring/charts/telemetry-services/values.yaml#L191-L200)). **This is the field the issue is missing.** |

A schema caveat that looks alarming but is not: the parent chart's `values.schema.json` declares only `deploy` under `telemetryServices.opencost`. The schema is non-strict (no `additionalProperties: false`), and the real schema for the rest lives in `charts/telemetry-services/values.schema.json`. Renders pass.

### 3.2 The guided setup fails install one key at a time

With `costMetrics.enabled` and `telemetryServices.opencost.deploy` set and nothing else, `helm template` fails four times in sequence, each with the exact value to add:

1. *"The OpenCost default cluster id should match the cluster name."* → `defaultClusterId: spyglass`
2. *"OpenCost requires linking to a Prometheus data source."* → `metricsSource: grafanaCloudPrometheus`
3. *"OpenCost requires a url to a Prometheus data source."* → `url: https://prometheus-prod-24-prod-eu-west-2.grafana.net/api/prom` — **the chart computes this URL itself**, which independently confirms §2
4. *"OpenCost requires the secret for grafanaCloudPrometheus to be set."* → `existingSecretName: grafanacloudprometheus-k8s-monitoring`

The fourth is the constraint that breaks the issue's branch-B plan: the required name is the destination's *own* Secret, computed by [`secrets.kubernetesSecretName`](https://github.com/grafana/k8s-monitoring-helm/blob/k8s-monitoring-4.3.2/charts/k8s-monitoring/templates/secrets/_helpers.tpl#L175-L187) from the destination map key and the release name. The rendered OpenCost Deployment then reads:

    - name: DB_BASIC_AUTH_USERNAME
      valueFrom: { secretKeyRef: { name: grafanacloudprometheus-k8s-monitoring, key: username } }
    - name: DB_BASIC_AUTH_PW
      valueFrom: { secretKeyRef: { name: grafanacloudprometheus-k8s-monitoring, key: password } }

i.e. under guided setup OpenCost queries with **the same `destinations_token` Alloy pushes with**. With that token write-only, OpenCost gets the 401 from §1.3 on every query.

The `defaultClusterId` check sits *outside* the `metricsSource != "custom"` guard ([`_validate.tpl:190-199`](https://github.com/grafana/k8s-monitoring-helm/blob/k8s-monitoring-4.3.2/charts/k8s-monitoring/charts/telemetry-services/templates/_validate.tpl#L190-L199)), so it applies in every mode.

### 3.3 `metricsSource: "custom"` is the escape hatch (option B)

Rendered and verified: setting `metricsSource = "custom"` and `existingSecretName = "opencost-prometheus-read"` skips checks 2-4 entirely and produces a Deployment whose `DB_BASIC_AUTH_*` read from that separate Secret, with `PROMETHEUS_SERVER_ENDPOINT` still taken from `…prometheus.external.url`. So option B works — it just requires 40-platform to create the Secret itself (`kubernetes_secret_v1`, same namespace as the release, keys `username`/`password`).

Do **not** reach for `destinations.<name>.secret.embed: true` as a workaround. That path takes a different validation branch which compares `telemetryServices.opencost.opencost.prometheus.username` — a key that does not exist in the chart's default values — and separately compares `password_key` against the destination *password* rather than a key name ([`_validate.tpl:256-280`](https://github.com/grafana/k8s-monitoring-helm/blob/k8s-monitoring-4.3.2/charts/k8s-monitoring/charts/telemetry-services/templates/_validate.tpl#L256-L280)). Reproduced: it fails with *"The username for grafanaCloudPrometheus and OpenCost do not match."* This looks like a chart bug; avoid the branch.

### 3.4 What the feature actually collects

`costMetrics` adds an Alloy `discovery.kubernetes` + `prometheus.scrape` + `prometheus.relabel` block that finds OpenCost pods by `app.kubernetes.io/name=opencost` in the release namespace, scrapes `job_name = "integrations/opencost"`, and keeps exactly 25 metric names — `up`, `scrape_samples_scraped`, `container_cpu_allocation`, `container_memory_allocation_bytes`, `kubecost_*`, `node_cpu_hourly_cost`, `node_ram_hourly_cost`, `node_total_hourly_cost`, `opencost_build_info`, `pv_hourly_cost`, and friends. The issue's "25 metrics in the chart's own `opencost.yaml` allow-list" checks out.

Deployment footprint: one `Deployment`, `Service`, `ServiceAccount`, `ClusterRole` and `ClusterRoleBinding`, all named `k8s-monitoring-opencost`, all shipped by the vendored OpenCost subchart. **No extra RBAC to write.** The image is `ghcr.io/opencost/opencost:1.121.0` — a registry the cluster does not currently pull from. The subcharts are vendored inside the packaged `k8s-monitoring-4.3.2.tgz`, so the OCI dependency on `ghcr.io/opencost/charts` is resolved at package time and Terraform's Helm provider does not need OCI registry access.

---

## 4. OpenCost's own requirements

### 4.1 AWS pricing without a CUR — the issue's claim holds

[OpenCost AWS configuration](https://opencost.io/docs/configuration/aws) confirms both halves of the issue's assertion. OpenCost "will automatically read the node information `node.spec.providerID` to determine the cloud service provider (CSP) in use", and once AWS is detected it "will attempt to pull the AWS on-demand pricing from the configured public API URL with no further configuration required" — the public price list at `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/${node_region}/index.json`. Spot pricing is what needs the extra integration: the docs require setting up the Spot Instance Data Feed with S3 access. **No CUR/Athena integration is needed for non-zero costs.** Issue correct.

Practical consequence for this stack: EKS Auto Mode nodes carry a normal `aws:///<az>/<instance-id>` providerID, so detection works; costs will be on-demand list prices even if the nodes are actually spot. That is a fidelity caveat, not a blocker.

Egress to `pricing.us-east-1.amazonaws.com` must be permitted from the OpenCost pod — UNVERIFIED against this cluster's egress rules, but the cluster already reaches `grafana.net` so a default-open egress is likely.

### 4.2 It genuinely needs *read* access, and it checks at startup

OpenCost's Prometheus module defines `PROMETHEUS_SERVER_ENDPOINT`, `DB_BASIC_AUTH_USERNAME` and `DB_BASIC_AUTH_PW` ([`promenv.go:12, 33-34`](https://github.com/opencost/opencost/blob/v1.121.0/modules/prometheus-source/pkg/env/promenv.go#L12-L34)), and the same file notes the endpoint "should point to a global query endpoint (e.g., Thanos Query, Cortex, or Mimir)" — Grafana Cloud Metrics is Mimir, so this is a supported topology.

Startup validation issues literally the query `up` and fails if it errors or returns nothing ([`validate.go:9, 19-48`](https://github.com/opencost/opencost/blob/v1.121.0/modules/prometheus-source/pkg/prom/validate.go#L9-L48)):

    const UpQuery = "up"

That is precisely the probe the issue prescribes — the probe is not a proxy for OpenCost's requirement, it *is* OpenCost's own boot check. A write-only token means OpenCost fails validation immediately and logs the auth error rather than producing zero-valued costs.

### 4.3 Cluster-id wiring must line up (it already does)

The chart sets `CLUSTER_ID=spyglass`, `PROM_CLUSTER_ID_LABEL=cluster`, and `CURRENT_CLUSTER_ID_FILTER_ENABLED=true`. The default `PROM_CLUSTER_ID_LABEL` in OpenCost is `cluster_id` ([`promenv.go:176`](https://github.com/opencost/opencost/blob/v1.121.0/modules/prometheus-source/pkg/env/promenv.go#L176)), so the chart's override matters: OpenCost will filter every query by `cluster="spyglass"`. The rendered `prometheus.remote_write` block stamps `external_labels = { "cluster" = "spyglass", "k8s_cluster_name" = "spyglass" }`, so the label the filter needs is already on the data this stack has been shipping. Nothing to do — but if `cluster.name` and `defaultClusterId` ever diverge, OpenCost silently sees an empty cluster.

The chart also sets `CLOUD_PROVIDER_API_KEY=disabled` (a GKE workaround, harmless on EKS) and `EMIT_KSM_V1_METRICS_ONLY=true`, so OpenCost emits KSM-v1-shaped metrics itself instead of duplicating the cluster's kube-state-metrics output.

### 4.4 Queryable-Prometheus content — a soft prerequisite the issue does not mention

OpenCost computes allocation from cluster metrics it reads *back out of* the destination. That creates a loop this repo happens to already satisfy — `clusterMetrics` has been enabled and shipping since the stack came up — but the chart's allow-lists decide what is actually retrievable. Checking the rendered keep-regexes against what OpenCost queries:

- **Present:** `container_cpu_usage_seconds_total`, `container_memory_working_set_bytes`, `kube_pod_container_resource_requests`/`_limits`, `kube_pod_owner`, `kube_pod_info`, `kube_persistentvolumeclaim_*`, `kubelet_volume_stats_used_bytes`, and — via the wildcards `kube_node.*` and `kube_replicaset.*` — `kube_node_status_capacity`, `kube_node_labels`, `kube_node_info`, `kube_replicaset_owner`.
- **Absent from the default allow-lists:** `kube_namespace_labels`, `kube_pod_labels`, `container_fs_usage_bytes`, `kube_persistentvolume_capacity_bytes`.

The absent four are the inputs to label-based cost aggregation and to PV/disk cost. **UNVERIFIED** how much OpenCost 1.121.0 degrades without them — core node/pod/namespace allocation should still compute, since that comes from the present set. Note also that kube-state-metrics does not emit `kube_pod_labels`/`kube_namespace_labels` at all without `--metric-labels-allowlist`, so those would be missing even with a permissive allow-list. If the Cost tab populates but label-scoped breakdowns look empty, this is the first place to look.

Retention: the chart sets `RESOLUTION_1D_RETENTION=15` and `RESOLUTION_1H_RETENTION=49` (days/hours), and `PROMETHEUS_QUERY_RESOLUTION_SECONDS=300`. Grafana Cloud metrics retention comfortably exceeds both. Expect nothing on the Cost tab until enough history accumulates for OpenCost's first completed query windows.

---

## 5. Prerequisites the issue does not mention

1. **`existingSecretName` is mandatory** and is forced to the destination's own Secret under guided setup (§3.2). This is what makes "just mint a read token" insufficient.
2. **Adding `metrics:read` is a safe in-place edit.** `scopes` is not `ForceNew`; the provider issues `PostAccessPolicy` on update and the token is not recreated (§Summary, option A). The portal token in `var.grafana_cloud_access_policy_token` already holds `accesspolicies:write` — it created this policy — so no new credential is needed.
3. **`costMetrics.collector` must name a collector that exists.** `"alloy-metrics"` is declared at `k8s-monitoring.tf:69`; the chart does not create one implicitly.
4. **New egress paths:** `ghcr.io` for the OpenCost image, and `pricing.us-east-1.amazonaws.com` for the AWS price list.
5. **Do not override `telemetryServices.opencost.extraVolumes`.** The chart ships a default `configs` emptyDir that the OpenCost container mounts at `/var/configs`; replacing the list drops the mount ([`telemetry-services/values.yaml:149-151`](https://github.com/grafana/k8s-monitoring-helm/blob/k8s-monitoring-4.3.2/charts/k8s-monitoring/charts/telemetry-services/values.yaml#L149-L151)).
6. **Two same-named keys, different meanings:** `costMetrics.opencost.*` configures *scraping* an OpenCost that already exists; `telemetryServices.opencost.*` configures *deploying* one. Setting `metricsSource` on the wrong one silently does nothing.
7. **Cost data is not instant.** OpenCost must accumulate query windows against Grafana Cloud after install; "the Cost tab populates" is not a same-minute acceptance check.

---

## Open questions

1. **Least privilege vs. guided setup (option A vs. B)** — a product decision for the maintainer, not a research gap. Option A widens the shared push token to `metrics:read` across the whole stack; option B keeps the read credential separate at the cost of `metricsSource: custom` and a hand-rolled Secret. Both verified to render at 4.3.2.
2. **Label-based cost breakdowns** — UNVERIFIED whether the four metrics absent from the default allow-lists (§4.4) meaningfully degrade OpenCost 1.121.0. Worth re-checking after the Cost tab is populated rather than pre-emptively widening allow-lists.
3. **Cluster egress** to `ghcr.io` and `pricing.us-east-1.amazonaws.com` — UNVERIFIED against this cluster's actual egress configuration.
4. **The `secret.embed` validation branch** appears to compare a key name against a password value ([`_validate.tpl:271`](https://github.com/grafana/k8s-monitoring-helm/blob/k8s-monitoring-4.3.2/charts/k8s-monitoring/charts/telemetry-services/templates/_validate.tpl#L271)) and references an undocumented `prometheus.username` key. Not blocking (this repo does not use embedded secrets), but it is an upstream bug worth reporting if anyone touches that path.
5. **Spot-instance fidelity** — EKS Auto Mode may place workloads on spot capacity while OpenCost bills them at on-demand list price. Accurate spot pricing needs the AWS Spot Instance Data Feed plus S3 access, which is out of scope for issue 19 but changes how much the resulting numbers should be trusted.
