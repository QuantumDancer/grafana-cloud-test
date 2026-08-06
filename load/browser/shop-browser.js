// Spyglass shop — browser-driven Faro traffic loop (issue 08).
//
// This is the *sole* source of Grafana Cloud Frontend Observability
// telemetry besides an actual human clicking around (load/k6/shop-load.js
// only ever talks to the backend's /api, never loads the React app in a
// browser, so it produces zero Faro data). Low frequency by design — this
// isn't meant to look like real user *volume*, just to keep Web Vitals,
// route-change spans, and the planted JS error flowing continuously across
// a multi-day baseline run.
//
// MUST target the public https://shop.rottlr.de (charts/shop's
// browserloop.targetUrl default), never an in-cluster Service URL: the
// hosted Faro Collector's `grafana_frontend_o11y_app` resource
// (infra/30-grafana-cloud/frontend-observability.tf) sets `allowed_origins =
// ["https://shop.rottlr.de"]`, and the collector enforces CORS against that
// allowlist — a request whose page origin isn't on it has every beacon
// silently dropped, so a cluster-internal URL would run this whole loop for
// nothing.
import { browser } from 'k6/browser';
import { check, sleep } from 'k6';

const TARGET_URL = __ENV.TARGET_URL || 'https://shop.rottlr.de';

// One VU, one iteration per scenario run: this is a loop, not a load
// generator. `sleepAfterIteration` between passes plus the pod's
// restartPolicy: Always (once this bounded scenario duration elapses) is
// what makes it "low frequency, continuous" rather than either a single
// one-off run or a tight hammering loop.
export const options = {
  scenarios: {
    browse_shop: {
      executor: 'constant-vus',
      vus: 1,
      duration: '55m', // leaves headroom under the Deployment's own restart cycle
      options: {
        browser: {
          type: 'chromium',
        },
      },
    },
  },
  thresholds: {
    // A loose, best-effort check only — this scenario's job is generating
    // Faro telemetry, not enforcing SLOs; a slow page load (including the
    // deliberately slow /slow-page fault) shouldn't fail the run.
    checks: ['rate>0.5'],
  },
};

// Every step is wrapped so one failed locator (e.g. a transient page hiccup)
// doesn't abort the whole iteration — better to keep looping and generating
// *some* telemetry than to have Faro traffic go silent because one selector
// didn't match this time around.
async function safeStep(name, fn) {
  try {
    await fn();
    check(null, { [`${name} succeeded`]: () => true });
  } catch (err) {
    console.warn(`${name} failed: ${err}`);
    check(null, { [`${name} succeeded`]: () => false });
  }
}

export default async function () {
  const page = await browser.newPage();

  try {
    // --- catalog ---
    await safeStep('load catalog', async () => {
      await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
    });

    // --- product detail ---
    await safeStep('open a product', async () => {
      const card = page.locator('.product-card').first();
      await card.waitFor({ state: 'visible', timeout: 10000 });
      await card.click();
      await page.waitForSelector('.product-detail', { timeout: 10000 });
    });

    // --- cart ---
    await safeStep('add to cart', async () => {
      const addButton = page.locator('button:has-text("Add to cart")');
      await addButton.click();
      await page.locator('a:has-text("View cart")').click();
      await page.waitForSelector('.cart', { timeout: 10000 });
    });

    // --- checkout ---
    await safeStep('checkout', async () => {
      await page.locator('button:has-text("Proceed to checkout")').click();
      await page.waitForSelector('.checkout', { timeout: 10000 });
      await page.locator('button:has-text("Place order")').click();
      // Outcome is one of three planted possibilities (success / out of
      // stock / the ~2% payment-provider 500) — any of them is a completed,
      // Faro-worthy checkout interaction, so this just waits for *a*
      // resulting banner rather than requiring success specifically.
      await page.waitForSelector('.checkout__success, .error-banner', { timeout: 10000 });
    });

    // Occasionally (not every pass) visit the error-throwing Lens Care
    // Guide route too — issue 08 calls for this "occasionally", and every
    // single pass would make Frontend Observability's error rate look far
    // higher than the rest of the (mostly successful) traffic mix.
    if (Math.random() < 0.25) {
      await safeStep('trigger lens care guide error', async () => {
        await page.goto(`${TARGET_URL}/lens-care`, { waitUntil: 'networkidle' });
        await page.locator('button:has-text("Load detailed coating chart")').click();
        // The click sets state that makes the *next render* throw (see the
        // frontend's LensCareGuidePage doc comment); FaroErrorBoundary
        // reports it to Faro and then renders its fallback — give both a
        // moment to happen before moving on.
        await page.waitForTimeout(1000);
      });
    }
  } finally {
    await page.close();
  }

  // "Low frequency" per issue 08: a full pass every 2-5 minutes is plenty to
  // keep telemetry flowing without looking like synthetic hammering. This is
  // the only pacing control — the executor above has no `iterationDuration`
  // to move this into.
  sleep(120 + Math.random() * 180);
}
