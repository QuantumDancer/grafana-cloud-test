# Components communicate via local remote state, applied in order 10-network -> 20-cluster ->
# 30-grafana-cloud -> 40-platform (this component). Each `terraform_remote_state` data source just
# reads the referenced statefile; it has no bearing on init/validate (data sources aren't evaluated
# until plan), so `tofu validate` works even before the upstream components have been applied.
data "terraform_remote_state" "network" {
  backend = "local"
  config = {
    path = "${path.module}/../10-network/terraform.tfstate"
  }
}

data "terraform_remote_state" "cluster" {
  backend = "local"
  config = {
    path = "${path.module}/../20-cluster/terraform.tfstate"
  }
}

# CONTRACT with 30-grafana-cloud (built in parallel — see final report for the exact output names
# this component consumes, so the two components can be aligned):
#   stack_id                                         - Grafana Cloud stack identifier
#   prometheus_remote_write_url, prometheus_username - remote_write URL + basic-auth username
#   loki_url, loki_username                          - push URL + basic-auth username
#   otlp_url, otlp_username                          - OTLP gateway URL + basic-auth username
#   destinations_token (sensitive)                   - shared basic-auth password for all three
data "terraform_remote_state" "grafana_cloud" {
  backend = "local"
  config = {
    path = "${path.module}/../30-grafana-cloud/terraform.tfstate"
  }
}
