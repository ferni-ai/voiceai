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

  it('leaves out "thanks to" a cause, but not "thanks to you"', () => {
    expect(callerThanked('thanks to my boss i got fired')).toBe(false);
    expect(callerThanked('thanks to the storm we lost power all week')).toBe(false);
    expect(callerThanked('Thanks to you I finally slept last night.')).toBe(true);
  });

  it('leaves out a sarcastic thanks, but not a sincere thanks a lot', () => {
    expect(callerThanked('thanks for nothing')).toBe(false);
    expect(callerThanked('gee, thanks')).toBe(false);
    expect(callerThanked('gee, thanks a lot for reminding me')).toBe(false);
    expect(callerThanked("thanks a lot, now it's broken")).toBe(false);
    expect(callerThanked('Thanks a lot for listening to all that.')).toBe(true);
  });

  it('leaves out thanks passed on from someone else, but not the caller saying it', () => {
    expect(callerThanked('my mom says thanks')).toBe(false);
    expect(callerThanked('my sister said thank you for the advice')).toBe(false);
    expect(callerThanked('I said thanks and I meant it.')).toBe(true);
    expect(callerThanked('I just wanted to say thank you.')).toBe(true);
  });

  it("leaves out a decline that isn't the whole turn", () => {
    expect(callerThanked("no thanks, i'm good")).toBe(false);
  });

  it('reads a long turn from its tail: a 200 KB story reads as its last sentence', () => {
    const story = 'We drove out past the lake and the radio kept cutting out. '.repeat(3400);
    for (const end of [SINCERE, 'thanks for nothing', 'and that was the whole trip.']) {
      const long = `${story}${end}`;
      expect(long.length).toBeGreaterThan(200_000);
      expect(callerThanked(long), end).toBe(callerThanked(end));
    }
    expect(callerThanked(`${story}${SINCERE}`)).toBe(true);
    expect(callerThanked(`Thank you. ${story}`)).toBe(false);
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

  it('on: no line on a heavy turn, or after a heavy one, a sincere thanks included', () => {
    const grief = "my dad died last month. thanks, i'll be fine";
    expect(callerThanked(grief)).toBe(true); // the words alone read as thanks
    expect(extras(grief, { THANKS_TAKEN: 'on' }).fired).not.toContain('thanks_taken');
    const signals = { ...regexSignals('Thanks, that helps.', 'share'), heavy: true };
    const after = extrasFor(
      'Thanks, that helps.',
      'share',
      'answer',
      false,
      () => 0.99,
      { THANKS_TAKEN: 'on' },
      signals
    );
    expect(after.fired).not.toContain('thanks_taken');
    expect(extras('Thanks, that helps.', { THANKS_TAKEN: 'on' }).fired).toContain('thanks_taken');
  });
});
