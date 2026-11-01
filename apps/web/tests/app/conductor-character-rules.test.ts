/**
 * One test per character rule: gentle springs, soft moods, the overshoot cap,
 * haptics, the neutral-pose easing allow-list and the faces that drop while
 * the user is upset.
 */
import { describe, expect, it } from 'vitest';

import type { ChannelCommand, WriteContext } from '../../src/app/call/conductor.js';
import { CONDUCTOR_POLICY } from '../../src/app/call/conductor-character.js';
import { createCharacterPolicy } from '../../src/app/call/conductor-policy.js';
import { count } from '../../src/app/call/conductor-trace.js';
import { EASING } from '../../src/config/animation-constants.js';
import type { Sequence } from '../../src/config/motion-sequences.js';
import { character, ctx, drops, gate, peak, tokenName, yRange } from './character-test-kit.js';
import { seq } from './conductor-harness.js';

describe('conductor policy: one test per character rule', () => {
  it('gentle springs: calm poses peak near 1.02, upset curves never overshoot', () => {
    const { poseEasing, gentleEasing } = CONDUCTOR_POLICY.character;
    expect(poseEasing).toBe('springGentle');
    expect(gentleEasing).toBe('gentle');
    expect(peak(poseEasing)).toBeGreaterThan(1.01); // a hint of play...
    expect(peak(poseEasing)).toBeLessThanOrEqual(1.025); // ...never a bounce
    expect(peak(gentleEasing)).toBe(1); // heavy and slow: no overshoot at all
    expect(peak('spring')).toBeGreaterThan(1.09); // what both replace
    expect(CONDUCTOR_POLICY.character.stateDurationScale).toBe(1.15);
  });

  it.each(['tender', 'upset', 'crisis'] as const)(
    '%s: a pose that would spring is eased gently, never bouncy; only neutral springs',
    async (mood) => {
      const h = character();
      await h.arrive();
      h.go('user_speaking');
      const lean = () =>
        h.played.filter((c) => c.origin === 'turn_user' && c.action === 'lean').pop();
      expect(lean()?.easing).toBe('springGentle');
      h.go('listening');
      h.setContext({ mood });
      h.go('user_speaking');
      expect(lean()?.easing).toBe('gentle');
    }
  );

  it('upset: poses and moments that would spring are eased gently instead, never bouncy', async () => {
    const calm = character();
    await calm.arrive();
    calm.conductor.beat({ kind: 'sequence', id: 'overshoot' });
    await calm.clock.advance(600);
    expect(calm.played.find((c) => c.action === 'pop')?.easing).toBe('spring');

    const upset = character();
    await upset.arrive();
    upset.setContext({ mood: 'upset' });
    upset.conductor.beat({ kind: 'sequence', id: 'overshoot' });
    await upset.clock.advance(600);
    expect(upset.played.find((c) => c.action === 'pop')?.easing).toBe('gentle');
    upset.go('user_speaking');
    const lean = upset.played.filter((c) => c.origin === 'turn_user' && c.action === 'lean').pop();
    expect(lean?.easing).toBe('gentle');
  });

  it('overshoot: only an earned big celebration in a neutral mood may pass the 1.06 cap', async () => {
    const props = { scale: [1, 1.2, 1], translateY: [0, -20, 0] };
    const big = seq('celebration_big', 500, true, [
      { element: 'avatar', animation: 'burst', duration: 500, properties: props },
    ]);
    // Unearned: a plain celebration_big beat has no reason, so it never plays at all.
    const plain = character(false, { celebration_big: big });
    await plain.arrive();
    plain.conductor.beat({ kind: 'sequence', id: 'celebration_big' });
    await plain.clock.advance(600);
    expect(drops(plain.trace(), 'delight:reason=none')).toBe(1);
    expect(plain.played.filter((c) => c.action === 'burst')).toHaveLength(0);

    // Unearned, and reaching the gate anyway: dropped; any other sequence is capped.
    const call = gate();
    const burst: ChannelCommand = {
      channel: 'body',
      action: 'burst',
      durationMs: 500,
      origin: 'x',
    };
    const w = ctx({ sequenceId: 'celebration_big' });
    expect(call.write({ ...burst, params: props }, w)).toBe('delight:celebration_big:unearned');
    expect(call.write({ ...burst, params: props }, ctx())).toMatchObject({
      params: { scale: [1, 1.06, 1], translateY: [0, -8, 0] },
    });

    // Earned: the full burst.
    const h = character(false, { celebration_big: big });
    await h.arrive();
    h.conductor.beat({ kind: 'delight', size: 'big', reason: 'achievement' });
    await h.clock.advance(600);
    expect(h.played.find((c) => c.action === 'burst')?.params).toEqual(props);
    expect(CONDUCTOR_POLICY.character.maxScale).toBe(1.06);
  });

  it('haptics: a second buzz inside 600 ms is dropped, one at 600 ms plays', async () => {
    const buzz = (id: string, pattern: string, delay: number): Sequence =>
      seq(id, 2000, true, [], { haptic: { pattern, delay } });
    const h = character(false, {
      arrival_listening: buzz('arrival_listening', 'nudge', 0),
      buzz: buzz('buzz', 'tap', 599),
      arrival_speaking: buzz('arrival_speaking', 'pulse', 600),
    });
    h.go('listening'); // nudge at 0 ms
    h.conductor.beat({ kind: 'sequence', id: 'buzz' }); // tap at 599 ms
    h.go('speaking'); // pulse at 600 ms
    await h.clock.advance(1000);
    const t = h.trace();
    expect(count(t, 'haptic', 'nudge')).toBe(1);
    expect(drops(t, 'haptic:tap:gap')).toBe(1);
    expect(count(t, 'haptic', 'tap')).toBe(0);
    expect(count(t, 'haptic', 'pulse')).toBe(1);
  });

  it('haptics: one per beat, even when the beat asks again after the gap', () => {
    const call = createCharacterPolicy({ reducedMotion: false, sound: 'full' }).forCall();
    const buzz = { channel: 'haptic', action: 'tap', durationMs: 0, origin: 'test' } as const;
    const w: WriteContext = {
      layer: 'moment',
      sequenceId: 'buzz',
      runId: 7,
      state: 'listening',
      mood: 'neutral',
      now: 0,
    };
    expect(call.write(buzz, w)).toEqual(buzz);
    expect(call.write(buzz, { ...w, now: 5000 })).toBe('haptic:tap:per-beat');
    expect(call.write(buzz, { ...w, runId: 8, now: 5000 })).toEqual(buzz);
  });
});

