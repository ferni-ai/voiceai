/**
 * Earned delight: checked when it is asked for and again when it plays (mood,
 * the earned run, the 90 s gap), the per-call budget and the listed reasons.
 */
import { describe, expect, it } from 'vitest';

import type { ChannelCommand, MomentBeat } from '../../src/app/call/conductor.js';
import { createCharacterPolicy } from '../../src/app/call/conductor-policy.js';
import { count } from '../../src/app/call/conductor-trace.js';
import { character, ctx, drops, gate } from './character-test-kit.js';

describe('conductor policy: delight is checked again when it plays', () => {
  const smallWin: MomentBeat = { kind: 'delight', size: 'small', reason: 'achievement' };
  const bigWin: MomentBeat = { kind: 'delight', size: 'big', reason: 'achievement' };

  it.each(['upset', 'crisis'] as const)(
    'a delight queued behind a handoff never plays once the mood turns %s',
    async (mood) => {
      const h = character();
      await h.arrive();
      h.go('handoff_out', { handoffTo: 'maya' }); // not interruptible: the delight waits
      h.conductor.beat(smallWin);
      const m = h.mark();
      h.setContext({ mood });
      await h.clock.advance(5000);
      const t = h.since(m);
      expect(drops(t, `moment:celebration_small:mood=${mood}`)).toBe(1);
      // Cancelled in the queue, so it never even starts (and never reaches the play-time check).
      expect(t.filter(([, , , d]) => d?.startsWith('delight:celebration_small'))).toHaveLength(0);
      expect(count(t, 'glow', 'celebrate')).toBe(0);
      expect(count(t, 'sound', 'play', 'celebration.small')).toBe(0);
    }
  );

  it.each(['upset', 'crisis'] as const)(
    'an earned big celebration yields softly when the mood turns %s 50 ms in',
    async (mood) => {
      const h = character();
      await h.arrive();
      h.conductor.beat(bigWin);
      await h.clock.advance(50); // the overlay is up; bounce, sound and haptic start at 100 ms
      const m = h.mark();
      h.setContext({ mood });
      await h.clock.advance(4000);
      const t = h.since(m);
      expect(count(t, 'policy', 'yield', 'celebration_big')).toBe(1);
      expect(h.settled).toContain('colour'); // settles to its end pose, never snaps back
      expect(count(t, 'sound', 'play')).toBe(0);
      expect(t.filter(([, c]) => c === 'haptic')).toHaveLength(0);
      expect(count(t, 'body', 'joyBounce')).toBe(0);
    }
  );

  it('at play time a celebration write drops while upset, and an earn is forgotten', () => {
    const call = gate();
    const glow: ChannelCommand = {
      channel: 'glow',
      action: 'celebrate',
      durationMs: 600,
      origin: 'x',
    };
    const w = ctx({ sequenceId: 'celebration_small', runId: 9 });
    expect(call.moment(smallWin, 'neutral', 0)).toEqual({ play: 'celebration_small' });
    expect(call.write(glow, { ...w, mood: 'upset' })).toBe('delight:celebration_small:mood=upset');
    call.onMood('upset'); // the earn is forgotten, its budget stays spent
    expect(call.write(glow, w)).toBe('delight:celebration_small:unearned');
  });

  it('an earned big passes the cap only in its own run, and not once the mood turns tender', () => {
    const call = gate();
    const pop: ChannelCommand = {
      channel: 'body',
      action: 'pop',
      durationMs: 600,
      origin: 'x',
      params: { scale: [1, 1.2, 1], scaleX: [1, 1.2], scaleY: [1, 1.2] },
    };
    const w = ctx({ sequenceId: 'celebration_big', runId: 5 });
    expect(call.moment(bigWin, 'neutral', 0)).toEqual({ play: 'celebration_big' });
    expect(call.write(pop, w)).toMatchObject({ params: pop.params });
    const flat = { scale: [1, 1, 1], scaleX: [1, 1], scaleY: [1, 1] };
    expect(call.write(pop, { ...w, mood: 'tender' })).toMatchObject({ params: flat });
    expect(call.write(pop, { ...w, runId: 6 })).toBe('delight:celebration_big:unearned');
    // scaleX/scaleY are capped like scale: at 1.06 in a calm mood, 1.0 in a soft one.
    const capped = { scale: [1, 1.06, 1], scaleX: [1, 1.06], scaleY: [1, 1.06] };
    expect(gate().write(pop, ctx())).toMatchObject({ params: capped });
    expect(gate().write(pop, ctx({ mood: 'upset' }))).toMatchObject({ params: flat });
  });

  it('tender turns a big delight into a small one', () => {
    expect(gate().moment(bigWin, 'tender', 0)).toEqual({ play: 'celebration_small' });
  });
});

