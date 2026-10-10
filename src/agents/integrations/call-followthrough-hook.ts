/**
 * Hooks call follow-through into the agent job that talks on the phone for an
 * on-behalf call: when the session ends, the call's turns are handed to
 * recordCallFollowthrough, which tells the user how it went.
 *
 * Runs from the session's cleanup registry, which both session paths run
 * before the session's turns are torn down.
 *
 * @module agents/integrations/call-followthrough-hook
 */

import { createLogger } from '../../utils/safe-logger.js';
import { registerCleanup } from '../session/event-cleanup-registry.js';
import {
  followthroughCallFromDispatch,
  isCallFollowthroughEnabled,
  recordCallFollowthrough,
  type CallTurn,
} from '../../services/outreach/call-followthrough.js';

const log = createLogger({ module: 'call-followthrough-hook' });

interface CallHistory {
  getSimpleTurns: () => CallTurn[];
  getDurationSeconds: () => number;
}

async function callHistory(sessionId: string): Promise<CallHistory | undefined> {
  const { getSessionServices } = await import('../../services/session/session-manager.js');
  return getSessionServices(sessionId)?.historyTracker;
}

/** Returns true when follow-through will run at the end of this session. */
export function registerCallFollowthrough(
  metadata: Record<string, unknown>,
  sessionId: string,
  getHistory: (sessionId: string) => Promise<CallHistory | undefined> = callHistory
): boolean {
  if (!isCallFollowthroughEnabled()) return false;
  const call = followthroughCallFromDispatch(metadata);
  if (!call) {
    log.warn(
      { sessionId, callId: metadata.callId },
      'On-behalf call has no requester; no one to report back to'
    );
    return false;
  }

  const startedAt = Date.now();
  registerCleanup(sessionId, 'resource', 'call follow-through', async () => {
    const history = await getHistory(sessionId);
    const turns = history?.getSimpleTurns() ?? [];
    const seconds = history?.getDurationSeconds() ?? (Date.now() - startedAt) / 1000;
    await recordCallFollowthrough(call, turns, seconds);
  });
  return true;
}
