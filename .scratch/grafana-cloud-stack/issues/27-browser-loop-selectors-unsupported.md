# Browser loop's cart, checkout and lens-care steps have never run

Status: ready-for-agent

`load/browser/shop-browser.js` uses Playwright-only `:has-text()` pseudo-selectors, which
k6/browser does not implement — it forwards them straight to `document.querySelectorAll`,
which throws. Verified in the live pod's logs:

    level=warning msg="add to cart failed: clicking on \"button:has-text(\\\"Add to cart\\\")\":
      SyntaxError: Failed to execute 'querySelectorAll' on 'Document':
      'button:has-text(\"Add to cart\")'"
    level=warning msg="checkout failed: clicking on \"button:has-text(\\\"Proceed to checkout\\\")\": SyntaxError: …"

Affected lines: **83, 85, 91, 93, 108**.

This matters more than a failing selector usually would, because the browser loop is our
**sole Faro telemetry source besides real users** (per issue 08). `safeStep` swallows each
failure into a failed check and the loop continues, so the pod looks healthy and keeps
reporting — but it has only ever exercised catalog and product-detail pages. Cart,
checkout and the planted `/lens-care` error route have never been driven.

Two things follow that were previously mysterious:

- Frontend O11y session data is narrower than it appears — no checkout funnel, and no
  automatically-generated frontend exceptions.
- The `checks: ['rate>0.5']` threshold at line 46 is crossed every cycle
  (`level=error msg="thresholds on metrics 'checks' have been crossed"`), which had been
  read as noise.

## Fix

Replace the `:has-text()` selectors with k6/browser-supported locators — `getByRole` /
`getByText`, or plain CSS/XPath. Prefer role- or text-based locators over structural CSS
so the script does not re-break on markup changes.

While in there, consider whether `safeStep` should keep swallowing every failure. Its
current behaviour is what let five broken selectors run unnoticed for a whole session — a
step that fails on *every* iteration is a defect, not a flake, and could reasonably fail
the run rather than be logged as a warning.

Done: cart, checkout and lens-care steps complete in the loop; the `checks` threshold
stops being crossed; Faro shows checkout-funnel sessions and the planted frontend error
arriving without manual browsing.

## Comments

2026-08-07: Found incidentally while investigating the Synthetic Monitoring check during
the issue-10 validation session — the two are unrelated defects in different scripts.
