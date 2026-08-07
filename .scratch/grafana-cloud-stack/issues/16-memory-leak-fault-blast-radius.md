# Memory-leak fault takes the whole API down, not just its own signal

Status: ready-for-human

`FAULT_MEMORY_LEAK` works exactly as designed — but on a single-replica backend
(`charts/shop/templates/backend-deployment.yaml:10`, `replicas: 1`) "restart the pod to
draw a sawtooth" and "serve the API" are the same pod, so every restart is a full API
outage rather than one degraded instance.

Measured on the first live session (2026-08-07): `GET /api/products` served bursts of
Envoy 503/504, and an independent verifier put one window at roughly **40 % failures**.
The pod's `lastState` is `Error exit=143` — SIGTERM from the kubelet on a failed liveness
probe, *not* an OOM kill — with 2 restarts over 94 minutes. That matches the intended
mechanism: `MemoryLeakSimulator` appends 2 MB/min (`FAULT_MEMORY_LEAK_MB_PER_MIN`,
`charts/shop/values.yaml:109`) into a 512Mi limit until GC thrash makes `/api/health`
miss `timeoutSeconds: 3` three times in a row (`values.yaml:68-78`).

The design intent is documented and deliberate — the chart comments say the memory budget
and the tight liveness tuning exist *precisely* to make the restart happen on a demo-able
timescale. What was never decided is the acceptable blast radius. A ~40 % edge error rate
degrades every other product's demo data while it lasts: App O11y RED charts, Frontend
O11y sessions, k6 thresholds and the Synthetic Monitoring checks all take collateral
damage from a fault that is nominally about Kubernetes Monitoring's memory graph.

## The decision this needs

Whether a 40 % periodic API outage is the intended cost of the sawtooth. Three remedies,
cheapest first:

1. **Lower `backend.faults.memoryLeakMbPerMin`** (e.g. 2 → 1) — stretches the cycle so
   restarts are rarer. Doesn't change the depth of each outage, only its frequency.
2. **Raise `livenessProbe.failureThreshold`** (3 → 5-6) — lets the JVM ride out GC pauses
   longer. Keeps the sawtooth but tolerates more transient slowness before killing.
3. **Two backend replicas** — the structural fix: a restart stops being an outage because
   the other replica serves. Costs a second pod on a small cluster, and makes the memory
   graph two interleaved sawtooths instead of one clean one.

Requires human: this is a judgment call about what the demo stack is *for*, not a defect
with a correct answer. Once decided, the change itself is a values.yaml edit.

## Comments

2026-08-07: Filed from SESSION.md during triage. Characterisation above is from the first
live session; no code has changed in response.
