# Load generation

Status: ready-for-agent
Blocked by: 05, 06

`load/`: k6 HTTP scenario (browse, search — including slow-search terms, checkout with the
~2% failures, order history hitting the N+1) with modest VUs and time-of-day variation;
runnable in-cluster (Deployment/Job in charts/shop) against internal service URLs AND as a
cloud k6 test against https://shop.rottlr.de (same script, env-switched base URL).
Browser loop: k6 browser (preferred, one tool) or Playwright image driving the real frontend
through catalog→detail→cart→checkout + the error-throwing route, looped, low frequency —
this is the sole Faro telemetry source besides real users.

Done: both run in-cluster continuously without OOM/crash-loops; the k6 script passes
`k6 cloud` validation; request mix documented in load/README.md.
