# End-to-end validation

Status: ready-for-human
Blocked by: 04, 07, 08, 09

Run a full session (`start.sh` → deploy → load running) and verify each Grafana Cloud
surface per the spec's Validation section, checking off:
- [ ] Kubernetes Monitoring: cluster, workloads, cost tabs populated
- [ ] Application Observability: service map, RED, N+1 waterfall, checkout error traces
- [ ] Frontend Observability: Web Vitals, JS errors, sessions from the browser loop
- [ ] Database Observability: slow ILIKE query in query performance, explain plan visible
- [ ] Trace→query linking (App O11y span → DB O11y sample)
- [ ] Cloud k6: one completed cloud run
- [ ] Synthetic Monitoring: both checks green
- [ ] `stop.sh` leaves nothing behind (AWS console + Grafana Cloud + Cloudflare records)
Then schedule the multi-day baseline run for ML/anomaly/forecast features.

Requires human: Grafana Cloud UI checks, judgment on "looks right".
