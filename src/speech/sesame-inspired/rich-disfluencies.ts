/**
 * Rich Disfluency System
 *
 * Inspired by Sesame AI: "Natural speech requires appropriate disfluencies,
 * restarts, and laughter."
 *
 * This module provides a rich library of natural speech patterns including:
 * - Filled pauses ("um", "uh", "er")
 * - Self-corrections ("Wait, no. Let me rephrase.")
 * - False starts ("So— actually, before that—")
 * - Trailing off ("And then...")
 * - Thinking aloud ("Let me think...")
 * - Word searches ("What's the word...")
 *
 * @module speech/sesame-inspired/rich-disfluencies
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CartesiaEmotion } from '../cartesia-expressiveness.js';
import type { DisfluencyType, DisfluencyPattern, DisfluencyInjection } from './types.js';

const log = createLogger({ module: 'RichDisfluencies' });

// =============================================================================
// DISFLUENCY PATTERNS LIBRARY
// =============================================================================

/**
 * Comprehensive disfluency patterns with SSML
 */
export const DISFLUENCY_PATTERNS: Record<DisfluencyType, DisfluencyPattern> = {
  filled_pause: {
    type: 'filled_pause',
    patterns: ['um', 'uh', 'er', 'ah', 'hmm'],
    ssmlPatterns: [
      '<break time="100ms"/>um<break time="150ms"/>',
      '<break time="80ms"/>uh<break time="120ms"/>',
      '<break time="100ms"/>er<break time="100ms"/>',
      '<speed ratio="0.9"/>hmm<break time="150ms"/>',
      '<break time="80ms"/>ah<break time="100ms"/>',
    ],
    emotionalContexts: ['contemplative', 'hesitant', 'curious', 'neutral'],
    weight: 0.15,
  },

  restart: {
    type: 'restart',
    patterns: [
      'Actually, let me start over.',
      'Wait, let me rephrase that.',
      'No, that came out wrong.',
      "Okay, let me try that again.",
      "Hold on, I'm not saying this right.",
    ],
    ssmlPatterns: [
      '<break time="150ms"/><emotion value="hesitant"/>Actually<break time="100ms"/>, let me start over.<break time="200ms"/>',
      '<break time="100ms"/>Wait<break time="80ms"/>, let me rephrase that.<break time="150ms"/>',
      '<emotion value="hesitant"/>No, that came out wrong.<break time="200ms"/>',
      '<break time="100ms"/>Okay<break time="80ms"/>, let me try that again.<break time="150ms"/>',
    ],
    emotionalContexts: ['hesitant', 'apologetic', 'contemplative'],
    weight: 0.08,
  },

  self_correction: {
    type: 'self_correction',
    patterns: [
      'Wait— no.',
      'Actually— hold on.',
      "No, that's not right.",
      "Wait, I mean—",
      "Well— actually—",
    ],
    ssmlPatterns: [
      '<break time="50ms"/>Wait—<break time="100ms"/><speed ratio="0.95"/>no.<break time="150ms"/>',
      '<break time="50ms"/>Actually—<break time="80ms"/>hold on.<break time="150ms"/>',
      '<emotion value="hesitant"/>No, that\'s not right.<break time="150ms"/>',
      '<break time="50ms"/>Wait, I mean—<break time="120ms"/>',
      '<break time="50ms"/>Well—<break time="80ms"/>actually—<break time="100ms"/>',
    ],
    emotionalContexts: ['hesitant', 'contemplative', 'neutral'],
    weight: 0.1,
  },

  trail_off: {
    type: 'trail_off',
    patterns: [
      'And then...',
      'I just...',
      'It makes me think...',
      'Sometimes I wonder...',
      "You know...",
    ],
    ssmlPatterns: [
      '<speed ratio="0.85"/><volume ratio="0.85"/>And then...<break time="300ms"/>',
      '<speed ratio="0.8"/><volume ratio="0.8"/>I just...<break time="350ms"/>',
      '<speed ratio="0.85"/><volume ratio="0.85"/>It makes me think...<break time="300ms"/>',
      '<speed ratio="0.8"/><volume ratio="0.8"/>Sometimes I wonder...<break time="350ms"/>',
      '<speed ratio="0.85"/><volume ratio="0.85"/>You know...<break time="300ms"/>',
    ],
    emotionalContexts: ['contemplative', 'wistful', 'nostalgic', 'hesitant'],
    weight: 0.12,
  },

  false_start: {
    type: 'false_start',
    patterns: [
      'So— wait, before that—',
      "I was going to say— no, different thought.",
      "The thing is— actually, first—",
      "What I mean— hold on—",
    ],
    ssmlPatterns: [
      '<break time="50ms"/>So—<break time="100ms"/>wait, before that—<break time="150ms"/>',
      '<break time="50ms"/>I was going to say—<break time="100ms"/>no, different thought.<break time="150ms"/>',
      '<break time="50ms"/>The thing is—<break time="80ms"/>actually, first—<break time="150ms"/>',
    ],
    emotionalContexts: ['excited', 'enthusiastic', 'curious', 'hesitant'],
    weight: 0.08,
  },

  word_search: {
    type: 'word_search',
    patterns: [
      "What's the word...",
      "How do I put this...",
      "It's like...",
      "The feeling is...",
      "There's a word for this...",
    ],
    ssmlPatterns: [
      '<speed ratio="0.85"/><emotion value="contemplative"/>What\'s the word...<break time="300ms"/>',
      '<speed ratio="0.85"/>How do I put this...<break time="250ms"/>',
      '<speed ratio="0.9"/>It\'s like...<break time="200ms"/>',
      '<speed ratio="0.85"/><emotion value="contemplative"/>The feeling is...<break time="250ms"/>',
    ],
    emotionalContexts: ['contemplative', 'curious', 'hesitant'],
    weight: 0.1,
  },

  hedge: {
    type: 'hedge',
    patterns: [
      'kind of',
      'sort of',
      'maybe',
      'I think',
      'probably',
      'in a way',
      'I guess',
    ],
    ssmlPatterns: [
      '<speed ratio="0.95"/>kind of<break time="50ms"/>',
      '<speed ratio="0.95"/>sort of<break time="50ms"/>',
      '<break time="50ms"/>maybe<break time="80ms"/>',
      '<speed ratio="0.95"/>I think<break time="80ms"/>',
      '<break time="50ms"/>probably<break time="50ms"/>',
    ],
    emotionalContexts: ['hesitant', 'contemplative', 'neutral', 'insecure'],
    weight: 0.12,
  },

  thinking_aloud: {
    type: 'thinking_aloud',
    patterns: [
      'Let me think...',
      'Give me a second...',
      "I'm trying to...",
      "Okay, so...",
      "Right, so...",
    ],
    ssmlPatterns: [
      '<speed ratio="0.9"/><emotion value="contemplative"/>Let me think...<break time="400ms"/>',
      '<speed ratio="0.9"/>Give me a second...<break time="350ms"/>',
      '<speed ratio="0.9"/>I\'m trying to...<break time="250ms"/>',
      '<break time="100ms"/>Okay, so...<break time="150ms"/>',
      '<break time="100ms"/>Right, so...<break time="150ms"/>',
    ],
    emotionalContexts: ['contemplative', 'curious', 'neutral'],
    weight: 0.1,
  },

  repetition: {
    type: 'repetition',
    patterns: ['It is it is', 'I I think', 'The the thing is', 'So so'],
    ssmlPatterns: [
      'It is<break time="50ms"/>it is<break time="80ms"/>',
      'I<break time="50ms"/>I think<break time="80ms"/>',
      'The<break time="50ms"/>the thing is<break time="80ms"/>',
      'So<break time="50ms"/>so<break time="80ms"/>',
    ],
    emotionalContexts: ['excited', 'anxious', 'enthusiastic', 'hesitant'],
    weight: 0.05,
  },
};

