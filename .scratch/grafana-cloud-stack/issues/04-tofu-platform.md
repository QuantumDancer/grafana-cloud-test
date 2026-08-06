# Tofu component: 40-platform

Status: ready-for-agent
Blocked by: 02, 03

helm/kubernetes providers with exec auth (`aws eks get-token`), pattern from
idp-terraform-aws-infra. In-component ordering via depends_on:
1. cert-manager (chart) + `letsencrypt` ClusterIssuer (DNS-01, Cloudflare token from tfvars
   → Secret) — crib from idp-argocd-platform-apps/charts/cert-manager-config.
2. Envoy Gateway chart + GatewayClass + `Gateway` (namespace `gateway`) with HTTPS listener,
   `Certificate` for shop.rottlr.de.
3. external-dns chart (Cloudflare provider; sources gateway-httproute,service).
4. CNPG operator chart; PostgreSQL `Cluster` CR (latest stable PG): `pg_stat_statements`,
   `compute_query_id=on`, `track_activity_query_size=4096`; app database `shop` + owner user;
   `db-o11y` monitoring user with `pg_monitor`; secrets for both.
5. k8s-monitoring chart v4: clusterMetrics, clusterEvents, podLogs, applicationObservability
   (OTLP), integrations.postgresql with databaseObservability enabled, destinations from
   30-grafana-cloud token outputs. Values via templatefile/yamlencode per prior art.

Done: fresh `start.sh` run yields Ready gateway with valid LE cert, DNS record for
shop.rottlr.de, healthy CNPG cluster, Alloy pods shipping to Grafana Cloud
(Kubernetes Monitoring shows the cluster).
