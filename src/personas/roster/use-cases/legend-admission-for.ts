/**
 * The admission check, read from the environment: LEGENDS_AS_THEMSELVES, the
 * listing's consented-clone record and its voice setting.
 *
 * @module personas/roster/use-cases/legend-admission-for
 */

import { flagOn, type Env } from '../../../config/env-flag.js';
import { RETIRED_CLONE_VOICE_IDS } from '../../../config/voice-ids.js';
import { admitLegend, type LegendAdmission } from '../domain/legend-admission.js';
import { LEGEND_VOICE_RECORDS, legendVoiceRecordFor } from '../voice-records.js';

/** Whether `listingId` may speak as the real person now, and in which voice. */
export function legendAdmissionFor(listingId: string, env: Env = process.env): LegendAdmission {
  const record = legendVoiceRecordFor(listingId);
  return admitLegend({
    flagOn: flagOn('LEGENDS_AS_THEMSELVES', env),
    record,
    voiceId: record ? env[record.voiceSetting] : undefined,
    withheldVoiceIds: RETIRED_CLONE_VOICE_IDS,
  });
}

/**
 * Every legend clone voice id that is configured, admitted or not. Only its own
 * listing may speak in one, so anything else (a custom agent) must refuse them
 * all, flag or no flag.
 */
export function configuredLegendVoiceIds(env: Env = process.env): string[] {
  return LEGEND_VOICE_RECORDS.map((r) => env[r.voiceSetting]?.trim()).filter((id): id is string =>
    Boolean(id)
  );
}
