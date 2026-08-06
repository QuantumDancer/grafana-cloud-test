#!/usr/bin/env bash
# Tear down the whole stack: ordered `tofu destroy` over infra/ components in REVERSE,
# so in-cluster workloads (and their cloud side-effects like DNS records and load
# balancers) disappear before the cluster and VPC they live in.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Collect components in reverse lexical order without relying on `ls` parsing.
components=()
for component in "$repo_root"/infra/*/; do
  components=("$component" "${components[@]}")
done

for component in "${components[@]}"; do
  name="$(basename "$component")"
  echo "==> destroy ${name}"
  tofu -chdir="$component" init -input=false
  tofu -chdir="$component" destroy -input=false -auto-approve
done

echo "Stack destroyed. Verify in the AWS console that nothing is left billing."
