output "gateway_namespace" {
  description = "Namespace of the `external` Gateway, for the shop chart's HTTPRoute parentRef."
  value       = kubernetes_namespace_v1.gateway.metadata[0].name
}

output "gateway_name" {
  description = "Name of the `external` Gateway, for the shop chart's HTTPRoute parentRef."
  value       = "external"
}

output "shop_hostname" {
  description = "Public hostname the Gateway's HTTPS listener and shop-tls-cert Certificate are issued for."
  value       = local.shop_hostname
}

output "cnpg_cluster_name" {
  description = "Name of the CNPG Cluster CR (also the prefix of its generated Service names, e.g. `<name>-rw`)."
  value       = "shop-db"
}

output "cnpg_app_secret_name" {
  description = <<-EOT
    Name of the CNPG-managed Secret holding the `shop` app database's connection credentials
    (username, password, dbname, host, port, uri, jdbc-uri keys), in the `shop` namespace.
  EOT
  # CNPG's own naming for the auto-generated app secret: <cluster>-app.
  value       = "shop-db-app"
}

output "cnpg_rw_service" {
  description = "DNS name of the CNPG cluster's read-write Service, in the `shop` namespace."
  value       = "shop-db-rw.${local.shop_namespace}.svc.cluster.local"
}

# Derived from the k8s-monitoring chart's Alloy naming convention (`<release-name>-<collector-name>`,
# verified against the chart's `collector.alloy.fullname` template) rather than a chart output, since
# the chart has none. Confirm against `kubectl get svc -n monitoring` after the first apply.
output "alloy_otlp_grpc_endpoint" {
  description = "OTLP gRPC endpoint the shop app should point OTEL_EXPORTER_OTLP_ENDPOINT at."
  value       = "http://k8s-monitoring-alloy-metrics.${local.monitoring_namespace}.svc.cluster.local:4317"
}

output "alloy_otlp_http_endpoint" {
  description = "OTLP HTTP endpoint, if the shop app's OTel SDK is configured for HTTP instead of gRPC."
  value       = "http://k8s-monitoring-alloy-metrics.${local.monitoring_namespace}.svc.cluster.local:4318"
}
