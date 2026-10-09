import { describe, expect, it } from 'vitest';
import { callerLaughed, callerVenting, extrasFor } from '../turn-extras.js';
import { rngFor, turnShapeFor } from '../turn-shape.js';

const ALL_ON = { CURIOUS_DETAIL: 'on', THINK_ALOUD: 'on', LAUGH_ALONG: 'on', ASK_ADVICE: 'on' };

/** An rng that counts its draws and always returns `value`. */
function counting(value: number): { rng: () => number; draws: () => number } {
  let n = 0;
  return {
    rng: () => {
      n++;
      return value;
    },
    draws: () => n,
  };
}

describe('turn extras', () => {
  it('does nothing and draws nothing when every switch is off', () => {
    const c = counting(0);
    const out = extrasFor('haha what should I cook', 'request', 'answer', true, c.rng, {});
    expect(out).toEqual({ lines: [], fired: [] });
    expect(c.draws()).toBe(0);
  });

  it('hears laughter as whole words only', () => {
    for (const t of [
      'Haha, she did.',
      'ha ha okay',
      'lol',
      'Hah.',
      'hehe',
      '[laughter] yes',
      'Ha, I love that.',
    ])
      expect(callerLaughed(t), t).toBe(true);
    for (const t of [
      'That is half true.',
      'what a chat',
      'Shahid called',
      'the hall',
      'I said ha to him',
      'Hand it over',
    ])
      expect(callerLaughed(t), t).toBe(false);
  });

  it('laughs along only when they laughed', () => {
    const env = { LAUGH_ALONG: 'on' };
    expect(
      extrasFor('Haha, she did it again.', 'share', 'one', false, () => 0.9, env).fired
    ).toEqual(['laugh_along']);
    expect(extrasFor('She did it again.', 'share', 'one', false, () => 0.9, env).fired).toEqual([]);
  });

  it('thinks aloud on real questions and some longer answers, never on a quick reaction', () => {
    const env = { THINK_ALOUD: 'on' };
    expect(extrasFor('what should I do', 'request', 'answer', false, () => 0, env).fired).toEqual([
      'think_aloud',
    ]);
    expect(extrasFor('my cat did it', 'share', 'answer', false, () => 0, env).fired).toEqual([
      'think_aloud',
    ]);
    expect(extrasFor('my cat did it', 'share', 'answer', false, () => 0.5, env).fired).toEqual([]);
    expect(extrasFor('my cat did it', 'share', 'one', false, () => 0, env).fired).toEqual([]);
    expect(extrasFor('how are you', 'about_ferni', 'react', false, () => 0, env).fired).toEqual([]);
  });

  it('aims an allowed question at a detail, and sometimes makes a share reply one curious question', () => {
    const env = { CURIOUS_DETAIL: 'on' };
    const allowed = extrasFor('Biscuit ate it', 'share', 'answer', true, () => 0, env);
    expect(allowed.questionLine).toMatch(/one specific thing they mentioned/);
    expect(allowed.questionLine).toMatch(/never how it feels/);
    const one = extrasFor('Biscuit ate it', 'share', 'one', false, () => 0, env);
    expect(one.shapeLine).toMatch(/^THIS REPLY: one short curious question/);
    expect(one.questionLine).toBe('');
    expect(extrasFor('Biscuit ate it', 'share', 'one', false, () => 0.9, env).fired).toEqual([]);
  });

  it('asks for advice on light turns, never while they are venting', () => {
    const env = { ASK_ADVICE: 'on' };
    expect(extrasFor('yeah', 'ack', 'one', false, () => 0, env).fired).toEqual(['ask_advice']);
    expect(extrasFor('we got a puppy', 'share', 'answer', false, () => 0, env).fired).toEqual([
      'ask_advice',
    ]);
    expect(extrasFor('it has been a long day', 'share', 'one', false, () => 0, env).fired).toEqual(
      []
    );
    expect(extrasFor('yeah', 'ack', 'react', false, () => 0, env).fired).toEqual([]);
  });

  it('adds fillers, laughter and opinions only with HUMAN_TEXTURE, and none while venting', () => {
    const env = { HUMAN_TEXTURE: 'on' };
    expect(extrasFor('we got a puppy', 'share', 'answer', false, () => 0, {}).fired).toEqual([]);
    expect(
      extrasFor('the cat is plotting against me', 'share', 'answer', false, () => 0, env).fired
    ).toEqual(['filler', 'laugh_spontaneous', 'opinion']);
    const venting = extrasFor('honestly I am exhausted', 'share', 'answer', false, () => 0, env);
    expect(venting.fired).toEqual(['filler']);
    expect(extrasFor('haha she did it', 'share', 'one', false, () => 0, env).fired).not.toContain(
      'laugh_spontaneous'
    );
  });

  it('laughs on its own only when their words are funny or a happy surprise', () => {
    const env = { HUMAN_TEXTURE: 'on' };
    const laughs = (t: string) =>
      extrasFor(t, 'share', 'one', false, () => 0, env).fired.includes('laugh_spontaneous');
    expect(laughs('she did it on purpose, I swear')).toBe(true);
    expect(laughs('guess what, we got engaged')).toBe(true);
    // Live, he laughed at both of these.
    expect(laughs("my week's been okay, kind of a slow one")).toBe(false);
    expect(laughs('she said yes and I teared up')).toBe(false);
    expect(laughs('my grandpa passed away last week')).toBe(false);
  });

  it('hears venting as whole words only', () => {
    for (const t of [
      'Work was just a lot, I am so stressed',
      'it has been a long day',
      'I feel awful',
    ])
      expect(callerVenting(t), t).toBe(true);
    for (const t of [
      'I saddled the horse',
      'a rougher draft',
      'the worstead sweater',
      'my cat did it',
    ])
      expect(callerVenting(t), t).toBe(false);
  });

  it('keeps the reply shape the same with extras off, and reports what fired with them on', () => {
    const said = 'Haha, so what should I make for dinner?';
    const before = { ...process.env };
    try {
      for (const k of Object.keys(ALL_ON)) delete process.env[k];
      const off = turnShapeFor(said, rngFor('s'));
      expect(off.extras).toEqual([]);
      Object.assign(process.env, ALL_ON);
      const onShape = turnShapeFor(said, rngFor('s'));
      expect(onShape.shape).toBe(off.shape);
      expect(onShape.extras).toContain('laugh_along');
      expect(onShape.reminder).toMatch(/\[laughter\]/);
      expect(onShape.reminder).not.toMatch(/[—–]|\.\.\.|…|,,/);
    } finally {
      process.env = before;
    }
  });
});
