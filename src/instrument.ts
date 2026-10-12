/**
 * Process-level setup that must run before anything else. Import first in every
 * entry point (voice worker, per-call job child, UI server): phone numbers are
 * masked in everything the process logs (utils/log-redaction.ts), and error
 * reporting starts (a no-op unless SENTRY_DSN is set; see utils/error-reporting.ts).
 */

import { installLogPhoneRedaction } from './utils/log-redaction.js';
import { initErrorReporting } from './utils/error-reporting.js';

installLogPhoneRedaction();
await initErrorReporting();
