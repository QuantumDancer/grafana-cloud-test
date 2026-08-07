# Cloud k6 run fails its Metric Tags threshold — 1346 unique URL values

Status: ready-for-agent

The cloud run fails with "Reduce the cardinality of the url label (at least 1346 unique
values) in the http_reqs metric" (and the same for `name`, and for `http_req_receiving`).

Cause: `load/k6/shop-load.js` passes a params object to every request but only ever sets
`tags: { endpoint: … }` — never `tags.name`. k6 therefore defaults both the `name` and
`url` system tags to the fully interpolated URL, so every distinct id becomes its own
time series.

## Where the cardinality comes from

| file:line | request | distinct URLs |
|---|---|---|
| `load/k6/shop-load.js:137` | `GET /api/products?page=…` | 144 (saturates) |
| `load/k6/shop-load.js:149` | `GET /api/products/${id}` | up to 1000 |
| `load/k6/shop-load.js:156` | `GET /api/products/${id}/reviews` | up to 1000 |
| `load/k6/shop-load.js:173` | `POST /api/orders` | 1 |
| `load/k6/shop-load.js:197` | `GET /api/customers/${id}/orders` | up to 10000 |

The two product-detail sites account for roughly 78% of the observed 1346; order history
~11%, catalog ~11%. (Per-site split is modelled from the 14-minute 1→5 VU ramp at lines
98-102, not measured — the direction is certain, the exact split is an estimate.) Left
running longer the ceiling is ~12,145.

## Fix — add a `name` tag at each dynamic site

    :137  tags: { endpoint: 'catalog' }
       →  tags: { endpoint: 'catalog', name: 'GET /api/products' }
    :149  tags: { endpoint: 'catalog', name: 'GET /api/products/{id}' }
    :156  tags: { endpoint: 'catalog', name: 'GET /api/products/{id}/reviews' }
    :173  tags: { endpoint: 'checkout', name: 'POST /api/orders' }
    :197  tags: { endpoint: 'order_history', name: 'GET /api/customers/{id}/orders' }

Setting `tags.name` **also overwrites the `url` tag** (confirmed in the k6 docs' own JSON
sample, which emits `"name":"PostsItemURL","url":"PostsItemURL"`), so this one change
fixes both reported labels — no `options.systemTags` surgery needed. Result: 1346 → 5
series. The thresholds at lines 111-112 key off `endpoint` and are unaffected.

## Scope note — the in-cluster loadgen is unaffected in practice

The same script runs continuously in-cluster, but `count({__name__=~"k6_.+"})` is empty in
`grafanacloud-prom` (control: `count(up)`=17) — that runner is stdout-only, so the
cardinality bloats nothing but its end-of-run summary. The fix improves that summary and
is harmless there.

Done: a cloud run passes the Metric Tags threshold; `http_reqs` carries 5 `name` values.

## Not yet retrieved

The failed cloud run record itself could not be pulled: `gcx k6 *` fails with
`401 InvalidCredentials "Token could not be parsed"` because `GRAFANA_CLOUD_TOKEN` in
`~/.config/gcx/env` is a 20-character placeholder beginning `REPL…` rather than a `glc_`
portal token. The stack-proxied route reaches the k6 backend but is rejected because the
service-account identity has no email. IDs recovered from
`infra/30-grafana-cloud/terraform.tfstate` instead: project `spyglass` = 8309113, load
test `shop-load` = 1304210.

## Comments

2026-08-07: Filed from the issue-10 validation session.
