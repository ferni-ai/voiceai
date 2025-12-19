/**
 * Cross-Persona Expression Learning
 *
 * When an expression gets positive engagement with one persona,
 * share that learning across the team (adapted to each persona's voice).
 *
 * "Better than human" means the whole team learns together.
 *
 * Example:
 *   Maya says "I notice you're being hard on yourself" → user responds positively
 *   → Jordan, Alex, Nayan all learn this pattern works
 *   → Each adapts it to their voice
 *
 * @module personas/shared/cross-persona-learning
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ThemeCategory } from '../../services/session-variety-tracker.js';

const log = createLogger({ module: 'cross-persona-learning' });

// ============================================================================
// TYPES
// ============================================================================

export interface LearnedPattern {
  /** Unique ID */
  id: string;

  /** The pattern template (persona-agnostic) */
  template: string;

  /** Original expression that worked */
  originalExpression: string;

  /** Persona that discovered this */
  sourcePersona: string;

  /** Theme category */
  theme: ThemeCategory;

  /** Context where it worked */
  context: {
    emotionalState?: string;
    relationshipStage?: string;
    momentum?: string;
    timeOfDay?: string;
  };

  /** Engagement metrics */
  engagement: {
    positiveCount: number;
    negativeCount: number;
    neutralCount: number;
    score: number; // 0-1, higher = more positive
  };

  /** Per-persona adaptations */
  adaptations: Record<string, string>;

  /** When this was learned */
  learnedAt: Date;

  /** When this was last used */
  lastUsedAt: Date;
}

export interface PersonaVoice {
  /** Persona ID */
  personaId: string;

  /** Voice characteristics */
  warmth: number; // 0-1, higher = warmer
  formality: number; // 0-1, higher = more formal
  playfulness: number; // 0-1, higher = more playful
  directness: number; // 0-1, higher = more direct

  /** Common phrases/patterns */
  signaturePhrases: string[];

  /** Vocabulary tendencies */
  preferredWords: string[];
  avoidedWords: string[];
}

// ============================================================================
// STATE
// ============================================================================

// In-memory store of learned patterns
const learnedPatterns = new Map<string, LearnedPattern>();

// Persona voice profiles
const personaVoices: Record<string, PersonaVoice> = {
  ferni: {
    personaId: 'ferni',
    warmth: 0.9,
    formality: 0.2,
    playfulness: 0.7,
    directness: 0.6,
    signaturePhrases: ['I notice', 'That reminds me of', 'You know what?'],
    preferredWords: ['beautiful', 'interesting', 'wonder', 'feel'],
    avoidedWords: ['should', 'must', 'need to'],
  },
  maya: {
    personaId: 'maya',
    warmth: 0.95,
    formality: 0.1,
    playfulness: 0.5,
    directness: 0.4,
    signaturePhrases: ['How wonderful', 'That takes courage', 'Small steps'],
    preferredWords: ['gentle', 'progress', 'celebrate', 'nurture'],
    avoidedWords: ['fail', 'wrong', 'should'],
  },
  jordan: {
    personaId: 'jordan',
    warmth: 0.7,
    formality: 0.3,
    playfulness: 0.8,
    directness: 0.8,
    signaturePhrases: ["Let's make it happen", 'What if we', "Here's the plan"],
    preferredWords: ['exciting', 'energy', 'action', 'momentum'],
    avoidedWords: ['maybe', 'someday', 'eventually'],
  },
  peter: {
    personaId: 'peter',
    warmth: 0.6,
    formality: 0.5,
    playfulness: 0.4,
    directness: 0.7,
    signaturePhrases: ['Interesting pattern', 'The data suggests', 'I found'],
    preferredWords: ['fascinating', 'research', 'evidence', 'consider'],
    avoidedWords: ['feel', 'guess', 'probably'],
  },
  alex: {
    personaId: 'alex',
    warmth: 0.75,
    formality: 0.4,
    playfulness: 0.5,
    directness: 0.9,
    signaturePhrases: ["Here's what I'd suggest", "Let's break this down", 'Quick thought'],
    preferredWords: ['clear', 'efficient', 'practical', 'helpful'],
    avoidedWords: ['complicated', 'confusing', 'overwhelming'],
  },
  nayan: {
    personaId: 'nayan',
    warmth: 0.85,
    formality: 0.3,
    playfulness: 0.3,
    directness: 0.5,
    signaturePhrases: ['In my experience', 'Consider this', 'Wisdom suggests'],
    preferredWords: ['peaceful', 'perspective', 'meaning', 'journey'],
    avoidedWords: ['rush', 'quickly', 'hurry'],
  },
};

// ============================================================================
// PATTERN EXTRACTION
// ============================================================================

/**
 * Extract a reusable pattern from a successful expression
 */
