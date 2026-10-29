/**
 * The conductor with the real character policy, asserted through its trace:
 * the six call moments (arrival, listening, thinking, speaking, handoff,
 * goodbye), plus reduced motion, mood, crisis, earned delight and the
 * character shaping.
 */
import { describe, expect, it } from 'vitest';

import type { WriteContext } from '../../src/app/call/conductor.js';
import { CONDUCTOR_POLICY, createCharacterPolicy } from '../../src/app/call/conductor-policy.js';
import { count, type TraceEntry } from '../../src/app/call/conductor-trace.js';
import { EASING } from '../../src/config/animation-constants.js';
import { REDUCED_MOTION, type Sequence } from '../../src/config/motion-sequences.js';
import { harness, seq } from './conductor-harness.js';

function character(reducedMotion = false, extra: Readonly<Record<string, Sequence>> = {}) {
  return harness({
    policy: createCharacterPolicy({
      reducedMotion,
      sound: 'full',
      reducedMotionTable: REDUCED_MOTION,
    }),
    sequences: {
      overshoot: seq('overshoot', 500, true, [
        {
          element: 'avatar',
          animation: 'pop',
          duration: 500,
          easing: 'spring',
          properties: { scale: [1, 1.2, 1], translateY: [0, -20, 0] },
        },
      ]),
      ...extra,
    },
  });
}

const drops = (t: readonly TraceEntry[], reason: string): number =>
  count(t, 'policy', 'drop', reason);

describe('conductor policy: the six call moments', () => {
  it('arrival: one connect sound, one join haptic, glow attached, even if agent_connected arrives twice', async () => {
    const h = character();
    h.go('connecting');
    await h.clock.advance(2410);
    expect(count(h.trace(), 'sound', 'play')).toBe(0); // "No sound: the chord waits for him."

    h.go('arrival');
    await h.clock.advance(300);
    h.go('arrival'); // participantConnected re-fires while the arrival plays
    await h.clock.advance(700);
    h.go('listening');
    await h.clock.advance(3000);
    h.go('arrival'); // a second participant joins much later
    await h.clock.advance(2000);

    const t = h.trace();
    expect(count(t, 'sound', 'play')).toBe(1);
    expect(count(t, 'sound', 'play', 'system.connectionSuccess')).toBe(1);
    expect(count(t, 'haptic', 'tap')).toBe(1);
    expect(count(t, 'haptic', 'success')).toBe(1);
    expect(count(t, 'glow', 'attach')).toBe(1);
    expect(count(t, 'glow', 'bloom')).toBe(1);
    expect(drops(t, 'moment:arrival_joined:once')).toBe(2);
    const faces = t.filter(([, c, a]) => c === 'face' && a === 'expression').map(([, , , d]) => d);
    expect(faces.slice(0, 4)).toEqual(['resting', 'surprised', 'happy', 'attentive']);
  });

  it('arrival: the connect sound plays once per attempt, even when the legacy connection_success beat asks again', async () => {
    const h = character();
    await h.arrive();
    await h.clock.advance(1000); // the chord played 2.9 s ago: past the 2 s same-track cooldown
    h.conductor.beat({ kind: 'sequence', id: 'connection_success' });
    await h.clock.advance(1500);
    const t = h.trace();
    expect(count(t, 'sound', 'play', 'system.connectionSuccess')).toBe(1);
    expect(drops(t, 'sound:system.connectionSuccess:once')).toBe(1);
  });

  it('listening: speaking → listening writes the listening face and a lean, no sound or haptic', async () => {
    const h = character();
    await h.arrive();
    h.go('speaking');
    await h.clock.advance(2000);
    const m = h.mark();
    h.go('listening');
    await h.clock.advance(1000);
    const t = h.since(m);
    expect(count(t, 'face', 'expression', 'listening')).toBe(1);
    expect(count(t, 'body', 'lean')).toBe(1);
    expect(count(t, 'sound', 'play')).toBe(0);
    expect(t.filter(([, c]) => c === 'haptic')).toHaveLength(0);
  });

  it('thinking: arrival_ready first, then turn_thinking, never a sound', async () => {
    const h = character();
    await h.arrive();
    const m = h.mark();
    h.go('thinking');
    await h.clock.advance(800);
    h.go('speaking');
    await h.clock.advance(800);
    h.go('thinking');
    await h.clock.advance(800);
    const t = h.since(m);
    expect(count(t, 'face', 'look')).toBe(1);
    expect(count(t, 'face', 'glance')).toBe(1);
    expect(count(t, 'sound', 'play')).toBe(0);
  });

  it('speaking: no UI sound plays over the voice', async () => {
    const h = character();
    await h.arrive();
    h.go('speaking');
    h.conductor.beat({ kind: 'sequence', id: 'celebration_small' });
    await h.clock.advance(1500);
    const t = h.trace();
    expect(count(t, 'sound', 'play', 'celebration.small')).toBe(0);
    expect(drops(t, 'sound:celebration.small:quiet-speaking')).toBe(1);
  });

  it('handoff out → in: exactly one handoff sound, the new persona, one haptic, one colour shift', async () => {
    const h = character();
    await h.arrive();
    const m = h.mark();
    h.go('handoff_out', { handoffTo: 'maya' });
    await h.clock.advance(800);
    h.go('handoff_in');
    await h.clock.advance(2500);
    h.go('listening', { persona: 'maya', handoffTo: null });
    await h.clock.advance(1000);
    const t = h.since(m);
    expect(count(t, 'sound', 'play')).toBe(1);
    expect(count(t, 'sound', 'play', 'persona.maya')).toBe(1);
    expect(count(t, 'haptic', 'personaSignature')).toBe(1);
    expect(count(t, 'colour', 'colorShift')).toBe(1);
  });

  it('goodbye: session end sound, goodbye haptic and glow fade, never the connect chord', async () => {
    const h = character();
    await h.arrive();
    const m = h.mark();
    h.go('ending');
    await h.clock.advance(3000);
    h.go('ended');
    const t = h.since(m);
    expect(count(t, 'sound', 'play', 'system.sessionEnd')).toBe(1);
    expect(count(t, 'haptic', 'goodbye')).toBe(1);
    expect(count(t, 'glow', 'fadeOut')).toBe(1);
    expect(count(t, 'sound', 'play', 'system.connectionSuccess')).toBe(0);
  });
});

