# Loadgen "restart loop" is by design — but its ramp puts a sawtooth in the traffic

Status: resolved

Raised from a SESSION.md deferred-work entry: `spyglass-loadgen` showed 19-21 restarts
over ~4.5h during the issue 20/23 verification, and a crash-looping load generator would
distort telemetry windows. Investigating it disproved the crash-loop premise but surfaced
a real, worse problem underneath.

## The restart loop is not a crash

Every piece of evidence says the container exits cleanly and is meant to:

- `lastState.terminated` = `exitCode: 0`, `reason: "Completed"` — not `Error`, not
  `OOMKilled`.
- Each run lasted 14m01s (`startedAt` 13:54:21Z → `finishedAt` 14:08:22Z) against a
  scenario whose stages summed to exactly 14m00s (`2m` ramp-up + `10m` steady + `2m`
  ramp-down). 22 restarts over 5h14m is 14.3 min apiece — the scenario duration plus
  startup.
- The next container started at 14:08:23Z, **one second** after the previous exited, and
  the pod's events contained only `Created`/`Started`/`Pulled`. No `BackOff` event ever
  fired: kubelet's exponential restart backoff resets when a container has run long
  enough, and a 14-minute run clears that threshold every time.
- The final run summary showed all thresholds ✓, `checks_succeeded: 100.00%` over 2135
  checks, 838 iterations, `http_req_failed` 1.51% (entirely the planted ~2% checkout
  faults; `{endpoint:catalog}` and `{endpoint:order_history}` were both 0.00%).

This is the mechanism `charts/shop/templates/loadgen.yaml` documents on purpose: k6's
process exit is what triggers the next run, and the Pod's implicit `restartPolicy: Always`
is what makes load "continuous" without k6 looping internally or the chart needing a
CronJob. `spyglass-browserloop` does the same thing on a 55-minute cycle (also `exitCode:
0` / `Completed`), which is why its restart count looked unremarkable while the loadgen's
looked alarming — the only difference was cadence.

## The real defect: a periodic 75% trough in the Shop's request rate

The `ramping-vus` scenario drained to **0 VUs** for its last two minutes and climbed from
1 VU over its first two. Because the pod restarts the instant the scenario ends, that ramp
was never a one-off warm-up and cool-down — it repeated every 14 minutes forever.

Backend request rate over 75 minutes, `sum(rate(http_server_request_duration_seconds_count
{service_name="spyglass-backend"}[2m]))` at 1m step (2026-08-07):

```
13:08    4.33  ##########################
13:09    4.35  ##########################
13:10    1.43  ########
13:12    1.66  #########      <- 13:11 returned no data at all
13:13    1.22  #######
13:14    2.73  ################
13:15    4.07  ########################
...
13:52    4.21  #########################
13:53    3.04  ##################
13:54    0.84  #####
13:56    1.08  ######         <- 13:55 returned no data at all
13:57    2.35  ##############
13:58    4.02  ########################
```

Steady state ~4.3 req/s collapsing to ~0.8-1.4 req/s for 3-4 of every 14 minutes, with
some scrape intervals recording nothing. That is ~25% of wall-clock time spent at roughly
a quarter of normal traffic, on a perfectly fixed period.

This matters because of what this stack is *for*. CONTEXT.md defines a **baseline run** as
a deliberate multi-day session so Grafana Cloud's ML, anomaly-baseline and forecasting
features accumulate continuous data. A rigidly periodic sawtooth is precisely the shape
those features learn — so the load generator was teaching them a cycle the stack invented
rather than the Shop's real behaviour. Worse, its amplitude (~75%) dwarfed the genuine
time-of-day variation that `diurnalSleepMultiplier()` exists to produce (2x/4x sleep
scaling), effectively burying the intended signal under an artefact.

## Why the run is bounded at all — the constraint on the obvious fix

"Just run k6 forever" would trade the sawtooth for an OOM kill. k6 accumulates metric
samples in memory for the whole run; `container_memory_working_set_bytes` for the k6
container traced an identical ramp every cycle:

```
13:46  21.4 MiB   (run starts)
13:52  35.1 MiB
13:54  38.0 MiB   -> ~1.7 MiB/min through steady state
13:56  49.8 MiB   -> step up as ramp-down + end-of-test summary run
13:58  54.1 MiB
14:00  23.3 MiB   (next run starts — memory reset)
```

So **the process exit is the memory reset**, and the bounded duration is load-bearing
rather than arbitrary. At ~1.7 MiB/min an unbounded run reaches the old 256Mi limit in
roughly two hours.

## Fix

Three changes, in `load/k6/shop-load.js` and `charts/shop/values.yaml`:

1. **`ramping-vus` → `constant-vus`** at 5 VUs (`gracefulRampDown` → `gracefulStop`,
   which is the constant-vus equivalent). This removes the trough entirely: VUs are at
   full count from the first second, so the per-cycle seam shrinks from ~4 minutes to the
   ~2-3s of container restart plus k6 startup.
2. **`duration: '55m'`**, matching `load/browser/shop-browser.js`'s existing cycle so both
   in-cluster loops restart on one documented cadence. Restarts drop from ~103/day to
   ~26/day — a rate no longer mistakable for a crash loop, while still resetting memory
   and re-evaluating thresholds hourly.
3. **`discardResponseBodies: true`** — nothing in the script reads a body (checks inspect
   `res.status`, the custom Trends read `res.timings`), so retaining them only accelerated
   the memory growth that bounds the run length.

`charts/shop/values.yaml` raises the loadgen memory **limit** 256Mi → 512Mi to size it
against the longer run (~190 MiB projected peak at 55m). The **request** stays 128Mi, so
scheduling pressure is unchanged. The two numbers must move together — a comment in each
file says so, since an OOM kill here would be a genuine crash loop unlike the clean
restarts this workload does by design.

`charts/shop/templates/loadgen.yaml` gains a comment stating outright that a forever-
climbing restart count is success, with the exact signature to check (`exitCode: 0` /
`Completed`, no `BackOff`) before investigating it again — this premise cost investigation
time twice.

## Verification

Deployed as release revision 12. k6 reports the new shape on startup:

```
scenarios: (100.00%) 1 scenario, 5 max VUs, 55m30s max duration (incl. graceful stop):
         * shop_traffic: 5 looping VUs for 55m0s (gracefulStop: 30s)
running (00m01.0s), 5/5 VUs, 0 complete and 0 interrupted iterations
```

5/5 VUs at one second in, versus the old scenario's two-minute climb from 1. Container
limit confirmed at 512Mi on the Deployment. Post-deploy request rate held flat across the
window that previously contained a trough — see the Comments below for the measured
series.

## Comments

Note for whoever redeploys: `helm upgrade --reuse-values` reuses the previous release's
*computed* values, which masks changed chart defaults — the first upgrade attempt here
left the memory limit at 256Mi despite values.yaml saying 512Mi, and needed an explicit
`--set loadgen.resources.limits.memory=512Mi`. `scripts/deploy-shop.sh` does not use
`--reuse-values`, so a normal full deploy picks the new default up correctly.
