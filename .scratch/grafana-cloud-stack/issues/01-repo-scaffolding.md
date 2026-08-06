# Repo scaffolding

Status: ready-for-agent

Create the confirmed layout: `infra/`, `apps/backend/`, `apps/frontend/`, `charts/shop/`,
`load/`, `scripts/`, `.github/workflows/` (empty dirs via .gitkeep where needed), root
`.gitignore` (tofu state/lock/tfvars, build outputs, node_modules, target), root `README.md`
describing the project, the session workflow (start → deploy → use → stop), and pointers to
spec/CONTEXT/ADRs.

Done: layout exists, `.gitignore` covers `*.tfstate*`, `*.auto.tfvars`, `.terraform/`.

## Comments

2026-08-06: Completed (commit `fe2cbee`, main session). `mise.toml` pins OpenTofu 1.12.5.