describe('conductor policy: motion, mood and character', () => {
  it('reduced motion: no body motion, no loops, instant faces, haptics only on arrival', async () => {
    const h = character(true);
    await h.arrive();
    h.conductor.beat({ kind: 'sequence', id: 'connection_establishing' }); // ring ×3, looping sound
    await h.clock.advance(3000);
    const t = h.trace();
    expect(t.filter(([, c]) => c === 'body')).toHaveLength(0);
    expect(drops(t, 'glow:loop:reduced-motion')).toBe(1);
    expect(drops(t, 'sound:loop:reduced-motion')).toBe(1);
    expect(drops(t, 'haptic:tap:reduced-motion')).toBe(1);
    expect(count(t, 'haptic', 'success')).toBe(1);
    expect(h.played.filter((c) => c.channel === 'face').every((c) => c.durationMs === 0)).toBe(
      true
    );
  });

  it('upset mood: a delight beat is dropped and traced, and so is a happy face', async () => {
    const h = character();
    await h.arrive();
    h.setContext({ mood: 'upset' });
    h.conductor.beat({ kind: 'delight', size: 'small', reason: 'achievement' });
    h.conductor.beat({ kind: 'expression', name: 'happy' });
    await h.clock.advance(2000);
    const t = h.trace();
    expect(drops(t, 'delight:mood=upset')).toBe(1);
    expect(count(t, 'glow', 'celebrate')).toBe(0);
    expect(drops(t, 'face:happy:mood=upset')).toBe(1);
  });

  it('crisis pins the face to a caring expression and silences UI sound', async () => {
    const h = character();
    await h.arrive();
    h.setContext({ mood: 'crisis' });
    h.conductor.beat({ kind: 'expression', name: 'surprised' });
    h.go('speaking');
    h.go('ending');
    await h.clock.advance(3000);
    const t = h.trace();
    expect(count(t, 'face', 'expression', 'holdingSpace')).toBe(1);
    const pin = h.played.find((c) => c.params?.expression === 'holdingSpace');
    expect(pin?.params?.source).toBe('choreography');
    expect(drops(t, 'face:surprised:crisis-pinned')).toBe(1);
    expect(drops(t, 'face:speaking:crisis-pinned')).toBe(1);
    expect(drops(t, 'sound:system.sessionEnd:mood=crisis')).toBe(1);
  });

  it('delight must be earned: a listed reason, within the per-call budget and gap', async () => {
    const h = character();
    await h.arrive();
    h.conductor.beat({ kind: 'delight', size: 'small', reason: 'just_because' as never });
    h.conductor.beat({ kind: 'delight', size: 'small', reason: 'streak' });
    await h.clock.advance(2000);
    h.conductor.beat({ kind: 'delight', size: 'small', reason: 'streak' });
    const t = h.trace();
    expect(drops(t, 'delight:reason=just_because')).toBe(1);
    expect(drops(t, 'delight:small:gap')).toBe(1);
    expect(count(t, 'glow', 'celebrate')).toBe(1);
  });

  it('character: state poses run 1.15× slower with a gentle spring; nothing overshoots', async () => {
    const h = character();
    await h.arrive();
    expect(h.played.find((c) => c.action === 'lean')?.durationMs).toBe(Math.round(600 * 1.15));
    expect(h.played.find((c) => c.action === 'anticipate')?.easing).toBe('spring'); // moment layer
    h.go('user_speaking');
    const userLean = h.played.find((c) => c.origin === 'turn_user' && c.action === 'lean');
    expect(userLean).toMatchObject({ durationMs: Math.round(500 * 1.15), easing: 'springGentle' });
    h.go('listening');
    h.conductor.beat({ kind: 'sequence', id: 'overshoot' });
    await h.clock.advance(600);
    const pop = h.played.find((c) => c.action === 'pop');
    expect(pop?.params).toEqual({ scale: [1, 1.06, 1], translateY: [0, -8, 0] });
  });
});

