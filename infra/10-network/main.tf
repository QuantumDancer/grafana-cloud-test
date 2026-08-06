data "aws_availability_zones" "available" {
  state = "available"
}

# Two AZs are enough for a throwaway cluster: EKS requires at least two subnets in
# different AZs, and a third only buys resilience this stack doesn't need.
locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.0"

  name = var.name
  cidr = var.vpc_cidr

  azs             = local.azs
  private_subnets = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 4, i)]
  public_subnets  = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 4, i + 8)]

  # A single managed NAT gateway, deviating from the prior project's fck-nat instance:
  # sessions last hours, so the ~EUR 0.05/h premium is cents while removing a hand-rolled
  # component from every spin-up. Egress through it is only image pulls and telemetry.
  enable_nat_gateway = true
  single_nat_gateway = true

  # EKS Auto Mode's built-in load balancer controller discovers subnets by these
  # role tags: public for internet-facing NLB/ALB, private for internal ones.
  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
  }
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
  }
}
