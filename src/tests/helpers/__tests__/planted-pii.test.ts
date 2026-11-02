/**
 * plantedPiiIn: the no-PII probe the turn receipt and context packet tests use.
 * It must ignore counts that happen to share digits with the planted phone and
 * still catch every way the planted text can reach a log.
 */
import { describe, expect, it } from 'vitest';
import { plantedPiiIn } from '../snippet-leak.js';

const PLANTED = ['Jane', '555', '867', '5309'];
const DIGITS = '5558675309';

describe('plantedPiiIn', () => {
  it('ignores counts and timings that share digits with the planted phone', () => {
    // The shape that failed #3366: a section estimated at 555 tokens, an 867 ms timing.
    const log = { sections: [['this_turn', 555]], tokens: 5309, timing: { ttsMs: 867 } };
    expect(JSON.stringify(log)).toContain('555'); // a bare substring check would flag it
    expect(plantedPiiIn(log, PLANTED, DIGITS)).toEqual([]);
  });

  it('finds a planted fragment in a string value, at any depth', () => {
    const log = ['CONTEXT_PACKET', { notes: [{ text: 'call 555 867 5309' }] }];
    expect(plantedPiiIn(log, PLANTED, DIGITS)).toEqual(['555', '867', '5309']);
  });

  it('finds a planted fragment used as a key', () => {
    expect(plantedPiiIn({ byName: { Jane: 1 } }, PLANTED)).toEqual(['Jane']);
  });

  it('finds the planted phone logged as a number', () => {
    expect(plantedPiiIn({ phone: 15558675309 }, PLANTED, DIGITS)).toEqual([DIGITS]);
  });

  it('reads the value as logged: toJSON output counts, dropped fields do not', () => {
    const viaToJson = { toJSON: () => ({ caller: 'Jane' }) };
    expect(plantedPiiIn(viaToJson, PLANTED)).toEqual(['Jane']);
    expect(plantedPiiIn({ hidden: undefined, fn: () => 'Jane' }, PLANTED)).toEqual([]);
  });
});
