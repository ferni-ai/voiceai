/**
 * Imported once at boot by the web server and the voice agent: logs which LOG_HASH_SECRET each
 * runs with, as phoneHashKeyVersion (the key's purpose plus an 8-hex fingerprint of a fixed
 * constant under the derived key; never the secret). A held call's number is stored under this
 * key's hash (minor_care_holds/phone#…) and the inbound SMS webhook in the web server looks it up
 * under its own: two different secrets and the hold never matches, silently.
 */
import { createLogger } from '../../utils/safe-logger.js';
import { phoneHashKeyVersion } from './checkin-replies.js';

createLogger({ module: 'phone-hash-key' }).info(
  { phoneHashKeyVersion: phoneHashKeyVersion() ?? 'unset' },
  'LOG_HASH_SECRET fingerprint'
);
