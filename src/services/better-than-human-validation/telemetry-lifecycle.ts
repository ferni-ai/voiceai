/**
 * When BTH capability events reach Firestore (#4069). Off (BTH_TELEMETRY_FLUSH), the
 * buffer in production-telemetry.ts flushes only when it holds 50 events, and anything
 * under 50 is lost when the process exits. On: every process that runs calls flushes it
 * every 30 s, and drains it at shutdown.
 *
 * @module services/better-than-human-validation/telemetry-lifecycle
 */

import type { Env } from '../../config/env-flag.js';
import { flagOn } from '../../config/env-flag.js';
import { TimeoutError, withTimeout } from '../../utils/async.js';
import { createLogger } from '../../utils/safe-logger.js';
import { initBTHTelemetry, shutdownBTHTelemetry } from './production-telemetry.js';

const log = createLogger({ module: 'BTHTelemetryLifecycle' });

let started = false;

/** Starts the 30 s flush once per process when the flag is on; true when this call started it. */
export function startBTHTelemetryIfEnabled(env: Env = process.env): boolean {
  if (started || !flagOn('BTH_TELEMETRY_FLUSH', env)) return false;
  initBTHTelemetry();
  started = true;
  return true;
}

/** Stops the flush and sends what is buffered, waiting at most `timeoutMs`. Not started: a no-op. */
export async function stopBTHTelemetry(timeoutMs: number): Promise<void> {
  if (!started) return;
  started = false;
  try {
    await withTimeout(shutdownBTHTelemetry(), timeoutMs, 'BTH telemetry flush');
  } catch (error) {
    if (error instanceof TimeoutError) {
      log.warn({ timeoutMs }, 'BTH telemetry flush unfinished at shutdown; buffered events lost');
    } else {
      log.error({ error: String(error) }, 'BTH telemetry flush failed at shutdown');
    }
  }
}
