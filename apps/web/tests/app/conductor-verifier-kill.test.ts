/**
 * The independent verifier's kill tests for #2998 round 6, adopted verbatim
 * (only this comment and prettier formatting differ). Each asserts a stated
 * rule of the character policy and turns red under the mutant it was written
 * to kill (voiceai-evidence/motion-audit-2026-10-29/v2998r6/).
 */
import { describe, expect, it } from 'vitest';

import type { ChannelCommand, MomentBeat, WriteContext } from '../../src/app/call/conductor.js';
import { createConductor } from '../../src/app/call/conductor.js';
import { createCharacterPolicy } from '../../src/app/call/conductor-policy.js';
import { count } from '../../src/app/call/conductor-trace.js';
import { REDUCED_MOTION } from '../../src/config/motion-sequences.js';
import { SEQUENCES } from '../../src/config/sequences.generated.js';
import {
  CHANNELS,
  EXTRA_SEQUENCES,
  FakeClock,
  harness,
  seq,
  SOUND_MS,
} from './conductor-harness.js';

const policy = () =>
  createCharacterPolicy({
    reducedMotion: false,
    sound: 'full',
    reducedMotionTable: REDUCED_MOTION,
  });
const character = (sequences = {}) => harness({ policy: policy(), sequences });
const gate = () => createCharacterPolicy({ reducedMotion: false, sound: 'full' }).forCall();
const ctx = (p: Partial<WriteContext> = {}): WriteContext => ({
  layer: 'moment',
  sequenceId: 't',
  runId: 1,
  state: 'listening',
  mood: 'neutral',
  now: 0,
  ...p,
});
const small: MomentBeat = { kind: 'delight', size: 'small', reason: 'achievement' };
const big: MomentBeat = { kind: 'delight', size: 'big', reason: 'achievement' };
const maxScale = (c: ChannelCommand) =>
  Math.max(
    1,
    ...Object.entries(c.params ?? {})
      .filter(([k]) => k.startsWith('scale'))
      .flatMap(([, v]) => (Array.isArray(v) ? v : [v]) as number[])
  );

