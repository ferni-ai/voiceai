/**
 * Human Signal Extractor — avoidance detection.
 * @module memory/signals/human-signal-extractor/avoidances
 */

import type { RecurringAvoidance } from '../../../types/human-memory.js';
import type { ConversationTurn } from './types.js';

// AVOIDANCE DETECTION
// ============================================================================

/**
 * Patterns for detecting topic avoidance
 */
export function detectAvoidances(turns: ConversationTurn[]): RecurringAvoidance[] {
  const avoidances: RecurringAvoidance[] = [];
  const now = new Date();

  // Look for deflection patterns
  const deflectionPatterns = [
    /(?:i'd rather not|let's not|can we talk about something else)/i,
    /(?:i don't want to talk about|i don't like talking about) (.+)/i,
    /(?:that's|it's) (?:a sensitive|a difficult|hard to talk about)/i,
    /(?:i'm not ready to|i can't) (?:talk about|discuss) (.+)/i,
  ];

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const pattern of deflectionPatterns) {
      const match = turn.content.match(pattern);
      if (match) {
        avoidances.push({
          id: `avoid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          topic: match[1]?.slice(0, 100) || 'sensitive topic',
          avoidanceStyle: 'deflects',
          observations: 1,
          approach: 'only_if_they_do',
          firstNoticed: now,
        });
      }
    }
  }

  return avoidances;
}

// ============================================================================