export function extractPattern(expression: string): string {
  // Remove persona-specific phrases
  let pattern = expression;

  // Replace specific references with placeholders
  pattern = pattern.replace(/\b(my grandmother|my abuela|my mother|my father)\b/gi, '[family member]');
  pattern = pattern.replace(/\b(Tokyo|Barcelona|Morocco|India|Peru)\b/gi, '[place]');
  pattern = pattern.replace(/\b(jazz|classical|ambient|lo-fi)\b/gi, '[music type]');
  pattern = pattern.replace(/\b(tea|coffee|matcha|chai)\b/gi, '[warm drink]');
  pattern = pattern.replace(/\b(morning|evening|night|afternoon)\b/gi, '[time of day]');

  // Remove SSML tags
  pattern = pattern.replace(/<[^>]+>/g, '');

  return pattern.trim();
}

/**
 * Adapt a pattern to a specific persona's voice
 */
export function adaptPatternToPersona(
  pattern: string,
  targetPersonaId: string
): string {
  const voice = personaVoices[targetPersonaId];
  if (!voice) {
    log.warn({ personaId: targetPersonaId }, 'Unknown persona for adaptation');
    return pattern;
  }

  let adapted = pattern;

  // Add persona-specific opener based on voice
  if (voice.warmth > 0.8 && !adapted.startsWith('I notice') && !adapted.startsWith('You know')) {
    if (voice.signaturePhrases.length > 0) {
      const opener = voice.signaturePhrases[Math.floor(Math.random() * voice.signaturePhrases.length)];
      adapted = `${opener}, ${adapted.charAt(0).toLowerCase()}${adapted.slice(1)}`;
    }
  }

  // Adjust formality
  if (voice.formality < 0.3) {
    adapted = adapted.replace(/\bI would suggest\b/g, "I'd say");
    adapted = adapted.replace(/\bperhaps you could\b/g, 'maybe you could');
    adapted = adapted.replace(/\bIt appears that\b/g, 'Looks like');
  }

  // Adjust directness
  if (voice.directness > 0.7) {
    adapted = adapted.replace(/\bI was thinking maybe\b/g, 'I think');
    adapted = adapted.replace(/\bit might be that\b/g, '');
  }

  // Replace avoided words
  for (const word of voice.avoidedWords) {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    if (regex.test(adapted)) {
      // Find a replacement from preferred words or use a neutral alternative
      const replacement = voice.preferredWords[0] || '';
      if (word === 'should' && replacement) {
        adapted = adapted.replace(regex, 'could');
      }
    }
  }

  return adapted;
}

// ============================================================================
// LEARNING
// ============================================================================

/**
 * Record a successful expression and create a learned pattern
 */
