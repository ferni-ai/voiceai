/**
 * Conductor trace: one line per decision, so a test (or an e2e probe) can
 * count "connect sound ×1" and "no haptic while speaking" instead of reading
 * pixels. Writes and policy drops both land here: `[t, 'sound', 'play',
 * 'system.connectionSuccess']` next to `[t, 'policy', 'drop',
 * 'sound:system.connectionSuccess:once']`.
 *
 * A ring buffer, so a long call cannot grow it without bound.
 */

/** The seven channels, one writer each. */
export type ChannelId = 'face' | 'body' | 'glow' | 'colour' | 'caption' | 'sound' | 'haptic';
export type TraceChannel = ChannelId | 'state' | 'policy';
export type TraceEntry = readonly [
  t: number,
  channel: TraceChannel,
  action: string,
  detail?: string,
];

export const TRACE_CAPACITY = 500;

export interface Trace {
  push(t: number, channel: TraceChannel, action: string, detail?: string): void;
  entries(): readonly TraceEntry[];
}

export function createTrace(capacity = TRACE_CAPACITY): Trace {
  const ring: TraceEntry[] = [];
  return {
    push(t, channel, action, detail) {
      ring.push(detail === undefined ? [t, channel, action] : [t, channel, action, detail]);
      if (ring.length > capacity) ring.shift();
    },
    entries: () => ring.slice(),
  };
}

/** Entries matching channel and action (and detail, when given). */
export function count(
  trace: readonly TraceEntry[],
  channel: TraceChannel,
  action: string,
  detail?: string
): number {
  return trace.filter(
    ([, c, a, d]) => c === channel && a === action && (detail === undefined || d === detail)
  ).length;
}
