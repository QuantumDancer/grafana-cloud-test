# Tofu components: 10-network + 20-cluster

Status: ready-for-agent

`infra/10-network`: VPC via terraform-aws-modules/vpc, 2 AZs, tagged for the cluster.
Decide fck-nat vs no-NAT after checking EKS Auto Mode subnet requirements (record outcome here).
`infra/20-cluster`: EKS **Auto Mode** via terraform-aws-modules/eks (verify current module
support), access entry for the user's SSO/admin principal, default tags
(`ManagedBy=OpenTofu`, `Project=grafana-cloud-test`). Local state; outputs consumed by later
components via `terraform_remote_state` (local backend paths).
`scripts/start.sh` / `scripts/stop.sh`: ordered applies/destroys across all components
(pattern from idp-terraform-aws-infra scripts), `set -euo pipefail`, shellcheck-clean.

Done: `start.sh` brings up VPC+cluster from zero; `stop.sh` destroys cleanly; kubeconfig
obtainable via `aws eks update-kubeconfig`.

## Comments

2026-08-06: Completed (commit `ddf3294`, main session). NAT decision: single managed NAT
gateway instead of fck-nat — session-hours make the premium cents and it removes a
hand-rolled component (rationale in `infra/10-network/main.tf`). `tofu validate` passes for
both components; scripts shellcheck-clean. Live apply still untested (issue 10).
