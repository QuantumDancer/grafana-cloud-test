# Two-token model (per the k6/SM pattern documented for this provider):
# a stack-realm access policy + token scoped to Frontend Observability
# authenticates a *second*, aliased provider instance, which is what the
# grafana_frontend_o11y_app resource actually uses. Provider config is built
# from a resource's own output (`.token`) — the documented "provider config
# from resource output" pattern for this provider's k6/SM/Frontend-O11y
# integrations. Destroy-ordering caveat: Terraform destroys resources that
# use the aliased provider (the app) before the token/policy the alias
# depends on, so ordinary destroys are fine; but there's no guarantee the
# provider's own client sees the token revoked mid-destroy if a partial
# apply/destroy is interrupted and resumed — undocumented failure mode,
# flagged once here and not repeated in the k6/SM files below.
resource "grafana_cloud_access_policy" "frontend_o11y" {
  provider = grafana.cloud

  region       = var.grafana_cloud_region
  name         = "frontend-o11y-spyglass"
  display_name = "Frontend Observability app management"

  scopes = ["frontend-observability:read", "frontend-observability:write", "frontend-observability:delete", "stacks:read"]

  realm {
    type       = "stack"
    identifier = data.grafana_cloud_stack.this.id
  }
}

resource "grafana_cloud_access_policy_token" "frontend_o11y" {
  provider = grafana.cloud

  region           = var.grafana_cloud_region
  access_policy_id = grafana_cloud_access_policy.frontend_o11y.policy_id
  name             = "frontend-o11y-spyglass"
}

provider "grafana" {
  alias = "frontend_o11y"
  # The resource needs both clients: the frontend-o11y API does the actual app
  # management, but the provider also resolves the stack through the Cloud API
  # and hard-errors without this token (found empirically on first apply).
  cloud_access_policy_token      = var.grafana_cloud_access_policy_token
  frontend_o11y_api_access_token = grafana_cloud_access_policy_token.frontend_o11y.token
}

# "spyglass" is this test project's frontend app name throughout Grafana
# Cloud (mirrored by the k6 project below) — origin is the shop's stable
# domain, not the cluster's ephemeral ALB hostname, so this needs no
# updating across cluster rebuilds (see the research doc's ALB-hostname
# discussion, which doesn't apply here since the domain is static).
resource "grafana_frontend_o11y_app" "spyglass" {
  provider = grafana.frontend_o11y

  stack_id        = data.grafana_cloud_stack.this.id
  name            = "spyglass"
  allowed_origins = ["https://shop.rottlr.de"]

  # Both required by the resource schema even though we don't need
  # per-signal attributes or non-default settings yet.
  extra_log_attributes = {}
  settings             = {}
}
