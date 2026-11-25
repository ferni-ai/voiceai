/**
 * BTH_TELEMETRY_FLUSH (#4069): off, nothing starts and nothing flushes at shutdown;
 * on, one 30 s flush per process, and shutdown waits for the buffered events to land.
 * Only the Firestore boundary is faked; production-telemetry and the interval manager are real.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ getFirestoreDb: vi.fn() }));
vi.mock('../../superhuman/firestore-utils.js', () => db);

const FLUSH_INTERVAL = 'bth-telemetry-flush';
const ON = { BTH_TELEMETRY_FLUSH: 'on' };

type Lifecycle = typeof import('../telemetry-lifecycle.js');
type Telemetry = typeof import('../production-telemetry.js');
type Intervals = typeof import('../../../utils/interval-manager.js');

let lifecycle: Lifecycle;
let telemetry: Telemetry;
let intervals: Intervals;

/** A Firestore stand-in whose batch commit resolves when the test says so. */
function fakeFirestore(commit: () => Promise<void>) {
  const set = vi.fn();
  const commitFn = vi.fn(commit);
  db.getFirestoreDb.mockReturnValue({
    collection: (name: string) => ({ doc: (id: string) => ({ path: `${name}/${id}` }) }),
    batch: () => ({ set, commit: commitFn }),
  });
  return { set, commit: commitFn };
}

function trackOne(): string {
  return telemetry.trackBTHCapabilityTriggered({
    userId: 'user-1',
    sessionId: 'session-1',
    capability: 'commitment_detection',
    trigger: { type: 'user_message', content: 'I will call my sister', confidence: 0.9 },
    action: { type: 'injected_context', description: 'noted the commitment' },
  });
}

const tick = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

beforeEach(async () => {
  vi.resetModules();
  db.getFirestoreDb.mockReset();
  lifecycle = await import('../telemetry-lifecycle.js');
  telemetry = await import('../production-telemetry.js');
  intervals = await import('../../../utils/interval-manager.js');
});

afterEach(() => {
  intervals.clearAllIntervals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('BTH telemetry lifecycle, flag off', () => {
  it('starts no flush interval and does not flush at shutdown', async () => {
    fakeFirestore(async () => undefined);
    expect(lifecycle.startBTHTelemetryIfEnabled({})).toBe(false);
    expect(lifecycle.startBTHTelemetryIfEnabled({ BTH_TELEMETRY_FLUSH: 'off' })).toBe(false);
    expect(intervals.hasInterval(FLUSH_INTERVAL)).toBe(false);

    expect(trackOne()).not.toBe('');
    await lifecycle.stopBTHTelemetry(1_000);

    expect(db.getFirestoreDb).not.toHaveBeenCalled();
    expect(telemetry.getBufferStats().bufferedEvents).toBe(1);
  });
});

describe('BTH telemetry lifecycle, flag on', () => {
  it('starts one 30 s flush, and a second start makes no second interval', () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    expect(lifecycle.startBTHTelemetryIfEnabled(ON)).toBe(true);
    expect(lifecycle.startBTHTelemetryIfEnabled(ON)).toBe(false);

    expect(intervals.hasInterval(FLUSH_INTERVAL)).toBe(true);
    expect(setIntervalSpy.mock.calls.filter(([, ms]) => ms === 30_000)).toHaveLength(1);
  });

  it('sends buffered events to Firestore within 30 s, under the batch size of 50', async () => {
    vi.useFakeTimers();
    const { set } = fakeFirestore(async () => undefined);
    lifecycle.startBTHTelemetryIfEnabled(ON);
    const eventId = trackOne();

    expect(set).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(set).toHaveBeenCalledWith(
      { path: `bth_production_events/${eventId}` },
      expect.objectContaining({ eventId, capability: 'commitment_detection' })
    );
    expect(telemetry.getBufferStats().bufferedEvents).toBe(0);
  });

  it('stop waits for the shutdown flush to commit, then stops the interval', async () => {
    let release!: () => void;
    const { set, commit } = fakeFirestore(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    lifecycle.startBTHTelemetryIfEnabled(ON);
    const eventId = trackOne();

    let stopped = false;
    const stopping = lifecycle.stopBTHTelemetry(5_000).then(() => (stopped = true));
    await tick();
    await tick();

    expect(commit).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      { path: `bth_production_events/${eventId}` },
      expect.objectContaining({ eventId })
    );
    expect(stopped).toBe(false);

    release();
    await stopping;
    expect(stopped).toBe(true);
    expect(intervals.hasInterval(FLUSH_INTERVAL)).toBe(false);
  });

  it('stop gives up after its timeout when Firestore never answers', async () => {
    fakeFirestore(
      () =>
        new Promise<void>(() => {
          // Firestore never answers
        })
    );
    lifecycle.startBTHTelemetryIfEnabled(ON);
    trackOne();

    const started = Date.now();
    await lifecycle.stopBTHTelemetry(50);
    expect(Date.now() - started).toBeLessThan(1_000);
  }, 2_000);
});