describe('verifier kill tests 2998r6', () => {
  it('K3 rule 7: a yield aborts the celebration sound that already started', async () => {
    const clock = new FakeClock();
    const sounds: { at: number; abortedAt?: number; origin: string }[] = [];
    const adapters = Object.fromEntries(
      CHANNELS.map((id) => [
        id,
        {
          id,
          mount: () => true,
          settle: () => undefined,
          play(cmd: ChannelCommand, signal: AbortSignal) {
            if (id !== 'sound' || cmd.action !== 'play') return Promise.resolve();
            const rec: (typeof sounds)[number] = { at: clock.now(), origin: cmd.origin };
            sounds.push(rec);
            return new Promise<void>((res) => {
              const h = clock.setTimeout(res, SOUND_MS);
              signal.addEventListener('abort', () => {
                rec.abortedAt = clock.now();
                clock.clearTimeout(h);
                res();
              });
            });
          },
        },
      ])
    );
    const c = createConductor({
      adapters,
      clock,
      sequences: { ...SEQUENCES, ...EXTRA_SEQUENCES },
      policy: policy(),
    });
    const base = { attempt: 1, mood: 'neutral' as const, slowStage: 0 as const, persona: 'ferni' };
    c.onContext(base);
    c.beat(small); // celebration.small sound at 0 ms
    await clock.advance(200);
    c.onContext({ ...base, mood: 'upset' });
    const s = sounds.find((x) => x.origin === 'celebration_small');
    expect(s?.abortedAt).toBe(200);
  });

  it('K5 rule 2: a new call (attempt) starts a fresh delight budget in the conductor', async () => {
    const h = character();
    await h.arrive();
    h.conductor.beat(big);
    await h.clock.advance(5000);
    h.setContext({ attempt: 2 });
    const m = h.mark();
    await h.arrive();
    h.conductor.beat(big);
    await h.clock.advance(5000);
    expect(count(h.since(m), 'sound', 'play', 'celebration.big')).toBe(1);
  });

  it('K5b rule 2: a handoff inside one call does not refill the budget', async () => {
    const h = character();
    await h.arrive();
    h.conductor.beat(big);
    await h.clock.advance(5000);
    h.go('handoff_out', { handoffTo: 'maya' });
    await h.clock.advance(1000);
    h.go('handoff_in', { handoffTo: 'maya', persona: 'maya' } as never);
    await h.clock.advance(100_000);
    const m = h.mark();
    h.conductor.beat(big);
    await h.clock.advance(5000);
    expect(count(h.since(m), 'sound', 'play', 'celebration.big')).toBe(0);
  });

  it('K6b rule 1: a write after the mood turns tender is shaped by the live mood, not the mood its run started in', async () => {
    const pop = seq('probe_pop', 1000, false, [
      {
        element: 'avatar',
        animation: 'pop',
        delay: 500,
        duration: 300,
        easing: 'spring',
        properties: { scale: [1, 1.05, 1] },
      },
    ]);
    const h = character({ probe_pop: pop });
    await h.arrive();
    h.conductor.beat({ kind: 'sequence', id: 'probe_pop' });
    await h.clock.advance(100);
    h.setContext({ mood: 'tender' });
    await h.clock.advance(1000);
    const w = h.played.find((c) => c.action === 'pop');
    expect(w?.easing).toBe('gentle');
    expect(maxScale(w!)).toBe(1);
  });

  it('K7 rule 1: in a second call, a small celebration is capped at 1.06 whatever the first call earned', async () => {
    const h = character();
    await h.arrive();
    h.conductor.beat(big);
    await h.clock.advance(5000);
    h.setContext({ attempt: 2 });
    await h.arrive();
    const n = h.played.length;
    h.conductor.beat(big); // fresh call: earned big, its own run
    await h.clock.advance(5000);
    await h.clock.advance(90_000);
    h.conductor.beat(small);
    await h.clock.advance(5000);
    const glow = h.played.slice(n).filter((c) => c.origin === 'celebration_small');
    expect(glow.length).toBeGreaterThan(0);
    expect(Math.max(...glow.map(maxScale))).toBeLessThanOrEqual(1.06);
  });

  it('K7b rule 1: two conductors (two page loads), same run ids: the second call small is still capped', async () => {
    const a = character();
    await a.arrive();
    a.conductor.beat(big);
    await a.clock.advance(5000);
    const b = character();
    await b.arrive();
    b.conductor.beat(small);
    await b.clock.advance(5000);
    const glow = b.played.filter((c) => c.origin === 'celebration_small');
    expect(Math.max(...glow.map(maxScale))).toBeLessThanOrEqual(1.06);
  });

  it('K10 rule 4: in crisis the goodbye haptic (a state pose) is softened to softTap, not kept', async () => {
    const h = character();
    await h.arrive();
    h.setContext({ mood: 'crisis' });
    const m = h.mark();
    h.go('ending');
    await h.clock.advance(3000);
    const hs = h
      .since(m)
      .filter(([, c]) => c === 'haptic')
      .map(([, , a]) => a);
    expect(hs).toEqual(['softTap']);
  });

  it.each(['delighted', 'excited', 'happy', 'joyful', 'pleased', 'glad', 'proud'])(
    'K14 rule 3: %s drops while upset and in crisis',
    (name) => {
      for (const mood of ['upset', 'crisis'] as const) {
        const call = gate();
        if (mood === 'crisis') call.onMood('crisis');
        const face: ChannelCommand = {
          channel: 'face',
          action: 'expression',
          durationMs: 0,
          origin: 'beat',
          params: { expression: name },
        };
        expect(typeof call.write(face, ctx({ mood, sequenceId: 'beat', runId: 3 }))).toBe('string');
      }
    }
  );

  it('K18 rule 1: while an earned big plays, another run (a pose) is still capped at 1.06', () => {
    const call = gate();
    call.moment(big, 'neutral', 0);
    const pop: ChannelCommand = {
      channel: 'body',
      action: 'pop',
      durationMs: 600,
      origin: 'x',
      params: { scale: [1, 1.2, 1] },
    };
    expect(call.write(pop, ctx({ sequenceId: 'celebration_big', runId: 5 }))).toMatchObject({
      params: { scale: [1, 1.2, 1] },
    });
    expect(
      call.write(pop, ctx({ sequenceId: 'arrival_speaking', runId: 6, layer: 'state' }))
    ).toMatchObject({ params: { scale: [1, 1.06, 1] } });
  });

  it('K19 rule 6: reduced motion drops body motion even for an earned big (no simplification table)', async () => {
    const h = harness({ policy: createCharacterPolicy({ reducedMotion: true, sound: 'full' }) });
    await h.arrive();
    h.conductor.beat(big);
    await h.clock.advance(4000);
    expect(h.played.filter((c) => c.channel === 'body')).toHaveLength(0);
  });

  it('K20 rule 2: a small delight 30 s after a big one drops (90 s between any two)', () => {
    const call = gate();
    expect(call.moment(big, 'neutral', 0)).toEqual({ play: 'celebration_big' });
    expect(call.moment(small, 'neutral', 30_000)).toBe('delight:small:gap');
  });

  it('K23 rule 2: at play time a celebration write drops in crisis too (gate API, before onMood)', () => {
    const call = gate();
    call.moment(small, 'neutral', 0);
    const glow: ChannelCommand = {
      channel: 'glow',
      action: 'celebrate',
      durationMs: 600,
      origin: 'x',
    };
    expect(
      typeof call.write(glow, ctx({ sequenceId: 'celebration_small', runId: 9, mood: 'crisis' }))
    ).toBe('string');
  });

  it('KGAP rule 2: two delights never PLAY less than 90 s apart (one queued behind a handoff)', async () => {
    const h = character();
    await h.arrive();
    h.go('handoff_out', { handoffTo: 'maya' });
    h.conductor.beat({ kind: 'delight', size: 'small', reason: 'first_meeting' });
    h.go('handoff_in', { handoffTo: 'maya' });
    await h.clock.advance(90_000);
    h.conductor.beat(small);
    await h.clock.advance(5000);
    const plays = h
      .trace()
      .filter(([, c, a, d]) => c === 'sound' && a === 'play' && d === 'celebration.small')
      .map(([t]) => t);
    if (plays.length === 2) expect(plays[1]! - plays[0]!).toBeGreaterThanOrEqual(90_000);
  });
});
