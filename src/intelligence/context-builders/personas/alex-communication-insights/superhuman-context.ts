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
  communicationArchaeology,
  relationshipTemperature,
  unsaidWordsDetector,
  communicationDebt,
  strategicSilence,
  unspokenNeeds,
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
export async function buildAlexQuickSuperhumanContext(
  userId: string
): Promise<string> {
  try {
    return await buildQuickCommunicationContext(userId);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build quick superhuman context');
    return '';
  }
}

// ============================================================================
// REAL-TIME PROCESSING
// ============================================================================

/**
 * Process user transcript for superhuman insights in real-time.
 * Call this on each turn to detect patterns.
 */
export async function processTranscriptForSuperhuman(
  userId: string,
  transcript: string,
  context?: { currentTopic?: string }
): Promise<{
  detectedDebt?: ReturnType<typeof communicationDebt.detect>[0];
  detectedUnsaid?: ReturnType<typeof unsaidWordsDetector.detect>;
  detectedNeed?: ReturnType<typeof unspokenNeeds.detect>;
  communicationMention?: ReturnType<typeof communicationArchaeology.detectMention>;
}> {
  const results: {
    detectedDebt?: ReturnType<typeof communicationDebt.detect>[0];
    detectedUnsaid?: ReturnType<typeof unsaidWordsDetector.detect>;
    detectedNeed?: ReturnType<typeof unspokenNeeds.detect>;
    communicationMention?: ReturnType<typeof communicationArchaeology.detectMention>;
  } = {};

  try {
    // Detect communication debt mentions
    const debts = communicationDebt.detect(transcript);
    if (debts.length > 0) {
      results.detectedDebt = debts[0];

      // Auto-record the debt (fire and forget)
      void communicationDebt.record(userId, {
        type: debts[0].type,
        description: debts[0].description,
        contactName: debts[0].contactName || 'Unknown',
        priority: 'medium',
        relationshipImportance: 5,
        status: 'pending',
      });
    }

    // Detect topic deflection (unsaid words)
    const unsaidDetection = unsaidWordsDetector.detect(transcript, context?.currentTopic);
    if (unsaidDetection.topicMentioned) {
      results.detectedUnsaid = unsaidDetection;

      // Track in session
      unsaidWordsDetector.track(
        userId,
        unsaidDetection.topicMentioned,
        unsaidDetection.wasDeflected,
        transcript.slice(0, 100)
      );
    }

    // Detect unspoken needs
    const needDetection = unspokenNeeds.detect(transcript);
    if (needDetection) {
      results.detectedNeed = needDetection;
    }

    // Detect conversation mentions
    const commMention = communicationArchaeology.detectMention(transcript, context);
    if (commMention.detected) {
      results.communicationMention = commMention;

      // Auto-record the communication event
      if (commMention.contactName && commMention.contactName !== 'Unknown') {
        void communicationArchaeology.recordEvent(userId, {
          userId,
          type: commMention.type || 'mentioned',
          contactName: commMention.contactName,
          summary: transcript.slice(0, 200),
          topics: commMention.topics || [],
          sentiment: commMention.sentiment || 0,
          emotionalWeight: 0.5,
          occurredAt: Date.now(),
        });

        // Update relationship temperature
        void relationshipTemperature.update(
          userId,
          commMention.contactName,
          commMention.sentiment || 0,
          transcript.slice(0, 100)
        );
      }
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to process transcript for superhuman insights');
  }

  return results;
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
  processTranscript: processTranscriptForSuperhuman,
  endSession: endSuperhumanSession,
};

export default alexSuperhumanContext;
