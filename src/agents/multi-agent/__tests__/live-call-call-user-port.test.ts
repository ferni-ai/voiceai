/**
 * Every live call installs callUser's outreach adapter (call-user-port.ts).
 * Without it, callUser with TOOLS_REAL_CALL_USER=on would only ever say that
 * no call is coming.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { callUserAdapter } from '../../../services/outreach/call-user-adapter.js';
import { confirmThreadAdapter } from '../../../services/outreach/confirm-thread-adapter.js';
import {
  getConfirmThreadPort,
  setConfirmThreadPort,
} from '../../../tools/domains/communication/outreach/confirm-thread.js';
import {
  getCallUserPort,
  setCallUserPort,
} from '../../../tools/domains/proactive/outreach/call-user-port.js';
import { placeGatedCall, setGatedCallPort } from '../../../tools/domains/telephony/index.js';
import { installLiveCallBehaviors } from '../live-call-behaviors.js';

afterEach(() => {
  setCallUserPort(undefined);
  setConfirmThreadPort(undefined);
  setGatedCallPort(undefined);
  vi.unstubAllEnvs();
});

describe('a live call', () => {
  it('installs the call-user outreach adapter', () => {
    for (const flag of ['INTERRUPT_TRACE', 'BARGE_IN_FASTPATH', 'TURN_KEEPER']) {
      vi.stubEnv(flag, 'off');
    }
    expect(getCallUserPort()).toBeUndefined();
    const session = { on: () => undefined, interrupt: () => undefined };
    installLiveCallBehaviors({
      session: session as never,
      sessionWithEvents: session,
      sessionEventHandlers: [],
      cleanupFunctions: [],
      sessionId: 's1',
      userId: 'u1',
    });
    expect(getCallUserPort()).toBe(callUserAdapter);
  });

  it('installs the store that keeps read-backs waiting on a yes (THREADS_PENDING_CONFIRM)', () => {
    for (const flag of ['INTERRUPT_TRACE', 'BARGE_IN_FASTPATH', 'TURN_KEEPER']) {
      vi.stubEnv(flag, 'off');
    }
    expect(getConfirmThreadPort()).toBeUndefined();
    const session = { on: () => undefined, interrupt: () => undefined };
    installLiveCallBehaviors({
      session: session as never,
      sessionWithEvents: session,
      sessionEventHandlers: [],
      cleanupFunctions: [],
      sessionId: 's1',
      userId: 'u1',
    });
    expect(getConfirmThreadPort()).toBe(confirmThreadAdapter);
  });

  it('installs the placer for backgroundCall and referral calls (CALL_PATHS_PLACE_OR_HOLD)', async () => {
    for (const flag of ['INTERRUPT_TRACE', 'BARGE_IN_FASTPATH', 'TURN_KEEPER']) {
      vi.stubEnv(flag, 'off');
    }
    // A premium-rate number: compliance refuses it before any lookup or dial.
    const call = {
      userId: 'u1',
      userName: 'Sam',
      contactName: 'Ana',
      phone: '+19005550100',
      purpose: 'say hi',
      objective: 'deliver_message',
      callType: 'personal',
    } as const;
    expect(await placeGatedCall(call)).toEqual({ refused: "calls can't be placed from here yet" });
    const session = { on: () => undefined, interrupt: () => undefined };
    installLiveCallBehaviors({
      session: session as never,
      sessionWithEvents: session,
      sessionEventHandlers: [],
      cleanupFunctions: [],
      sessionId: 's1',
      userId: 'u1',
    });
    expect(await placeGatedCall(call)).toEqual({
      refused: '"+19005550100" is a premium-rate number, which I won\'t dial',
    });
  });
});
