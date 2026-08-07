variable "grafana_cloud_access_policy_token" {
  description = <<-EOT
    Portal-level Grafana Cloud access-policy token, created once by hand in
    the Cloud Portal (Administration > Access Policies) and supplied via
    terraform.auto.tfvars. Required scopes (union of everything this
    component provisions with it — see terraform.tfvars.example for the
    breakdown by resource): stacks:read|write, accesspolicies:read|write|delete,
    stack-service-accounts:write, subscriptions:read, orgs:read.
  EOT
  type        = string
  sensitive   = true
}

variable "stack_slug" {
  description = "Slug of the pre-existing, long-lived Grafana Cloud stack this component configures. The stack itself is never created/destroyed here."
  type        = string
}

variable "grafana_cloud_region" {
  description = <<-EOT
    Region for Cloud Access Policy management (the `region` argument on
    grafana_cloud_access_policy/_token), e.g. "prod-eu-west-3". This is the
    account's Access Policy API region, NOT the stack's own instance
    region_slug (e.g. "eu") returned by data.grafana_cloud_stack — the two
    happen to usually correspond but are documented as separate concepts.
    Check the exact value under Access Policies > Create in the portal.
  EOT
  type        = string
  # This account's stack and all its existing access policies live in
  # prod-eu-west-2 (verified in the portal, 2026-08-06) — new policies must be
  # created in the same region as the resources they grant access to.
  default = "prod-eu-west-2"
}

variable "grafana_user" {
  description = "Grafana Cloud user (login/email) used as the acting user for the k6 App installation (grafana_k6_installation.grafana_user)."
  type        = string
}
