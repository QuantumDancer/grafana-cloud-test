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
  # The repository is the OCI namespace only — the provider appends `chart` to it,
  # so including the chart name here would double it (found empirically: 401 on
  # docker.io/envoyproxy/gateway-helm/gateway-helm).
  repository = "oci://docker.io/envoyproxy"
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
resource "kubectl_manifest" "envoy_gatewayclass" {
  server_side_apply = true
  yaml_body = yamlencode({
    apiVersion = "gateway.networking.k8s.io/v1"
    kind       = "GatewayClass"
    metadata = {
      name = "eg"
    }
    spec = {
      controllerName = "gateway.envoyproxy.io/gatewayclass-controller"
    }
  })

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
resource "kubectl_manifest" "external_gateway" {
  server_side_apply = true
  yaml_body = yamlencode({
    apiVersion = "gateway.networking.k8s.io/v1"
    kind       = "Gateway"
    metadata = {
      name      = "external"
      namespace = kubernetes_namespace_v1.gateway.metadata[0].name
    }
    spec = {
      gatewayClassName = "eg"
      # Envoy Gateway copies these annotations onto the LoadBalancer Service it
      # generates for this Gateway. Without the scheme annotation, EKS Auto
      # Mode's built-in load balancer controller provisions an *internal* NLB
      # (its default) — found live: shop.rottlr.de resolved to a private VPC
      # IP and timed out from the internet. AWS NLB scheme is immutable, so
      # the controller replaces the NLB on this change; external-dns follows
      # the new hostname automatically.
      infrastructure = {
        annotations = {
          "service.beta.kubernetes.io/aws-load-balancer-scheme" = "internet-facing"
        }
      }
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
  })

  depends_on = [kubectl_manifest.envoy_gatewayclass]
}

# The Certificate cert-manager renews into the `shop-tls-cert` Secret the Gateway's HTTPS listener
# references above.
resource "kubectl_manifest" "shop_certificate" {
  server_side_apply = true
  yaml_body = yamlencode({
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
  })

  depends_on = [kubectl_manifest.letsencrypt_cluster_issuer]
}
