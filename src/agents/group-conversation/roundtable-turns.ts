/**
 * While a roundtable runs, the person's turns go to it, not to the persona's own reply.
 *
 * The persona agent on the call keeps the session; its onUserTurnCompleted asks
 * takeRoundtableTurn first and, when a roundtable takes the turn, stops its own reply
 * (voice.StopResponse). Keyed by the call's session id, which stays the same across
 * handoffs. Plan: docs/plans/2026-10-10-roundtable-voice.md.
 *
 * @module agents/group-conversation/roundtable-turns
 */
import { voice } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'RoundtableTurns' });

type TurnHandler = (utterance: string) => Promise<void>;
const handlers = new Map<string, TurnHandler>();

/** Send this call's turns to a roundtable; returns the function that stops it. */
export function attachRoundtableTurns(
  sessionId: string,
  roundtable: { handleUserInput: TurnHandler }
): () => void {
  const handler: TurnHandler = (utterance) => roundtable.handleUserInput(utterance);
  handlers.set(sessionId, handler);
  return () => {
    if (handlers.get(sessionId) === handler) handlers.delete(sessionId);
  };
}

/** True when a roundtable on this call took the turn (the caller then skips its reply). */
export function takeRoundtableTurn(
  sessionId: string | undefined,
  utterance: string | undefined
): boolean {
  const handler = sessionId ? handlers.get(sessionId) : undefined;
  if (!handler) return false;
  const text = utterance?.trim();
  if (text) {
    void handler(text).catch((error: unknown) =>
      log.warn({ sessionId, error: String(error) }, 'Roundtable could not take the turn')
    );
  }
  return true;
}

/** The call's session id from an agent session's userData (services.sessionId, else sessionId). */
export function callSessionId(userData: unknown): string | undefined {
  const data = userData as { services?: { sessionId?: string }; sessionId?: string } | undefined;
  return data?.services?.sessionId ?? data?.sessionId;
}

/** For a persona agent's onUserTurnCompleted: a roundtable takes the turn → stop its own reply. */
export function stopIfRoundtableTurn(userData: unknown, utterance: string | undefined): void {
  if (takeRoundtableTurn(callSessionId(userData), utterance)) throw new voice.StopResponse();
}
