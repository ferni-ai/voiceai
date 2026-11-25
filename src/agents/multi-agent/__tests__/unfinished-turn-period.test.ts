/**
 * UNFINISHED_TURN_PERIOD_DANGLING (#4242): ink sometimes closes a thought that stopped on a
 * connective or a filler with a period ("...and.", "...um."). Main answers it at once as
 * finished; with the flag on it is held as dangling. Invented lines only.
 */
import { describe, expect, it } from 'vitest';
import { DANGLING_HOLD_MS, unfinishedTurnHoldMs, unfinishedness } from '../unfinished-turn.js';

const ON = { UNFINISHED_TURN_PERIOD_DANGLING: 'on' };
const OFF = { UNFINISHED_TURN_PERIOD_DANGLING: 'off' };

/** Turns that stop on a connective or filler with a period. */
const STOPPED_WITH_A_PERIOD = [
  'I went to the store and.',
  'Riley wanted to come but.',
  'We could do pasta or.',
  'So I was thinking, um.',
  'And then uh.',
  'It was, er.',
  'Well, erm.',
  'I called her and.")',
];

/** Real ends, some on words that dangle without a period. */
const REAL_ENDS = [
  'I think so.',
  'I wanted to.',
  'Just because.',
  'Turn it on.',
  'I made pasta today.',
  'And?',
  'But!',
  'Or what?',
];

describe('UNFINISHED_TURN_PERIOD_DANGLING', () => {
  it('on: a period after and, but, or or a filler holds the turn as dangling', () => {
    for (const turn of STOPPED_WITH_A_PERIOD) {
      expect(unfinishedness(turn, ON), turn).toBe('dangling');
      expect(unfinishedTurnHoldMs(turn, ON), turn).toBe(DANGLING_HOLD_MS);
    }
  });

  it('off or unset: the same turns are answered at once as finished (main)', () => {
    for (const turn of STOPPED_WITH_A_PERIOD)
      for (const env of [OFF, {}]) {
        expect(unfinishedness(turn, env), turn).toBe('finished');
        expect(unfinishedTurnHoldMs(turn, env), turn).toBe(0);
      }
  });

  it('on: real ends stay finished, including a question or a shout on a connective', () => {
    for (const turn of REAL_ENDS) {
      expect(unfinishedness(turn, ON), turn).toBe('finished');
      expect(unfinishedTurnHoldMs(turn, ON), turn).toBe(0);
    }
  });

  it('a comma or no punctuation after a connective dangles with the flag on or off', () => {
    for (const env of [ON, OFF])
      for (const turn of ['Riley wanted to come but,', 'I was tired so', 'We left and'])
        expect(unfinishedness(turn, env), turn).toBe('dangling');
  });

  it('a 20 KB turn gets the same verdict as its last sentence', () => {
    const lead = 'we talked about the garden and the weather. '.repeat(460);
    for (const last of ['I went to the store and.', 'I think so.', 'And?']) {
      expect(lead.length + last.length, last).toBeGreaterThan(20_000);
      expect(unfinishedness(lead + last, ON), last).toBe(unfinishedness(last, ON));
    }
  });
});
