/**
 * Serves the built ferni.ai site (apps/website/ferni-website/_site) for the
 * website specs, on a port of their own.
 *
 * The readiness probe uses node:http and drains each response. It used to
 * call fetch() and leave the body unread; Node's fetch (undici) can then
 * throw `assert(!this.paused)` from its socket handler, outside any await,
 * and Playwright pins that uncaught error on whichever test is running
 * (Deploy Landing failed that way on main twice, on run 38891888777 and on
 * dbe48cae2's first attempt).
 */

import type { BrowserContext } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { get } from 'node:http';
import { createServer } from 'node:net';

const SITE_DIR = 'apps/website/ferni-website/_site';
const STARTUP_MS = 20000;

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(true));
    probe.once('listening', () => {
      probe.close(() => resolve(false));
    });
    probe.listen(port, '127.0.0.1');
  });
}

/** True when the site answers 200; the body is always read to the end. */
function answers(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = get(url, (response) => {
      response.resume();
      response.once('end', () => resolve(response.statusCode === 200));
      response.once('error', () => resolve(false));
    });
    request.once('error', () => resolve(false));
    request.setTimeout(2000, () => request.destroy());
  });
}

async function waitForSite(url: string): Promise<void> {
  const deadline = Date.now() + STARTUP_MS;
  while (Date.now() < deadline) {
    if (await answers(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Site did not answer on ${url}`);
}

export interface BuiltSite {
  url: string;
  stop: () => void;
}

/**
 * Starts `python3 -m http.server` on the port unless something already
 * serves it, and resolves once the homepage answers.
 */
export async function serveBuiltSite(port: number): Promise<BuiltSite> {
  const url = `http://127.0.0.1:${port}`;
  let server: ChildProcess | undefined;
  if (!(await portInUse(port))) {
    server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {
      cwd: SITE_DIR,
      stdio: 'ignore',
    });
  }
  await waitForSite(url);
  return { url, stop: () => server?.kill() };
}

/** Any ferni.ai API: app.ferni.ai, api.ferni.ai, ferni.ai itself. */
const PROD_API = /^https:\/\/([a-z0-9-]+\.)*ferni\.ai\/api\//;

/**
 * Answers the built pages' calls to the production API in the browser, so a
 * spec never reaches it. Some scripts used absolute prod URLs (the exit beacon
 * in conversion-tracking.js posted to app.ferni.ai's experiments/track/batch
 * until 2026-10-18); from CI that was 167 HTTP 400s and 153 CORS blocks in prod
 * logs from origin 127.0.0.1:8768 after the consent spec landed. Returns the
 * URLs it answered.
 */
export async function keepOffProdApi(context: BrowserContext): Promise<string[]> {
  const caught: string[] = [];
  await context.route(PROD_API, (route) => {
    caught.push(route.request().url());
    return route.fulfill({ status: 204, body: '' });
  });
  return caught;
}