// =============================================================================
// DISFLUENCY SELECTION
// =============================================================================

/**
 * Get disfluencies appropriate for an emotional context
 */
export function getDisfluenciesForEmotion(
  emotion: CartesiaEmotion
): DisfluencyPattern[] {
  return Object.values(DISFLUENCY_PATTERNS).filter((p) =>
    p.emotionalContexts.includes(emotion)
  );
}

/**
 * Select a random disfluency based on weights
 */
export function selectWeightedDisfluency(
  patterns: DisfluencyPattern[]
): DisfluencyPattern | null {
  if (patterns.length === 0) return null;

  const totalWeight = patterns.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;

  for (const pattern of patterns) {
    random -= pattern.weight;
    if (random <= 0) {
      return pattern;
    }
  }

  return patterns[0];
}

/**
 * Get a random SSML pattern from a disfluency
 */
export function getRandomSsmlPattern(pattern: DisfluencyPattern): string {
  return pattern.ssmlPatterns[Math.floor(Math.random() * pattern.ssmlPatterns.length)];
}

// =============================================================================
// INJECTION LOGIC
// =============================================================================

/**
 * Sentence boundary patterns
 */
const SENTENCE_BOUNDARIES = /([.!?])\s+/g;
const CLAUSE_BOUNDARIES = /([,;:])\s+/g;

