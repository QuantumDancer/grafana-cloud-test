# Shop helm chart + deploy script

Status: ready-for-agent
Blocked by: 05, 06

`charts/shop/`: one chart, per-component enable flags — frontend, backend, loadgen,
browserloop. Backend: Deployment (+liveness probe for the sawtooth fault), Service, DB
connection from the CNPG-created secret (platform layer), OTLP endpoint env pointing at the
chart's Alloy receiver service. Frontend: Deployment, Service, runtime config (Faro URL/key).
HTTPRoute on the platform `Gateway`: `/api` → backend, rest → frontend, host shop.rottlr.de.
Loadgen/browserloop: run images from `load/` (issue 08).
`scripts/deploy-shop.sh`: `helm upgrade -i` with values assembled from tofu outputs
(`tofu output` from 30-grafana-cloud/40-platform), image tags as parameters (default latest).

Done: on a live platform, `deploy-shop.sh` brings the Shop up at https://shop.rottlr.de;
faults demonstrable; `helm uninstall` clean.

## Comments

2026-08-06: Built and statically verified (executor + main session): helm lint --strict
clean, template renders all 9 resources with correct enable-flag trimming, shellcheck clean,
names cross-checked against 40-platform (`shop-db-app-credentials`, Alloy OTLP HTTP :4318,
gateway/external). `deploy-shop.sh` requires explicit `--backend-repo`/`--frontend-repo`.
Live done-criteria await issue 10.
