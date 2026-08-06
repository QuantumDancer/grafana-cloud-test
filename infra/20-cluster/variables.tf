variable "kubernetes_version" {
  description = "EKS Kubernetes version; bump deliberately, not implicitly"
  type        = string
  # TODO: 1.33 entered EKS extended support (premium control-plane pricing).
  # Bump to the newest standard-support version before the next cluster
  # creation — cheap here since the cluster is ephemeral anyway.
  default     = "1.33"
}
