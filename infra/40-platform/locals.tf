locals {
  aws_region = data.terraform_remote_state.network.outputs.aws_region
  # The AWS CLI profile used for local/CI runs is optional in 10-network's contract; when absent,
  # `aws eks get-token` falls through to the ambient credential chain (env vars, instance role, ...).
  aws_profile = try(data.terraform_remote_state.network.outputs.aws_profile, "")

  cluster_name     = data.terraform_remote_state.cluster.outputs.cluster_name
  cluster_endpoint = data.terraform_remote_state.cluster.outputs.cluster_endpoint
  cluster_ca       = base64decode(data.terraform_remote_state.cluster.outputs.cluster_certificate_authority_data)

  gc = data.terraform_remote_state.grafana_cloud.outputs

  # Namespaces created by this component, named up front so every resource file agrees on them.
  gateway_namespace    = "gateway"
  shop_namespace       = "shop"
  monitoring_namespace = "monitoring"

  # The public hostname the shop app is exposed on; also the cert-manager Certificate's DNS name.
  shop_hostname = "shop.rottlr.de"
}
