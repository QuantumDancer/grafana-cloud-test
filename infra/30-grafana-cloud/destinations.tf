# Stack-realm access policy + token for the k8s-monitoring Helm chart's
# `destinations` block (consumed by 40-platform via this component's
# outputs). The chart only ever pushes (remote_write metrics, push logs,
# push traces) — it never queries data back — so this token carries write-only
# scopes. (Deviation from the brief: the k8s-monitoring-helm chart docs
# researched don't spell out an exact scope list for its destinations token;
# write-only is the minimal set that satisfies a push-only client, verified
# against the same write scopes the provider's own sm_metrics_publish example
# uses for an analogous push-only integration.)
resource "grafana_cloud_access_policy" "destinations" {
  provider = grafana.cloud

  region       = var.grafana_cloud_region
  name         = "k8s-monitoring-destinations"
  display_name = "k8s-monitoring chart destinations"

  scopes = ["metrics:write", "logs:write", "traces:write"]

  realm {
    type       = "stack"
    identifier = data.grafana_cloud_stack.this.id
  }
}

resource "grafana_cloud_access_policy_token" "destinations" {
  provider = grafana.cloud

  region           = var.grafana_cloud_region
  access_policy_id = grafana_cloud_access_policy.destinations.policy_id
  name             = "k8s-monitoring-destinations"
}
