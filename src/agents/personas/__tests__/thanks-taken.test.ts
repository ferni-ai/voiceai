import { describe, expect, it } from 'vitest';
import { callerThanked, THANKS_TAKEN_LINE } from '../thanks-taken.js';
import { extrasFor, regexSignals } from '../turn-extras.js';

// The line from rt-1114-thanks-so-much that got the next cat joke on 2 of 2 dev calls (#3877).
const SINCERE = "Thanks. Really. Thank you. You're a good listener.";

/** extrasFor on a share, with a fixed draw so only the env differs between runs. */
function extras(text: string, env: Record<string, string | undefined>, crisisRisk = false) {
  const signals = { ...regexSignals(text, 'share'), crisisRisk };
  return extrasFor(text, 'share', 'answer', false, () => 0.99, env, signals);
}

describe('callerThanked', () => {
  it('hears a mid-call thank-you or kind word', () => {
    for (const t of [
      SINCERE,
      "Sorry. Thank you for letting me tell you this. I know it's silly.",
      'Thanks, that helps.',
      'I really appreciate it.',
      "You're the best.",
      'you are such a good friend',
    ]) {
      expect(callerThanked(t), t).toBe(true);
    }
  });

  it('leaves out goodbyes, declines and look-alike words', () => {
    for (const t of [
      'Thanks, bye!',
      'Okay thanks, talk soon.',
      'thank you, goodnight',
      'No thanks, I already ate.',
      'no thank you',
      'Thanks but no thanks.',
      'Thanksgiving was a whole thing this year.',
      'She thanked me for the leaf.',
      'my roommate keeps eating my yogurt',
    ]) {
      expect(callerThanked(t), t).toBe(false);
    }
  });
});

describe('THANKS_TAKEN in extrasFor', () => {
  it('on: adds the take-the-thanks line on a sincere thank-you', () => {
    const out = extras(SINCERE, { THANKS_TAKEN: 'on' });
    expect(out.lines).toContain(THANKS_TAKEN_LINE);
    expect(out.fired).toContain('thanks_taken');
  });

  it('off or unset: the extras are exactly what they were without the flag', () => {
    const unset = extras(SINCERE, {});
    const off = extras(SINCERE, { THANKS_TAKEN: 'off' });
    expect(unset.lines).not.toContain(THANKS_TAKEN_LINE);
    expect(unset.fired).not.toContain('thanks_taken');
    expect(off).toEqual(unset);
  });

  it('on: changes nothing else, and draws nothing from the random source', () => {
    let draws = 0;
    const counted = () => {
      draws += 1;
      return 0.99;
    };
    const signals = regexSignals(SINCERE, 'share');
    const on = extrasFor(
      SINCERE,
      'share',
      'answer',
      false,
      counted,
      { THANKS_TAKEN: 'on' },
      signals
    );
    const onDraws = draws;
    draws = 0;
    const off = extrasFor(SINCERE, 'share', 'answer', false, counted, {}, signals);
    expect(onDraws).toBe(draws);
    expect(on.lines.filter((l) => l !== THANKS_TAKEN_LINE)).toEqual(off.lines);
    expect(on.fired.filter((f) => f !== 'thanks_taken')).toEqual(off.fired);
  });

  it('on: no line for a goodbye, a turn without thanks, or a call with crisis risk', () => {
    expect(extras('Okay thanks, talk soon.', { THANKS_TAKEN: 'on' }).fired).not.toContain(
      'thanks_taken'
    );
    expect(extras('Today she brought me a leaf.', { THANKS_TAKEN: 'on' }).fired).not.toContain(
      'thanks_taken'
    );
    expect(extras(SINCERE, { THANKS_TAKEN: 'on' }, true).fired).not.toContain('thanks_taken');
  });
});
