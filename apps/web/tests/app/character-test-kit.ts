/**
 * Shared test kit for the conductor's character policy: a conductor harness
 * with the real policy, a call gate driven directly, and easing-curve math.
 */
import type { WriteContext } from '../../src/app/call/conductor.js';
import { createCharacterPolicy } from '../../src/app/call/conductor-policy.js';
import { count, type TraceEntry } from '../../src/app/call/conductor-trace.js';
import { EASING } from '../../src/config/animation-constants.js';
import { REDUCED_MOTION, type Sequence } from '../../src/config/motion-sequences.js';
import { harness, seq } from './conductor-harness.js';

/** The conductor harness with the character policy, plus an `overshoot` pop sequence. */
export function character(reducedMotion = false, extra: Readonly<Record<string, Sequence>> = {}) {
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

export const drops = (t: readonly TraceEntry[], reason: string): number =>
  count(t, 'policy', 'drop', reason);

/** One call's gate, driven directly: no conductor, no clock. */
export const gate = () => createCharacterPolicy({ reducedMotion: false, sound: 'full' }).forCall();
export const ctx = (patch: Partial<WriteContext> = {}): WriteContext => ({
  layer: 'moment',
  sequenceId: 'test',
  runId: 1,
  state: 'listening',
  mood: 'neutral',
  now: 0,
  ...patch,
});

/** Lowest and highest point of an easing token's curve; CSS keywords stay in 0..1. */
export function yRange(value: string): [number, number] {
  const n = '\\s*(-?[\\d.]+)\\s*';
  const m = new RegExp(`^cubic-bezier\\(${n},${n},${n},${n}\\)$`).exec(value);
  if (!m) return [0, 1];
  const [y1, y2] = [Number(m[2]), Number(m[4])];
  let [lo, hi] = [0, 1];
  for (let i = 0; i <= 1000; i++) {
    const t = i / 1000;
    const y = 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3;
    [lo, hi] = [Math.min(lo, y), Math.max(hi, y)];
  }
  return [lo, hi];
}

/** The easing token's camelCase name, as sequences use it: SPRING_GENTLE → springGentle. */
export const tokenName = (key: string): string =>
  key.toLowerCase().replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

/** The CSS value of an easing token by its camelCase name, or undefined if unknown. */
export const easingValue = (name: string): string | undefined =>
  (EASING as Readonly<Record<string, string>>)[
    name.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()
  ];

/** The highest point an easing token's curve reaches (1 = no overshoot). */
export function peak(token: string): number {
  const value = easingValue(token);
  if (!value?.startsWith('cubic-bezier')) throw new Error(`no cubic-bezier token for ${token}`);
  return Math.round(yRange(value)[1] * 1e4) / 1e4;
}
