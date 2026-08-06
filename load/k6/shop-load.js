// Minimal smoke-level load script for the shop demo app.
//
// TODO(issue 08): this is a placeholder shape (health check + one product
// search) so `grafana_k6_load_test` has a valid, runnable script to attach
// to during initial `tofu apply` of 30-grafana-cloud. The real multi-scenario
// load profile (checkout flow, ramping VUs, thresholds tuned against the
// free-tier 500 VUh/month budget) lands in a later issue.
import http from 'k6/http';
import { check, sleep } from 'k6';

// `k6 cloud` / the Cloud UI can override the target via the BASE_URL env var,
// so this script is runnable against any environment (local, ephemeral EKS
// ALB via port-forward, or the stable https://shop.rottlr.de domain) without
// edits.
const BASE_URL = __ENV.BASE_URL || 'https://shop.rottlr.de';

// Deliberately modest: a couple of VUs for a short duration keeps this
// well inside the k6 Cloud free tier's 500 VU-hours/month while still
// producing real traffic to exercise Synthetic Monitoring/Frontend
// Observability correlation during manual `k6 cloud` runs.
export const options = {
  vus: 2,
  duration: '30s',
};

export default function () {
  const health = http.get(`${BASE_URL}/api/health`);
  check(health, { 'health check status is 200': (r) => r.status === 200 });

  const search = http.get(`${BASE_URL}/api/products?search=telescope`);
  check(search, { 'product search status is 200': (r) => r.status === 200 });

  sleep(1);
}
