# Every other input this component needs (region, cluster coordinates, Grafana Cloud endpoints
# and credentials) comes from the upstream components' remote state — see data.tf. The Cloudflare
# token is the one secret that has no upstream source, since it authenticates cert-manager's DNS-01
# solver and external-dns directly against Cloudflare's API, not against anything Terraform-managed
# in this stack.
variable "cloudflare_api_token" {
  description = <<-EOT
    Cloudflare API token used by cert-manager (DNS-01 ACME solver for rottlr.de) and external-dns
    (DNS record management for rottlr.de). Needs Zone:DNS:Edit on the rottlr.de zone.
  EOT
  type        = string
  sensitive   = true
}
