/**
 * The consented-clone records: which listings may speak as a real person, in
 * that person's cloned voice.
 *
 * Each legend's estate gave written consent, attested 2026-11-14
 * (docs/decisions/register.md). Seth gave his own for the `seth` teammate,
 * attested 2026-11-17. The owner holds every consent off the repo. The voice
 * ids come from one setting per listing and are never written here.
 *
 * @module personas/roster/voice-records
 */

import type { Env } from '../../config/env-flag.js';
import { RETIRED_CLONES } from '../../config/voice-ids.js';
import { FULL_LEGEND_CONSENT, type ConsentedCloneRecord } from './domain/voice-record.js';

const LEGEND_VOICE_RECORDS: readonly ConsentedCloneRecord[] = [
  {
    kind: 'consented-clone',
    listingId: 'john-bogle',
    voiceSetting: 'LEGEND_VOICE_JOHN_BOGLE',
    reservedCloneIds: [RETIRED_CLONES.bogle],
    consent: {
      person: 'John C. "Jack" Bogle',
      basis: 'estate',
      heldBy: 'owner',
      attested: '2026-11-14',
      covers: FULL_LEGEND_CONSENT,
    },
  },
  {
    kind: 'consented-clone',
    listingId: 'seth',
    // Also named in config/voice-ids.ts (sethVoiceId), which can't import this file.
    voiceSetting: 'ROSTER_VOICE_SETH',
    reservedCloneIds: [],
    consent: {
      person: 'Seth Ford',
      basis: 'self',
      heldBy: 'owner',
      attested: '2026-11-17',
      covers: FULL_LEGEND_CONSENT,
    },
  },
];

/**
 * Every consented clone voice id that is configured (the legends' and Seth's).
 * A custom agent must refuse them all.
 */
export function configuredLegendVoiceIds(env: Env = process.env): string[] {
  return LEGEND_VOICE_RECORDS.map((r) => env[r.voiceSetting]?.trim()).filter((id): id is string =>
    Boolean(id)
  );
}
