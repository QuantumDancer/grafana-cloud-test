output "vpc_id" {
  value = module.vpc.vpc_id
}

output "private_subnet_ids" {
  value = module.vpc.private_subnets
}

output "public_subnet_ids" {
  value = module.vpc.public_subnets
}

# Later components must use the same region/profile; exporting them here keeps the
# untracked tfvars needed only once, in this component.
output "aws_region" {
  value = var.aws_region
}

output "aws_profile" {
  value = var.aws_profile
}

output "name" {
  value = var.name
}
