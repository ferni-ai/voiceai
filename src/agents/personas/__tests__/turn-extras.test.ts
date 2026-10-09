import { describe, expect, it } from 'vitest';
import { callerLaughed, extrasFor } from '../turn-extras.js';
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

  it('thinks aloud only on real questions, never on a quick reaction', () => {
    const env = { THINK_ALOUD: 'on' };
    expect(extrasFor('what should I do', 'request', 'answer', false, () => 0, env).fired).toEqual([
      'think_aloud',
    ]);
    expect(extrasFor('my cat did it', 'share', 'answer', false, () => 0, env).fired).toEqual([]);
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

  it('asks for advice only on a light acknowledgement', () => {
    const env = { ASK_ADVICE: 'on' };
    expect(extrasFor('yeah', 'ack', 'one', false, () => 0, env).fired).toEqual(['ask_advice']);
    expect(extrasFor('my boss quit', 'share', 'one', false, () => 0, env).fired).toEqual([]);
    expect(extrasFor('yeah', 'ack', 'react', false, () => 0, env).fired).toEqual([]);
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
