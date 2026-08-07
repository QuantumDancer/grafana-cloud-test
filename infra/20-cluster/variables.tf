variable "kubernetes_version" {
  description = "EKS Kubernetes version; bump deliberately, not implicitly"
  type        = string
  # Keep this on EKS *standard* support (extended support bills the
  # control-plane at a premium) — cheap to bump here since the cluster is
  # ephemeral anyway. 1.36 released 2026-06-02, standard until 2027-08.
  default = "1.36"
}
