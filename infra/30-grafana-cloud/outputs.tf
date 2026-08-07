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

# All *_username outputs are tostring()ed: the provider exposes these ids as
# numbers, and numbers above 1e6 survive tofu fine but come out of 40-platform's
# yamlencode() in scientific notation ("2.244577e+06") — which Grafana Cloud
# rejected live with 401 invalid authentication credentials. Strings encode
# verbatim.
output "prometheus_username" {
  description = "Basic-auth username (instance/user id) for the Prometheus remote_write endpoint."
  value       = tostring(data.grafana_cloud_stack.this.prometheus_user_id)
}

# Provider attribute is `logs_*`; underlying instance is Loki.
# The stack attribute is the bare host URL; the push path must be appended
# here because the k8s-monitoring chart's `loki` destination uses the URL
# verbatim (first live run: Alloy POSTed to the host root and got 405).
output "loki_url" {
  description = "Loki push endpoint for the stack (full /loki/api/v1/push path)."
  value       = "${data.grafana_cloud_stack.this.logs_url}/loki/api/v1/push"
}

output "loki_username" {
  description = "Basic-auth username (instance/user id) for the Loki push endpoint."
  value       = tostring(data.grafana_cloud_stack.this.logs_user_id)
}

# Same bare-host caveat as loki_url: the gateway serves OTLP under /otlp
# (i.e. /otlp/v1/traces etc.) and the chart uses this URL verbatim (first
# live run: 404 on /v1/* without the suffix).
output "otlp_url" {
  description = "OTLP/HTTP endpoint for the stack (metrics+logs+traces via a single OTLP destination), including the /otlp base path."
  value       = "${data.grafana_cloud_stack.this.otlp_url}/otlp"
}

# The OTLP gateway authenticates with the stack (instance) id as basic-auth username,
# unlike the per-signal endpoints which each have their own user id.
output "otlp_username" {
  description = "Basic-auth username for the OTLP endpoint (the stack id)."
  value       = tostring(data.grafana_cloud_stack.this.id)
}

output "tempo_url" {
  description = "Tempo (traces) endpoint for the stack. Per the provider docs, append /tempo when wiring this as a Grafana Tempo data source."
  value       = data.grafana_cloud_stack.this.traces_url
}

output "tempo_username" {
  description = "Basic-auth username (instance/user id) for the Tempo endpoint."
  value       = tostring(data.grafana_cloud_stack.this.traces_user_id)
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

# The three values CI's source-map upload step needs (frontend.yml):
# FARO_SOURCEMAP_ENDPOINT / FARO_APP_ID repo variables + FARO_SOURCEMAP_TOKEN
# secret (FARO_STACK_ID is the stack_id output above). The API host is
# derived from the stack region — it's a different host from the collector
# endpoint (faro-api vs faro-collector) and the provider doesn't expose it
# as a resource attribute.
output "faro_sourcemap_endpoint" {
  description = "Faro source-map API endpoint for faro-cli uploads — CI's FARO_SOURCEMAP_ENDPOINT repository variable."
  value       = "https://faro-api-${var.grafana_cloud_region}.grafana.net/faro/api/v1"
}

output "faro_app_id" {
  description = "Frontend Observability app id for \"spyglass\" — CI's FARO_APP_ID repository variable."
  value       = tostring(grafana_frontend_o11y_app.spyglass.id)
}

output "faro_sourcemap_token" {
  description = "frontend-o11y access-policy token — CI's FARO_SOURCEMAP_TOKEN repository secret."
  value       = grafana_cloud_access_policy_token.frontend_o11y.token
  sensitive   = true
}

output "k6_project_id" {
  description = "k6 Cloud project id for the \"spyglass\" project — read by `k6 cloud`/scripts to target manual load-test runs."
  value       = grafana_k6_project.spyglass.id
}
