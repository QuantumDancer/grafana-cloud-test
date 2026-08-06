{{/*
Common labels, shared by every resource this chart renders.
*/}}
{{- define "shop.labels" -}}
app.kubernetes.io/part-of: spyglass
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{/*
Every resource name in this chart is plain "<release name>-<component>"
(e.g. "spyglass-backend"), inlined directly at each call site rather than
routed through a fullname-style helper — this chart is only ever installed
once, under the fixed release name "spyglass", by scripts/deploy-shop.sh, so
the usual multiple-installs-per-namespace collision guard doesn't apply.
*/}}
