/**
 * Shared test harness for the conductor: a fake clock (no real timers), fake
 * channel adapters that record every write, and a driver that feeds
 * transitions the way the call machine would.
 */
import type { CallState, Mood } from '../../src/app/call/call-types.js';
import {
  createConductor,
  type ChannelAdapter,
  type ChannelCommand,
  type ConductorCallContext,
  type ConductorClock,
  type ConductorPolicy,
} from '../../src/app/call/conductor.js';
import type { ChannelId, TraceEntry } from '../../src/app/call/conductor-trace.js';
import {
  SEQUENCES,
  type Sequence,
  type SequenceStep,
} from '../../src/config/sequences.generated.js';

export const CHANNELS: readonly ChannelId[] = [
  'face',
  'body',
  'glow',
  'colour',
  'caption',
  'sound',
  'haptic',
];
/** How long the fake sound adapter takes to resolve (the real one resolves on 'ended'). */
export const SOUND_MS = 800;

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

export class FakeClock implements ConductorClock {
  t = 0;
  private n = 0;
  private q: { at: number; h: number; fn: () => void }[] = [];
  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): unknown {
    const h = ++this.n;
    this.q.push({ at: this.t + ms, h, fn });
    return h;
  }
  clearTimeout(h: unknown): void {
    this.q = this.q.filter((e) => e.h !== h);
  }
  /** Run every timer due within `ms`, in order, settling promises between them. */
  async advance(ms: number): Promise<void> {
    const end = this.t + ms;
    for (;;) {
      await flush();
      this.q.sort((a, b) => a.at - b.at || a.h - b.h);
      const next = this.q[0];
      if (!next || next.at > end) break;
      this.q.shift();
      this.t = next.at;
      next.fn();
    }
    this.t = end;
    await flush();
  }
}

export function seq(
  id: string,
  totalDuration: number,
  interruptible: boolean,
  steps: Partial<SequenceStep>[],
  extra: Partial<Sequence> = {}
): Sequence {
  return {
    id,
    name: id,
    description: id,
    trigger: 'test',
    totalDuration,
    interruptible,
    steps: steps.map((s) => ({
      element: 'face',
      animation: 'expression',
      delay: 0,
      duration: 0,
      ...s,
    })),
    ...extra,
  };
}

/** Token-shaped stand-ins for the sequences migration PR 1 adds to sequences.json. */
export const EXTRA_SEQUENCES: Record<string, Sequence> = {
  turn_thinking: seq('turn_thinking', 400, true, [
    { element: 'eyes', animation: 'glance', duration: 400 },
  ]),
  turn_user: seq('turn_user', 500, true, [
    { properties: { expression: 'attentive' } },
    { element: 'avatar', animation: 'lean', duration: 500, easing: 'spring' },
  ]),
  handoff_out: seq('handoff_out', 600, false, [
    { element: 'currentAvatar', animation: 'fade', duration: 400 },
    { element: 'transitionGlow', animation: 'colorShift', duration: 600 },
  ]),
  handoff_in: seq(
    'handoff_in',
    1200,
    false,
    [
      { element: 'newAvatar', animation: 'breatheIn', duration: 800 },
      { element: 'nameTag', animation: 'slideUp', delay: 400, duration: 400 },
    ],
    {
      sound: { track: 'persona.{nextPersonaId}', delay: 300 },
      haptic: { pattern: 'personaSignature', delay: 400 },
    }
  ),
};

export interface HarnessOptions {
  readonly policy: ConductorPolicy;
  readonly failing?: ChannelId;
  readonly unmounted?: ChannelId;
  readonly sequences?: Readonly<Record<string, Sequence>>;
}

export function harness(opts: HarnessOptions) {
  const clock = new FakeClock();
  const settled: ChannelId[] = [];
  const played: ChannelCommand[] = [];
  const adapter = (id: ChannelId): ChannelAdapter => ({
    id,
    mount: () => id !== opts.unmounted,
    play(cmd, signal) {
      if (id === opts.failing) throw new Error(`${id} adapter broke`);
      played.push(cmd);
      if (id !== 'sound' || cmd.action !== 'play') return Promise.resolve();
      return new Promise<void>((resolve) => {
        const h = clock.setTimeout(resolve, SOUND_MS);
        signal.addEventListener('abort', () => {
          clock.clearTimeout(h);
          resolve();
        });
      });
    },
    settle: () => settled.push(id),
  });
  const conductor = createConductor({
    adapters: Object.fromEntries(CHANNELS.map((id) => [id, adapter(id)])),
    clock,
    sequences: { ...SEQUENCES, ...EXTRA_SEQUENCES, ...opts.sequences },
    policy: opts.policy,
  });
  let state: CallState = 'idle';
  let ctx: ConductorCallContext = {
    attempt: 1,
    mood: 'neutral',
    slowStage: 0,
    persona: 'ferni',
    handoffTo: null,
  };
  const go = (to: CallState, patch: Partial<ConductorCallContext> = {}): void => {
    ctx = { ...ctx, ...patch };
    conductor.onTransition({ from: state, to, event: 'test', at: clock.now() }, ctx);
    state = to;
  };
  const setContext = (patch: { mood?: Mood; attempt?: number }): void => {
    ctx = { ...ctx, ...patch };
    conductor.onContext(ctx);
  };
  const mark = (): number => conductor.trace().length;
  /** Entries written after `mark`. */
  const since = (m: number): readonly TraceEntry[] => conductor.trace().slice(m);
  /** Tap → join → first listening turn, as the call machine emits it. */
  const arrive = async (): Promise<void> => {
    go('connecting');
    await clock.advance(2410);
    go('arrival');
    await clock.advance(1000);
    go('listening');
    await clock.advance(1000);
  };
  return {
    clock,
    conductor,
    go,
    setContext,
    mark,
    since,
    arrive,
    settled,
    played,
    trace: () => conductor.trace(),
  };
}
