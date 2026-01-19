/**
 * Active Listening Handler
 *
 * Handles Phase 17: Active Listening Memory Capture
 * "Better Than Human" - real-time entity extraction as user speaks.
 *
 * Extracted from transcript-handler.ts to reduce file size.
 *
 * @module voice-agent/active-listening-handler
 */

import { diag } from '../../services/diagnostic-logger.js';
import {
  processIncrementalCapture,
  getNextConfirmation,
  type IncrementalCaptureInput,
} from '../../memory/capture/active-listening-capture.js';
import type { UserData } from '../shared/types.js';
import type { ConversationManager } from '../../services/conversation-manager.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ActiveListeningContext {
  /** User ID */
  userId: string;
  /** Session ID */
  sessionId: string;
  /** The transcript text */
  transcript: string;
  /** Whether this is a final transcript */
  isFinal: boolean;
  /** User data with turn count and other context */
  userData: UserData;
  /** Conversation manager for checking agent speaking state */
  conversationManager?: ConversationManager;
}

export interface ActiveListeningResult {
  /** Number of items captured */
  capturedCount: number;
  /** Types of items captured */
  capturedTypes: string[];
  /** Pending confirmation item, if any */
  pendingConfirmation?: {
    itemId: string;
    question: string;
    priority: number;
  };
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Process partial transcript for active listening memory capture.
 * Extracts entities, dates, commitments in real-time as user speaks.
 *
 * @param ctx - Active listening context
 * @returns Active listening result
 */
export function processActiveListeningPartial(ctx: ActiveListeningContext): ActiveListeningResult {
  const { userId, sessionId, transcript, userData, conversationManager } = ctx;

  const result: ActiveListeningResult = {
    capturedCount: 0,
    capturedTypes: [],
  };

  if (!userId) {
    return result;
  }

  try {
    const turnStartTime = (userData as Record<string, unknown>).turnStartTime;
    const captureInput: IncrementalCaptureInput = {
      userId,
      sessionId,
      partialTranscript: transcript,
      isFinal: false,
      turnNumber: userData.turnCount || 0,
      elapsedMs: Date.now() - (typeof turnStartTime === 'number' ? turnStartTime : Date.now()),
      topicContext: userData.lastTopic,
      emotionalContext: userData.lastEmotionAnalysis
        ? {
            primary: userData.lastEmotionAnalysis.primary,
            intensity: userData.lastEmotionAnalysis.intensity,
          }
        : undefined,
    };

    const immediateCaptured = processIncrementalCapture(captureInput);

    if (immediateCaptured.length > 0) {
      result.capturedCount = immediateCaptured.length;
      result.capturedTypes = immediateCaptured.map((i) => i.type);

      diag.state('Active listening: Captured items from partial', {
        count: result.capturedCount,
        types: result.capturedTypes,
      });

      // Check if we should ask a confirmation question
      const nextConfirmation = getNextConfirmation(sessionId);
      if (nextConfirmation && conversationManager && !conversationManager.isAgentSpeaking()) {
        // Store for potential use in response (don't interrupt flow)
        (userData as Record<string, unknown>).pendingConfirmation = nextConfirmation;
        result.pendingConfirmation = {
          itemId: nextConfirmation.itemId,
          question: nextConfirmation.question,
          priority: nextConfirmation.priority,
        };
      }
    }
  } catch {
    // Active listening is non-critical - don't block transcript processing
  }

  return result;
}

/**
 * Process final transcript for active listening memory capture.
 * Captures any remaining items from the complete utterance.
 *
 * @param ctx - Active listening context
 * @returns Active listening result
 */
export function processActiveListeningFinal(ctx: ActiveListeningContext): ActiveListeningResult {
  const { userId, sessionId, transcript, userData } = ctx;

  const result: ActiveListeningResult = {
    capturedCount: 0,
    capturedTypes: [],
  };

  if (!userId || !transcript) {
    return result;
  }

  try {
    const finalTurnStartTime = (userData as Record<string, unknown>).turnStartTime;
    const captureInput: IncrementalCaptureInput = {
      userId,
      sessionId,
      partialTranscript: transcript,
      isFinal: true,
      turnNumber: userData.turnCount || 0,
      elapsedMs:
        Date.now() - (typeof finalTurnStartTime === 'number' ? finalTurnStartTime : Date.now()),
      topicContext: userData.lastTopic,
      emotionalContext: userData.lastEmotionAnalysis
        ? {
            primary: userData.lastEmotionAnalysis.primary,
            intensity: userData.lastEmotionAnalysis.intensity,
          }
        : undefined,
    };

    const finalCaptured = processIncrementalCapture(captureInput);

    if (finalCaptured.length > 0) {
      result.capturedCount = finalCaptured.length;
      result.capturedTypes = finalCaptured.map((i) => i.type);

      diag.state('Active listening: Final capture complete', {
        count: result.capturedCount,
        types: result.capturedTypes,
      });
    }
  } catch {
    // Active listening is non-critical
  }

  return result;
}

export default {
  processActiveListeningPartial,
  processActiveListeningFinal,
};
