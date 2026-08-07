# Frontend: set Faro `app.version` for source-map matching

Status: ready-for-agent

CI uploads source maps tagged `--bundle-id ${{ github.sha }}` (frontend.yml), but runtime
stack-trace deobfuscation needs the SDK to report a matching `app.version` — previously
absent from `initializeFaro()` in `apps/frontend/src/faro.ts`. Wire the commit sha through
the build so runtime `app.version` === upload `--bundle-id`.

Constraint: the version identifies the build artifact, so it must come from build time
(Vite env), not the runtime config.js mechanism. CI's host-side `pnpm build` (source of the
uploaded maps) and the docker image build must bake in the identical sha.

## Comments

2026-08-07 (agent): Implemented, pending commit/push:

- `src/faro.ts`: `version: import.meta.env.VITE_APP_VERSION || undefined` (undefined for
  local builds — field omitted rather than empty string).
- `Dockerfile`: `ARG VITE_APP_VERSION=""` before `pnpm build` (ARG doubles as env var).
- `frontend.yml`: `VITE_APP_VERSION: ${{ github.sha }}` env on the host build +
  `build-args` on the image build; stale SESSION.md-caveat comment rewritten.

Verified locally: `VITE_APP_VERSION=localtest pnpm build` succeeds and the string appears
in the emitted bundle; actionlint clean on the workflow.

Remaining verification (belongs to issue 10's Frontend O11y pass): the first real
source-map upload after the FARO_* CI vars are set also proves the
`frontend-observability:*` token scopes on the `stack`-realm access policy work — the
tofu apply of 30-grafana-cloud accepted them (2026-08-06), but the token has never been
exercised.

2026-08-07 (agent): Deployed and verified serving: the bundle at
`https://shop.rottlr.de` contains the full commit sha (`b937ad8…`) as `app.version`.
`faro_sourcemap_endpoint`/`faro_app_id`/`faro_sourcemap_token` outputs added to
30-grafana-cloud (in state at next apply). Still open: the FARO_* repo vars + secret
must be set by the user (agent's gh PAT got 403 on `gh variable set`), then a frontend
workflow run must show the upload step succeed — that closes this and the token-scope
question.
