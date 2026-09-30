/**
 * Shared helpers for brand automation job handlers.
 * Extracted from brand-jobs.ts.
 */

import type { ServerResponse } from 'http';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson } from './helpers.js';

const log = createLogger({ module: 'BrandJobs' });

/**
 * Without Firestore these jobs have nothing to read or write. Report that as a
 * failure (503) so Cloud Scheduler records it, instead of a green "success"
 * with zeroed stats.
 */
export function sendFirestoreUnavailable(res: ServerResponse, job: string): void {
  log.error({ job }, 'Firestore not available - brand job did not run');
  sendJson(res, 503, {
    success: false,
    job,
    error: 'Firestore not available',
    timestamp: new Date().toISOString(),
  });
}
