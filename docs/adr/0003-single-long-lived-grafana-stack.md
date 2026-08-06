# Reuse the single long-lived Grafana Cloud stack

All Grafana Cloud resources are created inside the operator's existing free-tier stack
(also used for home-lab Linux VM monitoring) — the stack itself is never created or
destroyed by tofu, only tokens, the Faro app, k6, and Synthetic Monitoring resources within
it. Two reasons: the free tier allows exactly one stack per org, and telemetry history must
outlive the ephemeral cluster — ML baselines, anomaly detection, and forecasting features
need days of accumulated data that a per-session stack would erase. Consequence: test-stack
telemetry and home-lab telemetry share retention/usage quotas; acceptable because the
home-lab load is metrics+logs only and small.