describe('conductor policy: the delight budget, gap and reasons', () => {
  const win = (size: 'small' | 'big', reason: string = 'achievement'): MomentBeat => ({
    kind: 'delight',
    size,
    reason: reason as never,
  });

  it('90 s between any two delights asked for, whatever their size', () => {
    const call = gate();
    expect(call.moment(win('small'), 'neutral', 0)).toEqual({ play: 'celebration_small' });
    expect(call.moment(win('small'), 'neutral', 89_999)).toBe('delight:small:gap');
    expect(call.moment(win('big'), 'neutral', 60_000)).toBe('delight:big:gap');
    expect(call.moment(win('big'), 'neutral', 90_000)).toEqual({ play: 'celebration_big' });
  });

  it('every call starts with a fresh budget', () => {
    const policy = createCharacterPolicy({ reducedMotion: false, sound: 'full' });
    const first = policy.forCall();
    expect(first.moment(win('big'), 'neutral', 0)).toEqual({ play: 'celebration_big' });
    expect(first.moment(win('big'), 'neutral', 100_000)).toBe('delight:big:budget');
    expect(policy.forCall().moment(win('big'), 'neutral', 0)).toEqual({ play: 'celebration_big' });
  });

  it.each(['achievement', 'breakthrough', 'laughter', 'first_meeting'])(
    '%s is earned when calm, never while upset or in crisis',
    (reason) => {
      expect(gate().moment(win('small', reason), 'neutral', 0)).toEqual({
        play: 'celebration_small',
      });
      expect(gate().moment(win('small', reason), 'upset', 0)).toBe('delight:mood=upset');
      expect(gate().moment(win('small', reason), 'crisis', 0)).toBe('delight:mood=crisis');
    }
  );

  it('a streak is never earned, whatever size it asks for', () => {
    expect(gate().moment(win('big', 'streak'), 'neutral', 0)).toBe('delight:reason=streak');
    expect(gate().moment(win('small', 'streak'), 'neutral', 0)).toBe('delight:reason=streak');
  });
});

describe('conductor policy: the 90 s gap is measured from when a delight PLAYS', () => {
  const small = (reason: 'achievement' | 'first_meeting' = 'achievement'): MomentBeat => ({
    kind: 'delight',
    size: 'small',
    reason,
  });

  it('a delight that waited behind a handoff starts the clock when it plays, not when asked', async () => {
    const h = character();
    await h.arrive(); // t = 4410
    h.go('handoff_out', { handoffTo: 'maya' });
    h.conductor.beat(small('first_meeting')); // asked at 4410, waits behind both handoffs
    h.go('handoff_in', { handoffTo: 'maya' });
    await h.clock.advance(90_000); // t = 94410: 90 s after the ask, 87.2 s after it played
    h.conductor.beat(small());
    await h.clock.advance(5000);
    const plays = h
      .trace()
      .filter(([, c, a, d]) => c === 'sound' && a === 'play' && d === 'celebration.small')
      .map(([t]) => t);
    expect(plays).toEqual([7210]);
    expect(drops(h.trace(), 'delight:small:gap')).toBe(1);
  });

  it('a delight that comes up within 90 s of the last one that played is dropped, not deferred', () => {
    const glow: ChannelCommand = {
      channel: 'glow',
      action: 'celebrate',
      durationMs: 600,
      origin: 'x',
    };
    // Two delights asked 90 s apart; the first only gets to play at 95 s.
    const twoEarned = () => {
      const call = gate();
      expect(call.moment(small(), 'neutral', 0)).toEqual({ play: 'celebration_small' });
      expect(call.moment(small(), 'neutral', 90_000)).toEqual({ play: 'celebration_small' });
      const at = (runId: number, now: number) =>
        call.write(
          { ...glow, params: { runId } },
          ctx({ sequenceId: 'celebration_small', runId, now })
        );
      expect(at(1, 95_000)).toMatchObject({ action: 'celebrate' });
      return { call, at };
    };
    const soon = twoEarned();
    expect(soon.at(2, 184_999)).toBe('delight:celebration_small:gap'); // 89.999 s after a play
    expect(soon.at(2, 200_000)).toBe('delight:celebration_small:gap'); // and it stays dropped
    expect(soon.call.moment(small(), 'neutral', 184_999)).toBe('delight:small:gap');
    expect(soon.call.moment(small(), 'neutral', 185_000)).toEqual({ play: 'celebration_small' });
    expect(twoEarned().at(2, 185_000)).toMatchObject({ action: 'celebrate' }); // exactly 90 s
  });
});