/** The y control points of a design-system easing token, e.g. 'springGentle' → [1.25, 1]. */
function bezierY(token: string): [number, number] {
  const key = token.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase() as keyof typeof EASING;
  const n = '\\s*(-?[\\d.]+)\\s*';
  const m = new RegExp(`cubic-bezier\\(${n},${n},${n},${n}\\)`).exec(String(EASING[key]));
  if (!m?.[2] || !m[4]) throw new Error(`no cubic-bezier token for ${token}`);
  return [Number(m[2]), Number(m[4])];
}

/** The highest point an easing token's curve reaches (1 = no overshoot). */
function peak(token: string): number {
  const [y1, y2] = bezierY(token);
  let max = 0;
  for (let i = 0; i <= 1000; i++) {
    const t = i / 1000;
    max = Math.max(max, 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3);
  }
  return Math.round(max * 1e4) / 1e4;
}

describe('conductor policy: one test per character rule', () => {
  it('gentle springs: calm poses peak near 1.02, upset curves never overshoot', () => {
    const { poseEasing, gentleEasing, remapEasings } = CONDUCTOR_POLICY.character;
    expect(remapEasings).toEqual(['spring', 'anticipate']);
    expect(poseEasing).toBe('springGentle');
    expect(gentleEasing).toBe('gentle');
    expect(peak(poseEasing)).toBeGreaterThan(1.01); // a hint of play...
    expect(peak(poseEasing)).toBeLessThanOrEqual(1.025); // ...never a bounce
    expect(peak(gentleEasing)).toBe(1); // heavy and slow: no overshoot at all
    expect(peak('spring')).toBeGreaterThan(1.09); // what both replace
    expect(CONDUCTOR_POLICY.character.stateDurationScale).toBe(1.15);
  });

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
    const big = seq('celebration_big', 500, true, [
      { element: 'avatar', animation: 'burst', duration: 500, properties: { scale: [1, 1.2, 1] } },
    ]);
    const h = character(false, { celebration_big: big });
    await h.arrive();
    h.conductor.beat({ kind: 'delight', size: 'big', reason: 'achievement' });
    await h.clock.advance(600);
    expect(h.played.find((c) => c.action === 'burst')?.params).toEqual({ scale: [1, 1.2, 1] });
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
