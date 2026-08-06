module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.0"

  name               = local.network.name
  kubernetes_version = var.kubernetes_version

  # Auto Mode's built-in node pools replace all node-group/Karpenter machinery:
  # "system" runs critical addons on dedicated capacity, "general-purpose" everything else.
  compute_config = {
    enabled    = true
    node_pools = ["general-purpose", "system"]
  }

  # The laptop running tofu is outside the VPC, so the API endpoint must be public.
  endpoint_public_access = true

  # Whoever applies this owns the throwaway cluster — no separate admin principal needed.
  enable_cluster_creator_admin_permissions = true

  vpc_id     = local.network.vpc_id
  subnet_ids = local.network.private_subnet_ids
}