/**
 * Find natural injection points in text
 */
export function findInjectionPoints(text: string): { position: number; type: 'sentence' | 'clause' | 'start' }[] {
  const points: { position: number; type: 'sentence' | 'clause' | 'start' }[] = [];

  // Start of text is always a valid point
  points.push({ position: 0, type: 'start' });

  // Find sentence boundaries
  let match;
  const sentenceRegex = new RegExp(SENTENCE_BOUNDARIES);
  while ((match = sentenceRegex.exec(text)) !== null) {
    points.push({ position: match.index + match[0].length, type: 'sentence' });
  }

  // Find clause boundaries
  const clauseRegex = new RegExp(CLAUSE_BOUNDARIES);
  while ((match = clauseRegex.exec(text)) !== null) {
    points.push({ position: match.index + match[0].length, type: 'clause' });
  }

  // Sort by position
  points.sort((a, b) => a.position - b.position);

  return points;
}

/**
 * Inject disfluency at a natural point
 */
export function injectDisfluency(
  text: string,
  emotion: CartesiaEmotion,
  probability: number = 0.2
): DisfluencyInjection | null {
  // Roll for injection
  if (Math.random() > probability) {
    return null;
  }

  // Get appropriate disfluencies
  const patterns = getDisfluenciesForEmotion(emotion);
  if (patterns.length === 0) {
    // Fallback to general patterns
    patterns.push(...getDisfluenciesForEmotion('neutral'));
  }

  const pattern = selectWeightedDisfluency(patterns);
  if (!pattern) return null;

  const ssml = getRandomSsmlPattern(pattern);

  // Find injection points
  const points = findInjectionPoints(text);

  // Prefer start for thinking_aloud and filled_pause
  // Prefer mid for self_correction and false_start
  // Prefer end for trail_off
  let selectedPoint = points[0]; // Default to start
  let position: 'start' | 'mid' | 'end' = 'start';

  if (pattern.type === 'trail_off') {
    // Inject before the last sentence
    selectedPoint = points.length > 1 ? points[points.length - 2] : points[0];
    position = 'end';
  } else if (
    pattern.type === 'self_correction' ||
    pattern.type === 'false_start'
  ) {
    // Inject at a mid-point clause boundary
    const midPoints = points.filter((p) => p.type === 'clause');
    if (midPoints.length > 0) {
      selectedPoint = midPoints[Math.floor(Math.random() * midPoints.length)];
      position = 'mid';
    }
  }

  // Construct enhanced text
  const before = text.slice(0, selectedPoint.position);
  const after = text.slice(selectedPoint.position);
  const enhanced = before + ssml + after;

  log.debug(
    {
      type: pattern.type,
      position,
      emotion,
    },
    'Injected disfluency'
  );

  return {
    original: text,
    enhanced,
    type: pattern.type,
    position,
  };
}

// =============================================================================
// SPECIALIZED INJECTIONS
// =============================================================================

/**
 * Add a thinking pause at the start of a response
 */
export function addThinkingStart(text: string): string {
  const thinkingStarts = [
    '<speed ratio="0.9"/><emotion value="contemplative"/>Hmm.<break time="200ms"/>',
    '<break time="150ms"/>Well.<break time="150ms"/>',
    '<speed ratio="0.9"/>Let me think.<break time="250ms"/>',
    '<break time="100ms"/><emotion value="curious"/>Okay.<break time="150ms"/>',
    '<speed ratio="0.9"/>So.<break time="150ms"/>',
  ];

  const selected = thinkingStarts[Math.floor(Math.random() * thinkingStarts.length)];
  return selected + text;
}

