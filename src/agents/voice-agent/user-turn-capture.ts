/**
 * User Turn Capture
 *
 * Everything memory needs from one final user transcript, in one place, run
 * BEFORE any tool routing so no route (FTIS direct execution, handoff, cached
 * reply) can skip it:
 *
 * 1. allocate the turn number (shared with assistant turns, monotonic)
 * 2. session history + Firestore turn (`recordUserTurn` → `services.addTurn`)
 * 3. conversation thread message
 * 4. dynamic memory fast capture + STM buffer (queues deep extraction)
 * 5. active-listening capture
 *
 * Steps 2-5 run in the background; only the turn number is synchronous.
 *
 * @module voice-agent/user-turn-capture
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { SessionServices } from '../../services/index.js';
import type { ConversationManager } from '../../services/conversation-manager.js';
import type { PersonaId } from '../../personas/types.js';
import type { UserData } from '../shared/types.js';
import { nextTurnNumber } from '../../services/memory/turn-sequencer.js';
import { rememberSessionTurn } from '../../memory/capture/session-turn-ring.js';
import { processActiveListeningFinal } from './active-listening-handler.js';

const log = createLogger({ module: 'user-turn-capture' });

export interface UserTurnCaptureInput {
  transcript: string;
  sessionId: string;
  userId: string | undefined;
  services: SessionServices | null | undefined;
  personaId: string;
  userData: UserData;
  conversationManager?: ConversationManager;
}

function sentimentFrom(userData: UserData): 'positive' | 'negative' | 'neutral' {
  const primary = userData.lastEmotionAnalysis?.primary;
  if (primary === 'happy') return 'positive';
  if (primary === 'sad') return 'negative';
  return 'neutral';
}

async function captureDynamicMemory(
  input: UserTurnCaptureInput,
  userId: string,
  turnNumber: number
): Promise<void> {
  const { fastCapture, recordTurn } = await import('../../memory/dynamic/index.js');
  const captureResult = await fastCapture({
    userId,
    sessionId: input.sessionId,
    turnNumber,
    transcript: input.transcript,
    personaId: input.personaId,
  });
  recordTurn(input.sessionId, userId, captureResult, input.transcript, turnNumber, input.personaId);
}

/**
 * Capture a final user transcript on every memory path. Returns the turn
 * number allocated (0 when the transcript was empty).
 */
export function captureUserTurn(input: UserTurnCaptureInput): number {
  const transcript = input.transcript?.trim();
  if (!transcript) return 0;

  const { sessionId, userId, services, personaId } = input;
  const turnNumber = nextTurnNumber(sessionId);
  rememberSessionTurn(sessionId, {
    role: 'user',
    text: transcript,
    turnNumber,
    personaId,
    timestamp: Date.now(),
  });

  // Session history + Firestore turns (+ on-behalf capture)
  void import('./agent-turn-recorder.js')
    .then(({ recordUserTurn }) =>
      recordUserTurn(sessionId, services, transcript, { turnNumber, personaId })
    )
    .catch((error: unknown) => {
      log.warn({ error: String(error), sessionId }, 'User turn record failed, using fallback');
      services?.addTurn?.('user', transcript, undefined, { turnNumber, personaId });
    });

  if (!userId) {
    log.debug({ sessionId }, 'No userId - skipping thread + dynamic memory capture');
    return turnNumber;
  }

  // Conversation thread (cross-channel continuity)
  void import('../../services/conversation-thread/thread-recorder.js')
    .then(({ recordUserMessage }) =>
      recordUserMessage({
        userId,
        sessionId,
        personaId: personaId as PersonaId,
        threadId: input.userData.threadId,
        content: transcript,
        sentiment: sentimentFrom(input.userData),
        topics: input.userData.recentTopics,
      })
    )
    .catch((error: unknown) =>
      log.debug({ error: String(error), sessionId }, 'Thread user message failed (non-critical)')
    );

  // Dynamic memory: fast capture → STM buffer, queues deep extraction
  void captureDynamicMemory(input, userId, turnNumber).catch((error: unknown) =>
    log.warn({ error: String(error), sessionId }, 'Dynamic memory capture failed')
  );

  // Active listening (entities, dates, commitments)
  try {
    processActiveListeningFinal({
      userId,
      sessionId,
      transcript,
      isFinal: true,
      userData: input.userData,
      conversationManager: input.conversationManager,
    });
  } catch (error) {
    log.debug({ error: String(error), sessionId }, 'Active listening capture failed');
  }

  return turnNumber;
}
