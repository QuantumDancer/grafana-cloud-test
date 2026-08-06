# Component 30: everything that lives inside the user's existing, long-lived
# Grafana Cloud stack. Never creates or destroys the stack itself (that's a
# manual one-time setup outside this repo) — only the access policies,
# tokens, and app installations that let 40-platform's k8s-monitoring chart,
# the React frontend, and manual k6/SM tooling talk to it.
terraform {
  required_version = ">= 1.8"

  required_providers {
    grafana = {
      source = "grafana/grafana"
      # Floor set by the research doc's version-floor findings: v4.32.0 fixed
      # non-deterministic `allowed_origins` ordering on grafana_frontend_o11y_app
      # (perpetual plan diffs below that), and v4.12.0 is where k6_schedule's
      # cron-expression support landed. Pinning to the ~>4.44 line (current
      # release verified 2026-08-06) stays comfortably above both floors.
      version = "~> 4.44"
    }
  }

  backend "local" {}
}
