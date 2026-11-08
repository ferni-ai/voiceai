/**
 * CRISIS_IMMINENT_NEEDS_AGREEMENT: a turn read with and without the everyday
 * rules that splits imminent / none gets a crisis read (crisis guidance, 988)
 * instead of the 911 script, in the narrow cases crisis-imminent-agreement.ts
 * lists. Everything else, and the flag off, is the more severe read as before.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { CrisisVerdict } from '../crisis-classifier.js';
import { moreSevereRead } from '../crisis-everyday.js';
import {
  combineReads,
  notePatternBlock,
  resetImminentAgreement,
  type TurnReads,
} from '../crisis-imminent-agreement.js';

const ON = { CRISIS_IMMINENT_NEEDS_AGREEMENT: 'on' };
const OFF = {};
const read = (risk: CrisisVerdict['risk']): CrisisVerdict => ({ risk, subject: 'self' });
const IMMINENT = read('imminent');
const CRISIS = read('crisis');
const NONE = read('none');

/** A fragment of an ordinary request, cut mid-sentence, with a risk-list word in it. */
const FRAGMENT = 'Okay, final question. Tell me her name and the last thing she';
const SIGN_OFF = 'Great, thanks. Bye for now.';
/** Quiet preparation with no pattern match: must keep an imminent read. */
const ARRANGING = "Can you ask my brother to take the dog tonight? I won't be around after.";

let calls = 0;
function turn(reads: Partial<TurnReads>, env: Record<string, string> = ON): CrisisVerdict | null {
  return combineReads({
    ruled: null,
    plain: null,
    pattern: 'none',
    latest: FRAGMENT,
    earlier: ['Who on your team is good with money?'],
    call: `call-${calls}`,
    env,
    ...reads,
  });
}

beforeEach(() => {
  resetImminentAgreement();
  calls++;
});

describe('flag off', () => {
  const risks = [IMMINENT, CRISIS, NONE, null];
  it.each(risks.flatMap((r) => risks.map((p) => [r, p] as const)))(
    'is the more severe read (%j, %j)',
    (ruled, plain) => {
      for (const latest of [FRAGMENT, SIGN_OFF]) {
        expect(turn({ ruled, plain, latest }, OFF)).toEqual(moreSevereRead(ruled, plain));
      }
    }
  );

  it('keeps imminent when the reads split (the dev false alarm)', () => {
    expect(turn({ ruled: IMMINENT, plain: NONE }, OFF)?.risk).toBe('imminent');
  });
});

describe('flag on: a split eases to crisis', () => {
  it('rules imminent, plain none: crisis, about the caller', () => {
    expect(turn({ ruled: IMMINENT, plain: NONE })).toEqual({ risk: 'crisis', subject: 'self' });
  });

  it('plain imminent, rules none, on a plain sign-off: crisis', () => {
    expect(turn({ ruled: NONE, plain: IMMINENT, latest: SIGN_OFF })?.risk).toBe('crisis');
  });

  it('two split turns in a row are both eased (a split is not agreed risk)', () => {
    expect(turn({ ruled: IMMINENT, plain: NONE })?.risk).toBe('crisis');
    expect(turn({ ruled: NONE, plain: IMMINENT, latest: SIGN_OFF })?.risk).toBe('crisis');
  });
});

describe('flag on: real risk keeps imminent', () => {
  it.each([
    ['both reads imminent', { ruled: IMMINENT, plain: IMMINENT }],
    ['imminent and crisis', { ruled: IMMINENT, plain: CRISIS }],
    ['crisis and imminent', { ruled: CRISIS, plain: IMMINENT }],
    ['a missing plain read', { ruled: IMMINENT, plain: null }],
    ['a missing ruled read', { ruled: null, plain: IMMINENT }],
    ['a lone read (no plain read ran)', { ruled: IMMINENT, plain: IMMINENT }],
    ['plain imminent on quiet preparation', { ruled: NONE, plain: IMMINENT, latest: ARRANGING }],
    [
      'plain imminent on a farewell sign-off',
      { ruled: NONE, plain: IMMINENT, latest: 'Thanks for everything. Goodbye.' },
    ],
    ['a pattern on this turn', { ruled: IMMINENT, plain: NONE, pattern: 'crisis' as const }],
    ['no known call', { ruled: IMMINENT, plain: NONE, call: undefined }],
    [
      'a pattern in an earlier line',
      { ruled: IMMINENT, plain: NONE, earlier: ['I want to kill myself.'] },
    ],
  ])('%s', (_name, reads) => {
    expect(turn(reads)?.risk).toBe('imminent');
  });

  it('a sign-off after agreed risk earlier on the call', () => {
    expect(turn({ ruled: CRISIS, plain: CRISIS, latest: 'I just feel so empty.' })?.risk).toBe(
      'crisis'
    );
    expect(turn({ ruled: NONE, plain: IMMINENT, latest: SIGN_OFF })?.risk).toBe('imminent');
  });

  it('a split after a lone crisis read earlier on the call', () => {
    expect(turn({ ruled: CRISIS, plain: CRISIS, latest: 'Nothing matters.' })?.risk).toBe('crisis');
    expect(turn({ ruled: IMMINENT, plain: NONE })?.risk).toBe('imminent');
  });

  it('a split after a turn the patterns blocked', () => {
    expect(notePatternBlock(`call-${calls}`, ON)).toBeNull();
    expect(turn({ ruled: IMMINENT, plain: NONE })?.risk).toBe('imminent');
  });

  it('a pattern block with the flag off notes nothing', () => {
    notePatternBlock(`call-${calls}`, OFF);
    expect(turn({ ruled: IMMINENT, plain: NONE })?.risk).toBe('crisis');
  });
});
