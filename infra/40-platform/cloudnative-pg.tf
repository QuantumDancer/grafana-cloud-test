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

# `postInitSQL` runs as the PostgreSQL superuser during cluster bootstrap, so it's the only place
# we can create a second role beyond the `owner` CNPG's `initdb` bootstrap creates automatically.
# Per CNPG's own docs, treat this with care: a mistake here breaks bootstrap for the whole cluster.
resource "kubectl_manifest" "shop_db" {
  server_side_apply = true
  # postInitSQL interpolates the db-o11y password — keep it out of plan output.
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
