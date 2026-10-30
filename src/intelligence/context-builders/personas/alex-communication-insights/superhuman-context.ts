/**
 * Superhuman Communication Context for Alex
 *
 * Integrates the 10 "Better Than Human" communication capabilities:
 *
 * 1. Communication Archaeology - Perfect recall of past conversations
 * 2. Relationship Temperature - Track gradual drift
 * 3. Unsaid Words Detector - Notice what they DON'T say
 * 4. Reception Predictor - Predict how messages will land
 * 5. Apology Effectiveness - Learn what works per person
 * 6. Conflict Replay - Objective conflict analysis
 * 7. Communication Debt - Track all obligations
 * 8. Third-Party Perspective - Truly neutral viewpoints
 * 9. Strategic Silence - Know when NOT to communicate
 * 10. Unspoken Needs - Surface underlying needs
 *
 * @module intelligence/context-builders/personas/alex-communication-insights/superhuman-context
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import {
  buildSuperhumanCommunicationContext,
  buildQuickCommunicationContext,
  relationshipTemperature,
  unsaidWordsDetector,
  communicationDebt,
  strategicSilence,
} from '../../../../tools/domains/communication/superhuman-tools/index.js';

const log = createLogger({ module: 'context:alex-superhuman' });

// ============================================================================
// TYPES
// ============================================================================

export interface SuperhumanCommunicationBriefing {
  /** Full context string for LLM injection */
  contextString: string;

  /** Quick summary for display */
  summary: {
    relationshipsNeedingAttention: number;
    communicationDebts: number;
    unsaidTopics: number;
    heldMessages: number;
  };

  /** Whether any urgent items need attention */
  hasUrgentItems: boolean;
}

export interface ConversationContext {
  /** Current user transcript */
  transcript?: string;
  /** Detected topics */
  topics?: string[];
  /** Mentioned person name */
  mentionedPerson?: string;
  /** Current emotion */
  emotion?: string;
}

// ============================================================================
// MAIN CONTEXT BUILDER
// ============================================================================

/**
 * Build full superhuman communication context for Alex.
 * Use on first turn, handoffs, or when communication topics arise.
 */
export async function buildAlexSuperhumanContext(
  userId: string,
  conversationContext?: ConversationContext
): Promise<SuperhumanCommunicationBriefing> {
  const startTime = Date.now();

  try {
    // Build context with optional contact-specific focus
    const contextString = await buildSuperhumanCommunicationContext(userId, {
      includeAll: true,
      contactName: conversationContext?.mentionedPerson,
      maxLength: 2500, // Keep reasonable size
    });

    // Get quick stats for summary
    const [debts, tempAlerts, unsaid, heldMsgs] = await Promise.all([
      communicationDebt.getPending(userId).catch((err) => {
        log.warn({ userId, error: String(err) }, 'Failed to get communication debts');
        return [];
      }),
      relationshipTemperature.getNeedingAttention(userId).catch((err) => {
        log.warn({ userId, error: String(err) }, 'Failed to get relationship temperature alerts');
        return [];
      }),
      unsaidWordsDetector.get(userId).catch((err) => {
        log.warn({ userId, error: String(err) }, 'Failed to get unsaid words');
        return [];
      }),
      Promise.resolve(strategicSilence.getReadyMessages(userId)),
    ]);

    const summary = {
      relationshipsNeedingAttention: tempAlerts.length,
      communicationDebts: debts.length,
      unsaidTopics: unsaid.length,
      heldMessages: heldMsgs.length,
    };

    const hasUrgentItems =
      debts.some((d) => d.priority === 'urgent' || d.priority === 'high') ||
      tempAlerts.some((t) => t.alerts.some((a) => a.severity === 'high')) ||
      heldMsgs.length > 0;

    log.debug(
      {
        userId,
        durationMs: Date.now() - startTime,
        ...summary,
      },
      '🦸 Alex superhuman context built'
    );

    return {
      contextString,
      summary,
      hasUrgentItems,
    };
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build Alex superhuman context');

    return {
      contextString: '',
      summary: {
        relationshipsNeedingAttention: 0,
        communicationDebts: 0,
        unsaidTopics: 0,
        heldMessages: 0,
      },
      hasUrgentItems: false,
    };
  }
}

/**
 * Build quick superhuman context for ongoing turns.
 * Lightweight - only most actionable items.
 */
export async function buildAlexQuickSuperhumanContext(userId: string): Promise<string> {
  try {
    return await buildQuickCommunicationContext(userId);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build quick superhuman context');
    return '';
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * End session and persist all tracked data.
 * Call when conversation ends.
 */
export async function endSuperhumanSession(userId: string): Promise<void> {
  try {
    // Persist unsaid words data
    await unsaidWordsDetector.endSession(userId);

    log.debug({ userId }, 'Superhuman session ended and data persisted');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to end superhuman session');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const alexSuperhumanContext = {
  buildFull: buildAlexSuperhumanContext,
  buildQuick: buildAlexQuickSuperhumanContext,
  endSession: endSuperhumanSession,
};

export default alexSuperhumanContext;
