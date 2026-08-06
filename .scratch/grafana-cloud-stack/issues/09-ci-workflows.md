# CI workflows

Status: ready-for-agent
Blocked by: 05, 06

`.github/workflows/`: per-app workflows, path-filtered on push to main + PRs. Steps: unit
tests → docker build → push to GHCR (`ghcr.io/<owner>/grafana-cloud-test/{backend,frontend}`)
tagged `sha-<shortsha>` + `latest` (push only on main). Frontend additionally uploads source
maps to Faro (CLI/bundler plugin per docs/research/grafana-cloud-frontend-observability.md);
`FARO_SOURCEMAP_TOKEN` is the only GitHub secret; skip gracefully when unset (PRs from forks).
CI never touches AWS, the cluster, or tofu.

Done: workflows lint (actionlint if available); a push to main produces pullable GHCR images.
