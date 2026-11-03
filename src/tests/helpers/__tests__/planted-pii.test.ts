/**
 * plantedPiiIn: the no-PII probe the turn receipt and context packet tests use.
 * It must ignore counts that happen to share digits with the planted phone and
 * still catch every way the planted text can reach a log, numbers included.
 */
import { describe, expect, it } from 'vitest';
import { plantedPiiIn } from '../snippet-leak.js';

const PLANTED = ['Jane', '555', '867', '5309'];
const COUNTS = ['sections', 'tokens', 'timing'];

describe('plantedPiiIn', () => {
  it('ignores counts and timings that share digits with the planted phone', () => {
    // The shape that failed #3366: a section estimated at 555 tokens, an 867 ms timing.
    const log = { sections: [['this_turn', 555]], tokens: 5309, timing: { ttsMs: 867 } };
    expect(JSON.stringify(log)).toContain('555'); // a bare substring check would flag it
    expect(plantedPiiIn(log, PLANTED, COUNTS)).toEqual([]);
  });

  it('reads a number outside the count fields as text: a phone fragment is caught', () => {
    expect(plantedPiiIn({ last4: 5309 }, PLANTED, COUNTS)).toEqual(['5309']);
    expect(plantedPiiIn({ phone: 15558675309 }, PLANTED, COUNTS)).toEqual(['555', '867', '5309']);
    // the same number is caught beside a count field, just not under it
    expect(plantedPiiIn({ tokens: 12, caller: { last4: 5309 } }, PLANTED, COUNTS)).toEqual([
      '5309',
    ]);
  });

  it('a count field only counts on the log object itself, not nested deeper', () => {
    expect(plantedPiiIn({ caller: { tokens: 5309 } }, PLANTED, COUNTS)).toEqual(['5309']);
    // logger call args wrap the log object in arrays; its own keys still qualify
    expect(plantedPiiIn([[{ tokens: 5309 }, 'CONTEXT_PACKET']], PLANTED, COUNTS)).toEqual([]);
  });

  it('with no count fields named, every number is read as text', () => {
    expect(plantedPiiIn({ tokens: 555 }, PLANTED)).toEqual(['555']);
  });

  it('finds a planted fragment in a string value, at any depth, even under a count field', () => {
    const log = ['CONTEXT_PACKET', { sections: [{ text: 'call 555 867 5309' }] }];
    expect(plantedPiiIn(log, PLANTED, COUNTS)).toEqual(['555', '867', '5309']);
  });

  it('finds a planted fragment used as a key', () => {
    expect(plantedPiiIn({ timing: { Jane: 1 } }, PLANTED, COUNTS)).toEqual(['Jane']);
  });

  it('reads the value as logged: toJSON output counts, dropped fields do not', () => {
    const viaToJson = { toJSON: () => ({ caller: 'Jane' }) };
    expect(plantedPiiIn(viaToJson, PLANTED)).toEqual(['Jane']);
    expect(plantedPiiIn({ hidden: undefined, fn: () => 'Jane' }, PLANTED)).toEqual([]);
  });
});
