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

// Import for internal use
import type { CrisisSignals } from './types.js';

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

import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { crisisLevelSignalsSince, type CrisisEventRecord } from './crisis-signals.js';
import { isMemberIdentity } from '../identity/member-identity.js';
import { isSharedPlaceholderId } from '../../utils/synthetic-user.js';

/** A non-member's signal is kept 90 days, like a crisis event (#2872): a TTL on expireAt. */
const NON_MEMBER_SIGNAL_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Log crisis signal detection (even without transfer)
 * Used for tracking escalation patterns over time
 * Accepts CrisisSignals type returned by detectCrisisSignals()
 *
 * PRIVACY: never under a shared placeholder id ('unknown', a disguised one, a bare
 * 'anon:'): that bucket would pool every id-less caller's crises. A non-member
 * (anon:<id>) has no account to erase or export it under, so like #2872's crisis
 * record it keeps no words, only the signal flags and ids, and expires in 90 days.
 */
export async function logCrisisSignal(
  userId: string,
  signals: CrisisSignals,
  transcript?: string,
  sessionId?: string
): Promise<void> {
  // Only log if any crisis signals detected (severity > 0 or explicit flags)
  const hasSignals =
    signals.suicidalIdeation ||
    signals.selfHarmIndicators ||
    signals.domesticViolence ||
    signals.dangerToOthers ||
    signals.severity > 0;

  if (!hasSignals) {
    return;
  }

  log.warn(
    {
      userId,
      suicidalIdeation: signals.suicidalIdeation,
      selfHarmIndicators: signals.selfHarmIndicators,
      domesticViolence: signals.domesticViolence,
      dangerToOthers: signals.dangerToOthers,
      severity: signals.severity,
    },
    '🚨 Crisis signal detected'
  );
  if (isSharedPlaceholderId(userId)) {
    log.warn({ sessionId }, 'Crisis signal not stored: shared placeholder id');
    return;
  }
  const member = isMemberIdentity(userId);

  try {
    const db = getFirestoreDb();
    if (!db) return;

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('crisis_signals')
      .add({
        timestamp: new Date().toISOString(),
        signals: {
          suicidalIdeation: signals.suicidalIdeation,
          selfHarmIndicators: signals.selfHarmIndicators,
          traumaIndicators: signals.traumaIndicators,
          persistentDepression: signals.persistentDepression,
          anxietyDisorder: signals.anxietyDisorder,
          dangerToOthers: signals.dangerToOthers,
          domesticViolence: signals.domesticViolence,
          severity: signals.severity,
        },
        // A member's truncated transcript for context; a non-member's words are never kept
        ...(member
          ? { transcriptSnippet: transcript ? transcript.slice(0, 200) : null }
          : { expireAt: new Date(Date.now() + NON_MEMBER_SIGNAL_RETENTION_MS) }),
        // Firestore rejects an undefined field, which dropped every signal logged without one
        ...(sessionId ? { sessionId } : {}),
      });
    forgetRecentCrisis(userId); // the next turn's check-in sees this signal
  } catch (error) {
    // The code only, and only when it looks like one: a message can quote the caller
    const code = String((error as { code?: unknown } | null)?.code ?? '');
    log.error(
      { userId, code: /^[\w.-]{1,40}$/.test(code) ? code : 'unknown' },
      'Failed to log crisis signal'
    );
  }
}

/** The crisis_signals query, crisis-level events only; throws when Firestore does. */
async function queryCrisisHistory(userId: string, limitDays: number): Promise<CrisisEventRecord[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - limitDays);

  return crisisLevelSignalsSince(db, userId, cutoffDate);
}

/**
 * Get user's crisis history (for cross-session awareness)
 * SAFETY-CRITICAL: Used for proactive check-ins
 *
 * Reads the crisis-level signals in bogle_users/{uid}/crisis_signals
 * (crisis-signals.ts), which logCrisisSignal writes on the live turn path
 * (buildHumanTransferInjections). It used to read crisis_history, whose only
 * writer (logTransferEvent) nothing called, so a caller in crisis yesterday got
 * no follow-up today. That writer is deleted (memory v2 C5a); crisis_history
 * has no writer and old docs go with the account erase of bogle_users/{uid}.
 */
export async function getCrisisHistory(
  userId: string,
  limitDays: number = 30
): Promise<CrisisEventRecord[]> {
  try {
    return await queryCrisisHistory(userId, limitDays);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get crisis history');
    return [];
  }
}

type RecentCrisis = { hasCrisis: boolean; lastCrisis?: CrisisEventRecord };

/**
 * The crisis check-in runs every turn; the answer is kept for a minute so a
 * call queries crisis_signals about once a minute instead of once a turn.
 * logCrisisSignal (the live crisis writer) drops it, and a failed query is
 * not kept, so the next turn asks again.
 */
const RECENT_CRISIS_TTL_MS = 60_000;
const recentCrisis = new Map<string, { at: number; result: Promise<RecentCrisis> }>();

/** Drop the kept crisis answers for a user. */
export function forgetRecentCrisis(userId: string): void {
  for (const key of recentCrisis.keys()) if (key.startsWith(`${userId}|`)) recentCrisis.delete(key);
}

/**
 * Check if user had recent crisis (for proactive check-in)
 * BETTER-THAN-HUMAN: Remember past crises and check in
 */
export function hadRecentCrisis(userId: string, withinDays = 7): Promise<RecentCrisis> {
  const key = `${userId}|${withinDays}`;
  const now = Date.now();
  const kept = recentCrisis.get(key);
  if (kept && now - kept.at < RECENT_CRISIS_TTL_MS) return kept.result;

  for (const [k, v] of recentCrisis) if (now - v.at >= RECENT_CRISIS_TTL_MS) recentCrisis.delete(k);
  const result = queryCrisisHistory(userId, withinDays).then(
    (history): RecentCrisis =>
      history.length === 0 ? { hasCrisis: false } : { hasCrisis: true, lastCrisis: history[0] },
    (error: unknown): RecentCrisis => {
      log.error({ error: String(error), userId }, 'Failed to get crisis history');
      if (recentCrisis.get(key)?.result === result) recentCrisis.delete(key);
      return { hasCrisis: false };
    }
  );
  recentCrisis.set(key, { at: now, result });
  return result;
}

export default humanTransfer;
