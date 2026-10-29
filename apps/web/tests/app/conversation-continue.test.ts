/**
 * #2291: the agent may take back its goodbye. `conversation_continue`, arriving
 * while the app is still showing the goodbye from `conversation_end`, cancels
 * the hang-up, so a call never ends on crisis risk or while the caller is
 * still talking. Every message goes through the real handleDataMessage.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/message.ui.js', () => ({
  messageUI: { show: vi.fn(), clear: vi.fn() },
}));

import { handleDataMessage } from '../../src/app/data-message-handlers.js';
import {
  cancelEndDisconnect,
  CONVERSATION_CONTINUE_EVENT,
  holdEndDisconnect,
  MAX_END_HOLD_MS,
  scheduleEndDisconnect,
  watchGoodbyeCeremony,
} from '../../src/app/conversation-continue.js';
import { CALL_WRAP_UP_STORAGE_KEY } from '../../src/config/call-wrap-up-flag.js';
import { appState } from '../../src/state/app.state.js';
import type { DataMessage } from '../../src/types/events.js';

const deliver = (message: Record<string, unknown>): void =>
  handleDataMessage({ timestamp: Date.now(), ...message } as unknown as DataMessage);

describe('scheduleEndDisconnect / cancelEndDisconnect', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cancelEndDisconnect();
    vi.useRealTimers();
  });

  it('runs the hang-up after the delay unless cancelled first', () => {
    const ran = vi.fn();
    scheduleEndDisconnect(ran, 2500);
    vi.advanceTimersByTime(2499);
    expect(ran).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(ran).toHaveBeenCalledTimes(1);
    expect(cancelEndDisconnect()).toBe(false); // nothing left pending

    const cancelled = vi.fn();
    scheduleEndDisconnect(cancelled, 2500);
    vi.advanceTimersByTime(1000);
    expect(cancelEndDisconnect()).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(cancelled).not.toHaveBeenCalled();
  });
});

describe('holdEndDisconnect', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cancelEndDisconnect();
    vi.useRealTimers();
  });

  it('moves the hang-up to the delay after the latest hold, capped 8 s after the end', () => {
    const ran = vi.fn();
    expect(holdEndDisconnect()).toBe(false); // nothing to hold
    scheduleEndDisconnect(ran, 2500);
    vi.advanceTimersByTime(2000);
    expect(holdEndDisconnect()).toBe(true); // due at 4500 now
    vi.advanceTimersByTime(2499);
    expect(ran).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(ran).toHaveBeenCalledTimes(1);

    const capped = vi.fn();
    scheduleEndDisconnect(capped, 2500);
    for (let t = 0; t < 10_000; t += 1000) {
      holdEndDisconnect();
      vi.advanceTimersByTime(1000);
      if (t + 1000 < MAX_END_HOLD_MS) expect(capped).not.toHaveBeenCalled();
    }
    expect(capped).toHaveBeenCalledTimes(1);
    expect(MAX_END_HOLD_MS).toBe(8000);
  });
});

describe('conversation_continue after conversation_end', () => {
  const disconnects = vi.fn();
  const continues = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    window.addEventListener('ferni:conversation-end-disconnect', disconnects);
    window.addEventListener(CONVERSATION_CONTINUE_EVENT, continues);
  });
  afterEach(() => {
    window.removeEventListener('ferni:conversation-end-disconnect', disconnects);
    window.removeEventListener(CONVERSATION_CONTINUE_EVENT, continues);
    disconnects.mockReset();
    continues.mockReset();
    localStorage.removeItem(CALL_WRAP_UP_STORAGE_KEY);
    cancelEndDisconnect();
    vi.useRealTimers();
  });

  it('without it, the goodbye hangs up after its delay', () => {
    deliver({ type: 'conversation_end', reason: 'goodbye_complete', disconnectDelay: 2500 });
    vi.advanceTimersByTime(2500);
    expect(disconnects).toHaveBeenCalledTimes(1);
  });

  it.each(['crisis_hold', 'caller_spoke'])('%s cancels the hang-up and announces it', (reason) => {
    localStorage.setItem(CALL_WRAP_UP_STORAGE_KEY, 'true'); // the goodbye ceremony sets wrapping-up
    deliver({ type: 'conversation_end', reason: 'goodbye_complete', disconnectDelay: 2500 });
    expect(appState.get('isWrappingUp')).toBe(true);
    vi.advanceTimersByTime(1200);
    deliver({ type: 'conversation_continue', reason });
    vi.advanceTimersByTime(10_000);
    expect(disconnects).not.toHaveBeenCalled();
    expect(continues).toHaveBeenCalledTimes(1);
    expect((continues.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ reason });
    expect(appState.get('isWrappingUp')).toBe(false);
  });

  it("cancels the agent's own exit too", () => {
    deliver({ type: 'conversation_end', reason: 'agent_exit', disconnectDelay: 1500 });
    deliver({ type: 'conversation_continue', reason: 'crisis_hold' });
    vi.advanceTimersByTime(10_000);
    expect(disconnects).not.toHaveBeenCalled();
  });

  it('conversation_hold keeps the call up while the caller talks, then it still hangs up', () => {
    deliver({ type: 'conversation_end', reason: 'goodbye_complete', disconnectDelay: 2500 });
    vi.advanceTimersByTime(2000);
    deliver({ type: 'conversation_hold', reason: 'caller_speaking' });
    vi.advanceTimersByTime(2000); // 4 s after the end: past the plain 2.5 s
    expect(disconnects).not.toHaveBeenCalled();
    expect(continues).not.toHaveBeenCalled(); // a hold never reopens the call
    vi.advanceTimersByTime(500);
    expect(disconnects).toHaveBeenCalledTimes(1);
  });

  it('a continue during the goodbye ceremony stops it before it disconnects', async () => {
    const stopped = watchGoodbyeCeremony();
    const pausing = stopped.pause(400);
    vi.advanceTimersByTime(200);
    deliver({ type: 'conversation_continue', reason: 'crisis_hold' });
    vi.advanceTimersByTime(200);
    expect(await pausing).toBe(true); // app.ts returns before performStandardDisconnect

    const calm = watchGoodbyeCeremony(); // a later goodbye: no continue during it
    const pausingCalm = calm.pause(400);
    vi.advanceTimersByTime(400);
    expect(await pausingCalm).toBe(false);
  });

  it('app.ts stops its ceremony on the pause (pinned to the source)', () => {
    const app = readFileSync(join(__dirname, '..', '..', 'src', 'app.ts'), 'utf8');
    const ceremony = app.slice(app.indexOf('private async performGoodbyeCeremony'));
    const pause = ceremony.indexOf('if (await ceremony.pause(400)) return;');
    expect(ceremony.indexOf('const ceremony = watchGoodbyeCeremony();')).toBeGreaterThan(0);
    expect(pause).toBeGreaterThan(0);
    expect(pause).toBeLessThan(ceremony.indexOf('await this.performStandardDisconnect(true)'));
  });

  it('a later goodbye on the same call still hangs up', () => {
    deliver({ type: 'conversation_end', reason: 'goodbye_complete', disconnectDelay: 2500 });
    deliver({ type: 'conversation_continue', reason: 'caller_spoke' });
    deliver({ type: 'conversation_end', reason: 'goodbye_complete', disconnectDelay: 2500 });
    vi.advanceTimersByTime(2500);
    expect(disconnects).toHaveBeenCalledTimes(1);
  });
});
