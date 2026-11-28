/**
 * CRISIS_CLASSIFIER_OTHER_IMMINENT_911 beside the means forms (#3789): a line in the caller's own
 * voice about the means, which the classifier reads as someone else in immediate danger. With
 * CRISIS_MEANS_IN_HAND and CRISIS_MEANS_NOMINATE both live the patterns read the caller, so who is
 * at risk is unsure: 911 for them first, the for-them reply, then the caller's own script whole.
 * Every other setting reads no pattern, and the reply is main's. All lines are fictional.
 */
import { describe, expect, it } from 'vitest';

import { forThemFirst } from '../../../services/safety/crisis-caller-check.js';
import { CALL_911_FOR_THEM } from '../../../services/safety/crisis-guard-replies.js';
import {
  applyClassifierVerdict,
  detectCrisis,
  type ClassifierVerdictLike,
} from '../../../services/safety/crisis-guard.js';

const FLAG = 'CRISIS_CLASSIFIER_OTHER_IMMINENT_911';
/** A means line only the nominating forms read (whole supply, then the intent). */
const LINE = 'i have a full bottle of pills here and i want to take them all';
/** No pattern reads it: only the classifier can. */
const GARAGE = 'my brother is sitting in the garage with the car running and the door shut';
const OTHER_IMMINENT: ClassifierVerdictLike = { risk: 'imminent', subject: 'third_party' };
/** The caller's own imminent script says this of their safety. */
const OWN_SAFETY = 'Your safety matters most right now.';

type Means = Record<'CRISIS_MEANS_IN_HAND' | 'CRISIS_MEANS_NOMINATE', string>;
const SETTINGS: ReadonlyArray<readonly [string, Means]> = [
  ['both off', { CRISIS_MEANS_IN_HAND: 'off', CRISIS_MEANS_NOMINATE: 'off' }],
  ['in hand live', { CRISIS_MEANS_IN_HAND: 'live', CRISIS_MEANS_NOMINATE: 'off' }],
  ['nominate live', { CRISIS_MEANS_IN_HAND: 'off', CRISIS_MEANS_NOMINATE: 'live' }],
  ['both live', { CRISIS_MEANS_IN_HAND: 'live', CRISIS_MEANS_NOMINATE: 'live' }],
];

const reply = (line: string, means: Means, flag: 'on' | 'off'): string => {
  const env = { ...means, [FLAG]: flag };
  const merged = applyClassifierVerdict(
    detectCrisis(line, undefined, { env }),
    OTHER_IMMINENT,
    env
  );
  return merged.suggestedResponse ?? '';
};
const at = (text: string, n: string) => (text.includes(n) ? text.indexOf(n) : Infinity);
const sentences = (text: string) => text.split(/(?<=[.?!])\s+|\n+/).filter(Boolean);
const forThemReply = reply(GARAGE, SETTINGS[0][1], 'off');

describe('someone else in danger, read by the classifier, on a means line', () => {
  it('only both means flags live read the line as the caller’s own', () => {
    for (const [label, means] of SETTINGS) {
      const read = detectCrisis(LINE, undefined, { env: means });
      expect(read.subject === 'self', label).toBe(label === 'both live');
    }
  });

  it.each(SETTINGS)('%s: 911 for them first, 988 said, the for-them reply whole', (_, means) => {
    const on = reply(LINE, means, 'on');
    expect(on.startsWith(CALL_911_FOR_THEM)).toBe(true);
    expect(at(on, '911')).toBeLessThan(at(on, '988'));
    expect(on).toContain(forThemReply);
  });

  it.each(SETTINGS)('%s: loses no sentence of main’s reply', (_, means) => {
    const [on, off] = [reply(LINE, means, 'on'), reply(LINE, means, 'off')];
    for (const sentence of sentences(off)) expect(on).toContain(sentence);
  });

  it('both live: the for-them reply, then the caller’s own script whole', () => {
    const means = SETTINGS[3][1];
    const [on, off] = [reply(LINE, means, 'on'), reply(LINE, means, 'off')];
    expect(off).toContain(OWN_SAFETY);
    expect(on).toBe(forThemFirst(`${forThemReply}\n\n${off}`));
    expect(at(on, forThemReply)).toBeLessThan(at(on, OWN_SAFETY));
  });

  it.each(SETTINGS.slice(0, 3))('%s: no pattern reads the caller, so main’s reply', (_, means) => {
    expect(reply(LINE, means, 'on')).toBe(forThemFirst(reply(LINE, means, 'off')));
    expect(reply(LINE, means, 'on')).not.toContain(OWN_SAFETY);
  });
});
