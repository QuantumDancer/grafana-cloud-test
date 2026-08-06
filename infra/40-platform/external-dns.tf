# external-dns publishes DNS records for the Gateway's HTTPRoutes (and any plain LoadBalancer
# Services) into Cloudflare, so shop.rottlr.de resolves to the Gateway's address without a manual
# DNS step.
resource "kubernetes_namespace_v1" "external_dns" {
  metadata {
    name = "external-dns"
  }
}

resource "kubernetes_secret_v1" "cloudflare_api_token_external_dns" {
  metadata {
    name      = "cloudflare-api-token"
    namespace = kubernetes_namespace_v1.external_dns.metadata[0].name
  }

  data = {
    "api-token" = var.cloudflare_api_token
  }

  type = "Opaque"
}

resource "helm_release" "external_dns" {
  name       = "external-dns"
  repository = "https://kubernetes-sigs.github.io/external-dns/"
  chart      = "external-dns"
  version    = "1.21.1" # latest as of 2026-08; verified via `helm search repo external-dns/external-dns`
  namespace  = kubernetes_namespace_v1.external_dns.metadata[0].name

  values = [
    yamlencode({
      provider = {
        name = "cloudflare"
      }
      # gateway-httproute covers the shop chart's HTTPRoute; service covers any plain LoadBalancer
      # Services that carry the external-dns hostname annotation.
      sources = ["gateway-httproute", "service"]
      env = [
        {
          name = "CF_API_TOKEN"
          valueFrom = {
            secretKeyRef = {
              name = kubernetes_secret_v1.cloudflare_api_token_external_dns.metadata[0].name
              key  = "api-token"
            }
          }
        }
      ]
      # Scopes external-dns to the one zone this stack is allowed to touch, and tags the records it
      # creates so it can tell its own records apart from any others in the zone on cleanup.
      domainFilters = ["rottlr.de"]
      txtOwnerId    = local.cluster_name
    })
  ]
}
