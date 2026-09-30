/**
 * Notices when the caller speaks over Ferni, for the next reply
 * (conversation/yielding.ts).
 *
 * The SDK marks a cut-off reply `interrupted`, but adds it to the chat only
 * after the cancelled audio drains, so the next reply's context usually
 * does not have it yet. The session's own state events are on time:
 *
 * - the caller starts speaking while Ferni is speaking: spoken over;
 * - Ferni's reply still finishes (the SDK resumed after a false
 *   interruption, like an "mm-hm"): not spoken over after all;
 * - Ferni starts its next reply: that one is a new turn, clear it.
 *
 * @module agents/multi-agent/overlap-tracker
 */

interface SessionEvents {
  on?: (event: string, handler: (event: unknown) => void) => void;
  off?: (event: string, handler: (event: unknown) => void) => void;
}

interface OverlapHolder {
  /** The caller spoke over the reply now being answered. */
  spokeOverReply?: boolean;
}

export function wireOverlapTracker(session: SessionEvents, userData: OverlapHolder): () => void {
  let agentSpeaking = false;
  const onAgentState = (event: unknown) => {
    const state = (event as { newState?: string }).newState;
    if (state === 'speaking') userData.spokeOverReply = false;
    agentSpeaking = state === 'speaking';
  };
  const onUserState = (event: unknown) => {
    if ((event as { newState?: string }).newState === 'speaking' && agentSpeaking) {
      userData.spokeOverReply = true;
    }
  };
  const onItem = (event: unknown) => {
    const item = (event as { item?: { role?: string; interrupted?: boolean } }).item;
    // A reply that played to the end was not cut off after all
    if (item?.role === 'assistant' && item.interrupted !== true && agentSpeaking === false) {
      userData.spokeOverReply = false;
    }
  };
  session.on?.('agent_state_changed', onAgentState);
  session.on?.('user_state_changed', onUserState);
  session.on?.('conversation_item_added', onItem);
  return () => {
    session.off?.('agent_state_changed', onAgentState);
    session.off?.('user_state_changed', onUserState);
    session.off?.('conversation_item_added', onItem);
  };
}
