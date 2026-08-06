# Stack-realm access policy + token for the SM installation itself
# (`metrics_publisher_key`) — scopes are exactly what the resource's own
# schema/example document (research doc §2, provider install example),
# not a guess.
resource "grafana_cloud_access_policy" "sm_metrics_publish" {
  provider = grafana.cloud

  region       = var.grafana_cloud_region
  name         = "metric-publisher-for-sm"
  display_name = "Synthetic Monitoring metrics publisher"

  scopes = ["stacks:read", "metrics:write", "logs:write", "traces:write"]

  realm {
    type       = "stack"
    identifier = data.grafana_cloud_stack.this.id
  }
}

resource "grafana_cloud_access_policy_token" "sm_metrics_publish" {
  provider = grafana.cloud

  region           = var.grafana_cloud_region
  access_policy_id = grafana_cloud_access_policy.sm_metrics_publish.policy_id
  name             = "metric-publisher-for-sm"
}

resource "grafana_synthetic_monitoring_installation" "this" {
  provider = grafana.cloud

  stack_id              = data.grafana_cloud_stack.this.id
  metrics_publisher_key = grafana_cloud_access_policy_token.sm_metrics_publish.token
}

# Aliased provider built from the installation's generated token — see
# frontend-observability.tf for the shared destroy-ordering caveat.
provider "grafana" {
  alias           = "sm"
  sm_access_token = grafana_synthetic_monitoring_installation.this.sm_access_token
  sm_url          = grafana_synthetic_monitoring_installation.this.stack_sm_api_url
}

data "grafana_synthetic_monitoring_probes" "main" {
  provider   = grafana.sm
  depends_on = [grafana_synthetic_monitoring_installation.this]
}

# (a) HTTP check on the shop's health endpoint from two probes near
# Frankfurt (the demo stack's home region). At 300s/probe this is
# (2 probes) * (30 * 24 * 3600 / 300) executions/month ~= 17.3k API
# executions — comfortably inside the free tier's shared 100k/month pool
# even alongside the browser check below (research doc §"Pricing / free
# tier").
resource "grafana_synthetic_monitoring_check" "shop_health" {
  provider = grafana.sm

  job       = "shop-health"
  target    = "https://shop.rottlr.de/api/health"
  enabled   = true
  frequency = 300000 # ms; schema is milliseconds, not seconds (verified against synthetic_monitoring_check schema)
  probes = [
    data.grafana_synthetic_monitoring_probes.main.probes.Frankfurt,
    data.grafana_synthetic_monitoring_probes.main.probes.Paris,
  ]
  labels = {
    app = "spyglass"
  }

  settings {
    http {
      method = "GET"
    }
  }
}

# (b) Browser check exercising the shop's homepage from a single probe.
# At 900s/probe this is 30*24*3600/900 = 2880 browser executions/month —
# well under the free tier's 10k/month browser-execution pool, leaving
# headroom alongside k6 Cloud's occasional manual browser-VU runs (which
# burn k6 VUh, a separate free-tier pool, at 10x protocol-VU rate).
resource "grafana_synthetic_monitoring_check" "shop_homepage_browser" {
  provider = grafana.sm

  job       = "shop-homepage-browser"
  target    = "https://shop.rottlr.de"
  enabled   = true
  frequency = 900000 # ms
  probes = [
    data.grafana_synthetic_monitoring_probes.main.probes.Frankfurt,
  ]
  labels = {
    app = "spyglass"
  }

  settings {
    browser {
      script = file("${path.module}/checks/browser-check.js")
    }
  }
}
