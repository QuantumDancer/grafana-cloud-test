// Synthetic Monitoring "browser" check script (k6-browser dialect).
//
// Kept intentionally trivial: SM browser checks bill per-execution against
// the free tier's 10k/month browser-execution pool (shared with API
// executions), so this just proves the page loads and renders its title —
// not a full user-journey test (that's k6 Cloud's job, see load/k6/).
import { browser } from 'k6/browser';
import { check } from 'k6';

export const options = {
  scenarios: {
    ui: {
      executor: 'shared-iterations',
      options: {
        browser: {
          type: 'chromium',
        },
      },
    },
  },
};

export default async function () {
  const page = await browser.newPage();
  try {
    await page.goto('https://shop.rottlr.de');
    check(page, {
      'title contains shop name': async (p) => (await p.title()).length > 0,
    });
    check(page, {
      'page has rendered content': await page.locator('body').isVisible(),
    });
  } finally {
    await page.close();
  }
}
