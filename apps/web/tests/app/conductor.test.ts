/**
 * Conductor core with a pass-through policy: the two layers (pose replaced on
 * every transition, moments one at a time by priority), barge-in, adapter
 * mount and fallback, and that every policy verdict lands in the trace. The
 * policy rules themselves (dedupe, character, mood) are tested with the real
 * policy in conductor-policy.test.ts.
 */
import { describe, expect, it } from 'vitest';

import type {
  CallPolicy,
  ChannelCommand,
  ConductorPolicy,
  Priority,
} from '../../src/app/call/conductor.js';
import { count, type ChannelId, type TraceEntry } from '../../src/app/call/conductor-trace.js';
import { harness, seq, SOUND_MS } from './conductor-harness.js';

const PRIORITY: Readonly<Record<string, Priority>> = {
  arrival_joined: 'critical',
  handoff_out: 'high',
  handoff_in: 'high',
  celebration_big: 'high',
  deep_moment: 'low',
};
const CHANNEL_OF: Readonly<Record<string, ChannelId>> = {
  face: 'face',
  eyes: 'face',
  avatar: 'body',
  currentAvatar: 'body',
  newAvatar: 'body',
  halo: 'glow',
  avatarGlow: 'glow',
  sparkle: 'glow',
  transitionGlow: 'colour',
  statusText: 'caption',
  nameTag: 'caption',
  farewell: 'caption',
};

function passThrough(call: Partial<CallPolicy> = {}): ConductorPolicy {
  return {
    maxQueue: 3,
    minGapMs: 500,
    failuresBeforeFallback: 3,
    bargeInDuckDb: -12,
    priorityOf: (id) => PRIORITY[id] ?? 'normal',
    channelFor: (el) => CHANNEL_OF[el] ?? null,
    steps: (_id, s) => s.steps,
    forCall: () => ({
      write: (c: ChannelCommand) => c,
      moment: (b) => ({
        play: b.kind === 'sequence' ? b.id : `celebration_${b.size}`,
      }),
      onMood: () => null,
      soundStarted: () => undefined,
      soundEnded: () => undefined,
      ...call,
    }),
  };
}

const drops = (t: readonly TraceEntry[], reason: string): number =>
  count(t, 'policy', 'drop', reason);

describe('conductor core: state layer', () => {
  it('a transition replaces the pose, it never queues behind it', async () => {
    const h = harness({ policy: passThrough() });
    h.go('connecting');
    await h.clock.advance(30); // arrival_calling's halo step is due at 60 ms
    h.go('connecting_slow', { slowStage: 1 });
    await h.clock.advance(3000);
    const t = h.trace();
    expect(count(t, 'state', 'idle>connecting')).toBe(1);
    expect(count(t, 'state', 'connecting>connecting_slow')).toBe(1);
    expect(count(t, 'caption', 'swap', 'Calling Ferni…')).toBe(1);
    expect(count(t, 'glow', 'warm')).toBe(0);
    expect(count(t, 'caption', 'swap', 'Waking Ferni up…')).toBe(1);
  });

  it('slow stage 2 swaps to the very-slow caption', async () => {
    const h = harness({ policy: passThrough() });
    h.go('connecting');
    h.go('connecting_slow', { slowStage: 1 });
    h.go('connecting_slow', { slowStage: 2 });
    await h.clock.advance(500);
    expect(count(h.trace(), 'caption', 'swap', 'Taking a little longer than usual')).toBe(1);
  });

  it('thinking: the first think after arrival plays arrival_ready, later ones turn_thinking', async () => {
    const h = harness({ policy: passThrough() });
    await h.arrive();
    h.go('thinking');
    await h.clock.advance(800);
    h.go('speaking');
    await h.clock.advance(800);
    h.go('thinking');
    await h.clock.advance(800);
    const t = h.trace();
    expect(count(t, 'body', 'inhale')).toBe(1);
    expect(count(t, 'face', 'look')).toBe(1);
    expect(count(t, 'face', 'glance')).toBe(1);
  });

  it('arrival plays in the moment layer, so the next state does not cut it', async () => {
    const h = harness({ policy: passThrough() });
    h.go('connecting');
    await h.clock.advance(2000);
    h.go('arrival');
    await h.clock.advance(300);
    h.go('listening');
    await h.clock.advance(1500);
    const t = h.trace();
    expect(count(t, 'glow', 'bloom')).toBe(1);
    expect(count(t, 'face', 'expression', 'attentive')).toBe(1); // due at 1000 ms
    expect(count(t, 'face', 'expression', 'listening')).toBe(1);
  });
});

