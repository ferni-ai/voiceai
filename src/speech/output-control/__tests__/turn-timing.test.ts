/**
 * Each deliberate hold reports what it really held, measured where it happens
 * (turn-timing.ts), so the TURN_RECEIPT can credit a latency A/B to the right layer.
 */
import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { onTurnTiming, turnHoldTimer, type TurnTimingKind } from '../turn-timing.js';
import { OpenerGate } from '../../../agents/personas/opener-gate.js';
import { holdUntilCleared } from '../../../agents/personas/crisis-gate.js';
import { noteCrisisVerdictPending } from '../../../agents/safety/crisis-gate-signal.js';

const SID = 'RM_timing';
let heard: Array<[string, TurnTimingKind, number]> = [];
let off: () => void = () => undefined;
beforeEach(() => {
  vi.useFakeTimers({ now: 2_000_000 });
  heard = [];
  off = onTurnTiming((sessionId, kind, ms) => heard.push([sessionId, kind, ms]));
});
afterEach(() => {
  off();
  vi.useRealTimers();
});

/** A stream whose chunks we hand over one at a time. */
function source() {
  let ctl!: ReadableStreamDefaultController<string>;
  const stream = new ReadableStream<string>({ start: (c) => void (ctl = c) });
  return { stream, push: (t: string) => ctl.enqueue(t), end: () => ctl.close() };
}

describe('turnHoldTimer', () => {
  it('reports once, from the first start to the first stop after it', () => {
    const t = turnHoldTimer(SID, 'openerGate');
    t.stop(); // nothing started: nothing held
    t.start();
    vi.advanceTimersByTime(80);
    t.start(); // a later start doesn't move it
    vi.advanceTimersByTime(40);
    t.stop();
    t.stop();
    expect(heard).toEqual([[SID, 'openerGate', 120]]);
  });

  it('reports nothing without a session', () => {
    const t = turnHoldTimer(undefined, 'crisis');
    t.start();
    t.stop();
    expect(heard).toEqual([]);
  });
});

describe('the holds, measured in place', () => {
  it('opener gate: from the first words in to the decided opening out', async () => {
    const userData = { services: { sessionId: SID } };
    const gate = new OpenerGate(3, false, false).forSession(() => ({ userData }));
    const src = source();
    const reader = gate.wrap(src.stream as never).getReader();
    src.push('Oh, ');
    await vi.advanceTimersByTimeAsync(150); // not decidable yet: the gate waits for more
    expect(heard).toEqual([]);
    src.push('that is wonderful news for you.');
    const first = await reader.read();
    expect(first.value).toContain('wonderful news'); // the decided opening, out now
    expect(heard).toEqual([[SID, 'openerGate', 150]]);
  });

  it('crisis gate: a ready reply waits for the classifier to clear it', async () => {
    const session = { userData: { services: { sessionId: SID } } };
    let clear!: (v: null) => void;
    const escalation = new Promise<null>((resolve) => {
      clear = resolve;
    });
    noteCrisisVerdictPending(session, escalation);
    const src = source();
    const reader = holdUntilCleared(src.stream as never, escalation, async () => null).getReader();
    src.push('Hey there.');
    await vi.advanceTimersByTimeAsync(220);
    clear(null);
    src.end();
    expect((await reader.read()).value).toBe('Hey there.');
    expect(heard).toEqual([[SID, 'crisis', 220]]);
  });
});
