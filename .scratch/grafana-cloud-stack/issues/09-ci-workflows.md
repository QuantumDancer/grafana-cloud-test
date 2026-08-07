# CI workflows

Status: resolved
Blocked by: 05, 06

`.github/workflows/`: per-app workflows, path-filtered on push to main + PRs. Steps: unit
tests → docker build → push to GHCR (`ghcr.io/<owner>/grafana-cloud-test/{backend,frontend}`)
tagged `sha-<shortsha>` + `latest` (push only on main). Frontend additionally uploads source
maps to Faro (CLI/bundler plugin per docs/research/grafana-cloud-frontend-observability.md);
`FARO_SOURCEMAP_TOKEN` is the only GitHub secret; skip gracefully when unset (PRs from forks).
CI never touches AWS, the cluster, or tofu.

Done: workflows lint (actionlint if available); a push to main produces pullable GHCR images.

## Comments

2026-08-06: Built (executor), actionlint clean (re-run at integration). Faro source-map
upload via faro-cli, gated on `FARO_SOURCEMAP_TOKEN` + `FARO_*` repo variables with
graceful skip. Also hardened root .gitignore (all tfvars variants ignored except
.example). First real push to main is the live test of image publishing. Follow-up in
SESSION.md: frontend should set `app.version` for source-map matching.
