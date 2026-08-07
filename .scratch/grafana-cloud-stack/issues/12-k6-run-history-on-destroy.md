# Empirically check: does destroying the k6 tofu resource erase cloud run history?

Status: ready-for-agent

Undocumented behavior (open question from research): before relying on cloud k6 results as
a lasting record, check whether `tofu destroy` of the load-test resource also deletes its
run history in Grafana Cloud k6.

Procedure (fits naturally into the next teardown):

1. Before `scripts/stop.sh`, note the k6 test/run IDs visible in the Grafana Cloud k6 UI.
2. Tear down as usual (the destroy of 30-grafana-cloud removes the k6 test resource).
3. Re-check the UI: is the run history still there?

Outcome handling:

- History survives → nothing to change; record the finding here.
- History is erased → for routine stops, `tofu state rm` the k6 test resource before
  destroy (orphaning it deliberately), or document that the loss is accepted.
