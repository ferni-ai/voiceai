/**
 * Reported speech about someone else reads as a crisis about them (#3345, the family check-in
 * summary reads it through crisisRead). The shared reader is the crisis guard's
 * THIRD_PARTY_PATTERNS, so every caller of detectCrisis gets the same read: a third-party risk,
 * never the caller's own, and never the 988 override (third party tops out below the block).
 *
 * Every line here is invented.
 */
import { describe, expect, it } from 'vitest';

import { crisisRead } from '../../outreach/caller-text.js';
import { detectCrisis } from '../crisis-guard.js';

/** Each shape, said about she / he / they / my mom / my brother. */
const SHAPES: Record<string, string[]> = {
  'does not want to be here': [
    "she said she doesn't want to be here anymore",
    'he told me he does not want to be alive anymore',
    "my mom said she doesn't want to be here anymore",
    "my brother doesn't want to live anymore",
    "they said she didn't want to wake up again",
  ],
  'talked about ending it': [
    'he talked about ending it',
    "she's been talking about ending it all",
    'they talked about ending it',
    'my mom keeps talking about ending it',
    'my brother mentioned ending it',
    'he keeps talking about not being here anymore',
  ],
  'hurting themselves': [
    'she has been hurting herself',
    'he keeps hurting himself',
    "they've been hurting themselves",
    'my mom has been hurting herself',
    'my brother started burning himself',
    "she's been self-harming again",
  ],
  'means saved up': [
    'she mentioned she has pills saved up',
    'he has pills stockpiled',
    'they have a lot of meds hidden away',
    'my mom has been stockpiling her pills',
    "my brother said he's been saving up his meds",
  ],
};

/** The same words about something else: never a crisis read. */
const NEAR_MISSES = [
  "she said she doesn't want to be here, the party's boring",
  'he talked about ending it with his girlfriend',
  'she talked about ending it at work, the project is a mess',
  'my brother mentioned ending it before the holidays',
  "she fell asleep and can't get up early",
  "my dad's killing it at work",
  'she keeps hurting herself at the gym',
  'he has been hurting himself playing soccer',
  'my mom keeps hurting herself by accident',
  'she has pills saved in her travel bag',
  "she's saving up for a car",
  'he talked about ending the lease',
  "she doesn't want to live in that neighborhood",
  'they talked about ending it early this year',
];

describe('third-person reported crisis (#3345)', () => {
  for (const [shape, lines] of Object.entries(SHAPES)) {
    describe(shape, () => {
      it.each(lines)('reads a third-party crisis: %s', (line) => {
        const read = detectCrisis(line);
        expect(read.isCrisis).toBe(true);
        expect(read.subject).toBe('third_party');
        expect(read.indicators).toContain('third_party_risk');
        expect(crisisRead(line)).toBe(true);
      });
    });
  }

  it.each(NEAR_MISSES)('stays everyday: %s', (line) => {
    const read = detectCrisis(line);
    expect(read.isCrisis).toBe(false);
    expect(read.indicators).not.toContain('third_party_risk');
    expect(crisisRead(line)).toBe(false);
  });

  it('never takes the 988 override for a worry about someone else', () => {
    const read = detectCrisis('she mentioned she has pills saved up', {
      primary: 'distressed',
      intensity: 0.9,
      confidence: 0.9,
    });
    expect(read.subject).toBe('third_party');
    expect(read.severity).toBeLessThan(0.85);
  });

  it("leaves the caller's own words the caller's", () => {
    // A first-person crisis beside the report stays the caller's own (never lowered).
    const read = detectCrisis(
      "I want to kill myself. she said she doesn't want to be here anymore"
    );
    expect(read.subject).toBe('self');
    expect(read.severity).toBeGreaterThanOrEqual(0.9);
    // The caller talking about themselves is not a report about someone else.
    expect(detectCrisis('I talked about ending it').indicators).not.toContain('third_party_risk');
  });

  it('a fall where someone cannot get up has no medical reading in this reader (UNCONFIRMED gap)', () => {
    // The crisis guard has no medical or physical-emergency category; the escalation classifier's
    // medicalEmergency is first person only. Pinned so the gap is visible, not to bless it.
    expect(detectCrisis("she fell and can't get up").isCrisis).toBe(false);
  });
});
