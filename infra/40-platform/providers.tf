# Both providers authenticate the same way: an exec plugin that shells out to `aws eks get-token`
# rather than a static `data.aws_eks_cluster_auth` token. A long `tofu apply` here installs six
# Helm releases plus several CRs; a static token grabbed once at the start of the run can expire
# (EKS tokens last 15 minutes) before the run finishes, so each provider call gets a fresh one.
locals {
  eks_get_token_args = concat(
    ["eks", "get-token", "--cluster-name", local.cluster_name, "--region", local.aws_region],
    local.aws_profile != "" ? ["--profile", local.aws_profile] : []
  )
}

provider "helm" {
  kubernetes = {
    host                   = local.cluster_endpoint
    cluster_ca_certificate = local.cluster_ca

    exec = {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = local.eks_get_token_args
    }
  }
}

provider "kubernetes" {
  host                   = local.cluster_endpoint
  cluster_ca_certificate = local.cluster_ca

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = local.eks_get_token_args
  }
}
