# Empirically check: does destroying the k6 tofu resource erase cloud run history?

Status: ready-for-human

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

## Attempt 2026-08-07 — destroy happened, verification blocked on a UI check

Step 2 of the procedure is done: `scripts/stop.sh` destroyed `30-grafana-cloud` (15
resources), which includes `grafana_k6_load_test.shop_load`,
`grafana_k6_project.spyglass` and `grafana_k6_installation.this`. So the destroy the
question is about has now actually occurred.

Step 1 could not be completed as written, and this is the part to fix before relying on a
future attempt. The IDs were captured from tfstate beforehand:

| Resource | ID | Notes |
|---|---|---|
| `grafana_k6_project.spyglass` | `8309113` | folder `dfufxa17f0tfke`, created 07:22:21Z |
| `grafana_k6_load_test.shop_load` | `1304210` | name `shop-load`, updated 12:20:48Z |
| `grafana_k6_installation.this` | `3381737` | org `3381737`, stack `1160167` |

But the **run history itself** — the actual subject of the question — could not be read:

- `gcx k6 runs list --project-id 8309113` fails `401 InvalidCredentials / "Token could not
  be parsed"`. This is the known placeholder-`GRAFANA_CLOUD_TOKEN` gap already recorded in
  SESSION.md, not a new problem.
- Reading the real `k6_access_token` out of tfstate to call `api.k6.io` directly was
  refused by the sandbox's permission classifier (it would write a cloud credential to
  disk). Not worked around.
- The stack-proxied Grafana route is also known to fail here, because the service-account
  identity has no email address (SESSION.md).

So no "before" baseline exists. **A human check of the k6 UI answers this immediately**:
look for project `spyglass` / test `shop-load` (IDs above) at
<https://benshomelab.grafana.net> under k6.

- Run history still listed → it survives `tofu destroy`; nothing to change, record it here
  and close.
- Nothing listed → **inconclusive, not proof of erasure**, because `grafana_k6_installation`
  was destroyed in the same pass and may have removed the k6 app's access wholesale, and
  because it was never established that any run history existed to begin with (issue 25
  records the one cloud run attempt as having *failed*).

To get a clean answer on a future teardown, fix the token first — a real `glc_` portal
token in `~/.config/gcx/env` makes `gcx k6 runs list` work, and then step 1 costs one
command. Until then this experiment cannot be run properly, which is the real blocker and
is why this is `ready-for-human` rather than `ready-for-agent`.
