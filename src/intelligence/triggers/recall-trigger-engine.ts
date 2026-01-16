/**
 * Recall Trigger Engine
 *
 * Detects moments when surfacing a memory would be "better than human."
 * Orchestrates anniversary detection, pattern callbacks, commitment reminders,
 * and relationship gap alerts.
 *
 * Architecture:
 * ```
 * User Turn
 *     │
 *     ▼
 * detectRecallTriggers()
 *     │
 *     ├─→ Anniversary Detector
 *     ├─→ Pattern Callback Detector
 *     ├─→ Commitment Reminder
 *     └─→ Relationship Gap Detector
 *     │
 *     ▼
 * RecallTrigger[] (sorted by priority)
 * ```
 *
 * @module intelligence/triggers/recall-trigger-engine
 */

import { createLogger } from '../../utils/safe-logger.js';
import { detectAnniversaries, type AnniversaryTrigger } from './anniversary-detector.js';
import { detectPatternCallbacks, type PatternCallbackTrigger } from './pattern-callback.js';
import {
  detectCommitmentReminders,
  type CommitmentReminderTrigger,
} from './commitment-reminder.js';

const log = createLogger({ module: 'RecallTriggerEngine' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Types of recall triggers
 */
export type RecallTriggerType =
  | 'anniversary' // Date-based: "One year ago today..."
  | 'pattern_match' // Emotional similarity: "Last time you felt this way..."
  | 'commitment' // Unfulfilled promise: "You mentioned wanting to..."
  | 'relationship_gap' // Missing person: "You haven't mentioned X in a while"
  | 'celebration_due'; // Achievement acknowledgment: "You hit your streak!"

/**
 * A recall trigger detected from conversation context
 */
export interface RecallTrigger {
  /** Unique ID for tracking */
  id: string;
  /** Type of trigger */
  type: RecallTriggerType;
  /** Priority (0-100, higher = more important) */
  priority: number;
  /** Confidence that this trigger is relevant (0-1) */
  confidence: number;
  /** Natural language suggestion for surfacing */
  suggestion: string;
  /** Attribution phrase for the memory */
  attribution: string;
  /** Raw content that triggered this */
  content: string;
  /** Source memory/entity ID for tracking */
  sourceId?: string;
  /** When the source memory was created */
  sourceDate?: Date;
  /** Persona that should surface this (if specific) */
  targetPersonaId?: string;
  /** Additional context for LLM */
  context?: Record<string, unknown>;
}

/**
 * Input for recall trigger detection
 */
export interface RecallTriggerInput {
  /** User ID */
  userId: string;
  /** Session ID */
  sessionId: string;
  /** Current user transcript */
  transcript: string;
  /** Detected emotion (optional) */
  emotion?: string;
  /** Emotion intensity (0-1) */
  emotionIntensity?: number;
  /** Detected entities in transcript */
  mentionedEntities?: string[];
  /** Current persona ID */
  personaId?: string;
  /** Current turn number */
  turnNumber?: number;
}

/**
 * Result from recall trigger detection
 */
export interface RecallTriggerResult {
  /** All detected triggers, sorted by priority */
  triggers: RecallTrigger[];
  /** Best trigger to surface (if any) */
  bestTrigger: RecallTrigger | null;
  /** Whether any trigger should be surfaced */
  shouldSurface: boolean;
  /** Processing time in ms */
  processingTimeMs: number;
  /** Debug info */
  debug: {
    anniversariesChecked: number;
    patternsChecked: number;
    commitmentsChecked: number;
    relationshipGapsChecked: number;
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Recall trigger engine configuration
 */
export interface RecallTriggerConfig {
  /** Enable anniversary detection */
  enableAnniversaries: boolean;
  /** Enable pattern callbacks */
  enablePatternCallbacks: boolean;
  /** Enable commitment reminders */
  enableCommitments: boolean;
  /** Enable relationship gap detection */
  enableRelationshipGaps: boolean;
  /** Enable celebration detection */
  enableCelebrations: boolean;
  /** Minimum confidence to surface a trigger */
  minConfidence: number;
  /** Maximum triggers to return */
  maxTriggers: number;
  /** Cooldown between surfacing same trigger (ms) */
  triggerCooldownMs: number;
}

const DEFAULT_CONFIG: RecallTriggerConfig = {
  enableAnniversaries: true,
  enablePatternCallbacks: true,
  enableCommitments: true,
  enableRelationshipGaps: true,
  enableCelebrations: true,
  minConfidence: 0.6,
  maxTriggers: 3,
  triggerCooldownMs: 24 * 60 * 60 * 1000, // 24 hours
};

let config: RecallTriggerConfig = { ...DEFAULT_CONFIG };

/**
 * Update configuration
 */
export function setRecallTriggerConfig(newConfig: Partial<RecallTriggerConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Get current configuration
 */
export function getRecallTriggerConfig(): RecallTriggerConfig {
  return { ...config };
}

// ============================================================================
// TRIGGER COOLDOWN TRACKING
// ============================================================================

/** Track when triggers were last surfaced */
const triggerCooldowns = new Map<string, number>();

/**
 * Check if a trigger is on cooldown
 */
function isOnCooldown(triggerId: string): boolean {
  const lastSurfaced = triggerCooldowns.get(triggerId);
  if (!lastSurfaced) return false;
  return Date.now() - lastSurfaced < config.triggerCooldownMs;
}

/**
 * Record that a trigger was surfaced
 */
export function recordTriggerSurfaced(triggerId: string): void {
  triggerCooldowns.set(triggerId, Date.now());
}

/**
 * Clear cooldowns (for testing)
 */
export function clearTriggerCooldowns(): void {
  triggerCooldowns.clear();
}

// ============================================================================
// MAIN DETECTION FUNCTION
// ============================================================================

/**
 * Detect recall triggers from conversation context.
 *
 * This is the main entry point for "Better Than Human" recall detection.
 * It orchestrates multiple detection strategies and returns prioritized triggers.
 */
export async function detectRecallTriggers(
  input: RecallTriggerInput
): Promise<RecallTriggerResult> {
  const startTime = Date.now();
  const triggers: RecallTrigger[] = [];

  const debug = {
    anniversariesChecked: 0,
    patternsChecked: 0,
    commitmentsChecked: 0,
    relationshipGapsChecked: 0,
  };

  const {
    userId,
    sessionId,
    transcript,
    emotion,
    emotionIntensity,
    mentionedEntities,
    personaId,
    turnNumber,
  } = input;

  // Run all detectors in parallel for performance
  const detectionPromises: Array<Promise<void>> = [];

  // 1. ANNIVERSARY DETECTION
  if (config.enableAnniversaries) {
    detectionPromises.push(
      (async () => {
        try {
          const anniversaries = await detectAnniversaries(userId, { turnNumber });
          debug.anniversariesChecked = anniversaries.length;

          for (const anniversary of anniversaries) {
            const trigger = convertAnniversaryToTrigger(anniversary);
            if (!isOnCooldown(trigger.id) && trigger.confidence >= config.minConfidence) {
              triggers.push(trigger);
            }
          }
        } catch (error) {
          log.debug({ error: String(error) }, 'Anniversary detection failed');
        }
      })()
    );
  }

  // 2. PATTERN CALLBACK DETECTION
  if (config.enablePatternCallbacks && emotion) {
    detectionPromises.push(
      (async () => {
        try {
          const patterns = await detectPatternCallbacks(userId, {
            currentEmotion: emotion,
            currentIntensity: emotionIntensity,
            transcript,
          });
          debug.patternsChecked = patterns.length;

          for (const pattern of patterns) {
            const trigger = convertPatternToTrigger(pattern);
            if (!isOnCooldown(trigger.id) && trigger.confidence >= config.minConfidence) {
              triggers.push(trigger);
            }
          }
        } catch (error) {
          log.debug({ error: String(error) }, 'Pattern callback detection failed');
        }
      })()
    );
  }

  // 3. COMMITMENT REMINDER DETECTION
  if (config.enableCommitments) {
    detectionPromises.push(
      (async () => {
        try {
          const commitments = await detectCommitmentReminders(userId, {
            transcript,
            mentionedEntities,
          });
          debug.commitmentsChecked = commitments.length;

          for (const commitment of commitments) {
            const trigger = convertCommitmentToTrigger(commitment);
            if (!isOnCooldown(trigger.id) && trigger.confidence >= config.minConfidence) {
              triggers.push(trigger);
            }
          }
        } catch (error) {
          log.debug({ error: String(error) }, 'Commitment detection failed');
        }
      })()
    );
  }

  // 4. RELATIONSHIP GAP DETECTION
  if (config.enableRelationshipGaps && mentionedEntities) {
    detectionPromises.push(
      (async () => {
        try {
          const gaps = await detectRelationshipGaps(userId, mentionedEntities);
          debug.relationshipGapsChecked = gaps.length;

          for (const gap of gaps) {
            if (!isOnCooldown(gap.id) && gap.confidence >= config.minConfidence) {
              triggers.push(gap);
            }
          }
        } catch (error) {
          log.debug({ error: String(error) }, 'Relationship gap detection failed');
        }
      })()
    );
  }

  // Wait for all detectors
  await Promise.all(detectionPromises);

  // Sort by priority (highest first)
  triggers.sort((a, b) => b.priority - a.priority);

  // Limit results
  const limitedTriggers = triggers.slice(0, config.maxTriggers);

  // Determine best trigger
  const bestTrigger = limitedTriggers.length > 0 ? limitedTriggers[0] : null;
  const shouldSurface = bestTrigger !== null && bestTrigger.confidence >= config.minConfidence;

  const processingTimeMs = Date.now() - startTime;

  log.debug(
    {
      userId,
      sessionId,
      triggersFound: triggers.length,
      bestTriggerType: bestTrigger?.type,
      shouldSurface,
      processingTimeMs,
      ...debug,
    },
    '🔔 Recall trigger detection complete'
  );

  return {
    triggers: limitedTriggers,
    bestTrigger,
    shouldSurface,
    processingTimeMs,
    debug,
  };
}

// ============================================================================
// TRIGGER CONVERSION HELPERS
// ============================================================================

/**
 * Convert anniversary trigger to standard format
 */
function convertAnniversaryToTrigger(anniversary: AnniversaryTrigger): RecallTrigger {
  return {
    id: `anniversary_${anniversary.id}`,
    type: 'anniversary',
    priority: anniversary.priority,
    confidence: anniversary.confidence,
    suggestion: anniversary.suggestion,
    attribution: anniversary.attribution,
    content: anniversary.content,
    sourceId: anniversary.sourceId,
    sourceDate: anniversary.sourceDate,
    context: anniversary.context,
  };
}

/**
 * Convert pattern callback to standard format
 */
function convertPatternToTrigger(pattern: PatternCallbackTrigger): RecallTrigger {
  return {
    id: `pattern_${pattern.id}`,
    type: 'pattern_match',
    priority: pattern.priority,
    confidence: pattern.confidence,
    suggestion: pattern.suggestion,
    attribution: pattern.attribution,
    content: pattern.content,
    sourceId: pattern.sourceId,
    sourceDate: pattern.sourceDate,
    context: pattern.context,
  };
}

/**
 * Convert commitment reminder to standard format
 */
function convertCommitmentToTrigger(commitment: CommitmentReminderTrigger): RecallTrigger {
  return {
    id: `commitment_${commitment.id}`,
    type: 'commitment',
    priority: commitment.priority,
    confidence: commitment.confidence,
    suggestion: commitment.suggestion,
    attribution: commitment.attribution,
    content: commitment.content,
    sourceId: commitment.sourceId,
    sourceDate: commitment.sourceDate,
    context: commitment.context,
  };
}

// ============================================================================
// RELATIONSHIP GAP DETECTION
// ============================================================================

/**
 * Detect relationship gaps (people not mentioned in a while)
 */
async function detectRelationshipGaps(
  userId: string,
  currentMentions: string[]
): Promise<RecallTrigger[]> {
  const triggers: RecallTrigger[] = [];

  try {
    // Get close contacts from entity store
    const { searchEntities } = await import('../../memory/entity-store/storage.js');
    const contacts = await searchEntities(userId, '', {
      types: ['person'],
      topK: 20,
    });

    // Filter to close contacts (high salience)
    const closeContacts = contacts.filter((c) => (c.salience || 0) > 0.6);

    // Find contacts not mentioned recently
    const now = Date.now();
    const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

    for (const contact of closeContacts) {
      // Skip if mentioned in current turn
      const mentioned = currentMentions.some(
        (m) =>
          m.toLowerCase() === contact.canonicalName.toLowerCase() ||
          contact.aliases?.some((a) => a.toLowerCase() === m.toLowerCase())
      );
      if (mentioned) continue;

      // Check last mention time
      const lastMention = contact.lastMentionedAt ? new Date(contact.lastMentionedAt).getTime() : 0;
      const daysSinceLastMention = Math.floor((now - lastMention) / (24 * 60 * 60 * 1000));

      // Only trigger for contacts not mentioned in 2+ weeks
      if (now - lastMention > TWO_WEEKS_MS) {
        const confidence = Math.min(0.9, 0.5 + daysSinceLastMention * 0.01);

        triggers.push({
          id: `relationship_gap_${contact.id}`,
          type: 'relationship_gap',
          priority: 50 + Math.min(30, daysSinceLastMention), // Priority increases with time
          confidence,
          suggestion: `You haven't mentioned ${contact.canonicalName} in ${daysSinceLastMention} days. How are things with them?`,
          attribution: `It's been a while since you mentioned`,
          content: contact.canonicalName,
          sourceId: contact.id,
          context: {
            daysSinceLastMention,
            relationship: contact.relationship,
          },
        });
      }
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Relationship gap detection failed');
  }

  return triggers;
}

// ============================================================================
// FORMATTING FOR LLM
// ============================================================================

/**
 * Format a recall trigger for LLM injection
 */
export function formatTriggerForPrompt(trigger: RecallTrigger): string {
  const typeLabels: Record<RecallTriggerType, string> = {
    anniversary: 'ANNIVERSARY OPPORTUNITY',
    pattern_match: 'PATTERN RECOGNITION',
    commitment: 'COMMITMENT REMINDER',
    relationship_gap: 'RELATIONSHIP CHECK-IN',
    celebration_due: 'CELEBRATION DUE',
  };

  const label = typeLabels[trigger.type] || 'RECALL OPPORTUNITY';

  return (
    `[${label}]\n` +
    `${trigger.suggestion}\n\n` +
    `${trigger.attribution}: "${trigger.content}"\n\n` +
    `Use this naturally if it fits the conversation. Don't force it.`
  );
}

/**
 * Select the best trigger to surface from a list
 */
export function selectBestTrigger(triggers: RecallTrigger[]): RecallTrigger | null {
  if (triggers.length === 0) return null;

  // Already sorted by priority
  // But also consider confidence as a tiebreaker
  const sorted = [...triggers].sort((a, b) => {
    const priorityDiff = b.priority - a.priority;
    if (Math.abs(priorityDiff) > 10) return priorityDiff;
    return b.confidence - a.confidence;
  });

  return sorted[0];
}

// ============================================================================
// LIFECYCLE
// ============================================================================

/**
 * Cleanup function
 */
export function cleanupRecallTriggerEngine(): void {
  // Cooldowns are retained across sessions for user experience
  // Only clear if explicitly requested
}

/**
 * Get engine stats for observability
 */
export function getRecallTriggerStats(): {
  activeCooldowns: number;
  config: RecallTriggerConfig;
} {
  return {
    activeCooldowns: triggerCooldowns.size,
    config: { ...config },
  };
}
