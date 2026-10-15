/**
 * Every live call installs callUser's outreach adapter (call-user-port.ts).
 * Without it, callUser with TOOLS_REAL_CALL_USER=on would only ever say that
 * no call is coming.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { callUserAdapter } from '../../../services/outreach/call-user-adapter.js';
import {
  getCallUserPort,
  setCallUserPort,
} from '../../../tools/domains/proactive/outreach/call-user-port.js';
import { installLiveCallBehaviors } from '../live-call-behaviors.js';

afterEach(() => {
  setCallUserPort(undefined);
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
});