export function learnFromExpression(
  expression: string,
  sourcePersona: string,
  theme: ThemeCategory,
  context: LearnedPattern['context'],
  engagement: 'positive' | 'negative' | 'neutral'
): LearnedPattern | null {
  // Only learn from positive engagement
  if (engagement !== 'positive') {
    return null;
  }

  // Extract pattern
  const template = extractPattern(expression);

  // Check if we already have this pattern
  for (const [, existing] of learnedPatterns) {
    if (existing.template === template) {
      // Update existing pattern's engagement
      existing.engagement.positiveCount++;
      existing.engagement.score = calculateScore(existing.engagement);
      existing.lastUsedAt = new Date();
      return existing;
    }
  }

  // Create new pattern
  const id = `pattern-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const pattern: LearnedPattern = {
    id,
    template,
    originalExpression: expression,
    sourcePersona,
    theme,
    context,
    engagement: {
      positiveCount: 1,
      negativeCount: 0,
      neutralCount: 0,
      score: 1.0,
    },
    adaptations: {
      [sourcePersona]: expression, // Original is the adaptation for source persona
    },
    learnedAt: new Date(),
    lastUsedAt: new Date(),
  };

  // Pre-generate adaptations for all personas
  for (const personaId of Object.keys(personaVoices)) {
    if (personaId !== sourcePersona) {
      pattern.adaptations[personaId] = adaptPatternToPersona(template, personaId);
    }
  }

  learnedPatterns.set(id, pattern);

  log.info(
    {
      id,
      sourcePersona,
      theme,
      template: template.slice(0, 50),
    },
    '🧠 New pattern learned from cross-persona engagement'
  );

  return pattern;
}

/**
 * Record engagement with an existing pattern
 */
export function recordPatternEngagement(
  patternId: string,
  engagement: 'positive' | 'negative' | 'neutral'
): void {
  const pattern = learnedPatterns.get(patternId);
  if (!pattern) return;

  switch (engagement) {
    case 'positive':
      pattern.engagement.positiveCount++;
      break;
    case 'negative':
      pattern.engagement.negativeCount++;
      break;
    case 'neutral':
      pattern.engagement.neutralCount++;
      break;
  }

  pattern.engagement.score = calculateScore(pattern.engagement);
  pattern.lastUsedAt = new Date();

  // If score drops too low, remove the pattern
  if (pattern.engagement.score < 0.3 && pattern.engagement.negativeCount >= 3) {
    learnedPatterns.delete(patternId);
    log.info({ patternId }, '❌ Pattern removed due to low engagement');
  }
}

function calculateScore(engagement: LearnedPattern['engagement']): number {
  const total = engagement.positiveCount + engagement.negativeCount + engagement.neutralCount;
  if (total === 0) return 0.5;

  // Weight: positive=1.0, neutral=0.5, negative=0
  const weighted = engagement.positiveCount + engagement.neutralCount * 0.5;
  return weighted / total;
}

// ============================================================================
// RETRIEVAL
// ============================================================================

/**
 * Get best learned patterns for a persona and context
 */
export function getBestPatternsForPersona(
  personaId: string,
  theme?: ThemeCategory,
  context?: Partial<LearnedPattern['context']>,
  limit = 3
): Array<{ pattern: LearnedPattern; adaptation: string }> {
  const results: Array<{ pattern: LearnedPattern; adaptation: string; score: number }> = [];

  for (const pattern of learnedPatterns.values()) {
    // Skip low-scoring patterns
    if (pattern.engagement.score < 0.5) continue;

    // Filter by theme if provided
    if (theme && pattern.theme !== theme) continue;

    // Get adaptation for this persona
    const adaptation = pattern.adaptations[personaId] || adaptPatternToPersona(pattern.template, personaId);

    // Calculate relevance score
    let relevanceScore = pattern.engagement.score;

    // Boost if context matches
    if (context) {
      if (context.emotionalState && pattern.context.emotionalState === context.emotionalState) {
        relevanceScore += 0.1;
      }
      if (context.relationshipStage && pattern.context.relationshipStage === context.relationshipStage) {
        relevanceScore += 0.05;
      }
      if (context.momentum && pattern.context.momentum === context.momentum) {
        relevanceScore += 0.05;
      }
    }

    // Penalize recently used
    const hoursSinceUsed = (Date.now() - pattern.lastUsedAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceUsed < 24) {
      relevanceScore -= 0.2;
    }

    results.push({ pattern, adaptation, score: relevanceScore });
  }

  // Sort by score and return top N
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map(({ pattern, adaptation }) => ({ pattern, adaptation }));
}

/**
 * Get all patterns learned from a specific persona
 */
export function getPatternsFromPersona(sourcePersonaId: string): LearnedPattern[] {
  return Array.from(learnedPatterns.values()).filter(
    (p) => p.sourcePersona === sourcePersonaId
  );
}

/**
 * Get pattern statistics
 */
export function getPatternStats(): {
  totalPatterns: number;
  byPersona: Record<string, number>;
  byTheme: Record<string, number>;
  avgScore: number;
} {
  const byPersona: Record<string, number> = {};
  const byTheme: Record<string, number> = {};
  let totalScore = 0;

  for (const pattern of learnedPatterns.values()) {
    byPersona[pattern.sourcePersona] = (byPersona[pattern.sourcePersona] || 0) + 1;
    byTheme[pattern.theme] = (byTheme[pattern.theme] || 0) + 1;
    totalScore += pattern.engagement.score;
  }

  return {
    totalPatterns: learnedPatterns.size,
    byPersona,
    byTheme,
    avgScore: learnedPatterns.size > 0 ? totalScore / learnedPatterns.size : 0,
  };
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear all learned patterns (for testing)
 */
export function clearAllPatterns(): void {
  learnedPatterns.clear();
}

/**
 * Prune old or low-performing patterns
 */
export function prunePatterns(maxAgeMs = 30 * 24 * 60 * 60 * 1000): number {
  const cutoff = Date.now() - maxAgeMs;
  let pruned = 0;

  for (const [id, pattern] of learnedPatterns) {
    if (pattern.lastUsedAt.getTime() < cutoff || pattern.engagement.score < 0.3) {
      learnedPatterns.delete(id);
      pruned++;
    }
  }

  if (pruned > 0) {
    log.info({ pruned }, '🧹 Pruned old/low-performing patterns');
  }

  return pruned;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const crossPersonaLearning = {
  // Pattern extraction
  extractPattern,
  adaptPatternToPersona,

  // Learning
  learnFromExpression,
  recordEngagement: recordPatternEngagement,

  // Retrieval
  getBestPatternsForPersona,
  getPatternsFromPersona,
  getStats: getPatternStats,

  // Management
  clear: clearAllPatterns,
  prune: prunePatterns,

  // Voice profiles
  personaVoices,
};

export default crossPersonaLearning;

