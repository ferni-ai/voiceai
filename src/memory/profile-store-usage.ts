/**
 * How much the agent profile store is used, and what it costs.
 *
 * getProfileStore() hands out the store wrapped in a timing proxy. Every
 * method call is counted and timed per method, and once a minute (only when
 * there were calls) one log line reports the window: which store, how many
 * calls, total and slowest milliseconds per method. That shows on a live
 * agent whether the profile-store callers run during voice turns and what
 * PERSIST_AGENT_PROFILES=true adds to them, which an end-to-end eval can't
 * separate from its own noise.
 *
 * @module memory/profile-store-usage
 */

import { getLogger } from '../utils/safe-logger.js';
import { registerInterval, hasInterval } from '../utils/interval-manager.js';

const logger = getLogger().child({ module: 'ProfileStore' });

export const USAGE_WINDOW_MS = 60_000;
const INTERVAL_NAME = 'profile-store-usage';

export interface MethodUsage {
  calls: number;
  totalMs: number;
  maxMs: number;
}

let tallies = new Map<string, MethodUsage>();
let storeKind = 'unknown';
const wrapped = new WeakMap<object, object>();

export function recordStoreCall(method: string, ms: number): void {
  const t = tallies.get(method) ?? { calls: 0, totalMs: 0, maxMs: 0 };
  t.calls += 1;
  t.totalMs += ms;
  t.maxMs = Math.max(t.maxMs, ms);
  tallies.set(method, t);
}

/** The usage since the last snapshot, and start a new window. */
export function takeUsageSnapshot(): Record<string, MethodUsage> {
  const snapshot = Object.fromEntries(
    [...tallies].map(([m, t]) => [
      m,
      { calls: t.calls, totalMs: Math.round(t.totalMs), maxMs: Math.round(t.maxMs) },
    ])
  );
  tallies = new Map();
  return snapshot;
}

export function flushUsage(): void {
  const methods = takeUsageSnapshot();
  const calls = Object.values(methods).reduce((n, t) => n + t.calls, 0);
  if (calls === 0) return;
  const totalMs = Object.values(methods).reduce((n, t) => n + t.totalMs, 0);
  logger.info(
    { store: storeKind, windowMs: USAGE_WINDOW_MS, calls, totalMs, methods },
    'Agent profile store usage'
  );
}

/**
 * The store, wrapped so its method calls are counted and timed. The method
 * runs with the real store as `this`, so class internals keep working, and
 * a rejected call is still timed and still rejects.
 */
export function withUsageTiming<T extends object>(store: T, kind: string): T {
  storeKind = kind;
  if (!hasInterval(INTERVAL_NAME)) registerInterval(INTERVAL_NAME, flushUsage, USAGE_WINDOW_MS);
  const existing = wrapped.get(store);
  if (existing) return existing as T;

  // Keyed by the function, not the name: if a method is replaced on the
  // store (a spy, a lazily bound method), calls reach the new one.
  const methodCache = new WeakMap<object, unknown>();
  const proxy = new Proxy(store, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop, target);
      if (typeof value !== 'function') return value;
      const fn = value as (...args: unknown[]) => unknown;
      const cached = methodCache.get(fn);
      if (cached) return cached;
      const name = String(prop);
      const timed = (...args: unknown[]): unknown => {
        const start = performance.now();
        const done = (): void => recordStoreCall(name, performance.now() - start);
        let result: unknown;
        try {
          result = fn.apply(target, args);
        } catch (error) {
          done();
          throw error;
        }
        if (result instanceof Promise) return result.finally(done);
        done();
        return result;
      };
      methodCache.set(fn, timed);
      return timed;
    },
  });
  wrapped.set(store, proxy);
  return proxy;
}
