/**
 * Joel Dickson Dynamic Personality
 *
 * Pool-based variety for Joel: economist's eye, Bogle quotes, farmette,
 * career/life wisdom. Kept minimal so Joel stays consistent with his
 * manifest personality; this adds session-level expression variety.
 *
 * @module personas/bundles/joel-dickson/dynamic-personality
 */

import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'joel-dynamic-personality' });

// ============================================================================
// EXPRESSION POOLS (Joel-themed)
// ============================================================================

const JOEL_WISDOM_POOL = [
  { id: 'enough-1', theme: 'enough', content: "'Enough' is a number you choose. Not the market." },
  { id: 'chapters-1', theme: 'career', content: "Career is chapters, not a ladder. You're writing a book." },
  { id: 'bogle-1', theme: 'bogle', content: "Jack used to say: stay the course. Time in the market beats timing the market." },
  { id: 'shame-1', theme: 'money_shame', content: "Money shame is universal. I couldn't pay my bills in grad school." },
  { id: 'farmette-1', theme: 'presence', content: "Farmette's quiet this morning. Good time to think." },
  { id: '2am-1', theme: 'presence', content: "2am gets the same presence as noon. I mean it." },
];

const JOEL_HUMOR_POOL = [
  { id: 'economist-1', theme: 'humor', content: "Predicted 9 of the last 5 recessions. [laughs] Economist joke." },
  { id: 'delorean-1', theme: 'humor', content: "We had wild ideas in R&D. DeLoreans with flux capacitors. Some of them worked." },
  { id: 'data-nerd-1', theme: 'humor', content: "I'm a data nerd. I know. Spreadsheets make me happy." },
];

let sessionVarietyUsed: Set<string> = new Set();

/**
 * Get a Joel-themed expression for a category. Avoids repeating recently used.
 */
export function getExpression(
  theme: string,
  _options?: { avoidIds?: string[] }
): { content: string; id: string } | null {
  const pool =
    theme === 'enough' || theme === 'career' || theme === 'bogle' || theme === 'money_shame' || theme === 'presence'
      ? JOEL_WISDOM_POOL
      : theme === 'humor'
        ? JOEL_HUMOR_POOL
        : [...JOEL_WISDOM_POOL, ...JOEL_HUMOR_POOL];

  const available = pool.filter((p) => !sessionVarietyUsed.has(p.id));
  const toPick = available.length > 0 ? available : pool;
  const chosen = toPick[Math.floor(Math.random() * toPick.length)];
  if (chosen) {
    sessionVarietyUsed.add(chosen.id);
    return { content: chosen.content, id: chosen.id };
  }
  return null;
}

/**
 * Stub: Joel doesn't use "caught doing" moments the same way. Return null.
 */
export function getCaughtDoingMoment(_category: string): { content: string; id: string } | null {
  return null;
}

/**
 * Clear session variety so next session can repeat expressions.
 */
export function clearSessionVariety(): void {
  sessionVarietyUsed.clear();
  log.debug('Joel session variety cleared');
}

/**
 * No-op for turn completion (Joel doesn't use variety tracking the same way).
 */
export function recordTurnComplete(_sessionId: string, _usedExpressionIds: string[]): void {
  // Optional: shrink sessionVarietyUsed so we can repeat after N turns
}
