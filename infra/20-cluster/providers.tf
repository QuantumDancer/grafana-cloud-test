provider "aws" {
  region  = local.network.aws_region
  profile = local.network.aws_profile

  default_tags {
    tags = {
      ManagedBy = "OpenTofu"
      Project   = "grafana-cloud-test"
    }
  }
}
