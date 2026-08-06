variable "aws_region" {
  description = "AWS region for the whole stack"
  type        = string
  default     = "eu-central-1"
}

variable "aws_profile" {
  description = "AWS CLI profile; null falls back to the default credential chain"
  type        = string
  default     = null
}

variable "name" {
  description = "Base name for the stack's AWS resources"
  type        = string
  default     = "spyglass"
}

variable "vpc_cidr" {
  description = "VPC CIDR"
  type        = string
  default     = "10.42.0.0/16"
}
