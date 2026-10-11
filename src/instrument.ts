/**
 * Process-level error reporting. Import first in every entry point (voice
 * worker, per-call job child, UI server). Does nothing unless SENTRY_DSN is set;
 * see utils/error-reporting.ts.
 */

import { initErrorReporting } from './utils/error-reporting.js';

await initErrorReporting();