describe('conductor core: moment layer', () => {
  it('priorities: higher preempts an interruptible moment, low is dropped, normal waits', async () => {
    const h = harness({ policy: passThrough() });
    await h.arrive();
    h.conductor.beat({ kind: 'sequence', id: 'celebration_small' });
    await h.clock.advance(100);
    const bigAt = h.clock.now();
    h.conductor.beat({ kind: 'sequence', id: 'celebration_big' });
    await h.clock.advance(100);
    h.conductor.beat({ kind: 'sequence', id: 'deep_moment' });
    h.conductor.beat({ kind: 'sequence', id: 'streak_milestone' });
    h.conductor.beat({ kind: 'sequence', id: 'streak_milestone' });
    await h.clock.advance(6000);
    const t = h.trace();
    expect(count(t, 'policy', 'preempt', 'celebration_small>celebration_big')).toBe(1);
    expect(h.settled).toEqual(expect.arrayContaining(['body', 'glow']));
    expect(drops(t, 'moment:deep_moment:low-priority')).toBe(1);
    expect(drops(t, 'moment:streak_milestone:merged')).toBe(1);
    const streak = t.find(([, c, a]) => c === 'body' && a === 'impressed');
    expect(streak?.[0]).toBeGreaterThanOrEqual(bigAt + 3500 + 500);
  });

  it('the queue holds at most maxQueue moments', async () => {
    const h = harness({ policy: passThrough() });
    await h.arrive();
    h.conductor.beat({ kind: 'sequence', id: 'celebration_big' }); // non-interruptible
    for (const id of ['celebration_small', 'streak_milestone', 'team_unlock', 'error_recovery']) {
      h.conductor.beat({ kind: 'sequence', id });
    }
    expect(drops(h.trace(), 'moment:error_recovery:queue-full')).toBe(1);
  });

  it('a moment ends when its sound ends, not when its timeline does', async () => {
    const chime = seq(
      'chime',
      100,
      true,
      [{ element: 'halo', animation: 'glint', duration: 100 }],
      {
        sound: { track: 'chime', delay: 0 },
      }
    );
    const nod = seq('nod', 300, true, [{ element: 'avatar', animation: 'nod', duration: 300 }]);
    const h = harness({ policy: passThrough(), sequences: { chime, nod } });
    await h.arrive();
    const at = h.clock.now();
    h.conductor.beat({ kind: 'sequence', id: 'chime' });
    h.conductor.beat({ kind: 'sequence', id: 'nod' });
    await h.clock.advance(3000);
    const started = h.trace().find(([, c, a]) => c === 'body' && a === 'nod');
    expect(started?.[0]).toBe(at + SOUND_MS + 500);
  });
});

describe('conductor core: barge-in', () => {
  it('cuts an interruptible moment to its end pose, stops UI sound, drops queued normal moments', async () => {
    const h = harness({ policy: passThrough() });
    await h.arrive();
    h.conductor.beat({ kind: 'sequence', id: 'celebration_small' });
    h.conductor.beat({ kind: 'sequence', id: 'streak_milestone' });
    await h.clock.advance(60);
    h.go('user_speaking');
    await h.clock.advance(2000);
    const t = h.trace();
    expect(count(t, 'policy', 'interrupt', 'celebration_small')).toBe(1);
    expect(count(t, 'glow', 'celebrate')).toBe(1); // due at 50 ms, before the barge-in
    expect(count(t, 'glow', 'burst')).toBe(0); // the sparkle at 100 ms never fires
    expect(drops(t, 'moment:streak_milestone:barge-in')).toBe(1);
    expect(h.settled).toEqual(expect.arrayContaining(['body', 'glow', 'sound']));
  });

  it('lets a non-interruptible moment finish its visuals but drops its haptic and ducks its sound', async () => {
    const h = harness({ policy: passThrough() });
    await h.arrive();
    h.go('handoff_out', { handoffTo: 'maya' });
    await h.clock.advance(700);
    h.go('handoff_in');
    await h.clock.advance(350); // sound started at 300, haptic due at 400
    h.go('user_speaking');
    await h.clock.advance(1500);
    const t = h.trace();
    expect(count(t, 'sound', 'play', 'persona.maya')).toBe(1);
    expect(drops(t, 'haptic:personaSignature:barge-in')).toBe(1);
    expect(count(t, 'haptic', 'personaSignature')).toBe(0);
    expect(count(t, 'sound', 'duck')).toBe(1);
    expect(count(t, 'caption', 'slideUp')).toBe(1);
  });
});

