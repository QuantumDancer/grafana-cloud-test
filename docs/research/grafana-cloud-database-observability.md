# Grafana Cloud Database Observability — Research Notes

**Accessed:** 2026-08-06.
**Version context:** Database Observability app v2.27.x (release notes through 2026-07-09); Grafana Alloy setup docs require **Alloy >= 1.17.0**; k8s-monitoring Helm chart docs from `main` (v4 line).
All sources are Grafana Labs first-party (grafana.com docs/blog/whats-new, grafana GitHub repos).

## Summary

**Verdict: PostgreSQL is supported and Generally Available.** Database Observability monitors **MySQL and PostgreSQL** and reached **GA on 2026-04-01/02** ("Database Observability is now generally available … Connect your MySQL and PostgreSQL databases", app release v2.17.0 dated 04/01/26 marks "GA after public preview") — [What's new: GA announcement](https://grafana.com/whats-new/2026-04-02-database-observability-now-generally-available/), [release notes](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/release-notes/). It launched in **public preview on 2025-11-13** for both engines — [launch blog](https://grafana.com/blog/understand-diagnose-and-optimize-sql-queries-introducing-grafana-cloud-database-observability/). It requires **PostgreSQL 14.0+** — [self-managed PostgreSQL setup](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/set-up/postgres/postgres/). It is a **Grafana Cloud-only product** (the UI/app; the Alloy collection components are OSS) available on all tiers including Free — [product page](https://grafana.com/products/cloud/database-observability/). The collector is Alloy's `database_observability.postgres` component, registered `StabilityGenerallyAvailable` in the Alloy source — [component.go](https://github.com/grafana/alloy/blob/main/internal/component/database_observability/postgres/component.go), [component reference](https://grafana.com/docs/alloy/latest/reference/components/database_observability/database_observability.postgres/). The **k8s-monitoring Helm chart supports it directly** via `integrations.postgresql.instances[].databaseObservability.enabled: true` — [chart integration docs](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/charts/feature-integrations/docs/integrations/postgresql.md), [chart PostgreSQL example](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/docs/examples/features/database-observability/postgresql/README.md). This makes it a strong candidate for the test project: genuinely Cloud-only UI, newer product, and directly wired into the planned Helm chart v4 + in-cluster PostgreSQL stack.

## Capabilities and subfeatures

From the [introduction](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/introduction/), [launch blog](https://grafana.com/blog/understand-diagnose-and-optimize-sql-queries-introducing-grafana-cloud-database-observability/), [product page](https://grafana.com/products/cloud/database-observability/), and [release notes](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/release-notes/):

- **Fleet overview** — "bird's eye view of your database fleet" with RED metrics (rate/error/duration) and filtering down to instance level ([launch blog](https://grafana.com/blog/understand-diagnose-and-optimize-sql-queries-introducing-grafana-cloud-database-observability/)).
- **Query performance analysis** — normalized/fingerprinted queries with counts, latency (avg + percentiles), error rates, row stats, lock/CPU/I-O time ([introduction](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/introduction/), [product page](https://grafana.com/products/cloud/database-observability/)).
- **Query samples** — individual executions with timestamp, duration, CPU time, wait events, full query text; PostgreSQL samples additionally carry transaction time, user, backend type, client, PID, state, leader PID, Xid, xmin horizon ([examine query samples](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/investigate/examine-query-samples/)). Filterable for Postgres since app v2.22.0 ([release notes](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/release-notes/)).
- **Wait events** — resource-contention analysis; for PostgreSQL captured from `pg_stat_activity` ([introduction](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/introduction/)).
- **Visual explain plans** — execution-plan visualization with per-operation cost share ([launch blog](https://grafana.com/blog/understand-diagnose-and-optimize-sql-queries-introducing-grafana-cloud-database-observability/)); single-node plan rendering improved in v2.26.0 ([release notes](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/release-notes/)).
- **Schema insights** — table structures, indexes, constraints, correlated with query performance ([introduction](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/introduction/)).
- **AI-powered optimization** — "AI-suggested CREATE INDEX statements and query rewrites" ([product page](https://grafana.com/products/cloud/database-observability/)); the original "AI Helper" tab was deprecated ~v2.23.0 in favor of integrated Grafana Assistant buttons ([release notes](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/release-notes/)).
- **Infrastructure correlation** — overlays query performance with CPU/memory/disk-I/O metrics ([product page](https://grafana.com/products/cloud/database-observability/)).
- **Trace-to-query linking** — see Application Observability section below ([link traces](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/monitor/link-traces/)).
- **Saved views** (v2.22.0) and **Fleet Management setup wizards** (v2.18.0+) ([release notes](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/release-notes/)).
- Workflow framing in docs: **Monitor → Investigate → Optimize** ([docs home](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/)).
- "Connections" as a distinct subfeature: **UNVERIFIED** — not found as a named Database Observability view in the pages reviewed (connection metrics do exist in the classic integration's exporter metrics).

**Architecture:** Alloy collects two streams — (1) Prometheus metrics from `prometheus.exporter.postgres` incl. the `stat_statements` collector, (2) structured **logs to Loki** produced by the `database_observability.postgres` collectors (query samples, schema details, explain plans, query details). The Cloud app correlates both; `instance` labels (`host:port`) must match between metrics and logs ([introduction](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/introduction/)).

## PostgreSQL setup requirements

All from [Set up self-managed PostgreSQL](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/set-up/postgres/postgres/) unless noted. Estimated setup time "20-40 minutes, excluding any required maintenance window for restarting PostgreSQL".

### Database-side

- **PostgreSQL 14.0 or later.**
- `postgresql.conf`:
  - `shared_preload_libraries = 'pg_stat_statements'` (restart required)
  - `compute_query_id = on` (restart required)
  - `pg_stat_statements.track = all` (reload or restart)
  - `track_activity_query_size = 4096` (restart required)
- `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;` **in each monitored database**.
- Dedicated monitoring user:
  ```sql
  CREATE USER "db-o11y" WITH PASSWORD '<secure_password>';
  GRANT pg_monitor TO "db-o11y";
  GRANT pg_read_all_stats TO "db-o11y";
  ALTER ROLE "db-o11y" SET pg_stat_statements.track = 'none';
  ```
  plus per-database schema access (`GRANT USAGE ON SCHEMA public ...; GRANT SELECT ON ALL TABLES IN SCHEMA public ...;`) or the broader `GRANT pg_read_all_data`.
- Alloy must connect **directly** to PostgreSQL — "avoid load balancers or connection poolers like PgBouncer". In-cluster, point it at the primary's Service.
- `track_io_timing`: **UNVERIFIED as a requirement** — not listed among the four mandatory parameters on the setup page (it is a common postgres_exporter-side recommendation, but the Database Observability doc reviewed does not mandate it).

### Collector-side (Alloy)

- **Alloy 1.17.0 or later** ([setup doc](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/set-up/postgres/postgres/)). The component itself was promoted from experimental to stable around Alloy v1.15.0 per the [Alloy CHANGELOG](https://github.com/grafana/alloy/blob/main/CHANGELOG.md) ("database_observability: Promote components to stable") and is registered `featuregate.StabilityGenerallyAvailable` in [current source](https://github.com/grafana/alloy/blob/main/internal/component/database_observability/postgres/component.go); the exact promotion version is **UNVERIFIED** (changelog summarization — verify against the changelog directly if it matters).
- Component: [`database_observability.postgres`](https://grafana.com/docs/alloy/latest/reference/components/database_observability/database_observability.postgres/) with required args `data_source_name` (DSN, secret) and `forward_to` (Loki receivers). Five collectors, **all enabled by default**: `query_details`, `query_samples` (incl. wait events), `schema_details`, `explain_plans`, `logs` (PostgreSQL log processing + error metrics). Options: `enable_collectors`/`disable_collectors`, `exclude_databases`, `exclude_users`, `exclude_current_user` (default true).
- Additionally requires `prometheus.exporter.postgres` with the `stat_statements` collector enabled (excluding the `db-o11y` user's own queries) and remote_write/Loki write to Grafana Cloud ([setup doc](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/set-up/postgres/postgres/)).
- Three documented config paths: (1) the in-app **Database Observability configuration page** (generates config; recommended), (2) the **Kubernetes Monitoring Helm chart**, (3) hand-written Alloy config ([setup doc](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/set-up/postgres/postgres/)).

## k8s-monitoring Helm chart (v4) support

- The chart's **integrations feature** has first-class support: `integrations.postgresql.instances[].databaseObservability.enabled: true` (default `false`), alongside the exporter config (host/port/database/credentials via Kubernetes Secret, `sslmode`, `autoDiscovery` with allow/deny lists, `collectors.statStatements.enabled: true`) — [feature-integrations postgresql docs](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/charts/feature-integrations/docs/integrations/postgresql.md).
- Per-collector tuning is exposed: query samples (default 15s interval), query details (1m, up to 100 recent queries), explain plans (1m), schema details (1m); plus cloud-provider metadata (AWS ARN / Azure / GCP), user/database exclusion, and custom labels (reserved: `job`, `instance`, `dsn`) — [same docs](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/charts/feature-integrations/docs/integrations/postgresql.md).
- A complete worked example exists in the chart repo: `alloy-singleton` collector running the integration, Prometheus + Loki destinations, secret referencing an existing `postgresql` chart secret, and PostgreSQL pod log collection via label selectors — [database-observability/postgresql example](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/docs/examples/features/database-observability/postgresql/README.md).
- **Caveat to verify at build time:** that example sets `collectors.alloy-singleton.alloy.stabilityLevel: experimental`. Since the Alloy component is now GA this may be stale, but until confirmed assume the chart-rendered config may need the elevated stability level ([example README](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/docs/examples/features/database-observability/postgresql/README.md)). Check which Alloy version chart v4 pins — it must be >= 1.17.0 per the setup doc.
- Grafana's own setup doc names the Helm chart as a supported method: "Kubernetes Monitoring Helm Chart — enable `databaseObservability.enabled: true` in `values.yaml`" ([setup doc](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/set-up/postgres/postgres/)).

## Comparison with the classic PostgreSQL integration

From the [classic PostgreSQL integration reference](https://grafana.com/docs/grafana-cloud/monitor-infrastructure/integrations/integration-reference/integration-postgres/):

| | Classic PostgreSQL integration | Database Observability |
|---|---|---|
| Basis | `prometheus.exporter.postgres` (postgres_exporter) metrics + optional logs | `database_observability.postgres` structured logs to Loki **plus** the same exporter's metrics (incl. `stat_statements`) |
| Scope | Infrastructure/operational: connections, replication, cache, locks, table stats; 4 dashboards, 19 alerts | Query-level: normalized queries, samples, wait events, explain plans, schema insights, AI suggestions |
| Positioning | "designed for operational visibility rather than granular query-level performance troubleshooting" | The integration docs explicitly point at it: "For query-level insights about slow queries, wait events, and execution plans, see Database Observability" |

**Run together?** Yes — Database Observability *requires* the exporter metrics pipeline anyway ([setup doc](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/set-up/postgres/postgres/)), and the Helm chart nests `databaseObservability` inside the `postgresql` integration so one instance definition drives both ([chart docs](https://github.com/grafana/k8s-monitoring-helm/blob/main/charts/k8s-monitoring/charts/feature-integrations/docs/integrations/postgresql.md)). The classic integration's dashboards/alerts remain useful for infra-level health.

## Interplay with Application Observability (documented)

From [Link traces and queries](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/monitor/link-traces/):

- **Bidirectional correlation**: from a DB span in a trace to query details/samples, and from a query sample's trace ID back to the trace (Explore / Traces Drilldown).
- **Minimum span requirements** (OTel db semantic conventions): query text in `db.query.text` or `db.statement`, and `db.system.name`/`db.system` = `postgresql` (or `mysql`). A Spring Boot app auto-instrumented with the OTel Java agent emits these — so the demo backend's queries should link with **no app changes** via the default matching mode.
- **Two matching modes**: (1) **query text matching** — default, "requires no application changes"; (2) **exact trace matching** — requires **SQLCommenter**-style "W3C `traceparent` comment appended to your SQL text", plus Alloy >= 1.17.0 (or `disable_query_redaction = true` in the `query_samples` block on older Alloy).
- **Limitations**: "best-effort correlation, not a guaranteed link on every span"; exact matching only succeeds if Alloy's periodic sampling happened to capture that execution. Trace ID detection in samples was improved in app v2.27.0 ([release notes](https://grafana.com/docs/grafana-cloud/monitor-applications/database-observability/release-notes/)).

## Cloud-only vs OSS

- The **product (UI, dashboards, AI suggestions, fleet view) is Grafana Cloud-only**, listed under Grafana Cloud with per-host-hour pricing: Free tier includes 2,232 host hours (~3 DB hosts), Pro from $0.07/host-hour ([product page](https://grafana.com/products/cloud/database-observability/)). No OSS-Grafana equivalent app is documented.
- The **collection layer is open source**: `database_observability.postgres` ships in OSS Grafana Alloy ([Alloy reference](https://grafana.com/docs/alloy/latest/reference/components/database_observability/database_observability.postgres/), [source](https://github.com/grafana/alloy/blob/main/internal/component/database_observability/postgres/component.go)); the product page itself advertises "built-in open source MySQL and PostgreSQL collection components". You could ship its logs/metrics to self-hosted Loki/Prometheus (the Helm example does exactly that), but the curated Database Observability experience on top exists only in Grafana Cloud — which makes it a good fit for the project's "Cloud-only features" goal.

## Open questions

1. **Helm chart `stabilityLevel: experimental`** in the official example vs the component's GA registration — determine whether chart v4's rendered config still gates the component behind a raised stability level, and which Alloy version the chart deploys (needs >= 1.17.0).
2. Exact Alloy version where `database_observability.postgres` went GA (changelog suggests ~v1.15.0; docs require 1.17.0 anyway) — **UNVERIFIED** detail, practically moot if using current Alloy.
3. Whether a dedicated "connections" view exists inside Database Observability (vs classic-integration connection metrics) — not found in reviewed docs.
4. Host-hour billing mechanics for a single in-cluster PostgreSQL pod (1 host ≈ 744 h/month, comfortably within the Free tier's 2,232 host hours per the [product page](https://grafana.com/products/cloud/database-observability/)) — confirm how "host" is counted for in-cluster databases.
5. The docs advise against connecting Alloy through poolers/load balancers; whether a standard Kubernetes ClusterIP Service in front of a single Postgres pod counts as acceptable is not addressed explicitly (the official Helm example itself uses the Service DNS name, so it evidently is).
