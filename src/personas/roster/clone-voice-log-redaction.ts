/**
 * A consented clone's voice id is never written to a log. Imported by the roster's
 * index.ts, so any process that imports the roster registers it; every deployed entry
 * imports the roster at boot for that reason (clone-voice-log-redaction-entries.test.ts).
 * The ids are read from their settings on every log line (utils/redacted-log-values.ts).
 *
 * @module personas/roster/clone-voice-log-redaction
 */

import { registerRedactedLogValues } from '../../utils/redacted-log-values.js';
import { configuredLegendVoiceIds } from './voice-records.js';

registerRedactedLogValues(() => configuredLegendVoiceIds());