describe('conductor core: policy verdicts and adapters', () => {
  it('traces every policy drop and never calls the adapter for it', async () => {
    const h = harness({
      policy: passThrough({
        write: (c) => (c.channel === 'haptic' ? `haptic:${c.action}:test` : c),
        moment: (b) => (b.kind === 'delight' ? 'delight:test' : { play: b.id }),
      }),
    });
    await h.arrive();
    h.conductor.beat({ kind: 'delight', size: 'small', reason: 'laughter' });
    const t = h.trace();
    expect(drops(t, 'haptic:tap:test')).toBe(1);
    expect(drops(t, 'haptic:success:test')).toBe(1);
    expect(drops(t, 'delight:test')).toBe(1);
    expect(h.played.filter((c) => c.channel === 'haptic')).toHaveLength(0);
  });

  it('a mood pin cancels the running moment and writes the pinned face', async () => {
    const pin = {
      channel: 'face',
      action: 'expression',
      origin: 'mood',
      durationMs: 0,
      params: { expression: 'holdingSpace' },
    } as const;
    const h = harness({
      policy: passThrough({ onMood: (m) => (m === 'crisis' ? pin : null) }),
    });
    await h.arrive();
    h.conductor.beat({ kind: 'sequence', id: 'celebration_small' });
    h.setContext({ mood: 'crisis' });
    await h.clock.advance(2000);
    const t = h.trace();
    expect(count(t, 'face', 'expression', 'holdingSpace')).toBe(1);
    expect(count(t, 'glow', 'celebrate')).toBe(0);
  });

  it('attaches each channel once, and traces writes to an unmounted one', async () => {
    const h = harness({ policy: passThrough(), unmounted: 'caption' });
    await h.arrive();
    const t = h.trace();
    expect(count(t, 'glow', 'attach')).toBe(1);
    expect(count(t, 'caption', 'unmounted', 'swap')).toBe(2); // calling, joined
    expect(h.played.filter((c) => c.channel === 'caption')).toHaveLength(0);
  });

  it('an adapter that throws 3 times turns the conductor off for the call', async () => {
    const h = harness({ policy: passThrough(), failing: 'colour' });
    await h.arrive();
    for (const id of ['joy', 'calm', 'tender']) {
      h.conductor.beat({ kind: 'emotion', id, intensity: 0.5 });
    }
    expect(count(h.trace(), 'policy', 'fallback', 'colour:3 failures')).toBe(1);
    expect(h.conductor.active()).toBe(false);
    const m = h.mark();
    h.go('speaking');
    h.conductor.beat({ kind: 'expression', name: 'curious' });
    await h.clock.advance(1000);
    expect(h.since(m)).toHaveLength(0);
    h.setContext({ attempt: 2 }); // a new call attempt starts fresh
    expect(h.conductor.active()).toBe(true);
  });

  it('traces a missing sequence and a token element no channel owns', async () => {
    const h = harness({ policy: passThrough() });
    await h.arrive();
    h.go('user_speaking');
    h.conductor.beat({ kind: 'sequence', id: 'not_a_sequence' });
    const t = h.trace();
    expect(count(t, 'policy', 'skip', 'element:controls')).toBe(1); // arrival_joined
    expect(drops(t, 'sequence:not_a_sequence:missing')).toBe(1);
  });

  it('dispose stops every pending write', async () => {
    const h = harness({ policy: passThrough() });
    h.go('connecting');
    h.conductor.dispose();
    const m = h.mark();
    await h.clock.advance(2000);
    h.go('arrival');
    expect(h.since(m)).toHaveLength(0);
  });
});
