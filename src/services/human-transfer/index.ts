/**
 * Human Expert Transfer Service
 *
 * > "Better than human means knowing when to bring in a human."
 *
 * Warm handoff system that connects users with professional help
 * when AI life coaching isn't enough.
 *
 * ## Features
 *
 * - **Escalation Classification**: Detect when professional help is needed
 * - **Context Summary**: Generate warm handoff summaries
 * - **Transfer Flow**: Orchestrate the connection
 * - **Safety First**: Crisis situations always get resources
 *
 * ## Usage
 *
 * ```typescript
 * import { humanTransfer } from './services/human-transfer';
 *
 * // Check if transfer is needed
 * const decision = humanTransfer.evaluateTransferNeed(transcript);
 *
 * if (decision.type !== 'none') {
 *   // Generate summary for professional
 *   const summary = await humanTransfer.generateSummary(
 *     decision.type,
 *     userProfile,
 *     conversations
 *   );
 *
 *   // Initiate transfer with consent
 *   const result = await humanTransfer.initiateTransfer({
 *     userId,
 *     decision,
 *     consent: { granted: true },
 *     summary,
 *   });
 * }
 * ```
 *
 * @module services/human-transfer
 */

import { createLogger } from '../../utils/safe-logger.js';

// Re-export types
export type {
  EscalationType,
  TransferUrgency,
  TransferChannel,
  EscalationDecision,
  CrisisSignals,
  TransferSummary,
  TransferConsent,
  TransferRequest,
  TransferResult,
  TransferRecord,
  CrisisService,
  ProfessionalEntry,
} from './types.js';

// Re-export classifiers
export {
  detectCrisisSignals,
  classifyEscalation,
  classifyWithContext,
  escalationClassifier,
} from './escalation-classifier.js';

// Re-export summary generators
export {
  generateTransferSummary,
  generateMinimalSummary,
  generateTopicsOnlySummary,
  contextSummary,
} from './context-summary.js';

// Re-export transfer flow
export {
  evaluateTransferNeed,
  getAvailableServices,
  initiateWarmTransfer,
  generateConsentRequest,
  transferFlow,
} from './transfer-flow.js';

const log = createLogger({ module: 'human-transfer' });

// ============================================================================
// UNIFIED API
// ============================================================================

import {
  detectCrisisSignals,
  classifyEscalation,
  classifyWithContext,
} from './escalation-classifier.js';
import { generateTransferSummary, generateMinimalSummary } from './context-summary.js';
import {
  evaluateTransferNeed,
  initiateWarmTransfer,
  generateConsentRequest,
  getAvailableServices,
} from './transfer-flow.js';
import type {
  EscalationType,
  EscalationDecision,
  TransferRequest,
  TransferResult,
  TransferSummary,
} from './types.js';

/**
 * Unified Human Transfer API
 *
 * Main entry point for the human transfer system.
 */
export const humanTransfer = {
  /**
   * Evaluate if a transfer to human professional is needed
   */
  evaluateTransferNeed,

  /**
   * Detect crisis signals from text
   */
  detectCrisisSignals,

  /**
   * Classify escalation with full context
   */
  classifyEscalation,

  /**
   * Classify with conversation history
   */
  classifyWithContext,

  /**
   * Generate transfer summary for professional
   */
  generateSummary: generateTransferSummary,

  /**
   * Generate minimal summary (privacy-focused)
   */
  generateMinimalSummary,

  /**
   * Initiate warm transfer
   */
  initiateTransfer: initiateWarmTransfer,

  /**
   * Generate consent request message
   */
  generateConsentRequest,

  /**
   * Get available services for escalation type
   */
  getAvailableServices,

  /**
   * Quick check: is this a crisis?
   */
  isCrisis: (transcript: string): boolean => {
    const signals = detectCrisisSignals(transcript);
    return signals.severity >= 7;
  },

  /**
   * Quick check: is this beyond coaching scope?
   */
  needsProfessional: (transcript: string): boolean => {
    const decision = evaluateTransferNeed(transcript);
    return decision.type !== 'none';
  },

  /**
   * Get crisis resources (always safe to call)
   */
  getCrisisResources: () => [
    {
      name: '988 Suicide & Crisis Lifeline',
      contact: 'Call or text 988',
      available: '24/7',
      description: 'Free, confidential support for people in distress',
    },
    {
      name: 'Crisis Text Line',
      contact: 'Text HOME to 741741',
      available: '24/7',
      description: 'Free crisis counseling via text',
    },
  ],
};

// ============================================================================
// CONTEXT INJECTION BUILDER
// ============================================================================

/**
 * Build context injection for LLM when transfer might be needed
 */
export function buildTransferAwarenessContext(decision: EscalationDecision): string | null {
  if (decision.type === 'none') return null;

  const sections: string[] = [];

  sections.push('[TRANSFER AWARENESS - Better Than Human]');

  if (decision.type === 'crisis_immediate' || decision.type === 'crisis_support') {
    sections.push('');
    sections.push('⚠️ CRISIS INDICATORS DETECTED');
    sections.push(`Reason: ${decision.reason}`);
    sections.push('');
    sections.push('CRITICAL: Always mention 988 (call or text) for crisis support.');
    sections.push('Your role: Provide grounding and presence while suggesting professional help.');
    sections.push("Don't lecture or push - offer and support their choice.");
  } else if (decision.type === 'therapy' || decision.type === 'psychiatry') {
    sections.push('');
    sections.push('This conversation touches on areas where professional support could help.');
    sections.push(`Reason: ${decision.reason}`);
    sections.push('');
    sections.push('Consider gently suggesting therapy if appropriate.');
    sections.push("Don't push - plant the seed and respect their autonomy.");
  } else {
    sections.push('');
    sections.push(`Professional support type: ${decision.type}`);
    sections.push(`Reason: ${decision.reason}`);
    sections.push('');
    sections.push('You can mention relevant resources if the conversation allows.');
  }

  return sections.join('\n');
}

// ============================================================================
// LOGGING AND ANALYTICS
// ============================================================================

/**
 * Log transfer event for analytics
 */
export async function logTransferEvent(
  userId: string,
  decision: EscalationDecision,
  result: TransferResult
): Promise<void> {
  log.info(
    {
      userId,
      escalationType: decision.type,
      urgency: decision.urgency,
      transferSuccess: result.success,
      channel: result.channel,
    },
    '📊 Transfer event logged'
  );

  // Future: Store in Firestore for analytics
  // await storeTransferRecord(userId, decision, result);
}

export default humanTransfer;
