import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEMO_DEFAULT_MINUTES,
  DEMO_END_REASON,
  DEMO_GOODBYE_LEAD_MS,
  DEMO_GOODBYE_LINE,
  DEMO_WARNING_LEAD_MS,
  DEMO_WARNING_LINE,
  clampDemoMinutes,
  demoCallCap,
  startDemoCallCap,
} from '../demo-call-cap.js';
import { waitForSessionEnd, type WatchedRoom } from '../session-end-watch.js';

class FakeRoom extends EventEmitter implements WatchedRoom {
  isConnected = true;
  remoteParticipants = { size: 1 };
}

const MINUTE = 60_000;
const ON = { DEMO_CALL_CAP: 'on' };
const demoMeta = (extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ is_demo: true, demo_id: 'demo-1', session_duration_minutes: 3, ...extra });

async function state(p: Promise<string>): Promise<string> {
  return Promise.race([p, Promise.resolve('still-open')]);
}

/** The multi-agent wiring: cap from metadata, then the shared session wait. */
function runCall(room: FakeRoom, metadata: string | undefined, env: Record<string, string>) {
  const said: string[] = [];
  const limitMs = demoCallCap(metadata, env);
  const cap = limitMs === null ? null : startDemoCallCap(limitMs, (t) => said.push(t));
  const ended = waitForSessionEnd(room, cap?.endOptions).finally(() => cap?.stop());
  return { said, ended, limitMs };
}

/** Keeps the caller talking so the idle stop never fires. */
async function talkFor(room: FakeRoom, ms: number): Promise<void> {
  for (let t = 0; t < ms; t += 5_000) {
    room.emit('activeSpeakersChanged', [{ identity: 'caller' }]);
    await vi.advanceTimersByTimeAsync(Math.min(5_000, ms - t)); // eslint-disable-line no-await-in-loop -- timers advance in order
  }
}

describe('demoCallCap', () => {
  it('is off by default: a demo room gets no cap', () => {
    expect(demoCallCap(demoMeta(), {})).toBeNull();
    expect(demoCallCap(demoMeta(), { DEMO_CALL_CAP: 'off' })).toBeNull();
  });

  it('caps nothing that is not a demo', () => {
    expect(demoCallCap(JSON.stringify({ persona_id: 'ferni' }), ON)).toBeNull();
    expect(demoCallCap(demoMeta({ is_demo: false }), ON)).toBeNull();
  });

  it('caps a demo at session_duration_minutes', () => {
    expect(demoCallCap(demoMeta({ session_duration_minutes: 5 }), ON)).toBe(5 * MINUTE);
  });

  it('treats missing or malformed metadata as no cap', () => {
    expect(demoCallCap(undefined, ON)).toBeNull();
    expect(demoCallCap('', ON)).toBeNull();
    expect(demoCallCap('{not json', ON)).toBeNull();
    expect(demoCallCap('[1,2]', ON)).toBeNull();
    expect(demoCallCap('null', ON)).toBeNull();
  });

  it('defaults a demo with no usable duration to 3 minutes', () => {
    const noDuration = JSON.stringify({ is_demo: true });
    expect(demoCallCap(noDuration, ON)).toBe(DEMO_DEFAULT_MINUTES * MINUTE);
    expect(demoCallCap(demoMeta({ session_duration_minutes: 'soon' }), ON)).toBe(3 * MINUTE);
  });
});

describe('clampDemoMinutes', () => {
  it('clamps to 1..10 and defaults junk to 3', () => {
    expect(clampDemoMinutes(0)).toBe(1);
    expect(clampDemoMinutes(-4)).toBe(1);
    expect(clampDemoMinutes(180)).toBe(10);
    expect(clampDemoMinutes('7')).toBe(7);
    expect(clampDemoMinutes(2.5)).toBe(2.5);
    expect(clampDemoMinutes(Number.NaN)).toBe(3);
    expect(clampDemoMinutes(Infinity)).toBe(3);
    expect(clampDemoMinutes(null)).toBe(3);
    expect(clampDemoMinutes('')).toBe(3);
    expect(clampDemoMinutes({})).toBe(3);
  });
});

describe('a demo call end to end, with fake timers', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('flag off: a demo call keeps going past its duration, and nothing is said', async () => {
    const room = new FakeRoom();
    const call = runCall(room, demoMeta(), {});
    await talkFor(room, 5 * MINUTE);
    expect(await state(call.ended)).toBe('still-open');
    expect(call.said).toEqual([]);
  });

  it('flag on, not a demo: no cap, nothing said', async () => {
    const room = new FakeRoom();
    const call = runCall(room, JSON.stringify({ persona_id: 'ferni' }), ON);
    await talkFor(room, 12 * MINUTE);
    expect(await state(call.ended)).toBe('still-open');
    expect(call.said).toEqual([]);
  });

  it('flag on, a demo: warns, says goodbye, then ends at the duration', async () => {
    const room = new FakeRoom();
    const call = runCall(room, demoMeta(), ON);
    const limit = 3 * MINUTE;

    await talkFor(room, limit - DEMO_WARNING_LEAD_MS - 1_000);
    expect(call.said).toEqual([]);
    await talkFor(room, 2_000);
    expect(call.said).toEqual([DEMO_WARNING_LINE]);

    await talkFor(room, DEMO_WARNING_LEAD_MS - DEMO_GOODBYE_LEAD_MS);
    expect(call.said).toEqual([DEMO_WARNING_LINE, DEMO_GOODBYE_LINE]);
    expect(await state(call.ended)).toBe('still-open');

    await talkFor(room, DEMO_GOODBYE_LEAD_MS - 2_000);
    expect(await state(call.ended)).toBe('still-open');
    await talkFor(room, 2_000);
    expect(await call.ended).toBe(DEMO_END_REASON);
  });

  it('a bad duration is clamped: 180 minutes ends at 10', async () => {
    const room = new FakeRoom();
    const call = runCall(room, demoMeta({ session_duration_minutes: 180 }), ON);
    await talkFor(room, 10 * MINUTE - 1_000);
    expect(await state(call.ended)).toBe('still-open');
    await talkFor(room, 1_000);
    expect(await call.ended).toBe(DEMO_END_REASON);
  });

  it('a caller who leaves early stops the timers: no lines after the call', async () => {
    const room = new FakeRoom();
    const call = runCall(room, demoMeta(), ON);
    await talkFor(room, MINUTE);
    room.emit('disconnected');
    expect(await call.ended).toBe('room.disconnected');
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(call.said).toEqual([]);
  });

  it('a say that throws is logged and the call still ends on time', async () => {
    const room = new FakeRoom();
    const cap = startDemoCallCap(MINUTE, () => {
      throw new Error('no active agent');
    });
    const ended = waitForSessionEnd(room, cap.endOptions);
    await talkFor(room, MINUTE);
    expect(await ended).toBe(DEMO_END_REASON);
    cap.stop();
  });
});

describe('spoken lines follow the voice text rules', () => {
  it('have no em dashes, ellipses or stage directions, and end with full stops', () => {
    for (const line of [DEMO_WARNING_LINE, DEMO_GOODBYE_LINE]) {
      expect(line).not.toMatch(/[—–…]|\.\.\.|[*[\]()]/);
      expect(line.trim().endsWith('.')).toBe(true);
    }
    expect(DEMO_GOODBYE_LINE).toMatch(/\bsign in\b/);
  });
});
