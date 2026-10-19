/**
 * The session's conversation state, with Firestore handed to conversation
 * carryover here: services/social is core and may not import the platform's
 * db (quality:arch), so the agent layer passes it in.
 *
 * @module agents/voice-agent/conversation-open
 */
import type { ConversationStateManager } from '../../services/social/conversation-state.js';
import {
  openConversation as openWithCarryover,
  setCarryoverDb,
} from '../../services/social/conversation-carryover.js';
import { getDb } from '../../utils/safe-firestore.js';

export function openConversation(
  sessionId: string,
  userId: string,
  agentId: string
): ConversationStateManager {
  setCarryoverDb(getDb);
  return openWithCarryover(sessionId, userId, agentId);
}
