/**
 * Intent Ranker - Phase 4 Multi-Intent Upgrade
 *
 * Ranks and resolves conflicts between multiple detected intents.
 * Handles overlapping intents, impossible combinations, and prioritization.
 *
 * @module tools/semantic-router/multi-intent/intent-ranker
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { IntentSpan } from './semantic-splitter.js';

const log = createLogger({ module: 'intent-ranker' });

// ============================================================================
// TYPES
// ============================================================================

export interface RankedIntent extends IntentSpan {
  /** Rank position (1 = highest priority) */
  rank: number;
  /** Priority score (higher = more important) */
  priorityScore: number;
  /** Reason for this ranking */
  rankReason: string;
}

export interface RankingResult {
  /** Ranked intents in priority order */
  rankedIntents: RankedIntent[];
  /** Whether any intents were dropped due to conflicts */
  hasConflicts: boolean;
  /** Dropped intents (if any) */
  droppedIntents: IntentSpan[];
  /** Execution order recommendation */
  executionOrder: 'sequential' | 'parallel' | 'primary_only';
}

// ============================================================================
// TOOL COMPATIBILITY MATRIX
// ============================================================================

/**
 * Tools that should NOT be executed together in the same turn.
 * These represent conflicting intents.
 */
const INCOMPATIBLE_TOOLS: Array<[string, string]> = [
  // Music conflicts
  ['playMusic', 'pauseMusic'],
  ['playMusic', 'stopMusic'],
  ['resumeMusic', 'pauseMusic'],
  // Handoff conflicts (can only handoff to one persona)
  ['handoff', 'handoff'],
  // Calendar conflicts
  ['createCalendarEvent', 'deleteCalendarEvent'],
];

/**
 * Tools that work well together (sequential execution recommended).
 */
const COMPLEMENTARY_TOOLS: Array<[string, string]> = [
  // Music + mood
  ['playMusic', 'setMood'],
  // Calendar + reminder
  ['createCalendarEvent', 'setReminder'],
  // Weather + travel
  ['getWeather', 'getTrafficInfo'],
  // Memory + follow-up
  ['rememberThis', 'getCalendar'],
];

/**
 * High-priority tools that should always execute first.
 */
const HIGH_PRIORITY_TOOLS = new Set([
  // Safety/crisis tools
  'crisisSupport',
  'emergencyContact',
  'findTherapist',
  // Critical notifications
  'urgentReminder',
  // Handoffs (user explicitly requested)
  'handoff',
]);

/**
 * Low-priority tools that can be deferred.
 */
const LOW_PRIORITY_TOOLS = new Set([
  // Ambient/background
  'setAmbientMusic',
  'updateMood',
  // Analytics
  'trackHabit',
  'logMood',
]);

// ============================================================================
// RANKING LOGIC
// ============================================================================

/**
 * Check if two tools are incompatible.
 */
function areIncompatible(tool1: string, tool2: string): boolean {
  for (const [a, b] of INCOMPATIBLE_TOOLS) {
    if ((tool1 === a && tool2 === b) || (tool1 === b && tool2 === a)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if two tools are complementary.
 */
function areComplementary(tool1: string, tool2: string): boolean {
  for (const [a, b] of COMPLEMENTARY_TOOLS) {
    if ((tool1 === a && tool2 === b) || (tool1 === b && tool2 === a)) {
      return true;
    }
  }
  return false;
}

/**
 * Calculate priority score for an intent.
 */
function calculatePriorityScore(intent: IntentSpan): number {
  let score = intent.confidence * 100; // Base: confidence scaled to 0-100

  if (!intent.toolId) {
    return score * 0.5; // Penalize unmatched intents
  }

  // High priority tools get a boost
  if (HIGH_PRIORITY_TOOLS.has(intent.toolId)) {
    score += 50;
  }

  // Low priority tools get penalized
  if (LOW_PRIORITY_TOOLS.has(intent.toolId)) {
    score -= 20;
  }

  // Position boost: earlier intents are often more important
  // (Users tend to mention the main thing first)
  score += Math.max(0, 10 - intent.startPos / 10);

  // Length boost: longer intents are often more specific
  const wordCount = intent.text.split(/\s+/).length;
  score += Math.min(10, wordCount * 2);

  return score;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Rank multiple intents and resolve conflicts.
 *
 * @param intents - Detected intent spans
 * @returns Ranked intents with execution recommendations
 */
export function rankIntents(intents: IntentSpan[]): RankingResult {
  if (intents.length === 0) {
    return {
      rankedIntents: [],
      hasConflicts: false,
      droppedIntents: [],
      executionOrder: 'primary_only',
    };
  }

  // Single intent - no ranking needed
  if (intents.length === 1) {
    const intent = intents[0];
    return {
      rankedIntents: [
        {
          ...intent,
          rank: 1,
          priorityScore: calculatePriorityScore(intent),
          rankReason: 'Only intent detected',
        },
      ],
      hasConflicts: false,
      droppedIntents: [],
      executionOrder: 'primary_only',
    };
  }

  // Calculate priority scores
  const scored = intents.map((intent) => ({
    intent,
    score: calculatePriorityScore(intent),
  }));

  // Sort by priority score (descending)
  scored.sort((a, b) => b.score - a.score);

  // Resolve conflicts
  const rankedIntents: RankedIntent[] = [];
  const droppedIntents: IntentSpan[] = [];
  const usedTools = new Set<string>();

  for (const { intent, score } of scored) {
    const toolId = intent.toolId;

    // Check for conflicts with already-selected intents
    let hasConflict = false;
    let conflictReason = '';

    if (toolId) {
      for (const usedTool of usedTools) {
        if (areIncompatible(toolId, usedTool)) {
          hasConflict = true;
          conflictReason = `Conflicts with ${usedTool}`;
          break;
        }
      }
    }

    if (hasConflict) {
      droppedIntents.push(intent);
      log.debug({ toolId, conflictReason }, 'Dropping conflicting intent');
    } else {
      const rank = rankedIntents.length + 1;
      let rankReason = `Priority score: ${score.toFixed(1)}`;

      if (toolId && HIGH_PRIORITY_TOOLS.has(toolId)) {
        rankReason = 'High priority tool';
      } else if (rank === 1) {
        rankReason = 'Highest confidence + position';
      }

      rankedIntents.push({
        ...intent,
        rank,
        priorityScore: score,
        rankReason,
      });

      if (toolId) {
        usedTools.add(toolId);
      }
    }
  }

  // Determine execution order
  let executionOrder: 'sequential' | 'parallel' | 'primary_only' = 'sequential';

  if (rankedIntents.length === 1) {
    executionOrder = 'primary_only';
  } else if (rankedIntents.length >= 2) {
    const tool1 = rankedIntents[0].toolId;
    const tool2 = rankedIntents[1].toolId;

    if (tool1 && tool2 && areComplementary(tool1, tool2)) {
      executionOrder = 'parallel';
    }
  }

  return {
    rankedIntents,
    hasConflicts: droppedIntents.length > 0,
    droppedIntents,
    executionOrder,
  };
}

/**
 * Get the primary intent (highest ranked).
 */
export function getPrimaryIntent(ranking: RankingResult): RankedIntent | null {
  return ranking.rankedIntents[0] || null;
}

/**
 * Get secondary intents (all except primary).
 */
export function getSecondaryIntents(ranking: RankingResult): RankedIntent[] {
  return ranking.rankedIntents.slice(1);
}
