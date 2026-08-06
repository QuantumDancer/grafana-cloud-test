# Grafana Terraform provider — k6 Cloud tests, Synthetic Monitoring, and Faro Collector origins

- **Accessed:** 2026-08-06
- **Primary sources:** Terraform Registry docs for `grafana/grafana` (content verified against the generated docs in [github.com/grafana/terraform-provider-grafana `docs/`](https://github.com/grafana/terraform-provider-grafana/tree/main/docs), which is what the Registry renders), provider GitHub releases, grafana.com/docs (Grafana Cloud > Testing > k6 / Synthetic Monitoring; Frontend Observability), grafana.com/pricing.
- **Versions referenced:** `grafana/grafana` provider current release **v4.44.0** (docs read from `main` on 2026-08-06); k6 Cloud REST API `/cloud/v6`; feature-introduction versions per the provider's GitHub releases (cited inline).

## Summary

**Q1 — yes, with one gap.** Grafana Cloud k6 load tests are fully manageable (create/update/destroy) via the Grafana Terraform provider: `grafana_k6_installation`, `grafana_k6_project`, `grafana_k6_load_test`, `grafana_k6_schedule`, plus `grafana_k6_project_allowed_load_zones` / `grafana_k6_project_limits` ([provider docs/resources listing](https://github.com/grafana/terraform-provider-grafana/tree/main/docs/resources)). k6 resources need provider config `stack_id` + `k6_access_token` ([provider index](https://registry.terraform.io/providers/grafana/grafana/latest/docs)). Terraform can **schedule** runs (`grafana_k6_schedule`, cron or RRULE-style recurrence) but has **no resource to start an ad-hoc run** — that's `k6 cloud` CLI, the UI, or `POST /cloud/v6/load_tests/{id}/start` ([load-tests REST API](https://grafana.com/docs/grafana-cloud/testing/k6/reference/cloud-rest-api/load-tests/)). Browser tests are just scripts, so they flow through the same resource; cloud-managed browser execution is supported and bills at 10× VUh ([run-your-first-browser-tests](https://grafana.com/docs/grafana-cloud/testing/k6/get-started/run-your-first-browser-tests/)). What deletion does to run history is **not documented** (open question below). Synthetic Monitoring is a fully Terraform-manageable complement (`grafana_synthetic_monitoring_installation`/`_check`/`_probe`/`_check_alerts`) with http/browser/scripted-k6 check types — well-suited to probing an ephemeral public endpoint.

**Q2 — yes, and the ephemeral-hostname problem is solvable two ways.** The hosted Faro Collector allows only listed CORS origins; origins may contain **one wildcard** (`https://*.grafana.com`), and a global `*` is "supported but discouraged" ([Faro instrumentation setup](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/faro/)). The app is Terraform-managed via `grafana_frontend_o11y_app` (updatable `allowed_origins` list) since provider v3.20.0, using a `frontend-observability:read|write|delete`-scoped access-policy token ([resource docs](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/frontend_o11y_app), [Cloud Terraform guide](https://grafana.com/docs/grafana-cloud/developer-resources/infrastructure-as-code/terraform/terraform-frontend-observability/)). For a changing ALB hostname: either update `allowed_origins` on each apply (allow ~2 min propagation) or set `https://*.elb.amazonaws.com` once — the single wildcard matches "0 or more characters", spanning the region label in ALB DNS names.

## 1. Grafana Cloud k6 via Terraform

### 1.1 Resources (all under subcategory "k6")

| Resource | Purpose | Source |
|---|---|---|
| `grafana_k6_installation` | Installs the k6 App on a Cloud stack and **generates the `k6_access_token`** used by all other k6 resources. Inputs: `stack_id`, `grafana_sa_token` (stack service-account token), `grafana_user`, `publisher_token` (stack-scoped access-policy token with `metrics:read|write`, `rules:read|write` — used by Cloud k6 to publish test metrics/thresholds). Not importable, but safe to run against an existing installation. | [k6_installation](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/k6_installation) |
| `grafana_k6_project` | Project (folder for tests). Only `name` is settable; exposes `grafana_folder_uid`, `is_default`. Importable by id. | [k6_project](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/k6_project) |
| `grafana_k6_load_test` | The test itself: `project_id`, `name`, `script` (inline or `file()`), optional `k6_version` (pins major k6 version; otherwise pinned at creation to the Cloud default). `baseline_test_run_id` is deprecated. Importable by id. | [k6_load_test](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/k6_load_test) |
| `grafana_k6_schedule` | Automated execution: `load_test_id`, `starts` (RFC3339), then either a `cron` block (5-field expression + `timezone`, aliases `@daily` etc.) or a `recurrence_rule` block (`frequency` HOURLY–YEARLY, `interval`, `byday`, `count`, `until`). **No block at all = one-shot run at `starts`.** Read-only: `next_run`, `deactivated`. One schedule per test (import key is the `load_test_id`). | [k6_schedule](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/k6_schedule) |
| `grafana_k6_project_allowed_load_zones`, `grafana_k6_project_limits` | Per-project load-zone allowlist and VUh/duration limits. | [docs/resources listing](https://github.com/grafana/terraform-provider-grafana/tree/main/docs/resources) |

Data sources exist for load tests, projects, schedules, limits, and allowed load zones ([docs/data-sources listing](https://github.com/grafana/terraform-provider-grafana/tree/main/docs/data-sources)).

So: **create AND destroy of test definitions, projects, and schedules is fully Terraform-managed.**

### 1.2 Auth

Two-token model, per the [k6_installation example](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/k6_installation):

1. A **Cloud access-policy token** (portal-level, scopes `stacks:read|write|delete`, `stack-service-accounts:write`, `accesspolicies:read|write|delete`) drives stack + installation setup via `provider { cloud_access_policy_token = ... }`.
2. The k6 resources themselves use a provider aliased with **`stack_id` + `k6_access_token`** — the token is emitted by `grafana_k6_installation.k6_access_token`, or can come from an existing UI installation ([provider index schema](https://registry.terraform.io/providers/grafana/grafana/latest/docs): `k6_access_token` — "The k6 Cloud API token", env `GRAFANA_K6_ACCESS_TOKEN`; `stack_id`, env `GRAFANA_STACK_ID`).

The underlying `/cloud/v6` REST API accepts a Personal API token or a Grafana Stack API token, always with an `X-Stack-Id` header ([load-tests REST API](https://grafana.com/docs/grafana-cloud/testing/k6/reference/cloud-rest-api/load-tests/)).

### 1.3 Provider version requirements

From the [provider releases](https://github.com/grafana/terraform-provider-grafana/releases) (verified via GitHub API 2026-08-06):

- **v3.24.0** (2025-05-06) — "Support to manage basic k6 resources" (project, load test, installation) — PR #2129.
- **v3.25.3** (2025-06-11) — k6 resource IDs converted to string (state-compat relevant if starting from older versions).
- **v4.2.0** (2025-08-07) — `grafana_k6_project_allowed_load_zones`.
- **v4.4.0** (2025-08-11) — `grafana_k6_schedule` added; **v4.12.0** (2025-10-23) added cron-expression support to schedules.
- **v4.42.0** (2026-07-28) — `k6_version` field on the load-test resource.

Practical floor for the full feature set described here: **>= 4.12.0**; just use the current 4.x.

### 1.4 Starting runs: Terraform schedules yes, ad-hoc starts no

There is **no Terraform resource that triggers an immediate test run** — the k6 resource set stops at definitions + schedules ([docs/resources listing](https://github.com/grafana/terraform-provider-grafana/tree/main/docs/resources)). Ad-hoc runs are started via:

- CLI: `k6 cloud <script>.js` ([run cloud tests from the CLI](https://grafana.com/docs/grafana-cloud/testing/k6/get-started/run-cloud-tests-from-the-cli/)),
- UI script editor ("Create and Run") ([run-your-first-browser-tests](https://grafana.com/docs/grafana-cloud/testing/k6/get-started/run-your-first-browser-tests/)),
- REST: `POST /cloud/v6/load_tests/{id}/start` (idempotency via `K6-Idempotency-Key`, valid 10 min) ([load-tests REST API](https://grafana.com/docs/grafana-cloud/testing/k6/reference/cloud-rest-api/load-tests/)).

A `grafana_k6_schedule` **without** a recurrence/cron block runs the test once at `starts` ([k6_schedule](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/k6_schedule)) — a workable "run once after apply" hack if `starts` is computed as now-plus-a-minute, though that's an inference from the schema, not a documented pattern (UNVERIFIED as a supported idiom).

### 1.5 Browser tests

`grafana_k6_load_test.script` is an opaque k6 script, so browser scripts go through the same resource — nothing in the schema restricts protocol vs browser ([k6_load_test](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/k6_load_test)). Cloud execution of browser tests is a first-class feature: tests run "on a fleet of automatically managed Chromium browsers", started via UI or `k6 cloud`; **"Browser VUs consume 10 times more VU hours compared to Protocol VUs"**, and browser executions auto-scale within the chosen load zones ([run-your-first-browser-tests](https://grafana.com/docs/grafana-cloud/testing/k6/get-started/run-your-first-browser-tests/), [browser-testing blog, secondary](https://grafana.com/blog/2024/10/24/browser-testing-in-grafana-cloud-k6-how-to-optimize-frontend-web-performance/)). Results get dedicated Browser Timeline / screenshots / Web Vitals views ([inspect-browser-test-results](https://grafana.com/docs/grafana-cloud/testing/k6/analyze-results/inspect-browser-test-results/)). Whether Terraform-created browser tests behave identically to UI-created ones has no dedicated doc — expected yes, since the API treats the script opaquely (inference).

### 1.6 Destroy behavior and run history

- Provider destroy calls the API delete; the API notes only "Cannot delete test while it's running" and **does not state what happens to associated test runs/results** ([load-tests REST API](https://grafana.com/docs/grafana-cloud/testing/k6/reference/cloud-rest-api/load-tests/); the deprecated v2 API's delete-test docs are equally silent — [deprecated tests API](https://grafana.com/docs/grafana-cloud/testing/k6/reference/cloud-rest-api/deprecated-rest-api/tests/)). Since runs are children of a test, loss of run history on destroy should be assumed until proven otherwise (open question 1).
- Deleting test *runs* (UI three-dot menu) "is irreversible"; starring a run does **not** extend retention: "Starred and non-starred test runs follow the same data retention policy as your Grafana Cloud Metrics data" ([manage-test-results](https://grafana.com/docs/grafana-cloud/testing/k6/analyze-results/manage-test-results/)). Exact retention duration for the free tier is not on that page (open question 2).
- `terraform destroy` of `grafana_k6_installation` semantics (uninstall vs. token-only) are not documented; the resource is explicitly tolerant of pre-existing installations on create ([k6_installation](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/k6_installation)). UNVERIFIED.

## 2. Synthetic Monitoring as a Terraform-managed alternative/addition

- Resources: `grafana_synthetic_monitoring_installation` (installs SM on the stack, generates the `sm_access_token`; needs only `stacks:read` on the cloud token plus a metrics-publisher access policy), `grafana_synthetic_monitoring_check`, `grafana_synthetic_monitoring_probe` (private probes), `grafana_synthetic_monitoring_check_alerts` ([sm_installation](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/synthetic_monitoring_installation), [sm_check](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/synthetic_monitoring_check), [docs/resources listing](https://github.com/grafana/terraform-provider-grafana/tree/main/docs/resources)). SM resources use provider `sm_access_token` (+ optional region-matched `sm_url`) ([provider index](https://registry.terraform.io/providers/grafana/grafana/latest/docs)).
- Check types in the `settings` block: `http`, `ping`, `dns`, `tcp`, `traceroute`, `grpc`, `multihttp`, `scripted` (k6 script), and **`browser`** (k6 browser script); `frequency` ranges 1 s–1 h (default 60 s), probes chosen from public probe locations via the `grafana_synthetic_monitoring_probes` data source ([sm_check schema](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/synthetic_monitoring_check)).
- Fit for this project: an SM `http` (or `browser`) check against the ephemeral ALB hostname is fully declarative — check created on `terraform apply` with the current hostname as `target`, destroyed with the stack. Checks run continuously at `frequency` (recurring probing, not load), so SM complements rather than replaces k6: SM = availability/latency probing from global locations; k6 = on-demand/scheduled load. Since `target` is just an attribute, each rebuild's new hostname is an in-place plan diff.

### Pricing / free tier (both products)

From [grafana.com/pricing](https://grafana.com/pricing/) (2026-08-06):

- **k6**: free tier "Limited to 500 virtual user hours per month"; Pro starts at $0.150/VUh beyond the included 500 VUh. Browser VUs burn VUh at 10× ([run-your-first-browser-tests](https://grafana.com/docs/grafana-cloud/testing/k6/get-started/run-your-first-browser-tests/)).
- **Synthetic Monitoring**: free tier "Limited to 100k API test executions & 10k browser test executions per month" (shared pool); Pro starts at $5.00/10k API executions and $50.00/10k browser executions. Note: one check × 3 probes × 60 s frequency ≈ 130k executions/month, so a single default-frequency multi-probe check can exceed the free API-execution pool — budget frequency × probes accordingly (arithmetic mine; allowance per pricing page).

## 3. Hosted Faro Collector CORS / origins via Terraform

### 3.1 How origins work on the hosted collector

From [Frontend Observability instrumentation setup](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/faro/):

- "If no origin is supplied, all origins are blocked."
- "Origins are matched exactly. For example, `https://app.grafana.com`."
- "Origins can contain one wildcard character to match 0 or more characters. For example, `https://*.grafana.com`."
- "Matching all domains with a global wildcard rule `*` is supported but discouraged as it allows anyone to submit data to your endpoint."
- "Allow two minutes for saved changes to CORS Allowed Origins to propagate and take effect."

### 3.2 Terraform resource

`grafana_frontend_o11y_app` — required: `stack_id`, `name`, `allowed_origins` (List of String, "A list of allowed origins for CORS"), `extra_log_attributes`, `settings` (incl. `geolocation.*`, `combineLabData`); read-only `collector_endpoint` (the URL the Faro SDK sends to). Import as `{{ stack_id }}:{{ name }}` ([frontend_o11y_app resource](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/frontend_o11y_app)). A matching data source exists ([data-sources listing](https://github.com/grafana/terraform-provider-grafana/tree/main/docs/data-sources)).

Auth: a Cloud access-policy token with scopes `frontend-observability:read|write|delete` (plus `stacks:read`), passed as provider `frontend_o11y_api_access_token` (env `GRAFANA_FRONTEND_O11Y_API_ACCESS_TOKEN`) ([Cloud Terraform guide](https://grafana.com/docs/grafana-cloud/developer-resources/infrastructure-as-code/terraform/terraform-frontend-observability/), [provider index](https://registry.terraform.io/providers/grafana/grafana/latest/docs)).

Versions ([releases](https://github.com/grafana/terraform-provider-grafana/releases)): introduced **v3.20.0** (2025-02-21, "Frontend Observability: add provider and resources"); import fixed v3.25.0; non-deterministic `allowed_origins` ordering fixed **v4.32.0** (2026-04-22) — use >= 4.32.0 to avoid perpetual plan diffs on multi-origin lists.

### 3.3 Ephemeral ALB hostname scenario

- **Yes, a changed origin breaks ingestion**: unlisted origins are blocked outright (§3.1), so a rebuilt cluster's new `xyz-123.eu-central-1.elb.amazonaws.com` origin would be rejected until the list changes.
- **Option A — update per apply**: `allowed_origins` is an ordinary updatable attribute; feed the ALB DNS name from the AWS/k8s side of the config (e.g. the Ingress status) and each `terraform apply` patches the app in place. Budget the documented ~2-minute propagation before traffic is accepted (§3.1).
- **Option B — one wildcard, set once**: `https://*.elb.amazonaws.com` is within the documented rules (exactly one wildcard, matching "0 or more characters" — which spans the `name-id.region` labels, since the docs constrain the wildcard count, not what it matches). Caveats: (1) it admits any AWS ALB origin on the internet, an origin-check-only weakening one step short of `*` — acceptable for a throwaway test stack, questionable beyond it; (2) the origin must match the scheme the browser reports — an ALB without ACM TLS serves `http://`, so the entry would need to be `http://*.elb.amazonaws.com` (scheme-matching behavior inferred from the docs' scheme-qualified examples; not spelled out — UNVERIFIED).
- The demo apps in Grafana's own Terraform guide use plain hostname origins; no doc shows the ALB-wildcard pattern specifically (pattern is mine, rules are theirs).

## Open questions

1. **k6 test deletion vs. run history**: neither the `/cloud/v6` delete-test docs nor the deprecated v2 API state whether deleting a load test deletes its test runs/results ([load-tests REST API](https://grafana.com/docs/grafana-cloud/testing/k6/reference/cloud-rest-api/load-tests/)). Assume history is lost with the test until tested empirically (cheap to verify: create/run/destroy a trivial test, then query `GET /cloud/v6/load_tests/{id}` and the runs list).
2. **Exact k6 result-retention duration** on the free tier: docs only say runs "follow the same data retention policy as your Grafana Cloud Metrics data" ([manage-test-results](https://grafana.com/docs/grafana-cloud/testing/k6/analyze-results/manage-test-results/)); the concrete number for a free stack was not found on a primary page. UNVERIFIED.
3. **`terraform destroy` semantics of `grafana_k6_installation`** (does it uninstall the k6 App / revoke the generated token?) — undocumented ([k6_installation](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/k6_installation)).
4. **Faro origin scheme matching**: whether `http://` vs `https://` origins must match exactly (and hence whether a TLS-less ALB needs an `http://` entry) is implied by the examples but never stated ([instrument/faro](https://grafana.com/docs/grafana-cloud/monitor-applications/frontend-observability/instrument/faro/)). Verify empirically or terminate TLS on the ALB and sidestep it.
5. **One-shot `grafana_k6_schedule` as a "run on apply" mechanism**: schema supports a no-recurrence schedule at a fixed `starts` time, but using a computed near-future timestamp from Terraform is untested/undocumented as an idiom ([k6_schedule](https://registry.terraform.io/providers/grafana/grafana/latest/docs/resources/k6_schedule)).
