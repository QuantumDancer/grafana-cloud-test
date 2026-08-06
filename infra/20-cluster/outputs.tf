output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "cluster_certificate_authority_data" {
  value = module.eks.cluster_certificate_authority_data
}

output "kubeconfig_command" {
  description = "Run this to talk to the cluster with kubectl"
  value       = "aws eks update-kubeconfig --region ${local.network.aws_region} --name ${module.eks.cluster_name}${local.network.aws_profile != null ? " --profile ${local.network.aws_profile}" : ""}"
}
