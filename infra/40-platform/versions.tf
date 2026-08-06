# 40-platform: the in-cluster Platform layer (cert-manager, ingress, DNS, database, and the
# Grafana Cloud collector) for the ephemeral Grafana Cloud test stack.
#
# This component only talks to Kubernetes (via helm/kubernetes providers with exec-plugin auth
# against the cluster built by 20-cluster) plus the local statefiles of the components that ran
# before it. It never touches the AWS API directly, so no `aws` provider is declared here.
terraform {
  required_version = ">= 1.8"

  required_providers {
    # v3 switched the provider's `kubernetes` config block to an object attribute
    # (`kubernetes = { ... }` instead of `kubernetes { ... }`) — see providers.tf.
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.2"
    }
    # v3 renamed most core resources to a `_v1` suffix (old names deprecated, not removed);
    # this component uses the new names throughout.
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 3.2"
    }
    # Only used to generate the db-o11y monitoring-user password; see cloudnative-pg.tf.
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "local" {}
}
