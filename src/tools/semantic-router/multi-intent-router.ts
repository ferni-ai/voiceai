/**
 * Multi-Intent Router
 *
 * Detects and splits compound intents into multiple tool calls.
 * "I'm stressed about my divorce AND losing my job" → two separate tool routes
 *
 * @module tools/semantic-router/multi-intent-router
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'MultiIntentRouter' });

// ============================================================================
// TYPES
// ============================================================================

export interface DetectedIntent {
  /** The domain this segment maps to */
  domain: string;
  /** The text segment */
  text: string;
  /** Confidence that this is a distinct intent */
  confidence: number;
  /** Keywords that triggered detection */
  matchedKeywords: string[];
}

export interface MultiIntentResult {
  /** Whether multiple intents were detected */
  isMultiIntent: boolean;
  /** The detected intents (1 or more) */
  intents: DetectedIntent[];
  /** Original input text */
  originalText: string;
}

// ============================================================================
// COMPOUND MARKERS
// ============================================================================

/**
 * Patterns that indicate compound intents
 */
const COMPOUND_PATTERNS = [
  // Additive
  /\b(and also|and|also|plus|as well as|in addition|on top of that|besides|furthermore)\b/i,
  // Contrastive
  /\b(but also|but|not just.*but|not only.*but|however)\b/i,
  // Sequential
  /\b(then|after that|and then|first.*then)\b/i,
  // Comparative
  /\b(while also|at the same time|simultaneously|meanwhile)\b/i,
];

// ============================================================================
// DOMAIN KEYWORDS
// ============================================================================

/**
 * Keywords that map to specific domains
 */
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  // Life stages
  divorce: [
    'divorce',
    'divorcing',
    'separated',
    'separation',
    'custody',
    'ex-spouse',
    'ex-wife',
    'ex-husband',
  ],
  'job-loss': [
    'job loss',
    'laid off',
    'fired',
    'unemployed',
    'lost my job',
    'job search',
    'career change',
  ],
  'health-diagnosis': [
    'diagnosis',
    'diagnosed',
    'chronic illness',
    'disease',
    'cancer',
    'condition',
  ],
  'new-parent': [
    'baby',
    'newborn',
    'postpartum',
    'parenting',
    'motherhood',
    'fatherhood',
    'sleep deprived',
  ],
  sobriety: ['sobriety', 'sober', 'recovery', 'relapse', 'addiction', 'drinking', 'substance'],
  infidelity: ['cheating', 'affair', 'infidelity', 'betrayed', 'trust broken'],
  grief: ['grief', 'grieving', 'loss', 'death', 'died', 'passed away', 'mourning'],

  // Emotions
  anxiety: ['anxious', 'anxiety', 'worried', 'panic', 'nervous', 'fear'],
  depression: ['depressed', 'depression', 'hopeless', 'empty', 'numb'],
  anger: ['angry', 'furious', 'rage', 'mad', 'frustrated'],
  stress: ['stressed', 'stress', 'overwhelmed', 'pressure', 'burnout'],
  shame: ['ashamed', 'shame', 'embarrassed', 'humiliated'],
  envy: ['jealous', 'envious', 'envy', 'comparing'],
  resentment: ['resentful', 'resentment', 'bitter', 'grudge'],

  // Relationships
  relationships: ['relationship', 'partner', 'spouse', 'boyfriend', 'girlfriend', 'marriage'],
  family: ['family', 'parents', 'siblings', 'kids', 'children'],
  friendship: ['friend', 'friendship', 'friends', 'social'],

  // Career
  career: ['career', 'work', 'job', 'profession', 'boss', 'coworker'],
  finances: ['money', 'financial', 'debt', 'bills', 'savings', 'budget'],

  // Wellness
  sleep: ['sleep', 'insomnia', 'tired', 'exhausted', 'rest'],
  health: ['health', 'fitness', 'exercise', 'diet', 'weight'],

  // Identity
  identity: ['identity', 'who am i', 'purpose', 'meaning', 'lost'],
  'faith-transition': ['faith', 'religion', 'spiritual', 'church', 'belief'],
  'coming-out': ['coming out', 'gay', 'lesbian', 'lgbtq', 'queer', 'bisexual'],
};

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

/**
 * Check if text contains compound markers
 */
