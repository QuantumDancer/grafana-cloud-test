// Spyglass shop — primary k6 HTTP load scenario (issue 08).
//
// Runs identically in three places:
//   1. In-cluster, continuously, via charts/shop's loadgen Deployment — see
//      that template's comment on why a bounded (not literally infinite)
//      scenario duration plus the Pod's implicit restartPolicy: Always is
//      how "continuous" is achieved without this script looping forever.
//   2. Manually via `k6 cloud` against https://shop.rottlr.de (occasional
//      runs per the spec) — the same file is also `file()`-read directly by
//      infra/30-grafana-cloud/k6.tf's `grafana_k6_load_test` resource.
//   3. `k6 run` from a developer machine for local iteration.
//
// All paths below start with /api so this script is valid unmodified against
// both an in-cluster Service (BASE_URL has no path prefix, the shop chart's
// HTTPRoute routes /api straight to the backend) and the public hostname
// (same HTTPRoute, same /api prefix, over the internet).
//
// Only k6's own built-in modules are imported — no Node APIs (fs, path,
// etc.) — a requirement for `k6 cloud`/cloud execution, where the script
// runs in k6's own JS runtime, not Node.
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// BASE_URL: charts/shop's loadgen Deployment sets this to the in-cluster
// backend Service DNS name; a manual `k6 cloud` run overrides it to the
// public hostname. Local `k6 run` with no override falls back to the
// hostname too, since there's no in-cluster DNS outside the pod.
const BASE_URL = __ENV.BASE_URL || 'https://shop.rottlr.de';

// ~1,000 products / ~10,000 customers seeded by the backend's Flyway
// migrations (see apps/backend/README.md) — picking uniformly across these
// ranges spreads load across the whole seeded dataset rather than hammering
// a handful of hot rows, which would make the N+1 and slow-search faults
// look artificially better-cached than they'd be under real traffic.
const PRODUCT_ID_MAX = 1000;
const CUSTOMER_ID_MAX = 10000;

// Search terms deliberately split into two flavors:
//   - SLOW_SEARCH_TERMS: short/common substrings. FAULT_SLOW_SEARCH's
//     unanchored `ILIKE '%term%'` can't use the description index regardless
//     of term, but a short common substring matches far more rows, forcing a
//     bigger sequential scan and a slower, more demonstrable query — exactly
//     the "slow search terms" issue 08 asks for.
//   - PRODUCT_SEARCH_TERMS: realistic shopper queries, mixed in so the
//     traffic profile doesn't look like 100% adversarial probing.
const SLOW_SEARCH_TERMS = ['a', 'e', 'pro', 'the', 'lens'];
const PRODUCT_SEARCH_TERMS = ['telescope', 'binoculars', 'magnifying', '8x42', 'refractor', 'zoom'];
const CATEGORIES = ['', 'Telescopes', 'Binoculars', 'Magnifying Glasses'];

// Custom metrics kept separate from the default http_req_failed/duration so
// the checkout flow's *expected* ~2% planted 500 rate (FAULT_CHECKOUT_ERRORS)
// can be observed without ever tripping a threshold — see the `thresholds`
// block below, which deliberately excludes checkout requests from the
// blanket failure-rate check.
const checkoutErrorRate = new Rate('checkout_error_rate');
const checkoutDuration = new Trend('checkout_duration', true);
const orderHistoryDuration = new Trend('order_history_duration', true);
const searchDuration = new Trend('search_duration', true);

function randomInt(max) {
  return Math.floor(Math.random() * max) + 1;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Time-of-day traffic variation (issue 08): rather than encode a literal
// 24-hour ramp into k6's stage durations — which would make one k6 process
// lifetime *be* a day, awkward for both the bounded in-cluster restart cycle
// and a short manual `k6 cloud` run — each iteration reads the wall-clock
// hour and scales its own pacing. VU count stays constant (set by
// `options.scenarios`); this instead makes iterations faster/slower, which
// is what actually varies request rate over real calendar time as the
// container keeps restarting across a multi-day baseline run.
function diurnalSleepMultiplier() {
  const hour = new Date().getHours();
  if (hour >= 9 && hour < 21) return 1; // daytime: full pace
  if (hour >= 6 && hour < 9 || hour >= 21 && hour < 24) return 2; // shoulder hours: half pace
  return 4; // 00:00-06:00: quiet-hours pace, a quarter of daytime traffic
}

export const options = {
  scenarios: {
    shop_traffic: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '2m', target: Number(__ENV.VUS) || 5 }, // ramp up
        { duration: '10m', target: Number(__ENV.VUS) || 5 }, // steady state
        { duration: '2m', target: 0 }, // ramp down
      ],
      // Lets an in-flight iteration (e.g. mid-checkout) finish cleanly
      // rather than being cut off when the scenario ramps down.
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // Excludes /api/orders (checkout) — see checkoutErrorRate above — so the
    // planted ~2% payment-provider failures never fail the test run.
    'http_req_failed{endpoint:catalog}': ['rate<0.05'],
    'http_req_failed{endpoint:order_history}': ['rate<0.05'],
    http_req_duration: ['p(95)<8000'], // generous: FAULT_SLOW_SEARCH is *meant* to be slow
  },
};

