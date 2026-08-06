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
    # Custom-resource manifests (ClusterIssuer, Gateway, CNPG Cluster, ...) go through
    # kubectl_manifest instead of kubernetes_manifest: the latter validates GroupVersionKind
    # against the live API at PLAN time, which can never succeed when the CRDs are installed
    # by helm_releases in the same apply (found empirically on first apply).
    kubectl = {
      source  = "alekc/kubectl"
      version = "~> 2.1"
    }
    # Only used to generate the db-o11y monitoring-user password; see cloudnative-pg.tf.
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "local" {}
}
