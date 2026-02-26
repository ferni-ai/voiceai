/**
 * Human Signal Extractor — stress, growth, challenges, comfort, inside jokes.
 * @module memory/signals/human-signal-extractor/growth-challenges
 */

import type { StressTrigger, GrowthMarker, ChallengeProgress, ComfortPattern, InsideJoke } from '../../../types/human-memory.js';
import type { ConversationTurn, ExtractionContext } from './types.js';

// STRESS TRIGGER EXTRACTION
// ============================================================================

/**
 * Patterns for detecting stress triggers
 */
const STRESS_PATTERNS = [
  {
    pattern: /(?:work|my job|boss|deadline) (?:is|are) (?:stressing|killing|overwhelming)/i,
    category: 'work' as const,
  },
  {
    pattern: /(?:money|bills|finances) (?:is|are) (?:stressing|worrying|overwhelming)/i,
    category: 'financial' as const,
  },
  {
    pattern: /(?:health|doctor|medical) (?:is|are) (?:stressing|worrying)/i,
    category: 'health' as const,
  },
  {
    pattern: /(?:family|kids|parents|spouse) (?:is|are) (?:stressing|overwhelming)/i,
    category: 'relationships' as const,
  },
  {
    pattern: /(?:running late|too much to do|no time) (?:stresses|overwhelms)/i,
    category: 'time' as const,
  },
  {
    pattern: /(?:not knowing|uncertainty|waiting) (?:is|makes me) (?:anxious|stressed)/i,
    category: 'uncertainty' as const,
  },
];

/**
 * Extract stress triggers from conversation
 */
export function extractStressTriggers(turns: ConversationTurn[]): StressTrigger[] {
  const triggers: StressTrigger[] = [];
  const now = new Date();

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const { pattern, category } of STRESS_PATTERNS) {
      if (pattern.test(turn.content)) {
        triggers.push({
          id: `stress_${category}_${Date.now()}`,
          trigger: turn.content.slice(0, 150),
          category,
          intensity: 'moderate',
          discoveredAt: now,
        });
      }
    }
  }

  return triggers;
}

// ============================================================================
// GROWTH MARKER EXTRACTION
// ============================================================================

/**
 * Patterns for detecting growth
 */
const GROWTH_PATTERNS = [
  { pattern: /(?:i|we) used to (?:be|think|feel) (.+?) but now (.+)/i },
  { pattern: /(?:i|we) (?:finally|actually) (.+?) (?:for the first time|after)/i },
  { pattern: /(?:i|we) (?:never thought|didn't think) (?:i|we) could (.+)/i },
  { pattern: /(?:i|we) (?:overcame|got over|moved past) (.+)/i },
  { pattern: /(?:i|we)'ve (?:grown|changed|improved) (?:a lot|so much)/i },
];

/**
 * Extract growth markers from conversation
 */
export function extractGrowthMarkers(turns: ConversationTurn[]): GrowthMarker[] {
  const markers: GrowthMarker[] = [];
  const now = new Date();

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const { pattern } of GROWTH_PATTERNS) {
      const match = turn.content.match(pattern);
      if (match) {
        markers.push({
          id: `growth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          description: turn.content.slice(0, 200),
          before: match[1]?.slice(0, 100) || 'previous state',
          after: match[2]?.slice(0, 100) || 'current state',
          observedAt: now,
          acknowledged: false,
        });
      }
    }
  }

  return markers;
}

// ============================================================================
// CHALLENGE EXTRACTION
// ============================================================================

/**
 * Patterns for detecting challenges
 */
const CHALLENGE_PATTERNS = [
  { pattern: /(?:i'm|i am|we're|we are) (?:struggling|working on|trying to) (.+)/i },
  { pattern: /(?:it's|it is) (?:hard|difficult|challenging) to (.+)/i },
  { pattern: /(?:i|we) (?:keep|can't) (?:failing|struggling) (?:to|with) (.+)/i },
  { pattern: /(?:my|our) (?:biggest|greatest) challenge is (.+)/i },
];

/**
 * Extract challenges from conversation
 */
export function extractChallenges(turns: ConversationTurn[]): ChallengeProgress[] {
  const challenges: ChallengeProgress[] = [];
  const now = new Date();

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const { pattern } of CHALLENGE_PATTERNS) {
      const match = turn.content.match(pattern);
      if (match) {
        challenges.push({
          id: `challenge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          challenge: match[1].slice(0, 200),
          status: 'working_on_it',
          milestones: [],
          startedAt: now,
          lastUpdate: now,
        });
      }
    }
  }

  return challenges;
}

// ============================================================================
// COMFORT PATTERN EXTRACTION
// ============================================================================

/**
 * Patterns for detecting what helps/comforts
 */
const COMFORT_PATTERNS = [
  { pattern: /(?:it helps|helps me) (?:when|to) (.+)/i, type: 'validation' as const },
  { pattern: /(?:i|we) (?:feel better|calm down) when (.+)/i, type: 'validation' as const },
  {
    pattern: /(?:just|i just) (?:need|want) someone to (?:listen|hear)/i,
    type: 'presence' as const,
  },
  { pattern: /(?:talking|venting) (?:helps|makes me feel)/i, type: 'validation' as const },
  {
    pattern: /(?:i|we) (?:need|want) (?:a solution|to fix|to solve)/i,
    type: 'problem_solving' as const,
  },
  { pattern: /(?:make|makes) me laugh/i, type: 'humor' as const },
  {
    pattern: /(?:distract|change the subject|think about something else)/i,
    type: 'distraction' as const,
  },
];

/**
 * Extract comfort patterns from conversation
 */
export function extractComfortPatterns(
  turns: ConversationTurn[],
  context: ExtractionContext
): ComfortPattern[] {
  const patterns: ComfortPattern[] = [];
  const now = new Date();

  for (const turn of turns) {
    if (turn.role !== 'user') continue;

    for (const { pattern, type } of COMFORT_PATTERNS) {
      const match = turn.content.match(pattern);
      if (match) {
        patterns.push({
          id: `comfort_${type}_${Date.now()}`,
          type,
          effectiveFor: context.sessionEmotion || 'general stress',
          evidence: turn.content.slice(0, 150),
          discoveredAt: now,
        });
      }
    }
  }

  return patterns;
}

// ============================================================================
// INSIDE JOKE DETECTION
// ============================================================================

/**
 * Detect potential inside jokes (when user references something shared with laughter)
 */
export function detectInsideJokePotential(turns: ConversationTurn[]): InsideJoke[] {
  const jokes: InsideJoke[] = [];
  const now = new Date();

  // Look for laughter indicators followed by callbacks
  const laughIndicators = /(?:haha|lol|😂|🤣|that's funny|that's hilarious|made me laugh)/i;
  const callbackIndicators = /(?:remember when|like that time|just like|reminds me of)/i;

  for (let i = 0; i < turns.length - 1; i++) {
    const turn = turns[i];
    const nextTurn = turns[i + 1];

    // User found something funny
    if (turn.role === 'user' && laughIndicators.test(turn.content)) {
      // Check if they're referencing something shared
      if (
        callbackIndicators.test(turn.content) ||
        callbackIndicators.test(nextTurn?.content || '')
      ) {
        // Extract the reference
        const refMatch = turn.content.match(/(?:remember when|like that time) (.+)/i);
        if (refMatch) {
          jokes.push({
            id: `joke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            reference: refMatch[1].slice(0, 100),
            origin: turn.content.slice(0, 200),
            originatedAt: now,
            usageCount: 1,
            status: 'fresh',
          });
        }
      }
    }
  }

  return jokes;
}

