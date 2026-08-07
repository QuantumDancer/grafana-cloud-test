# Fractional `?page=` reaches the backend and 400s

Status: ready-for-agent

Hand-editing the catalog URL to `?page=2.7` produces "Failed to load products (400)".

`CatalogPage.tsx:20` parses with `Number(searchParams.get('page') ?? '1') || 1`, which
passes `2.7` straight through (it's truthy, so the `|| 1` guard never fires).
`toWirePageNumber` (`apps/frontend/src/api/mapping.ts:108`) then only clamps the lower
bound:

    return Math.max(0, (page ?? 1) - 1);

so the request carries `page=1.7000000000000002` and Spring rejects it.

Fix: truncate in `toWirePageNumber` — it already owns the "malformed `?page=` can't
become a negative index" responsibility per its doc comment, so integer-ness belongs in
the same place rather than in the route.

Not a regression: the pre-issue-15 code parsed the same way, the pager buttons only ever
emit integers, and it fails soft to a banner. Filed because the guard is one character
from being complete, not because it's urgent.

Done: `?page=2.7` renders a page of products instead of the error banner; a unit test in
`mapping` covers the fractional input.

## Comments

2026-08-07: Filed from SESSION.md during triage. Found by the fresh-context verifier that
returned CONFIRMED on issue 15 — deferred at the time because changing the reviewed bytes
after the verdict would have invalidated the coverage that earned it.
