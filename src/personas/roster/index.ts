/**
 * The roster (docs/plans/2026-11-12-one-roster.md): import from here, not from
 * the files inside. So far it holds the legends' consented-clone voice records;
 * the admission check and the listings themselves come later.
 *
 * @module personas/roster
 */

import './clone-voice-log-redaction.js'; // no log line carries a clone's voice id

export { configuredLegendVoiceIds } from './voice-records.js';
