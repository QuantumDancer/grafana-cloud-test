#!/bin/sh
# Generates the runtime config the built bundle reads at startup (see
# src/config.ts) from environment variables. Installed as
# /docker-entrypoint.d/50-spyglass-config.sh, one of the hook scripts the
# nginxinc/nginx-unprivileged base image's own entrypoint runs (in filename
# order) *before* it execs nginx itself — so this script must not exec or
# background anything, just write the file and return. Written in POSIX sh,
# not bash, because the alpine base only ships /bin/sh.
set -eu

CONFIG_PATH="/usr/share/nginx/html/config.js"
FARO_COLLECTOR_URL="${FARO_COLLECTOR_URL:-}"
FARO_APP_KEY="${FARO_APP_KEY:-}"
APP_ENVIRONMENT="${APP_ENVIRONMENT:-test}"
FAULTS_ENABLED="${FAULTS_ENABLED:-true}"

# Hand-rolled JSON string escaping (backslash and double-quote only) rather
# than reaching for jq/envsubst: keeps the image's runtime dependency surface
# to "nginx and sh", and the only untrusted-ish input here is operator-set
# env vars, not user data.
escape_json() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

collector_url_escaped=$(escape_json "$FARO_COLLECTOR_URL")
app_key_escaped=$(escape_json "$FARO_APP_KEY")
environment_escaped=$(escape_json "$APP_ENVIRONMENT")

# FAULTS_ENABLED is a boolean flag, not free text, so it's written as a bare
# JS literal rather than a quoted+escaped string like the others.
case "$FAULTS_ENABLED" in
  true | True | TRUE | 1) faults_enabled_literal=true ;;
  *) faults_enabled_literal=false ;;
esac

cat > "$CONFIG_PATH" <<EOF
window.__SPYGLASS_CONFIG__ = {
  faroCollectorUrl: "${collector_url_escaped}",
  faroAppKey: "${app_key_escaped}",
  appEnvironment: "${environment_escaped}",
  faultsEnabled: ${faults_enabled_literal}
};
EOF
