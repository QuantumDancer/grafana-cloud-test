# cert-manager issues and renews the TLS certificate the Gateway (envoy-gateway.tf) terminates
# HTTPS with. It solves ACME's DNS-01 challenge against Cloudflare (rottlr.de's DNS provider)
# rather than HTTP-01, since HTTP-01 would require the challenge to be routable before the Gateway
# it's meant to secure even exists.
resource "kubernetes_namespace_v1" "cert_manager" {
  metadata {
    name = "cert-manager"
  }
}

resource "helm_release" "cert_manager" {
  name       = "cert-manager"
  repository = "https://charts.jetstack.io"
  chart      = "cert-manager"
  version    = "v1.21.1" # latest as of 2026-08; verified via `helm search repo jetstack/cert-manager`
  namespace  = kubernetes_namespace_v1.cert_manager.metadata[0].name

  # Chart v1.21 gates CRD installation behind this value (default false) rather than the old
  # `installCRDs` flag. Helm provider v3 takes `set` as a list attribute, not a repeatable block.
  set = [
    {
      name  = "crds.enabled"
      value = "true"
    }
  ]
}

# The Cloudflare API token as a Kubernetes Secret, referenced by the ClusterIssuer's DNS-01 solver
# below. Held directly in this Secret (rather than via an external-secrets ExternalSecret pointing
# at Vault, as the source IDP platform does) because this test stack has no Vault of its own.
resource "kubernetes_secret_v1" "cloudflare_api_token_cert_manager" {
  metadata {
    name      = "cloudflare-api-token"
    namespace = kubernetes_namespace_v1.cert_manager.metadata[0].name
  }

  data = {
    "api-token" = var.cloudflare_api_token
  }

  type = "Opaque"
}

# cert-manager's CRDs only exist once the chart above has actually installed them, so every
# kubernetes_manifest resource for a cert-manager CRD in this component depends on this release.
resource "kubectl_manifest" "letsencrypt_cluster_issuer" {
  server_side_apply = true
  yaml_body = yamlencode({
    apiVersion = "cert-manager.io/v1"
    kind       = "ClusterIssuer"
    metadata = {
      name = "letsencrypt"
    }
    spec = {
      acme = {
        email  = "benjamin@rottler.io"
        server = "https://acme-v02.api.letsencrypt.org/directory"
        privateKeySecretRef = {
          name = "letsencrypt-cloudflare"
        }
        solvers = [
          {
            dns01 = {
              cloudflare = {
                apiTokenSecretRef = {
                  name = kubernetes_secret_v1.cloudflare_api_token_cert_manager.metadata[0].name
                  key  = "api-token"
                }
              }
            }
          }
        ]
      }
    }
  })

  depends_on = [helm_release.cert_manager]
}
