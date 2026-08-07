# `FAULT_SLOW_SEARCH` produces no measurable latency — 1000 rows is too small

Status: ready-for-human

The slow-search fault is correctly implemented and completely invisible. DB O11y's Query
Performance shows nothing slow because nothing *is* slow.

## Evidence

From `pg_stat_statements` on the live database:

| query | calls | mean | max |
|---|---|---|---|
| `SELECT count(*) FROM products … ILIKE …` | 7901 | **0.57 ms** | 10.9 ms |
| `SELECT * FROM products … ILIKE …` | 7846 | **0.48 ms** | 10.7 ms |

All three ILIKE queryids *are* arriving in Grafana Cloud with full metrics — they simply
rank near the bottom of Query Performance.

The fault itself is sound: `ProductRepository.searchSlow`
(`apps/backend/src/main/java/com/spyglass/backend/repository/ProductRepository.java:15-38`)
uses `description ILIKE '%term%'` with wildcards on both sides, which no btree index can
serve, forcing a sequential scan. That is exactly the intended mechanism. The problem is
scale: `products` holds **1000 rows**, so a full seq scan of short descriptions completes
in half a millisecond. The repository's own doc comment concedes the point about the name
half of the OR — "it's not the point of this fault and the products table is small".

For contrast, `order_items` has 301582 rows and `orders` 102094; the only queries in the
database that exceed 1s are the seeding queries.

## The decision this needs

The spec pinned ~1k products, so this is a spec-level tension rather than a coding
mistake: the seeded catalog size was chosen for realism, and the fault needs a table
large enough for a seq scan to hurt. Options:

1. **More products** — raise the seed count until the seq scan is visibly slow. Most
   faithful to how the fault would behave in production, but changes the demo catalog's
   character (and lengthens Flyway seeding on every fresh session).
2. **Fatter descriptions** — keep 1000 rows but make each description much longer, so the
   scan reads far more bytes per row. Cheaper on row count and seeding time; slightly
   artificial.
3. **Accept it** — treat slow-search as a fault that exists in the SQL but is not part of
   the observable demo, and drop it from the DB O11y validation criteria.

Requires human: which of these is right depends on what the stack is meant to demonstrate,
and option 1 has a session-startup cost that only you can price.

## Comments

2026-08-07: Filed from the issue-10 validation session. Two independent agents converged
here — one measured the query timings against the live DB, the other confirmed the fault's
implementation in the repository. Neither found any artificial latency (no sleep, no
throttle): the seq scan is the whole mechanism.
