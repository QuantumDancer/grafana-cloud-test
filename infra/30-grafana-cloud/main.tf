# The "cloud" alias drives every portal-level call in this component: stack
# lookup, access-policy/token issuance, the k6 App installation, and the
# Synthetic Monitoring installation all authenticate at the Grafana Cloud
# Portal level rather than against a specific Grafana instance.
provider "grafana" {
  alias                     = "cloud"
  cloud_access_policy_token = var.grafana_cloud_access_policy_token
}

# Source of truth for the stack's id plus every per-signal ingest endpoint
# (Prometheus remote-write, Loki, OTLP, Tempo) that 40-platform's
# k8s-monitoring chart destinations and the outputs below need. The stack
# already exists — this is a read, never a `grafana_cloud_stack` resource.
data "grafana_cloud_stack" "this" {
  provider = grafana.cloud
  slug     = var.stack_slug
}
