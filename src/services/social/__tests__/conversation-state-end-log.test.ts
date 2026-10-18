/**
 * Ending a call must not warn that persistence was off.
 *
 * Nothing calls initConversationStateWithPersistence, so persistence is off
 * for every session and endConversation logged "📦 SKIP: Persistence was NOT
 * enabled for this session" at warn at the end of every prod call (build
 * c20c77407). The call's memory is saved by other pipelines; this is now a
 * debug line.
 */
import { describe, expect, it, vi } from 'vitest';

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

vi.mock('../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getLogger: () => log,
}));

import { endConversation, getConversationState } from '../conversation-state.js';

describe('endConversation without persistence', () => {
  it('ends the call without a warning', async () => {
    getConversationState('end-log-session', 'end-log-user', 'ferni').incrementTurn();

    const state = await endConversation('end-log-session');

    expect(state?.flow.turnCount).toBe(1);
    expect(log.warn).not.toHaveBeenCalled();
    expect(log.debug).toHaveBeenCalledWith(
      { sessionId: 'end-log-session' },
      '📦 Conversation state not archived (persistence off)'
    );
  });
});
