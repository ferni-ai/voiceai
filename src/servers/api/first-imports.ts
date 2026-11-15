/**
 * What the API server imports before anything else, in this order. Imports are evaluated in
 * order, so a module imported ahead of the log redaction can log a phone number unmasked,
 * and the app logger keeps the first sink it builds.
 */
import '../../utils/log-redaction-install.js'; // mask phone numbers in all logs, first
import '../../config/refuse-production-data.js'; // loads dotenv, then the prod-data guard
import '../../instrument.js'; // error reporting; a no-op without SENTRY_DSN