function hasCompoundMarker(text: string): boolean {
  return COMPOUND_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Split text on compound markers
 */
function splitOnCompoundMarkers(text: string): string[] {
  // Create a combined regex for splitting
  const splitPattern =
    /\s*(?:and also|and|also|plus|as well as|in addition|on top of that|besides|but also|but|while also|at the same time)\s*/i;

  const segments = text.split(splitPattern).filter((s) => s.trim().length > 10);

  return segments;
}

/**
 * Detect domain for a text segment
 */
function detectDomainForSegment(
  segment: string
): { domain: string; keywords: string[]; confidence: number } | null {
  const lowerSegment = segment.toLowerCase();
  let bestMatch: { domain: string; keywords: string[]; confidence: number } | null = null;

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const matchedKeywords = keywords.filter((kw) => lowerSegment.includes(kw));

    if (matchedKeywords.length > 0) {
      const confidence = Math.min(0.9, 0.5 + matchedKeywords.length * 0.15);

      if (!bestMatch || confidence > bestMatch.confidence) {
        bestMatch = { domain, keywords: matchedKeywords, confidence };
      }
    }
  }

  return bestMatch;
}

// ============================================================================
// MAIN DETECTION
// ============================================================================

/**
 * Detect if input contains multiple intents
 */
export function detectMultipleIntents(text: string): MultiIntentResult {
  const result: MultiIntentResult = {
    isMultiIntent: false,
    intents: [],
    originalText: text,
  };

  // First check for compound markers
  if (!hasCompoundMarker(text)) {
    // Single intent - detect the domain
    const detection = detectDomainForSegment(text);
    if (detection) {
      result.intents.push({
        domain: detection.domain,
        text,
        confidence: detection.confidence,
        matchedKeywords: detection.keywords,
      });
    }
    return result;
  }

  // Split on compound markers
  const segments = splitOnCompoundMarkers(text);

  if (segments.length <= 1) {
    // Couldn't split meaningfully
    const detection = detectDomainForSegment(text);
    if (detection) {
      result.intents.push({
        domain: detection.domain,
        text,
        confidence: detection.confidence,
        matchedKeywords: detection.keywords,
      });
    }
    return result;
  }

  // Detect domain for each segment
  const detectedIntents: DetectedIntent[] = [];

  for (const segment of segments) {
    const detection = detectDomainForSegment(segment);
    if (detection) {
      detectedIntents.push({
        domain: detection.domain,
        text: segment.trim(),
        confidence: detection.confidence,
        matchedKeywords: detection.keywords,
      });
    }
  }

  // Check if we have multiple DIFFERENT domains
  const uniqueDomains = new Set(detectedIntents.map((i) => i.domain));

  if (uniqueDomains.size > 1) {
    result.isMultiIntent = true;
    result.intents = detectedIntents;

    log.info(
      {
        intentCount: detectedIntents.length,
        domains: Array.from(uniqueDomains),
      },
      '🎯 Multiple intents detected'
    );
  } else if (detectedIntents.length > 0) {
    // Same domain mentioned multiple times - consolidate
    result.intents = [detectedIntents[0]];
  }

  return result;
}

/**
 * Get priority intent from multiple intents
 * (Some intents should be handled first - e.g., crisis > career)
 */
export function getPriorityIntent(intents: DetectedIntent[]): DetectedIntent | null {
  if (intents.length === 0) return null;
  if (intents.length === 1) return intents[0];

  // Priority order (higher = more urgent)
  const priorityOrder: Record<string, number> = {
    crisis: 100,
    'suicidal-ideation': 100,
    depression: 90,
    anxiety: 85,
    grief: 80,
    anger: 75,
    stress: 70,
    relationships: 60,
    family: 55,
    divorce: 50,
    'job-loss': 45,
    career: 40,
    finances: 35,
    health: 30,
    identity: 25,
  };

  // Sort by priority (descending)
  const sorted = [...intents].sort((a, b) => {
    const priorityA = priorityOrder[a.domain] ?? 20;
    const priorityB = priorityOrder[b.domain] ?? 20;
    return priorityB - priorityA;
  });

  return sorted[0];
}

/**
 * Format intents for logging/debugging
 */
export function formatIntentsForLog(result: MultiIntentResult): string {
  if (!result.isMultiIntent) {
    return result.intents[0]?.domain || 'unknown';
  }

  return result.intents.map((i) => `${i.domain} (${Math.round(i.confidence * 100)}%)`).join(' + ');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectMultipleIntents,
  getPriorityIntent,
  formatIntentsForLog,
  DOMAIN_KEYWORDS,
};
