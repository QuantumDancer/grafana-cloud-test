# DB node shows the k8s Service name; spans use pre-stable semconv attributes

Status: ready-for-agent

Three symptoms, one attribute problem on the backend's JDBC spans.

## Symptom 1 — the database renders as `shop-db-rw.shop`

App O11y's Outbound + Databases panel names the node after the Kubernetes Service DNS
name instead of the database. Classification is already correct — `connection_type=database`
is derived from `db.system`, which we do emit.

Cause: Tempo's service-graph processor resolves a database peer name in the order
`peer.service` → `server.address` → `network.peer.address:port` → `db.namespace` →
`db.name`. Our spans carry `server.address=shop-db-rw.shop` but **no `peer.service`**, so
resolution stops at position two and never reaches `db.name=shop`. Confirmed absent
stack-wide: TraceQL probes for `span.peer.service`, `span.db.namespace` and
`span.db.query.text` each return `{"traces": []}`, and Tempo's tag list for the whole
stack has none of them.

## Symptom 2 — every N+1 child span is named `SELECT shop`

Issue 10's N+1 waterfall works, but its 44 sibling spans all read `SELECT shop` rather
than `SELECT shop.order_items` / `SELECT shop.products`, so the two-level fanout is
invisible. Cause: Alloy runs `set_semconv_span_name("1.37.0", "original_span_name")`
(`k8s-monitoring-alloy-metrics` ConfigMap, `otelcol.processor.transform "default"`, line
109). The 1.37 naming rule looks for `db.query.summary`/`db.collection.name`; our spans
carry the pre-stable `db.statement`/`db.sql.table`, so the rule degrades the name. The
original is preserved in the `original_span_name` attribute.

## Symptom 3 — trace→query linking cannot work

Database identity is recoverable (`db.system=postgresql`, `server.address`, `server.port`,
`db.name=shop`), but the query half is not: no `db.query.text`, no `db.query.summary`, no
digest of any kind. The only candidate is `db.statement`, under a legacy key that
current-semconv linking would not read.

Separately unresolved: no public Grafana Cloud documentation describing a span →
query-sample link could be found — the documented DB O11y workflow starts from the
Queries Overview, not from a trace. So issue 10's "trace→query linking" item may be
**unverifiable rather than failing**. Our spans would not satisfy a current-semconv
implementation regardless, so this change is a prerequisite either way.

## Fix — two env vars in `charts/shop/templates/backend-deployment.yaml`

Alongside the existing OTel env (lines 47-52), driven by new keys in the `otel:` block of
`charts/shop/values.yaml:90`:

    - name: OTEL_INSTRUMENTATION_COMMON_PEER_SERVICE_MAPPING
      value: "shop-db-rw.shop:5432=shop-db"

    - name: OTEL_SEMCONV_STABILITY_OPT_IN
      value: "database/dup"

`peer.service` is first in the resolution order, so the node becomes `shop-db`. Use
exactly `shop-db` — that is the instance name Database Observability already registers
(`infra/40-platform/k8s-monitoring.tf:126`), so the two products agree.

The semconv opt-in maps `db.system→db.system.name`, `db.name→db.namespace`,
`db.statement→db.query.text`, `db.operation→db.operation.name`,
`db.sql.table→db.collection.name` and adds `db.query.summary` — fixing symptoms 2 and 3
together. Mirror it as a default in `apps/backend/Dockerfile` (near lines 35-38) so local
runs match.

**Use `database/dup`, not bare `database`, at least first.** The bare value *removes*
`db.system`, and `connection_type=database` is derived from it — so if Grafana Cloud's
generator does not yet accept `db.system.name`, the node would lose its database
classification entirely. `/dup` emits both and is the safe rollout.

Done: the DB node reads `shop-db`; N+1 child spans read `SELECT order_items` /
`SELECT products`.

## Comments

2026-08-07: Filed from the issue-10 validation session, from a real span dump on trace
`a835d5c3b2d1c231c986f1a14651b059`. Inferred but not verified: that Grafana Cloud's
hosted metrics-generator uses the same peer-resolution order as OSS Tempo. The observed
`server="shop-db-rw.shop"` is exactly what that order predicts.
