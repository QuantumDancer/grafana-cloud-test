# Consumed by 40-platform (via `data.terraform_remote_state.grafana_cloud`)
# to populate the k8s-monitoring Helm chart's `destinations` map, and by
# shell scripts via `tofu output` for ad-hoc checks (e.g. `k6 cloud`, which
# reads the k6 project id to know where to push a manual run).
output "stack_id" {
  description = "Grafana Cloud stack id."
  value       = data.grafana_cloud_stack.this.id
}

# Provider attribute is `prometheus_*` but the underlying instance is Mimir;
# kept as `prometheus_*` here to match both the provider's naming and the
# k8s-monitoring chart's own `destinations.<name>.url` remote_write target.
output "prometheus_remote_write_url" {
  description = "Prometheus (Mimir) remote_write endpoint for the stack."
  value       = data.grafana_cloud_stack.this.prometheus_remote_write_endpoint
}

output "prometheus_username" {
  description = "Basic-auth username (instance/user id) for the Prometheus remote_write endpoint."
  value       = data.grafana_cloud_stack.this.prometheus_user_id
}

# Provider attribute is `logs_*`; underlying instance is Loki.
output "loki_url" {
  description = "Loki push endpoint for the stack."
  value       = data.grafana_cloud_stack.this.logs_url
}

output "loki_username" {
  description = "Basic-auth username (instance/user id) for the Loki push endpoint."
  value       = data.grafana_cloud_stack.this.logs_user_id
}

output "otlp_url" {
  description = "OTLP endpoint for the stack (metrics+logs+traces via a single OTLP destination, an alternative to the split prometheus/loki/tempo endpoints above)."
  value       = data.grafana_cloud_stack.this.otlp_url
}

output "tempo_url" {
  description = "Tempo (traces) endpoint for the stack. Per the provider docs, append /tempo when wiring this as a Grafana Tempo data source."
  value       = data.grafana_cloud_stack.this.traces_url
}

output "tempo_username" {
  description = "Basic-auth username (instance/user id) for the Tempo endpoint."
  value       = data.grafana_cloud_stack.this.traces_user_id
}

output "destinations_token" {
  description = "Access-policy token (metrics:write, logs:write, traces:write) for the k8s-monitoring chart's destinations."
  value       = grafana_cloud_access_policy_token.destinations.token
  sensitive   = true
}

output "faro_collector_endpoint" {
  description = "Faro Web SDK collector endpoint for the \"spyglass\" Frontend Observability app."
  value       = grafana_frontend_o11y_app.spyglass.collector_endpoint
}

output "k6_project_id" {
  description = "k6 Cloud project id for the \"spyglass\" project — read by `k6 cloud`/scripts to target manual load-test runs."
  value       = grafana_k6_project.spyglass.id
}