/**
 * The independent verifier's r7 kill tests (KN7, KN11, KN15), adopted verbatim
 * apart from test names and formatting (voiceai-evidence/motion-audit-2026-10-29/v2998r7/).
 */
describe('conductor policy: a delight refused at play time is used up, and any delight that played starts the gap', () => {
  const glowCmd: ChannelCommand = {
    channel: 'glow',
    action: 'celebrate',
    durationMs: 600,
    origin: 'x',
  };
  const ledgerOk = (v: unknown) => typeof v !== 'string' || !v.startsWith('delight:');
  const w = (seq: 'celebration_small' | 'celebration_big', runId: number, now: number) => ({
    ...ctx({ sequenceId: seq, runId, now }),
  });
  const small = { kind: 'delight', size: 'small', reason: 'achievement' } as const;
  const big = { kind: 'delight', size: 'big', reason: 'achievement' } as const;

  // KN11
  it('a big that played starts the play-time gap too: a small earned later drops 1 s after it', () => {
    const call = gate();
    expect(call.moment(big, 'neutral', 0)).toEqual({ play: 'celebration_big' });
    expect(call.moment(small, 'neutral', 90_000)).toEqual({ play: 'celebration_small' });
    expect(ledgerOk(call.write(glowCmd, w('celebration_big', 1, 95_000)))).toBe(true);
    expect(call.write(glowCmd, w('celebration_small', 2, 96_000))).toMatch(/^delight:.*gap/);
  });

  // KN7
  it('a delight refused for the gap is used up: a never-asked celebration run later is unearned', () => {
    const call = gate();
    call.moment(small, 'neutral', 0);
    call.moment(small, 'neutral', 90_000);
    expect(ledgerOk(call.write(glowCmd, w('celebration_small', 1, 95_000)))).toBe(true);
    expect(call.write(glowCmd, w('celebration_small', 2, 96_000))).toMatch(/gap/);
    expect(call.write(glowCmd, w('celebration_small', 3, 200_000))).toMatch(/^delight:.*unearned/);
  });

  // KN15
  it('a run refused for the gap never takes a later earn: the run that earned it plays', () => {
    const call = gate();
    call.moment(small, 'neutral', 0);
    call.moment(small, 'neutral', 90_000);
    expect(ledgerOk(call.write(glowCmd, w('celebration_small', 1, 95_000)))).toBe(true);
    expect(call.write(glowCmd, w('celebration_small', 2, 96_000))).toMatch(/gap/);
    expect(call.moment(small, 'neutral', 185_000)).toEqual({ play: 'celebration_small' });
    expect(call.write(glowCmd, w('celebration_small', 2, 185_001))).toMatch(/^delight:.*gap/);
    expect(ledgerOk(call.write(glowCmd, w('celebration_small', 3, 185_002)))).toBe(true);
  });
});
