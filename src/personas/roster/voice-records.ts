/**
 * The consented-clone records: which legends may speak as the real person, in
 * that person's cloned voice.
 *
 * Each estate gave written consent, held by the owner off the repo and attested
 * 2026-11-14 (docs/decisions/register.md). The voice ids come from one setting
 * per legend and are never written here.
 *
 * @module personas/roster/voice-records
 */

import { RETIRED_CLONES } from '../../config/voice-ids.js';
import { FULL_LEGEND_CONSENT, type ConsentedCloneRecord } from './domain/voice-record.js';

export const LEGEND_VOICE_RECORDS: readonly ConsentedCloneRecord[] = [
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
];

/** The record for a listing, or undefined when it has none. */
export function legendVoiceRecordFor(listingId: string): ConsentedCloneRecord | undefined {
  const id = listingId.trim().toLowerCase();
  return LEGEND_VOICE_RECORDS.find((r) => r.listingId === id);
}
