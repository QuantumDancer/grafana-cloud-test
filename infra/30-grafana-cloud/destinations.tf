# Stack-realm access policy + token for the k8s-monitoring Helm chart's
# `destinations` block (consumed by 40-platform via this component's
# outputs). Alloy itself only ever pushes (remote_write metrics, push logs,
# push traces), so the three write scopes cover the chart's own collectors.
#
# `metrics:read` is here for OpenCost, which the chart deploys as a telemetry
# service for cost metrics: it *queries* the metrics it needs for allocation
# back out of the destination rather than reading them from the cluster, and
# its startup validation runs a literal `up` query that fails the pod on a
# write-only credential. The chart's guided setup gives OpenCost the metrics
# destination's own generated Secret and validates that it did, so OpenCost
# cannot be handed a separately minted read token without dropping to
# `metricsSource: custom` and a hand-rolled Secret in 40-platform. Widening
# this policy is the cheaper trade for a disposable test stack; the cost is
# that the shared push token can also read every metric in the stack.
#
# Widening is safe in place: `scopes` is not ForceNew in the provider, and the
# token resource keys only off `access_policy_id`, so the token is not rotated
# and 40-platform needs no credential re-apply.
resource "grafana_cloud_access_policy" "destinations" {
  provider = grafana.cloud

  region       = var.grafana_cloud_region
  name         = "k8s-monitoring-destinations"
  display_name = "k8s-monitoring chart destinations"

  scopes = ["metrics:write", "metrics:read", "logs:write", "traces:write"]

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
