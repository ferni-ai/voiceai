/**
 * The consented-clone records keep that an estate's consent exists and what it
 * covers, never the document or a voice id. The voice id here is invented.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RETIRED_CLONE_VOICE_IDS } from '../../../config/voice-ids.js';
import { configuredLegendVoiceIds } from '../index.js';
import { LEGEND_VOICE_RECORDS } from '../voice-records.js';

const INVENTED_VOICE = '0b0b0b0b-1111-4222-8333-444444444444';

describe('the consented-clone records', () => {
  it("keep Jack Bogle's estate consent as a record, never a document or a voice id", () => {
    const bogle = LEGEND_VOICE_RECORDS.find((r) => r.listingId === 'john-bogle');
    expect(bogle?.consent).toEqual({
      person: 'John C. "Jack" Bogle',
      basis: 'estate',
      heldBy: 'owner',
      attested: '2026-11-14',
      covers: ['name', 'voice', 'new-words'],
    });
    const source = readFileSync(
      join(process.cwd(), 'src/personas/roster/voice-records.ts'),
      'utf-8'
    );
    expect(source).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('give every legend its own setting and reserve only withheld clones', () => {
    const settings = LEGEND_VOICE_RECORDS.map((r) => r.voiceSetting);
    expect(new Set(settings).size).toBe(settings.length);
    for (const r of LEGEND_VOICE_RECORDS) {
      expect(r.voiceSetting).toMatch(/^LEGEND_VOICE_[A-Z_]+$/);
      for (const id of r.reservedCloneIds) expect(RETIRED_CLONE_VOICE_IDS.has(id)).toBe(true);
    }
  });
});

describe('configuredLegendVoiceIds', () => {
  it('lists a set voice setting, trimmed, and skips an unset or blank one', () => {
    expect(configuredLegendVoiceIds({ LEGEND_VOICE_JOHN_BOGLE: ` ${INVENTED_VOICE} ` })).toEqual([
      INVENTED_VOICE,
    ]);
    for (const value of [undefined, '', '   ']) {
      expect(configuredLegendVoiceIds({ LEGEND_VOICE_JOHN_BOGLE: value })).toEqual([]);
    }
  });
});
