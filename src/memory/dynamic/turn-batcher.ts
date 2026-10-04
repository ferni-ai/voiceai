/**
 * Turn batcher: collect per-key items (one per conversational turn) and flush
 * them together, so a per-turn background pipeline runs once every few turns
 * instead of on every turn.
 *
 * A key flushes when it reaches `maxItems`, when `idleMs` passes with no new
 * item (which also covers the end of a call), or on `flushAll()` (shutdown).
 * Timers are injectable so the policy is testable without real time.
 */

export interface TurnBatcherOptions<T> {
  maxItems: number;
  idleMs: number;
  keyOf: (item: T) => string;
  flush: (key: string, items: T[]) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface TurnBatcher<T> {
  add(item: T): void;
  flushKey(key: string): void;
  flushAll(): void;
  pendingCount(key: string): number;
}

export function createTurnBatcher<T>(options: TurnBatcherOptions<T>): TurnBatcher<T> {
  const setTimer =
    options.setTimer ??
    ((fn: () => void, ms: number): unknown => {
      const t = setTimeout(fn, ms);
      t.unref?.();
      return t;
    });
  const clearTimer =
    options.clearTimer ?? ((h: unknown): void => clearTimeout(h as ReturnType<typeof setTimeout>));
  const buffers = new Map<string, { items: T[]; timer: unknown }>();

  function flushKey(key: string): void {
    const buffer = buffers.get(key);
    if (!buffer) return;
    buffers.delete(key);
    if (buffer.timer !== undefined) clearTimer(buffer.timer);
    if (buffer.items.length > 0) options.flush(key, buffer.items);
  }

  return {
    add(item: T): void {
      const key = options.keyOf(item);
      const buffer = buffers.get(key) ?? { items: [], timer: undefined };
      buffers.set(key, buffer);
      buffer.items.push(item);
      if (buffer.timer !== undefined) clearTimer(buffer.timer);
      if (buffer.items.length >= options.maxItems) {
        flushKey(key);
        return;
      }
      buffer.timer = setTimer(() => flushKey(key), options.idleMs);
    },
    flushKey,
    flushAll(): void {
      for (const key of [...buffers.keys()]) flushKey(key);
    },
    pendingCount(key: string): number {
      return buffers.get(key)?.items.length ?? 0;
    },
  };
}
