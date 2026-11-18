/**
 * Process-level setup that must run before anything else. Import first in every
 * entry point (voice worker, per-call job child, UI server): phone numbers are
 * masked in everything the process logs (utils/log-redaction.ts), and error
 * reporting starts (a no-op unless SENTRY_DSN is set; see utils/error-reporting.ts).
 */

import './utils/log-redaction-install.js';
import './personas/roster/index.js'; // and no consented clone's voice id
import { initErrorReporting } from './utils/error-reporting.js';

await initErrorReporting();
