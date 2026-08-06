#!/usr/bin/env bash
# Deploys (or removes) the Shop application via Helm. Per ADR-0002, the shop
# is NOT part of the tofu-managed Platform layer — it's redeployed on its own
# cadence, independently of infra changes — but it still needs several
# values *produced* by tofu (Gateway name, CNPG secret name, Alloy OTLP
# endpoint, the hosted Faro collector URL), so this script reads those via
# `tofu output` rather than duplicating them here as a second source of
# truth that could drift from infra/40-platform and infra/30-grafana-cloud.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
release_name="spyglass"
namespace="shop"

# REQUIRED in any real deployment: charts/shop/values.yaml's own image
# repository defaults are an obviously-fake "OWNER-PLACEHOLDER" sentinel that
# fails loudly (ImagePullBackOff) rather than silently deploying nothing —
# these flags are how a real run points at the actual GHCR images CI
# produces (see docs, issue 09).
backend_repo=""
frontend_repo=""
backend_tag="latest"
frontend_tag="latest"
do_uninstall=false

usage() {
  cat <<'EOF'
Usage: deploy-shop.sh [options]

Deploys the Spyglass shop (backend, frontend, loadgen, browserloop) via
`helm upgrade --install`, assembling values from tofu outputs of the
40-platform and 30-grafana-cloud components (both must already be applied —
run scripts/start.sh first).

Options:
  --backend-repo <repo>    Backend image repository (required unless --uninstall)
  --frontend-repo <repo>   Frontend image repository (required unless --uninstall)
  --backend-tag <tag>      Backend image tag (default: latest)
  --frontend-tag <tag>     Frontend image tag (default: latest)
  --uninstall              helm uninstall the release instead of deploying
  -h, --help               Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend-repo)
      backend_repo="$2"
      shift 2
      ;;
    --frontend-repo)
      frontend_repo="$2"
      shift 2
      ;;
    --backend-tag)
      backend_tag="$2"
      shift 2
      ;;
    --frontend-tag)
      frontend_tag="$2"
      shift 2
      ;;
    --uninstall)
      do_uninstall=true
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$do_uninstall" == "true" ]]; then
  echo "==> helm uninstall ${release_name} -n ${namespace}"
  helm uninstall "$release_name" -n "$namespace"
  exit 0
fi

if [[ -z "$backend_repo" || -z "$frontend_repo" ]]; then
  echo "Error: --backend-repo and --frontend-repo are required (no working image default exists)." >&2
  usage >&2
  exit 1
fi

# Reads a single tofu output as a raw string from the given infra component
# directory. Per this repo's shell-scripting convention, failure is checked
# via a captured exit code rather than `if !` (broken under this sandbox's
# bash, see CLAUDE.md) — and the error message here is deliberately more
# actionable than tofu's own "no state file" error, since the fix (apply the
# missing component first) isn't obvious from that error alone.
tofu_output() {
  local component="$1" key="$2" value rc
  value="$(mise exec -- tofu -chdir="${repo_root}/infra/${component}" output -raw "$key" 2>&1)"
  rc=$?
  if [[ $rc -ne 0 ]]; then
    echo "Failed to read tofu output '${key}' from infra/${component} — is that component applied?" >&2
    echo "Run scripts/start.sh first, then retry. Underlying error:" >&2
    echo "$value" >&2
    exit 1
  fi
  printf '%s' "$value"
}

echo "==> reading tofu outputs (infra/40-platform, infra/30-grafana-cloud)"
gateway_namespace="$(tofu_output 40-platform gateway_namespace)"
gateway_name="$(tofu_output 40-platform gateway_name)"
shop_hostname="$(tofu_output 40-platform shop_hostname)"
cnpg_app_secret_name="$(tofu_output 40-platform cnpg_app_secret_name)"
alloy_otlp_http_endpoint="$(tofu_output 40-platform alloy_otlp_http_endpoint)"
faro_collector_endpoint="$(tofu_output 30-grafana-cloud faro_collector_endpoint)"

echo "==> helm upgrade --install ${release_name} charts/shop -n ${namespace}"
# --set-file for both load scripts: the chart never bundles them itself
# (charts/shop/values.yaml's loadgen.script/browserloop.script default to
# empty) so `load/` stays the one place either script's content lives,
# rather than a copy living inside the chart too.
helm upgrade --install "$release_name" "${repo_root}/charts/shop" \
  --namespace "$namespace" \
  --set backend.image.repository="$backend_repo" \
  --set backend.image.tag="$backend_tag" \
  --set frontend.image.repository="$frontend_repo" \
  --set frontend.image.tag="$frontend_tag" \
  --set gateway.namespace="$gateway_namespace" \
  --set gateway.name="$gateway_name" \
  --set hostname="$shop_hostname" \
  --set backend.database.secretName="$cnpg_app_secret_name" \
  --set backend.otel.endpoint="$alloy_otlp_http_endpoint" \
  --set frontend.faroCollectorUrl="$faro_collector_endpoint" \
  --set-file loadgen.script="${repo_root}/load/k6/shop-load.js" \
  --set-file browserloop.script="${repo_root}/load/browser/shop-browser.js" \
  --wait

echo
echo "Shop deployed. Once the Certificate/HTTPRoute/external-dns record are ready:"
echo "  https://${shop_hostname}"
