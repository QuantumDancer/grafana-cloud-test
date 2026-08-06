# Envoy Gateway is the cluster's Gateway API implementation: it watches GatewayClass/Gateway/
# HTTPRoute objects and programs Envoy proxies accordingly. The shop chart (built separately) will
# attach its HTTPRoute to the `external` Gateway defined below via a parentRef.
resource "kubernetes_namespace_v1" "envoy_gateway_system" {
  metadata {
    name = "envoy-gateway-system"
  }
}

resource "helm_release" "envoy_gateway" {
  name = "eg"
  # The chart is only published as an OCI artifact, not a classic Helm repo index.
  repository = "oci://docker.io/envoyproxy/gateway-helm"
  chart      = "gateway-helm"
  version    = "1.8.3" # verified via `helm show chart oci://docker.io/envoyproxy/gateway-helm`
  namespace  = kubernetes_namespace_v1.envoy_gateway_system.metadata[0].name

  # `crds.enabled` (default true, left implicit here) installs BOTH the upstream Gateway API CRDs
  # (Gateway, GatewayClass, HTTPRoute, ...) and Envoy Gateway's own CRDs from a bundled `crds`
  # subchart — verified by inspecting the pulled chart. Nothing else needs to install Gateway API
  # CRDs separately for this cluster.
}

# The GatewayClass name/controllerName pair below is Envoy Gateway's own documented default
# (see its quickstart.yaml release asset) — using it as-is rather than inventing a new one.
resource "kubernetes_manifest" "envoy_gatewayclass" {
  manifest = {
    apiVersion = "gateway.networking.k8s.io/v1"
    kind       = "GatewayClass"
    metadata = {
      name = "eg"
    }
    spec = {
      controllerName = "gateway.envoyproxy.io/gatewayclass-controller"
    }
  }

  depends_on = [helm_release.envoy_gateway]
}

resource "kubernetes_namespace_v1" "gateway" {
  metadata {
    name = local.gateway_namespace
  }
}

# The externally reachable Gateway: one HTTPS listener terminating TLS for shop.rottlr.de, plus a
# plain HTTP listener (the shop chart's HTTPRoute is expected to redirect it to HTTPS). Routes are
# allowed from every namespace so future services can attach without touching this component.
resource "kubernetes_manifest" "external_gateway" {
  manifest = {
    apiVersion = "gateway.networking.k8s.io/v1"
    kind       = "Gateway"
    metadata = {
      name      = "external"
      namespace = kubernetes_namespace_v1.gateway.metadata[0].name
    }
    spec = {
      gatewayClassName = "eg"
      listeners = [
        {
          name     = "http"
          port     = 80
          protocol = "HTTP"
          allowedRoutes = {
            namespaces = {
              from = "All"
            }
          }
        },
        {
          name     = "https"
          port     = 443
          protocol = "HTTPS"
          allowedRoutes = {
            namespaces = {
              from = "All"
            }
          }
          tls = {
            mode = "Terminate"
            certificateRefs = [
              {
                name = "shop-tls-cert"
                kind = "Secret"
              }
            ]
          }
        }
      ]
    }
  }

  depends_on = [kubernetes_manifest.envoy_gatewayclass]
}

# The Certificate cert-manager renews into the `shop-tls-cert` Secret the Gateway's HTTPS listener
# references above.
resource "kubernetes_manifest" "shop_certificate" {
  manifest = {
    apiVersion = "cert-manager.io/v1"
    kind       = "Certificate"
    metadata = {
      name      = "shop-tls-cert"
      namespace = kubernetes_namespace_v1.gateway.metadata[0].name
    }
    spec = {
      secretName = "shop-tls-cert"
      issuerRef = {
        name = "letsencrypt"
        kind = "ClusterIssuer"
      }
      dnsNames = [local.shop_hostname]
    }
  }

  depends_on = [kubernetes_manifest.letsencrypt_cluster_issuer]
}
