# k6 needs a stack-scoped Grafana service account (NOT a Cloud access
# policy) to install the App — this is a deviation from the brief, which
# expected an access-policy/token pair like the SM and Frontend O11y
# integrations. The provider's own grafana_k6_installation example uses the
# portal-level cloud_access_policy_token directly (var.grafana_cloud_access_policy_token,
# already in scope via the "cloud" provider alias) plus a service-account
# token; there is no separate k6-specific access policy resource.
resource "grafana_cloud_stack_service_account" "k6" {
  provider = grafana.cloud

  stack_slug  = var.stack_slug
  name        = "${var.stack_slug}-k6-app"
  role        = "Admin"
  is_disabled = false
}

resource "grafana_cloud_stack_service_account_token" "k6" {
  provider = grafana.cloud

  stack_slug         = var.stack_slug
  name               = "${var.stack_slug}-k6-app-token"
  service_account_id = grafana_cloud_stack_service_account.k6.id
}

resource "grafana_k6_installation" "this" {
  provider = grafana.cloud

  cloud_access_policy_token = var.grafana_cloud_access_policy_token
  stack_id                  = data.grafana_cloud_stack.this.id
  grafana_sa_token          = grafana_cloud_stack_service_account_token.k6.key
  grafana_user              = var.grafana_user
}

# Aliased provider built from the installation's generated token — see
# frontend-observability.tf for the shared destroy-ordering caveat on this
# provider-config-from-resource-output pattern.
provider "grafana" {
  alias           = "k6"
  stack_id        = data.grafana_cloud_stack.this.id
  k6_access_token = grafana_k6_installation.this.k6_access_token
}

resource "grafana_k6_project" "spyglass" {
  provider = grafana.k6

  name = "spyglass"
}

resource "grafana_k6_load_test" "shop_load" {
  provider = grafana.k6

  project_id = grafana_k6_project.spyglass.id
  name       = "shop-load"
  # Deliberately no grafana_k6_schedule: occasional runs stay manual via
  # `k6 cloud` per the brief — Terraform can define/destroy the test but has
  # no resource for triggering an ad-hoc run (research doc §1.4).
  script = file("${path.module}/../../load/k6/shop-load.js")
}
