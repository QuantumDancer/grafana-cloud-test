# Hybrid deployment: Platform in tofu, Shop via plain Helm

The Platform (k8s-monitoring chart, CNPG operator + PostgreSQL Cluster CR, cert-manager,
Envoy Gateway, external-dns) is deployed as `helm_release`/manifests inside ordered OpenTofu
components; the Shop (frontend, backend, load generator, browser loop — one chart with
per-component enable flags) is deployed by a plain `helm upgrade -i` script outside tofu.
Chosen because the Platform benefits from tofu's ordering, cross-component output wiring
(tokens, secrets), and single-command teardown, while the Shop is under active development
and needs a tight redeploy loop without tofu plan/apply cycles or image tags in state.
The PostgreSQL Cluster CR sits on the Platform side, not in the Shop chart, because the
k8s-monitoring chart's `integrations.postgresql` values reference the DB service and
credentials secret — DB and its monitoring wiring must share a layer and apply order.

Considered: everything in tofu (rejected: slow app iteration); everything in a deploy script
(rejected: hand-rolled ordering and token plumbing that tofu gives for free); GitOps/Argo CD
(rejected: bootstrap complexity on an ephemeral cluster, and not the product under test).
