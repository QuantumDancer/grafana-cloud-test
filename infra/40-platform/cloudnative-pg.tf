# PostgreSQL lives in the Platform layer, not the shop application chart, because the k8s-monitoring
# Database Observability integration (k8s-monitoring.tf) needs a stable service/secret to point at
# that exists independently of the shop app's own lifecycle — redeploying the shop chart shouldn't
# tear down the database or interrupt its monitoring. A single instance (no HA replica) is enough
# for this ephemeral test stack; there's nothing here that needs to survive a node loss.
resource "kubernetes_namespace_v1" "shop" {
  metadata {
    name = local.shop_namespace
  }
}

resource "helm_release" "cloudnative_pg" {
  name       = "cloudnative-pg"
  repository = "https://cloudnative-pg.github.io/charts"
  chart      = "cloudnative-pg"
  version    = "0.29.0" # operator 1.30.0, supports PostgreSQL 14-18; verified via `helm search repo cnpg/cloudnative-pg`
  namespace  = "cnpg-system"

  create_namespace = true
  # `crds.create` (default true, left implicit here) installs the operator's own CRDs
  # (Cluster, Pooler, ...), verified from the chart's default values.
}

# The db-o11y monitoring user's password. Generated rather than left to a variable because nothing
# outside this component ever needs to type it in — it only flows from here into the bootstrap SQL
# below and the Secret that k8s-monitoring's Database Observability integration reads.
resource "random_password" "db_o11y" {
  length  = 32
  special = false
}

# Both bootstrap SQL hooks below run as the PostgreSQL superuser during cluster bootstrap, which is
# what lets us set up a second role beyond the `owner` CNPG's `initdb` bootstrap creates
# automatically. They differ in which database the superuser is connected to, and that difference
# is load-bearing — see the two lists in `bootstrap.initdb`. Per CNPG's own docs, treat both with
# care: a mistake here breaks bootstrap for the whole cluster.
resource "kubectl_manifest" "shop_db" {
  server_side_apply = true
  # postInitSQL interpolates the db-o11y password — keep it out of plan output. That is also why the
  # `CREATE USER ... PASSWORD` statement has to stay in `postInitSQL` specifically: `sensitive_fields`
  # names that one field, so the same statement moved into any sibling list would put the generated
  # password straight into plan output. postInitApplicationSQL carries no secret and is deliberately
  # not listed here.
  sensitive_fields = ["spec.bootstrap.initdb.postInitSQL"]
  yaml_body = yamlencode({
    apiVersion = "postgresql.cnpg.io/v1"
    kind       = "Cluster"
    metadata = {
      name      = "shop-db"
      namespace = kubernetes_namespace_v1.shop.metadata[0].name
    }
    spec = {
      instances = 1

      storage = {
        size         = "10Gi"
        storageClass = kubernetes_storage_class_v1.auto_ebs_gp3.metadata[0].name
      }

      # Real requests, not just "whatever's free": on the first live run the whole
      # stack landed on one 2-vCPU node, and CPU starvation made the instance
      # manager miss its API lease renewals — CNPG's primary then self-fenced
      # (repeated "Failed to renew lease" → "Shutting down instance" cycles).
      # Requests also drive EKS Auto Mode's scale-out, so sizing them honestly
      # spreads the stack across nodes.
      resources = {
        requests = {
          cpu    = "500m"
          memory = "1Gi"
        }
        limits = {
          memory = "1Gi"
        }
      }

      # No `imageName`: leaves the operator's own default PostgreSQL image (currently major
      # version 18) in place rather than pinning a tag we'd have to keep in sync by hand.
      bootstrap = {
        initdb = {
          database = "shop"
          owner    = "shop"
          # No explicit `secret`: naming one tells CNPG to USE a pre-existing secret
          # (first live apply failed with CreateContainerConfigError on the initdb pod
          # because none existed). Left unset, the operator generates `<cluster>-app`
          # (shop-db-app) with username/password plus ready-made jdbc-uri/uri keys.
          postInitSQL = [
            "CREATE USER \"db-o11y\" WITH PASSWORD '${random_password.db_o11y.result}'",
            "GRANT pg_monitor TO \"db-o11y\"",
            "GRANT pg_read_all_stats TO \"db-o11y\"",
          ]
          # Database Observability's explain plans need the same privileges PostgreSQL would need to
          # run the query itself, so `db-o11y` needs SELECT on the application's tables; the two
          # statistics roles above cover none of that. Three things about this list are easy to get
          # wrong and worth spelling out:
          #
          # - It is `postInitApplicationSQL`, not a fourth entry in `postInitSQL`. CNPG runs
          #   `postInitSQL` connected to the `postgres` maintenance database, where these grants
          #   would silently apply to that database's own (empty) `public` schema and never reach
          #   the app's tables. `postInitApplicationSQL` runs against the application database
          #   `shop`, which is where schema-scoped grants have to land.
          # - `FOR ROLE "shop"` is what makes the third statement work at all. Bootstrap happens
          #   before Flyway migrates, so no application table exists yet — the second statement is a
          #   no-op on a fresh cluster and is kept only so this list states the full intent (and
          #   matches the statements applied out-of-band to the already-running cluster). All the
          #   real work is the default-privileges entry, and default privileges attach to the role
          #   that creates the objects. Flyway connects as `shop`, so without `FOR ROLE "shop"` the
          #   entry would only cover objects the superuser creates and every migrated table would
          #   come out unreadable again.
          # - Giving a monitoring role a full read of the application's data is a genuine widening
          #   of its blast radius, accepted at triage because every row in this stack is synthetic —
          #   not because SELECT is somehow harmless. Keep it at exactly these three statements: no
          #   GRANT ALL, no ownership change, no `pg_read_all_data`, nothing outside schema `public`.
          postInitApplicationSQL = [
            "GRANT USAGE ON SCHEMA public TO \"db-o11y\"",
            "GRANT SELECT ON ALL TABLES IN SCHEMA public TO \"db-o11y\"",
            "ALTER DEFAULT PRIVILEGES FOR ROLE \"shop\" IN SCHEMA public GRANT SELECT ON TABLES TO \"db-o11y\"",
          ]
        }
      }

      # Database Observability prerequisites (see docs/research/grafana-cloud-database-observability.md):
      # setting `pg_stat_statements.*` parameters makes the operator both add pg_stat_statements to
      # `shared_preload_libraries` and run `CREATE EXTENSION IF NOT EXISTS pg_stat_statements` on
      # every database that accepts connections — no separate postInitSQL/extension step needed.
      # `compute_query_id` and `track_activity_query_size` are the two further GUCs Database
      # Observability's setup guide requires.
      postgresql = {
        parameters = {
          "pg_stat_statements.track"  = "all"
          "compute_query_id"          = "on"
          "track_activity_query_size" = "4096"
        }
      }
    }
  })

  depends_on = [helm_release.cloudnative_pg, kubernetes_storage_class_v1.auto_ebs_gp3]
}

# k8s-monitoring's PostgreSQL integration needs its own Secret (chart convention: `username`/
# `password` keys) rather than reading the db-o11y credentials out of SQL directly, since Alloy
# must connect directly to PostgreSQL with the DSN built from this Secret.
resource "kubernetes_secret_v1" "db_o11y_credentials" {
  metadata {
    name      = "shop-db-o11y-credentials"
    namespace = kubernetes_namespace_v1.shop.metadata[0].name
  }

  data = {
    username = "db-o11y"
    password = random_password.db_o11y.result
  }

  type = "Opaque"
}
