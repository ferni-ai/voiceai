/**
 * The conductor with the real character policy, asserted through its trace:
 * the six call moments (arrival, listening, thinking, speaking, handoff,
 * goodbye), plus reduced motion, mood, crisis and the character shaping.
 */
import { describe, expect, it } from 'vitest';

import { count } from '../../src/app/call/conductor-trace.js';
import { character, drops } from './character-test-kit.js';

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
    h.conductor.beat({ kind: 'delight', size: 'small', reason: 'achievement' });
    await h.clock.advance(1500);
    const t = h.trace();
    expect(count(t, 'glow', 'celebrate')).toBe(1); // the celebration itself plays
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
    h.conductor.beat({ kind: 'delight', size: 'small', reason: 'breakthrough' });
    await h.clock.advance(2000);
    h.conductor.beat({ kind: 'delight', size: 'small', reason: 'breakthrough' });
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
