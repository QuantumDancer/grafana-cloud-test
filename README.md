# Grafana Cloud test stack

A disposable EKS-based environment for exercising Grafana Cloud's Cloud-exclusive
observability features — Kubernetes Monitoring, Application Observability, Frontend
Observability, Database Observability, cloud k6, and Synthetic Monitoring — with realistic,
continuously generated telemetry.

The telemetry source is **Spyglass**, a mini web shop selling observation gear (telescopes,
binoculars, magnifying glasses) at `shop.rottlr.de`, with deliberately planted faults so the
observability products have real problems to surface.

## Layout

| Path | Contents |
|---|---|
| `infra/` | OpenTofu components, numbered in apply order |
| `apps/backend/` | Spring Boot API (Java, Maven, Flyway, OTel-instrumented) |
| `apps/frontend/` | React frontend (Vite, TypeScript, Faro-instrumented) |
| `charts/shop/` | Helm chart for the Shop: frontend, backend, load gen, browser loop |
| `load/` | k6 scripts (shared by in-cluster and cloud k6) + browser loop |
| `scripts/` | start/stop/deploy orchestration |
| `docs/research/` | Primary-source research notes per Grafana Cloud product |
| `docs/adr/` | Architecture decision records |

Domain glossary: [`CONTEXT.md`](./CONTEXT.md). Full spec and implementation issues:
`.scratch/grafana-cloud-stack/`.

## Session workflow

Everything is reproducible from this repo; the cluster is ephemeral and nothing on it is
precious.

```sh
scripts/start.sh        # ordered tofu applies: network → cluster → grafana-cloud → platform
scripts/deploy-shop.sh  # helm-installs the Shop + load generation
# ... use the stack, watch Grafana Cloud ...
scripts/stop.sh         # ordered destroys, leaves nothing billing
```

`stop.sh` refuses to start unless your AWS credentials are valid **and** have enough life
left to finish. This matters because the destroy runs in reverse, so the cheap layers go
first and the cluster and VPC go last: a session that expires partway through leaves
exactly the expensive things running. If it blocks, run the `aws sso login` command it
prints, or override the estimate with `TEARDOWN_EXPECTED_MINUTES=<n> scripts/stop.sh`.

Secrets (AWS profile, Grafana Cloud stack slug + tokens, Cloudflare API token) live in
untracked `*.auto.tfvars` files — see `infra/*/variables.tf` for what each component needs.

## CI

GitHub Actions builds and unit-tests both apps and pushes images to GHCR. CI never touches
AWS, the cluster, or tofu state — deploys are always local.
