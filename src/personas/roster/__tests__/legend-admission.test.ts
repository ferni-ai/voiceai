/**
 * A legend speaks as the real person only when LEGENDS_AS_THEMSELVES is on, its
 * consented-clone record covers the name, the voice and new words, and its voice
 * setting holds a usable voice id.
 * The voice ids here are invented; the real ones live only in settings.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RETIRED_CLONES, RETIRED_CLONE_VOICE_IDS } from '../../../config/voice-ids.js';
import { admitLegend } from '../domain/legend-admission.js';
import { legendAdmissionFor } from '../index.js';
import { LEGEND_VOICE_RECORDS, legendVoiceRecordFor } from '../voice-records.js';

const INVENTED_VOICE = '0b0b0b0b-1111-4222-8333-444444444444';
const ON = { LEGENDS_AS_THEMSELVES: 'on', LEGEND_VOICE_JOHN_BOGLE: INVENTED_VOICE };

describe('legendAdmissionFor', () => {
  it('admits Jack Bogle in his configured voice only once the flag is on', () => {
    const off = { ...ON, LEGENDS_AS_THEMSELVES: undefined };
    expect(legendAdmissionFor('john-bogle', off)).toEqual({ admitted: false, reason: 'flag-off' });
    expect(legendAdmissionFor('john-bogle', ON)).toEqual({
      admitted: true,
      voiceId: INVENTED_VOICE,
    });
  });

  it('admits nobody without a record, whatever the settings say', () => {
    for (const id of ['joel-dickson', 'peter-lynch', 'ferni', 'jfk']) {
      expect(legendAdmissionFor(id, ON), id).toEqual({ admitted: false, reason: 'no-record' });
    }
  });

  it.each([undefined, '', '   '])('refuses an unset voice setting (%j)', (value) => {
    expect(legendAdmissionFor('john-bogle', { ...ON, LEGEND_VOICE_JOHN_BOGLE: value })).toEqual({
      admitted: false,
      reason: 'voice-setting-unset',
    });
  });

  it('refuses a voice setting that is not a voice id', () => {
    expect(legendAdmissionFor('john-bogle', { ...ON, LEGEND_VOICE_JOHN_BOGLE: 'john 2' })).toEqual({
      admitted: false,
      reason: 'voice-not-a-uuid',
    });
  });

  it("refuses a living person's withheld clone, and takes his own reserved clone", () => {
    for (const other of [RETIRED_CLONES.joel, RETIRED_CLONES.peter]) {
      expect(legendAdmissionFor('john-bogle', { ...ON, LEGEND_VOICE_JOHN_BOGLE: other })).toEqual({
        admitted: false,
        reason: 'voice-is-withheld',
      });
    }
    const own = RETIRED_CLONES.bogle.toUpperCase();
    expect(legendAdmissionFor('john-bogle', { ...ON, LEGEND_VOICE_JOHN_BOGLE: own })).toEqual({
      admitted: true,
      voiceId: own,
    });
  });
});

describe('admitLegend', () => {
  it('refuses consent that does not cover the name, the voice and new words', () => {
    const full = legendVoiceRecordFor('john-bogle');
    if (!full) throw new Error('john-bogle has no record');
    const input = {
      flagOn: true,
      voiceId: INVENTED_VOICE,
      withheldVoiceIds: RETIRED_CLONE_VOICE_IDS,
    };
    expect(admitLegend({ ...input, record: full }).admitted).toBe(true);
    for (const covers of [['name', 'voice'], ['voice', 'new-words'], []] as const) {
      const partial = { ...full, consent: { ...full.consent, covers } };
      expect(admitLegend({ ...input, record: partial }), covers.join()).toEqual({
        admitted: false,
        reason: 'consent-does-not-cover',
      });
    }
  });
});

describe('the consented-clone records', () => {
  it("keep Jack Bogle's estate consent as a record, never a document or a voice id", () => {
    expect(legendVoiceRecordFor('John-Bogle')?.consent).toEqual({
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