/**
 * Add a realizing moment mid-thought
 */
export function addRealizationMoment(text: string): string {
  const realizations = [
    '<break time="100ms"/><emotion value="surprised"/>Oh!<break time="80ms"/>',
    '<break time="100ms"/>Wait—<break time="100ms"/>',
    '<break time="80ms"/><emotion value="curious"/>Ah!<break time="80ms"/>',
    '<break time="100ms"/>Oh! Actually—<break time="100ms"/>',
  ];

  // Find a good insertion point (after first sentence)
  const firstPeriod = text.indexOf('.');
  if (firstPeriod === -1 || firstPeriod > text.length - 20) {
    return text; // No good insertion point
  }

  const insertPoint = firstPeriod + 2; // After period and space
  const selected = realizations[Math.floor(Math.random() * realizations.length)];

  return text.slice(0, insertPoint) + selected + text.slice(insertPoint);
}

/**
 * Add a trailing off at the end
 */
export function addTrailingOff(text: string): string {
  const trailOffs = [
    '<break time="100ms"/><speed ratio="0.85"/><volume ratio="0.8"/>...you know?<break time="200ms"/>',
    '<break time="100ms"/><speed ratio="0.8"/><volume ratio="0.8"/>...anyway.<break time="200ms"/>',
    '<break time="100ms"/><speed ratio="0.85"/><volume ratio="0.85"/>...yeah.<break time="150ms"/>',
    '<break time="100ms"/><speed ratio="0.8"/><volume ratio="0.75"/>...or something like that.<break time="200ms"/>',
  ];

  // Remove existing ending punctuation
  const trimmed = text.replace(/[.!?]+\s*$/, '');
  const selected = trailOffs[Math.floor(Math.random() * trailOffs.length)];

  return trimmed + selected;
}

/**
 * Add self-interruption for excited delivery
 */
export function addExcitedInterruption(text: string): string {
  const interruptions = [
    '<break time="50ms"/>—oh!<break time="80ms"/>and<break time="50ms"/>',
    '<break time="50ms"/>—wait wait—<break time="80ms"/>',
    '<break time="50ms"/>—no but—<break time="80ms"/>',
    '<break time="50ms"/>—okay but here\'s the thing—<break time="100ms"/>',
  ];

  // Find a good mid-point
  const midPoint = Math.floor(text.length / 2);
  const nearbySpace = text.indexOf(' ', midPoint);

  if (nearbySpace === -1) return text;

  const selected = interruptions[Math.floor(Math.random() * interruptions.length)];

  return text.slice(0, nearbySpace) + selected + text.slice(nearbySpace + 1);
}

// =============================================================================
// SESSION MANAGEMENT
// =============================================================================

interface DisfluencySession {
  recentTypes: DisfluencyType[];
  injectionCount: number;
  lastInjectionTurn: number;
}

const sessions = new Map<string, DisfluencySession>();

/**
 * Get or create session
 */
export function getDisfluencySession(sessionId: string): DisfluencySession {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      recentTypes: [],
      injectionCount: 0,
      lastInjectionTurn: 0,
    });
  }
  return sessions.get(sessionId)!;
}

/**
 * Smart injection that avoids repetition and overuse
 */
export function smartInjectDisfluency(
  sessionId: string,
  text: string,
  emotion: CartesiaEmotion,
  turnNumber: number
): DisfluencyInjection | null {
  const session = getDisfluencySession(sessionId);

  // Don't inject every turn - space them out
  if (turnNumber - session.lastInjectionTurn < 2) {
    return null;
  }

  // Reduce probability if we've injected recently
  const baseProbability = 0.25;
  const reductionFactor = Math.max(0.3, 1 - session.injectionCount * 0.1);
  const probability = baseProbability * reductionFactor;

  const injection = injectDisfluency(text, emotion, probability);

  if (injection) {
    session.recentTypes.push(injection.type);
    if (session.recentTypes.length > 5) {
      session.recentTypes.shift();
    }
    session.injectionCount++;
    session.lastInjectionTurn = turnNumber;
  }

  return injection;
}

/**
 * Reset session
 */
export function resetDisfluencySession(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * Get active session count
 */
export function getActiveDisfluencySessionCount(): number {
  return sessions.size;
}
