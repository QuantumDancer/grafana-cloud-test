#!/usr/bin/env bash
# Bring up the whole stack: ordered `tofu apply` over every component in infra/.
# Components are numbered (10-network, 20-cluster, ...) so lexical order IS apply order.
# Idempotent: re-running converges an already-live stack instead of failing.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for component in "$repo_root"/infra/*/; do
  name="$(basename "$component")"
  echo "==> apply ${name}"
  # `init` is idempotent and cheap once providers are cached; running it every time
  # means a fresh clone (or a new component) never needs a manual init step.
  tofu -chdir="$component" init -input=false
  tofu -chdir="$component" apply -input=false -auto-approve
done

echo
echo "Cluster access:"
tofu -chdir="$repo_root/infra/20-cluster" output -raw kubeconfig_command
echo
