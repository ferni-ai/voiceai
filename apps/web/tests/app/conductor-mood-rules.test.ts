/**
 * The character rules for soft moods (tender, upset, crisis), streaks, playful
 * faces, sound cooldown, the crisis pin, and crisis being quiet.
 */
import { describe, expect, it } from 'vitest';

import type { Mood } from '../../src/app/call/call-types.js';
import type { ChannelCommand, MomentBeat } from '../../src/app/call/conductor.js';
import { count } from '../../src/app/call/conductor-trace.js';
import { EASING } from '../../src/config/animation-constants.js';
import { character, ctx, drops, gate, tokenName, yRange } from './character-test-kit.js';

describe('conductor policy: the rules the first verify could not turn red', () => {
  it.each(['tender', 'upset', 'crisis'] as const)(
    '%s: every easing token that leaves 0..1, and any unknown curve, becomes gentle',
    (mood) => {
      const call = gate();
      const names = [
        ...Object.keys(EASING).map(tokenName),
        'bounce',
        'springHeavy',
        'elastic.out(1, 0.7)',
      ];
      let bouncy = 0;
      for (const [i, easing] of names.entries()) {
        const cmd: ChannelCommand = {
          channel: 'body',
          action: 'move',
          durationMs: 300,
          origin: 'x',
          easing,
        };
        const out = call.write(cmd, ctx({ mood, runId: i }));
        if (typeof out === 'string') throw new Error(out);
        const key = easing.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase();
        const value = (EASING as Readonly<Record<string, string>>)[key];
        const [lo, hi] = value ? yRange(value) : [-Infinity, Infinity];
        const still = lo >= -1e-9 && hi <= 1 + 1e-9;
        expect([easing, out.easing]).toEqual([easing, still ? easing : 'gentle']);
        if (!still) bouncy += 1;
      }
      expect(bouncy).toBeGreaterThanOrEqual(10); // spring, anticipate, elastic, springGentle, ...
      // Neutral keeps a moment's own curve.
      const neutral = call.write(
        { channel: 'body', action: 'move', durationMs: 300, origin: 'x', easing: 'elastic' },
        ctx({ runId: 99 })
      );
      expect(neutral).toMatchObject({ easing: 'elastic' });
    }
  );

  it.each(['tender', 'upset', 'crisis'] as const)(
    '%s: a scale pop never grows past resting size',
    (mood) => {
      const pop = { channel: 'body', action: 'pop', durationMs: 300, origin: 'x' } as const;
      const params = { scale: [0.97, 1.03, 1], translateY: [0, -4, 0] };
      expect(gate().write({ ...pop, params }, ctx({ mood }))).toMatchObject({
        params: { scale: [0.97, 1, 1], translateY: [0, -4, 0] },
      });
      expect(gate().write({ ...pop, params }, ctx())).toMatchObject({ params });
    }
  );

  it('upset and crisis: haptics are softened to softTap, not silenced; neutral and tender keep theirs', () => {
    const buzz = { channel: 'haptic', action: 'success', durationMs: 0, origin: 'x' } as const;
    expect(gate().write(buzz, ctx({ mood: 'upset' }))).toMatchObject({ action: 'softTap' });
    expect(gate().write(buzz, ctx({ mood: 'crisis' }))).toMatchObject({ action: 'softTap' });
    expect(gate().write(buzz, ctx({ mood: 'tender' }))).toMatchObject({ action: 'success' });
    expect(gate().write(buzz, ctx())).toMatchObject({ action: 'success' });
  });

  it('delight budget: one big and three small per call; the second big and fourth small drop', () => {
    const call = gate();
    const min = 90_000;
    const delight = (size: 'small' | 'big', at: number) =>
      call.moment({ kind: 'delight', size, reason: 'achievement' }, 'neutral', at);
    expect(delight('big', 0)).toEqual({ play: 'celebration_big' });
    expect(delight('big', min)).toBe('delight:big:budget');
    expect(delight('small', min)).toEqual({ play: 'celebration_small' });
    expect(delight('small', 2 * min)).toEqual({ play: 'celebration_small' });
    expect(delight('small', 3 * min)).toEqual({ play: 'celebration_small' });
    expect(delight('small', 4 * min)).toBe('delight:small:budget');
  });

  it('a plain celebration sequence beat needs a reason like any delight', () => {
    const call = gate();
    expect(call.moment({ kind: 'sequence', id: 'celebration_small' }, 'neutral', 0)).toBe(
      'delight:reason=none'
    );
    expect(call.moment({ kind: 'sequence', id: 'celebration_big' }, 'neutral', 0)).toBe(
      'delight:reason=none'
    );
    expect(call.moment({ kind: 'sequence', id: 'celebration_big' }, 'upset', 0)).toBe(
      'delight:mood=upset'
    );
  });

  it('streaks and unlocks are never celebrated, even in a neutral mood', async () => {
    const call = gate();
    const streak: MomentBeat = { kind: 'delight', size: 'small', reason: 'streak' as never };
    expect(call.moment(streak, 'neutral', 0)).toBe('delight:reason=streak');
    const asked = (id: string, mood: Mood = 'neutral') =>
      call.moment({ kind: 'sequence', id }, mood, 0);
    expect(asked('streak_milestone')).toBe('delight:reason=streak');
    expect(asked('team_unlock')).toBe('delight:reason=unlock');
    expect(asked('streak_milestone', 'upset')).toBe('delight:mood=upset');
    expect(asked('team_unlock', 'crisis')).toBe('delight:mood=crisis');
    // End to end: a streak beat on a calm call celebrates nothing.
    const h = character();
    await h.arrive();
    h.conductor.beat(streak);
    await h.clock.advance(2000);
    expect(count(h.trace(), 'glow', 'celebrate')).toBe(0);
  });

  it.each(['tender', 'upset', 'crisis'] as const)(
    '%s: playful faces (wink, mischief, sheepish, amused, double-take) are dropped',
    (mood) => {
      const face = (expression: string, action = 'expression'): ChannelCommand => ({
        channel: 'face',
        action,
        params: { expression },
        durationMs: 200,
        origin: 'x',
      });
      for (const name of [
        'winking',
        'mischievous',
        'sheepish',
        'amused',
        'playful',
        'cheeky',
        'silly',
        'teasing',
      ]) {
        expect(gate().write(face(name), ctx({ mood }))).toBe(`face:${name}:mood=${mood}`);
        expect(gate().write(face(name), ctx())).toMatchObject({ params: { expression: name } });
      }
      const doubleTake = face('doubleTake', 'micro');
      expect(gate().write(doubleTake, ctx({ mood }))).toBe(`face:doubleTake:mood=${mood}`);
      expect(gate().write(doubleTake, ctx())).toMatchObject({ action: 'micro' });
      expect(gate().write(face('warm'), ctx({ mood }))).toMatchObject({
        params: { expression: 'warm' },
      });
    }
  );

  it('sound: the same track cannot replay within 2 s; at 2 s it plays', () => {
    const call = gate();
    const chime = { channel: 'sound', action: 'play', durationMs: 0, origin: 'x' } as const;
    const play = (now: number) =>
      call.write({ ...chime, params: { track: 'ui.chime' } }, ctx({ now }));
    expect(play(0)).toMatchObject({ action: 'play' });
    expect(play(1999)).toBe('sound:ui.chime:cooldown');
    expect(play(2000)).toMatchObject({ action: 'play' });
  });

  it.each(['neutral', 'tender'] as const)(
    'crisis: the caring face pin releases when the mood moves on to %s',
    async (mood) => {
      const h = character();
      await h.arrive();
      const m = h.mark();
      h.setContext({ mood: 'crisis' });
      h.conductor.beat({ kind: 'expression', name: 'warm' });
      expect(drops(h.since(m), 'face:warm:crisis-pinned')).toBe(1);
      h.setContext({ mood });
      await h.clock.advance(1300); // past the 1.2 s face dwell
      h.conductor.beat({ kind: 'expression', name: 'warm' });
      expect(count(h.since(m), 'face', 'expression', 'warm')).toBe(1);
    }
  );
});

describe('conductor policy: crisis is quiet, then sound comes back', () => {
  const play = (track: string): ChannelCommand => ({
    channel: 'sound',
    action: 'play',
    durationMs: 0,
    origin: 'x',
    params: { track },
  });

  it('crisis silences the persona too; once it passes, sound plays again', () => {
    const call = gate();
    call.onMood('crisis');
    expect(call.write(play('persona.maya'), ctx({ mood: 'crisis' }))).toBe(
      'sound:persona.maya:mood=crisis'
    );
    expect(call.write(play('ui.chime'), ctx({ mood: 'crisis' }))).toBe(
      'sound:ui.chime:mood=crisis'
    );
    call.onMood('neutral');
    expect(call.write(play('ui.chime'), ctx({ now: 5000 }))).toMatchObject({ action: 'play' });
    expect(call.write(play('persona.maya'), ctx({ now: 5000 }))).toMatchObject({ action: 'play' });
  });
});
