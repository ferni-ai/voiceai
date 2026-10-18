/**
 * Side-effect import that masks phone numbers in everything this process logs (see
 * log-redaction.ts). Import it first in an entry point: imports are evaluated in order,
 * so anything imported before it can log unredacted while it loads.
 */
import { installLogPhoneRedaction } from './log-redaction.js';

installLogPhoneRedaction();
