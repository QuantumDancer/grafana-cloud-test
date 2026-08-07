#!/usr/bin/env bash
# Tear down the whole stack: ordered `tofu destroy` over infra/ components in REVERSE,
# so in-cluster workloads (and their cloud side-effects like DNS records and load
# balancers) disappear before the cluster and VPC they live in.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# How long a full teardown is expected to need. Measured 2026-08-07, but only across the
# AWS layers with the cluster already drained: EKS control plane 3m, NAT gateway 50s, ~6m
# end to end. A teardown from a fully live stack is meaningfully slower — it also unwinds
# 40-platform (helm releases plus the gateway's load balancer, whose ENI cleanup is
# typically the slowest single step) and terminates live nodes — so this default carries
# headroom over the measured figure rather than matching it. Override when a stack has
# grown beyond the default shape:
#
#   TEARDOWN_EXPECTED_MINUTES=60 scripts/stop.sh
#
# Overestimating costs one extra `aws sso login`; underestimating costs a half-destroyed
# stack. But an over-strict default only trains people to override it reflexively, so this
# stays comfortably inside a typical 1-hour SSO session.
: "${TEARDOWN_EXPECTED_MINUTES:=30}"

# --- AWS credential pre-flight ----------------------------------------------------
#
# Destroying in reverse means the cheap layers go first and the expensive ones last, so a
# run that dies partway through fails in the worst possible order. That is not
# hypothetical: on 2026-08-07 an SSO session expired mid-teardown after 40-platform and
# 30-grafana-cloud were already gone, leaving the EKS cluster and VPC — the only parts
# billing real money — alive, with the observability stack that would have surfaced them
# already destroyed. Failing before touching anything is strictly better, and costs a
# second.
#
# The profile is tofu's, not the shell's: every component's provider takes it from
# 10-network's variables and this script never exports AWS_PROFILE. Read it from the same
# file tofu does, so the pre-flight validates the identity the destroy will actually use —
# checking the ambient credential chain could pass while tofu fails.
network_tfvars="${repo_root}/infra/10-network/terraform.auto.tfvars"
aws_profile="$(sed -n 's/^[[:space:]]*aws_profile[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' \
  "$network_tfvars" 2>/dev/null || true)"

aws_args=()
if [[ -n "$aws_profile" ]]; then
  aws_args=(--profile "$aws_profile")
fi

echo "==> pre-flight: AWS credentials (profile: ${aws_profile:-<default chain>})"

if ! aws sts get-caller-identity "${aws_args[@]}" >/dev/null 2>&1; then
  echo "ERROR: AWS credentials are not usable for profile '${aws_profile:-<default chain>}'." >&2
  echo "       Nothing has been destroyed." >&2
  sso_session="$(aws configure get sso_session "${aws_args[@]}" 2>/dev/null || true)"
  if [[ -n "$sso_session" ]]; then
    echo "       Re-authenticate with: aws sso login --sso-session ${sso_session}" >&2
  fi
  exit 1
fi

# Remaining lifetime, not just validity. Credentials that work right now are not enough:
# what matters is whether they will still work at the *end* of the destroy.
#
# The expiry that counts is the SSO token's, not the role credential's. Role credentials
# are short-lived and refreshed silently from the SSO token, so they are never what stops
# a long run — the token behind them is. AWS CLI v2 caches that token at
# ~/.aws/sso/cache/<sha1 of the sso-session name>.json.
#
# Profiles that are not sso-session-based (static keys, legacy profile-format SSO, a role
# assumed from the environment) have no such file. Those either never expire or cannot be
# introspected this way, so the check says it was skipped rather than guessing — a warning
# that means nothing is worse than no warning.
sso_session="$(aws configure get sso_session "${aws_args[@]}" 2>/dev/null || true)"

if [[ -z "$sso_session" ]]; then
  echo "    note: profile is not sso-session-based; cannot check remaining lifetime."
else
  session_hash="$(printf '%s' "$sso_session" | sha1sum | cut -d' ' -f1)"
  token_cache="${HOME}/.aws/sso/cache/${session_hash}.json"

  if [[ ! -r "$token_cache" ]]; then
    echo "    note: no cached SSO token for session '${sso_session}'; cannot check remaining lifetime."
  else
    expires_at="$(sed -n 's/.*"expiresAt"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$token_cache" | head -1)"

    if [[ -z "$expires_at" ]]; then
      echo "    note: cached SSO token has no expiresAt; cannot check remaining lifetime."
    else
      remaining_minutes=$(( ( $(date -d "$expires_at" +%s) - $(date +%s) ) / 60 ))

      if (( remaining_minutes < TEARDOWN_EXPECTED_MINUTES )); then
        echo "ERROR: SSO session '${sso_session}' expires in ${remaining_minutes} min, but a teardown" >&2
        echo "       is expected to need ${TEARDOWN_EXPECTED_MINUTES} min. Refusing to start a destroy that" >&2
        echo "       would strand the cluster and VPC halfway through." >&2
        echo "       Nothing has been destroyed." >&2
        echo "" >&2
        echo "       Refresh first:  aws sso login --sso-session ${sso_session}" >&2
        echo "       Or, if you are confident this teardown is quicker:" >&2
        echo "                       TEARDOWN_EXPECTED_MINUTES=${remaining_minutes} scripts/stop.sh" >&2
        exit 1
      fi

      echo "    SSO session '${sso_session}' valid for ${remaining_minutes} more min (need ${TEARDOWN_EXPECTED_MINUTES})."
    fi
  fi
fi

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