describe('conductor policy: neutral poses allow nothing livelier than springGentle', () => {
  it('every easing token, and any unknown curve, fits under the springGentle ceiling', () => {
    const call = gate();
    const ceiling = peak('springGentle');
    const names = [...Object.keys(EASING).map(tokenName), 'bounce', 'springHeavy'];
    const lively: string[] = [];
    for (const [i, easing] of names.entries()) {
      const cmd: ChannelCommand = {
        channel: 'body',
        action: 'lean',
        durationMs: 300,
        origin: 'x',
        easing,
      };
      const out = call.write(cmd, ctx({ layer: 'state', runId: i }));
      if (typeof out === 'string') throw new Error(out);
      const key = easing.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase();
      const value = (EASING as Readonly<Record<string, string>>)[key];
      const [lo, hi] = value ? yRange(value) : [-Infinity, Infinity];
      const fits = lo >= -1e-9 && hi <= ceiling + 1e-9;
      expect([easing, out.easing]).toEqual([easing, fits ? easing : 'springGentle']);
      if (!fits) lively.push(easing);
    }
    for (const name of ['spring', 'anticipate', 'elastic', 'springBouncy', 'springStrong']) {
      expect(lively).toContain(name);
    }
    for (const name of ['playful', 'easeOutBack', 'bounce', 'springHeavy']) {
      expect(lively).toContain(name);
    }
    // organic peaks at ~1.008, under springGentle's ~1.020, so it stays.
    expect(lively).not.toContain('organic');
    // A neutral moment keeps its own curve.
    const moment: ChannelCommand = {
      channel: 'body',
      action: 'pop',
      durationMs: 300,
      origin: 'x',
      easing: 'elastic',
    };
    expect(call.write(moment, ctx({ runId: 99 }))).toMatchObject({ easing: 'elastic' });
  });
});

it.each(['upset', 'crisis'] as const)('%s: joyful and proud faces drop too', (mood) => {
  for (const expression of ['joyful', 'proud', 'pleased', 'glad']) {
    const face: ChannelCommand = {
      channel: 'face',
      action: 'expression',
      durationMs: 200,
      origin: 'x',
      params: { expression },
    };
    expect(gate().write(face, ctx({ mood }))).toBe(`face:${expression}:mood=${mood}`);
  }
});
