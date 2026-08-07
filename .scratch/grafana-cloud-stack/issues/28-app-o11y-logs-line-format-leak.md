# App O11y logs view leaks its own `line_format` template and ANSI codes

Status: ready-for-human

The Application Observability logs view renders a raw Loki template instead of formatted
log lines, ANSI escapes and all:

    ␛[1m{{if .level }}{{alignRight 5 .level}}{{else if .severity}}…␛[0m
    ␛[90m[{{alignRight 10 .resources_service_instance_id}}…

**This is not ours.** Investigated and ruled out:

- The backend emits no ANSI whatsoever — `kubectl logs … | cat -v` shows not one `^[`.
  Spring's `spring.output.ansi.enabled` defaults to `detect` and the container has no TTY,
  so colour is off.
- We configure no log format at all: `application.yml:45-47` sets only
  `logging.level.root: INFO`. No `logback-spring.xml`, no `log4j2.xml`, no JSON encoder,
  no `logging.pattern.*` — searched all of `apps/backend/src`, `pom.xml`, `Dockerfile`,
  `compose.yaml`, `charts/shop`.
- `line_format` and `alignRight` appear **nowhere in the repository**.
- What actually lands in Loki is a bare OTLP body plus structured metadata
  (`severity_text`, `scope_name`, `thread_name`, `trace_id`, `span_id`) — no prefix, no
  colour.
- `gcx appo11y settings get` → `spec.jsonData: {}`. Nothing we set could inject a format.

`alignRight` is a Loki template function and `.resources_service_instance_id` is Grafana's
flattened-resource-attribute naming. Because the OTLP body carries only the message, App
O11y reconstructs a console-like line client-side via a `| line_format` stage — and the
`␛[1m`/`␛[90m` sequences are Grafana's own bold/grey styling, showing literally because
that view isn't ANSI-decoding the line it just built.

Requires human: this is a Grafana Cloud rendering defect to report upstream, not a change
we can make. If a local workaround is wanted it belongs in the Explore query (drop the
`| line_format` stage), not in this repo.

## Comments

2026-08-07: Filed from the issue-10 validation session, after eliminating every
repo-side explanation.
