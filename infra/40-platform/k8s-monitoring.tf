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

      # Scrapes the OpenCost deployed below and keeps its ~25-metric allow-list, which is what
      # backs the Kubernetes Monitoring app's Cost tab. Note this is the *scrape* half only —
      # `telemetryServices.opencost` is the half that deploys the workload, and the two blocks
      # confusingly both have an `opencost` key underneath them.
      costMetrics = {
        enabled   = true
        collector = "alloy-metrics"
      }

      # Chart v4 never deploys telemetry services implicitly ("no silent deployments"):
      # clusterMetrics validates that kube-state-metrics/node-exporter exist, and fails
      # the install unless they're either deployed here or label-matched to existing ones.
      telemetryServices = {
        "kube-state-metrics" = {
          deploy = true
        }
        "node-exporter" = {
          deploy = true
        }

        # OpenCost derives per-workload cost by *querying* metrics back out of Grafana Cloud
        # rather than reading them from the cluster, so it needs the read scope 30-grafana-cloud
        # now grants (see destinations.tf there for why the push token was widened rather than a
        # second token minted). On EKS it needs no AWS billing integration: it reads
        # node.spec.providerID, detects AWS, and pulls public on-demand pricing unaided — which
        # means costs are list prices even where the nodes are actually spot.
        opencost = {
          deploy = true
          # Ties OpenCost to the destination above, which makes the chart wire the query URL's
          # credentials from that destination's own generated Secret. The alternative
          # ("custom") would mean hand-rolling a Secret here.
          metricsSource = "grafanaCloudPrometheus"

          # The nesting is real, not a typo: `telemetryServices` aliases the telemetry-services
          # subchart, which declares upstream's `opencost` chart as a dependency, so upstream's
          # own values sit one level deeper.
          opencost = {
            exporter = {
              # The chart validates this equals cluster.name. It also sets
              # CURRENT_CLUSTER_ID_FILTER_ENABLED, so every OpenCost query is filtered by
              # cluster="<this>" — a mismatch here makes OpenCost silently see an empty cluster.
              defaultClusterId = local.cluster_name
            }
            prometheus = {
              # Credentials are not inline here; the chart requires naming the Secret it
              # generates for the grafanaCloudPrometheus destination, whose name it derives as
              # <lowercased destination key>-<release name>. It validates the value, so a wrong
              # name fails the install with the expected one rather than failing at runtime.
              existingSecretName = "grafanacloudprometheus-k8s-monitoring"
              external = {
                url = local.gc.prometheus_query_url
              }
            }
          }
        }
      }

      clusterEvents = {
        enabled   = true
        collector = "alloy-metrics"
      }

      # Stays enabled by default: it is the only log source for every workload that carries no
      # OTel SDK — Postgres, Alloy itself, cert-manager, the load generator, the browser loop —
      # none of which would cooperate with an opt-in scheme.
      podLogsViaLoki = {
        enabled   = true
        collector = "alloy-logs"

        # The one place ADR-0004's "one ingestion path per signal" rule is enforced: a workload
        # that ships its own logs over OTLP declares so with `telemetry.rottlr.de/logs: otlp` on
        # its pod template, and this rule stops the scraper from ingesting the same lines a
        # second time under a second identity. Currently claimed by the backend only
        # (`charts/shop/templates/backend-deployment.yaml`). Do not fold this key into the
        # `resource.opentelemetry.io/service.name` annotation sitting right beside it there,
        # tempting as the saved line is — ADR-0004 has the argument, and OTel Python is the
        # case that breaks it.
        #
        # TODO(drift): nothing detects a workload that quietly reacquires both paths — Adaptive
        # Logs has no concept of duplication and Loki's dedup never collapses two differently
        # shaped copies. ADR-0004 calls for a Loki alert on this; the cheap form is asserting
        # that `{namespace="shop", container="backend"}` stays empty. Not built yet.
        #
        # `extraDiscoveryRules` is raw Alloy appended verbatim to the end of
        # `discovery.relabel "filtered_pods"`, so this runs after the chart's own rules and the
        # annotation name arrives escaped the Prometheus way: `-`, `.` and `/` all become `_`.
        # Alloy anchors relabel regexes, so this matches the value `otlp` and nothing else.
        extraDiscoveryRules = <<-EOT
          rule {
            source_labels = ["__meta_kubernetes_pod_annotation_telemetry_rottlr_de_logs"]
            regex         = "otlp"
            action        = "drop"
          }
        EOT
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
    kubectl_manifest.shop_db,
    kubernetes_secret_v1.db_o11y_credentials,
  ]
}
