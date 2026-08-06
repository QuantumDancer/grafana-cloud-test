provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  default_tags {
    tags = {
      ManagedBy = "OpenTofu"
      Project   = "grafana-cloud-test"
    }
  }
}
