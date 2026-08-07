# Database Observability explain plans fail — `db-o11y` cannot read the app tables

Status: ready-for-agent

Clicking explain plan returns "Explain plan not available due to unrecoverable database
error. This query will not be retried." PostgreSQL requires the same privileges to
`EXPLAIN` a query as to execute it, and the collector's role holds none on our tables.

## Evidence

Reproduced directly against the live database:

    kubectl exec -n shop shop-db-1 -c postgres -- psql -d shop \
      -c 'SET ROLE "db-o11y"; EXPLAIN (FORMAT JSON) SELECT * FROM products WHERE name ILIKE '%widget%';'
    SET
    ERROR:  permission denied for table products

- `has_table_privilege('db-o11y','public.products','SELECT')` → `f` (schema USAGE → `t`).
- `db-o11y` is a member of `{pg_monitor, pg_read_all_stats}` only —
  `infra/40-platform/cloudnative-pg.tf:80-84`. All six tables are owned by `shop`; no
  grant to `db-o11y` exists anywhere.
- At scale: of 3946 `explain_plan_output` records in Loki over 3h, 2682 were
  `skipped/query denylisted`, 1164 `skipped/query contains reserved word`, and exactly
  **100 succeeded — every one a catalog query**. Of the 57 successful digests resolvable
  in `pg_stat_statements`, **zero** touch a user table.

The rest of the pipeline is healthy: the `database_observability.postgres "shop_db"`
component renders correctly (`k8s-monitoring.tf:121-168`), the singleton Alloy pod is
Running 2/2, `pg_stat_statements` v1.12 is installed with `compute_query_id=on`, and
`pg_stat_statements_*` metrics arrive in Grafana Cloud correctly labelled.

## Fix

Add to `postInitSQL` in `infra/40-platform/cloudnative-pg.tf:80-84`:

    GRANT USAGE ON SCHEMA public TO "db-o11y";
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO "db-o11y";
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO "db-o11y";

The third statement matters because Flyway creates the tables *after* bootstrap.

## Two things to weigh before applying

- **`postInitSQL` only runs at cluster bootstrap.** Adding it there does nothing for the
  currently running database — this needs a CNPG re-bootstrap (i.e. a fresh session), or
  the grants applied out-of-band once. Decide which; a fix that silently does nothing
  until the next `start.sh` is worse than no fix.
- **This is a real privilege expansion on a monitoring role.** It should be deliberate,
  not reflexive. Mitigating fact: the collector never issues `EXPLAIN ANALYZE`, so
  granting SELECT does not let it execute application queries — it only reads planner
  row estimates.

Done: an explain plan renders in DB O11y for a query against `products`.

## Comments

2026-08-07: Filed from the issue-10 validation session. The failure was reproduced
directly; the "will not be retried" wording matches a cached hard permission error, and
Alloy logs no explain-related error at all (inferred: the collector caches the failure).
