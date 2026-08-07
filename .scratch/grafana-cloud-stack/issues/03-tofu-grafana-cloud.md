# Tofu component: 30-grafana-cloud

Status: resolved
Blocked by: 02

Grafana provider (≥4.32, current 4.4x) against the existing free-tier stack (slug/region via
untracked tfvars). Resources:
- Access-policy + token for k8s-monitoring destinations (metrics/logs/traces/OTLP write scopes).
- `grafana_frontend_o11y_app` for shop.rottlr.de (`allowed_origins = ["https://shop.rottlr.de"]`),
  output collector endpoint + app key.
- `grafana_k6_installation` + `grafana_k6_project` + one `grafana_k6_load_test` from `load/`
  script (optional `grafana_k6_schedule`, disabled by default).
- `grafana_synthetic_monitoring_installation` + checks: HTTP `https://shop.rottlr.de/api/health`
  5 min × 2 probes; browser check on the shop 15 min × 1 probe.
Outputs (sensitive where applicable) consumed by 40-platform and scripts/deploy-shop.sh.

Done: `tofu apply` creates all of it against the real stack; `tofu destroy` removes it;
research doc `grafana-terraform-provider-k6-synthetics.md` caveats respected.

## Comments

2026-08-06: Built and validated (commits `bc862b4` + `otlp_username` in the 40-platform
commit; executor + main session). Schema realities vs. plan: k6 installation wants the
portal token + a stack service-account token (no publisher token); `settings` and
`extra_log_attributes` on the Faro app are schema-required (passed `{}`). NOT yet applied
against the real stack — two pre-apply verifications logged in SESSION.md
(`grafana_cloud_region` value, frontend-o11y access-policy realm).
