/**
 * Checks run against a deployed URL before traffic is promoted to it:
 * an HTTP health check with retries, and a real-browser smoke test.
 */

import { execFileSync } from 'child_process';
import { join } from 'path';

const warn = (msg: string) => console.log(`\x1b[33m⚠\x1b[0m ${msg}`);

/**
 * Health check a URL with retries
 */
export async function healthCheck(
  url: string,
  options: { maxRetries?: number; retryDelay?: number; timeout?: number } = {}
): Promise<{ healthy: boolean; statusCode?: number; error?: string }> {
  const { maxRetries = 5, retryDelay = 3000, timeout = 10000 } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return { healthy: true, statusCode: response.status };
      }

      warn(`Health check attempt ${attempt}/${maxRetries}: status ${response.status}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      warn(`Health check attempt ${attempt}/${maxRetries}: ${errorMsg}`);
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }

  return { healthy: false, error: `Failed after ${maxRetries} attempts` };
}

/**
 * Load a frontend URL in a real browser (scripts/smoke-frontend.mjs).
 *
 * A 200 doesn't mean the app runs: on 2026-10-04 the JS crashed at module
 * evaluation behind a 200. Returns false if the smoke script exits non-zero.
 */
export function smokeTestFrontend(projectRoot: string, url: string): boolean {
  try {
    execFileSync('node', [join(projectRoot, 'scripts/smoke-frontend.mjs'), url], {
      cwd: projectRoot,
      stdio: 'inherit',
    });
    return true;
  } catch {
    return false;
  }
}
