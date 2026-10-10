/**
 * While a roundtable runs, the person's turns go to it, not to the persona's own reply.
 *
 * The persona agent on the call keeps the session; its onUserTurnCompleted asks
 * stopIfRoundtableTurn first and, when a roundtable takes the turn, stops its own reply
 * (voice.StopResponse). Keyed by the call's session id, which stays the same across
 * handoffs. Plan: docs/plans/2026-10-10-roundtable-voice.md.
 *
 * Safety first: a turn with a crisis signal is never taken. The roundtable ends and the
 * persona answers that turn through its full pipeline, where the crisis override and
 * safety rails live (voice-agent/turn-handler.ts). Same detector, same threshold.
 *
 * @module agents/group-conversation/roundtable-turns
 */
import { voice } from '@livekit/agents';
import { hasCrisisSignal } from '../processors/turn-processor/turn-crisis.js';
import { detectCrisis } from '../safety/crisis-guard.js';
import { toGuardVoiceEmotion, type ProsodyEmotionLike } from '../safety/crisis-shadow.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'RoundtableTurns' });

type TurnHandler = (utterance: string) => Promise<void>;
interface Attached {
  handleUserInput: TurnHandler;
  /** Called when a turn carries a crisis signal; the roundtable should end. */
  onCrisis: () => void;
}
const attached = new Map<string, Attached>();

type TurnUserData = { voiceEmotion?: unknown; recentTranscripts?: string[] };

/** Send this call's turns to a roundtable; returns the function that stops it. */
export function attachRoundtableTurns(
  sessionId: string,
  roundtable: { handleUserInput: TurnHandler },
  onCrisis: () => void
): () => void {
  const entry: Attached = {
    handleUserInput: (utterance) => roundtable.handleUserInput(utterance),
    onCrisis,
  };
  attached.set(sessionId, entry);
  return () => {
    if (attached.get(sessionId) === entry) attached.delete(sessionId);
  };
}

/** The same signal the turn pipeline uses to keep the LLM (and its crisis override) in the loop. */
function crisisSignal(text: string, userData: TurnUserData | undefined): boolean {
  const crisis = detectCrisis(
    text,
    toGuardVoiceEmotion(userData?.voiceEmotion as ProsodyEmotionLike | undefined),
    { recentMessages: userData?.recentTranscripts }
  );
  return hasCrisisSignal(crisis);
}

/**
 * True when a roundtable on this call took the turn (the caller then skips its reply).
 * Never true for a turn with a crisis signal: that ends the roundtable and returns false.
 */
export function takeRoundtableTurn(
  sessionId: string | undefined,
  utterance: string | undefined,
  userData?: TurnUserData
): boolean {
  const entry = sessionId ? attached.get(sessionId) : undefined;
  if (!entry || !sessionId) return false;
  const text = utterance?.trim();
  if (text && crisisSignal(text, userData)) {
    log.warn({ sessionId }, '🚨 Crisis signal during a roundtable: ending it, the persona answers');
    attached.delete(sessionId);
    entry.onCrisis();
    return false;
  }
  if (text) {
    void entry
      .handleUserInput(text)
      .catch((error: unknown) =>
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
  if (takeRoundtableTurn(callSessionId(userData), utterance, userData as TurnUserData)) {
    throw new voice.StopResponse();
  }
}
