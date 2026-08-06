# grafana/k8s-monitoring v4 deploys the Grafana Alloy collectors that ship every signal from this
# cluster to Grafana Cloud: Kubernetes cluster metrics/events, pod logs, application traces/metrics/
# logs pushed by the shop app over OTLP, and PostgreSQL metrics + Database Observability data for
# the CNPG cluster. Every "feature block" below is independently off by default in the chart, so
# each one is explicitly enabled and pointed at the Grafana Cloud destinations from 30-grafana-cloud.
resource "kubernetes_namespace_v1" "monitoring" {
  metadata {
    name = local.monitoring_namespace
  }
}

resource "helm_release" "k8s_monitoring" {
  name       = "k8s-monitoring"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "k8s-monitoring"
  version    = "4.3.2" # latest v4 as of 2026-08; verified via `helm search repo grafana/k8s-monitoring`
  namespace  = kubernetes_namespace_v1.monitoring.metadata[0].name

  values = [
    yamlencode({
      cluster = {
        name = local.cluster_name
      }

      # v4 destinations are a map (name -> config), each entry with a `type`. All three below
      # share one basic-auth password (`destinations_token`) but have per-signal usernames, per
      # 30-grafana-cloud's contract (see data.tf).
      destinations = {
        grafanaCloudPrometheus = {
          type = "prometheus"
          url  = local.gc.prometheus_remote_write_url
          auth = {
            type     = "basic"
            username = local.gc.prometheus_username
            password = local.gc.destinations_token
          }
        }
        grafanaCloudLoki = {
          type = "loki"
          url  = local.gc.loki_url
          auth = {
            type     = "basic"
            username = local.gc.loki_username
            password = local.gc.destinations_token
          }
        }
        # Grafana Cloud's OTLP gateway only accepts OTLP/HTTP, not gRPC.
        grafanaCloudOtlp = {
          type     = "otlp"
          url      = local.gc.otlp_url
          protocol = "http"
          auth = {
            type     = "basic"
            username = local.gc.otlp_username
            password = local.gc.destinations_token
          }
          metrics = { enabled = true }
          logs    = { enabled = true }
          traces  = { enabled = true }
        }
      }

      # Three Alloy instances, split by workload shape rather than lumping everything onto one:
      #  - alloy-metrics: clustered, for the bulk of scrape/watch-based collection.
      #  - alloy-logs: a DaemonSet reading each node's log files, for pod logs.
      #  - alloy-singleton: exactly one replica, for polling integrations (PostgreSQL) where
      #    running more than one replica would just scrape the same target twice.
      collectors = {
        alloy-metrics = {
          presets = ["clustered"]
        }
        alloy-logs = {
          presets = ["filesystem-log-reader", "daemonset"]
        }
        alloy-singleton = {
          presets = ["singleton"]
        }
      }

      clusterMetrics = {
        enabled   = true
        collector = "alloy-metrics"
      }

      clusterEvents = {
        enabled   = true
        collector = "alloy-metrics"
      }

      podLogsViaLoki = {
        enabled   = true
        collector = "alloy-logs"
      }

      # Opens the OTLP gRPC/HTTP receivers the shop app's OTel SDK sends to (see outputs.tf for
      # the resulting Service DNS name/ports) and enriches incoming telemetry with Kubernetes
      # pod/namespace/workload metadata.
      applicationObservability = {
        enabled   = true
        collector = "alloy-metrics"
        receivers = {
          otlp = {
            grpc = { enabled = true }
            http = { enabled = true }
          }
        }
      }

      integrations = {
        collector = "alloy-singleton"
        postgresql = {
          instances = [
            {
              name = "shop-db"
              exporter = {
                dataSource = {
                  # CNPG names the primary's read-write Service "<cluster-name>-rw"; the Cluster CR
                  # is named "shop-db" in cloudnative-pg.tf.
                  host     = "shop-db-rw.${local.shop_namespace}.svc.cluster.local"
                  database = "shop"
                  # CNPG's default operand configuration expects TLS on client connections.
                  sslmode = "require"
                  # auth.username/password are left unset: with secret.create=false below, Alloy
                  # reads the "username"/"password" keys straight out of the existing Secret via
                  # usernameKey/passwordKey (both left at their defaults).
                }
                autoDiscovery = {
                  enabled = true
                }
                collectors = {
                  statStatements = {
                    enabled = true
                  }
                }
              }
              # Feeds Grafana Cloud Database Observability: query/schema/explain-plan collection
              # via Alloy's `database_observability.postgres` component, on top of the exporter
              # metrics above.
              databaseObservability = {
                enabled = true
              }
              secret = {
                create    = false
                name      = kubernetes_secret_v1.db_o11y_credentials.metadata[0].name
                namespace = local.shop_namespace
              }
              logs = {
                enabled = true
                labelSelectors = {
                  "cnpg.io/cluster" = "shop-db"
                }
              }
            }
          ]
        }
      }
    })
  ]

  depends_on = [
    kubernetes_manifest.shop_db,
    kubernetes_secret_v1.db_o11y_credentials,
  ]
}
