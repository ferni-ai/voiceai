#!/usr/bin/env node
/**
 * Browser smoke test for a deployed (or locally previewed) web frontend.
 *
 * An HTTP 200 only proves index.html was served. On 2026-10-04 app.ferni.ai
 * returned 200 while its JS threw at module evaluation (cyclic manualChunks,
 * "Cannot access 'v' before initialization"), so the page was blank and every
 * status-code health gate passed it. This loads the pages in a real browser
 * and fails on any uncaught page error, or if the sign-in gate never renders.
 *
 * Usage:
 *   node scripts/smoke-frontend.mjs <url> [--timeout <ms>]
 *
 * Exit codes: 0 = healthy, 1 = smoke failed, 2 = bad usage / browser launch failed.
 * Needs a Playwright chromium: npx playwright install --only-shell chromium
 */

import { chromium } from '@playwright/test';

const SIGN_IN_TEXT = 'Continue with Google';

// Console errors that are backend or preview-channel noise, not frontend
// breakage: the circuit-breaker poll hits the API, and service-worker
// registration fails on preview channels and on plain-http localhost.
const IGNORED_CONSOLE_ERRORS = [/\/health\/circuits/i, /service ?worker/i];

// Time to keep listening after a page is up, so errors thrown by lazily
// imported chunks still get caught.
const SETTLE_MS = 2000;

function parseArgs(argv) {
  const args = argv.slice(2);
  let timeout = 30000;
  const timeoutIdx = args.indexOf('--timeout');
  if (timeoutIdx !== -1) {
    timeout = Number(args[timeoutIdx + 1]);
    args.splice(timeoutIdx, 2);
  }
  const [rawUrl] = args;
  if (!rawUrl || !Number.isFinite(timeout) || timeout <= 0) {
    console.error('Usage: node scripts/smoke-frontend.mjs <url> [--timeout <ms>]');
    process.exit(2);
  }
  let base;
  try {
    base = new URL(rawUrl.endsWith('/') ? rawUrl : `${rawUrl}/`);
  } catch {
    console.error(`Not a valid URL: ${rawUrl}`);
    process.exit(2);
  }
  return { base, timeout };
}

/**
 * Load one path and return a list of human-readable failure reasons
 * (empty list = healthy).
 */
async function checkPage(context, url, { timeout, expectText }) {
  const failures = [];
  const page = await context.newPage();

  page.on('pageerror', (err) => {
    failures.push(`uncaught error: ${err.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = `${msg.text()} ${msg.location()?.url ?? ''}`;
    if (IGNORED_CONSOLE_ERRORS.some((re) => re.test(text))) return;
    failures.push(`console error: ${msg.text()}`);
  });

  try {
    const response = await page.goto(url, { waitUntil: 'load', timeout });
    if (!response || !response.ok()) {
      failures.push(`HTTP ${response ? response.status() : 'no response'}`);
    }
    if (expectText) {
      await page
        .getByText(expectText, { exact: true })
        .first()
        .waitFor({ state: 'visible', timeout })
        .catch(() => failures.push(`"${expectText}" not visible within ${timeout}ms`));
    }
    await page.waitForTimeout(SETTLE_MS);
  } catch (err) {
    failures.push(`navigation failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    await page.close();
  }
  return failures;
}

async function main() {
  const { base, timeout } = parseArgs(process.argv);
  const checks = [
    { path: '/', expectText: SIGN_IN_TEXT },
    { path: '/admin.html', expectText: null },
  ];

  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    console.error(`Could not launch chromium: ${err instanceof Error ? err.message : err}`);
    console.error('Install it with: npx playwright install --only-shell chromium');
    process.exit(2);
  }

  let failed = false;
  try {
    const context = await browser.newContext();
    for (const { path, expectText } of checks) {
      const url = new URL(path.replace(/^\//, ''), base).href;
      const failures = await checkPage(context, url, { timeout, expectText });
      if (failures.length === 0) {
        console.log(`PASS ${url}`);
      } else {
        failed = true;
        console.log(`FAIL ${url}`);
        for (const f of failures) console.log(`  - ${f}`);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(failed ? 'Frontend smoke test FAILED' : 'Frontend smoke test passed');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