export default function () {
  const sleepScale = diurnalSleepMultiplier();

  group('browse and search', function () {
    // Plain category browse (no search term) most of the time; an
    // occasional search, biased toward the deliberately slow terms so
    // FAULT_SLOW_SEARCH gets regularly exercised without being 100% of
    // search traffic.
    const category = pick(CATEGORIES);
    const doSearch = Math.random() < 0.6;
    const term = doSearch ? (Math.random() < 0.4 ? pick(SLOW_SEARCH_TERMS) : pick(PRODUCT_SEARCH_TERMS)) : '';
    const page = randomInt(3);

    // k6's JS runtime has no URLSearchParams (it's a browser/Node global,
    // not one of k6's built-ins) — building the query string by hand keeps
    // this valid for `k6 cloud` too.
    const queryParts = [`page=${page}`];
    if (term) queryParts.push(`search=${encodeURIComponent(term)}`);
    if (category) queryParts.push(`category=${encodeURIComponent(category)}`);

    const res = http.get(`${BASE_URL}/api/products?${queryParts.join('&')}`, {
      tags: { endpoint: 'catalog' },
    });
    searchDuration.add(res.timings.duration);
    check(res, { 'catalog/search status is 200': (r) => r.status === 200 });
  });

  sleep((0.5 + Math.random()) * sleepScale);

  let viewedProductId = null;
  group('product detail', function () {
    viewedProductId = randomInt(PRODUCT_ID_MAX);
    const res = http.get(`${BASE_URL}/api/products/${viewedProductId}`, {
      tags: { endpoint: 'catalog' },
    });
    check(res, { 'product detail status is 200': (r) => r.status === 200 });

    // Reviews only exist on ~30% of products (README) — a 404/empty result
    // here is expected often, not a bug, so it isn't checked strictly.
    http.get(`${BASE_URL}/api/products/${viewedProductId}/reviews`, {
      tags: { endpoint: 'catalog' },
    });
  });

  sleep((0.5 + Math.random()) * sleepScale);

  // Checkout on a minority of iterations — most shop visits browse without
  // buying, and this keeps write/order-volume traffic modest relative to
  // read traffic, which is realistic for a storefront.
  if (Math.random() < 0.3) {
    group('checkout', function () {
      const customerId = randomInt(CUSTOMER_ID_MAX);
      const payload = JSON.stringify({
        customerId,
        items: [{ productId: viewedProductId || randomInt(PRODUCT_ID_MAX), quantity: randomInt(3) }],
      });
      const res = http.post(`${BASE_URL}/api/orders`, payload, {
        headers: { 'Content-Type': 'application/json' },
        tags: { endpoint: 'checkout' },
      });
      checkoutDuration.add(res.timings.duration);
      // 201 = placed, 409 = out of stock (a real, expected outcome — the
      // randomly picked quantity can exceed a low-stock item's stock), 500 =
      // FAULT_CHECKOUT_ERRORS's simulated payment-provider failure. All three
      // are "the request worked as designed"; only anything else counts
      // against checkoutErrorRate.
      const expected = res.status === 201 || res.status === 409 || res.status === 500;
      checkoutErrorRate.add(!expected);
      check(res, { 'checkout got an expected status': () => expected });
    });

    sleep((0.5 + Math.random()) * sleepScale);
  }

  // Order history on a minority of iterations too — this is the endpoint
  // FAULT_N_PLUS_ONE lives on, so it's worth hitting regularly, but a
  // shopper checking past orders is less frequent than browsing.
  if (Math.random() < 0.2) {
    group('order history', function () {
      const customerId = randomInt(CUSTOMER_ID_MAX);
      const res = http.get(`${BASE_URL}/api/customers/${customerId}/orders`, {
        tags: { endpoint: 'order_history' },
      });
      orderHistoryDuration.add(res.timings.duration);
      check(res, { 'order history status is 200': (r) => r.status === 200 });
    });
  }

  sleep((1 + Math.random() * 2) * sleepScale);
}
