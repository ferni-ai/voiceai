/**
 * Relationship Extractor
 *
 * Phase 2: Personal Memory Integration
 *
 * Extracts information about people in the user's life from conversation text.
 * Tracks relationships, emotional valence, and context about each person.
 *
 * @module RelationshipExtractor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  Relationship,
  RelationshipType,
  EmotionalValence,
} from '../user-trigger-profile.types.js';

const log = createLogger({ module: 'relationship-extractor' });

// ============================================================================
// RELATIONSHIP PATTERNS
// ============================================================================

interface RelationshipPattern {
  pattern: RegExp;
  type: RelationshipType;
  role?: string;
  extractName?: (match: RegExpMatchArray) => string | null;
}

const RELATIONSHIP_PATTERNS: RelationshipPattern[] = [
  // Family - immediate
  {
    pattern: /my\s+(mom|mother)/i,
    type: 'family',
    role: 'mother',
    extractName: () => 'Mom',
  },
  {
    pattern: /my\s+(dad|father)/i,
    type: 'family',
    role: 'father',
    extractName: () => 'Dad',
  },
  {
    pattern: /my\s+(brother|sister|sibling)\s+(\w+)/i,
    type: 'family',
    extractName: (m) => m[2],
  },
  {
    pattern: /my\s+(son|daughter)\s+(\w+)/i,
    type: 'family',
    extractName: (m) => m[2],
  },
  {
    pattern: /my\s+(grandma|grandmother|grandpa|grandfather)/i,
    type: 'family',
    extractName: (m) => m[1].charAt(0).toUpperCase() + m[1].slice(1),
  },

  // Family - extended
  {
    pattern: /my\s+(aunt|uncle)\s+(\w+)/i,
    type: 'family',
    extractName: (m) => m[2],
  },
  {
    pattern: /my\s+(cousin)\s+(\w+)/i,
    type: 'family',
    extractName: (m) => m[2],
  },

  // Romantic
  {
    pattern: /my\s+(wife|husband|spouse)\s+(\w+)/i,
    type: 'romantic',
    extractName: (m) => m[2],
  },
  {
    pattern: /my\s+(wife|husband|spouse)(?!\s+\w)/i,
    type: 'romantic',
    extractName: (m) => m[1],
  },
  {
    pattern: /my\s+(girlfriend|boyfriend|partner)\s+(\w+)/i,
    type: 'romantic',
    extractName: (m) => m[2],
  },
  {
    pattern: /my\s+(girlfriend|boyfriend|partner)(?!\s+\w)/i,
    type: 'romantic',
    extractName: (m) => 'Partner',
  },
  {
    pattern: /my\s+ex(?:-|\s+)?(wife|husband|girlfriend|boyfriend|partner)?(?:\s+(\w+))?/i,
    type: 'romantic',
    role: 'ex',
    extractName: (m) => m[2] || 'Ex',
  },

  // Friends
  {
    pattern: /my\s+(?:best\s+)?friend\s+(\w+)/i,
    type: 'friend',
    extractName: (m) => m[1],
  },
  {
    pattern: /my\s+(?:old|close|good)\s+friend\s+(\w+)/i,
    type: 'friend',
    extractName: (m) => m[1],
  },

  // Work
  {
    pattern: /my\s+(?:boss|manager|supervisor)\s+(\w+)/i,
    type: 'colleague',
    role: 'boss',
    extractName: (m) => m[1],
  },
  {
    pattern: /my\s+(?:coworker|colleague)\s+(\w+)/i,
    type: 'colleague',
    extractName: (m) => m[1],
  },

  // Mentors
  {
    pattern: /my\s+(?:mentor|therapist|counselor|coach)\s+(\w+)?/i,
    type: 'mentor',
    extractName: (m) => m[1] || 'Mentor',
  },

  // Pets
  {
    pattern: /my\s+(?:dog|cat|pet)\s+(\w+)/i,
    type: 'pet',
    extractName: (m) => m[1],
  },

  // Generic named person
  {
    pattern: /(\w+)\s+(?:is|was)\s+my\s+(mom|mother|dad|father|brother|sister|friend|wife|husband|partner)/i,
    type: 'other',
    extractName: (m) => m[1],
  },
];

// ============================================================================
// VALENCE PATTERNS
// ============================================================================

interface ValencePattern {
  pattern: RegExp;
  valence: EmotionalValence;
  weight: number;
}

const POSITIVE_VALENCE_PATTERNS: ValencePattern[] = [
  { pattern: /love\s+(?:him|her|them)/i, valence: 'very_positive', weight: 0.8 },
  { pattern: /(?:best|closest|dearest)\s+(?:friend|person)/i, valence: 'very_positive', weight: 0.7 },
  { pattern: /(?:amazing|wonderful|incredible|supportive)/i, valence: 'positive', weight: 0.5 },
  { pattern: /(?:so|really)\s+(?:close|important)/i, valence: 'positive', weight: 0.5 },
  { pattern: /grateful\s+(?:for|to)/i, valence: 'positive', weight: 0.5 },
  { pattern: /(?:miss|missed)\s+(?:him|her|them)/i, valence: 'positive', weight: 0.4 },
];

const NEGATIVE_VALENCE_PATTERNS: ValencePattern[] = [
  { pattern: /(?:hate|can't\s+stand|despise)/i, valence: 'very_negative', weight: 0.8 },
  { pattern: /(?:toxic|abusive|manipulative)/i, valence: 'very_negative', weight: 0.9 },
  { pattern: /(?:difficult|hard|challenging)\s+relationship/i, valence: 'negative', weight: 0.5 },
  { pattern: /(?:hurt|disappointed|frustrated)\s+(?:by|with)/i, valence: 'negative', weight: 0.5 },
  { pattern: /(?:don't|doesn't)\s+(?:talk|speak)\s+(?:to|with)/i, valence: 'negative', weight: 0.6 },
  { pattern: /estranged/i, valence: 'very_negative', weight: 0.7 },
];

const COMPLICATED_PATTERNS: ValencePattern[] = [
  { pattern: /(?:complicated|complex|mixed\s+feelings)/i, valence: 'complicated', weight: 0.8 },
  { pattern: /(?:love|care\s+about).*(?:but|however)/i, valence: 'complicated', weight: 0.6 },
  { pattern: /(?:sometimes|on\s+and\s+off)/i, valence: 'complicated', weight: 0.4 },
  { pattern: /(?:hard|difficult).*(?:love|care)/i, valence: 'complicated', weight: 0.5 },
];

// ============================================================================
// DECEASED PATTERNS
// ============================================================================

const DECEASED_PATTERNS = [
  /passed\s+away/i,
  /died/i,
  /passed\s+on/i,
  /no\s+longer\s+with\s+us/i,
  /lost\s+(?:him|her|them)/i,
  /in\s+(?:heaven|a\s+better\s+place)/i,
  /(?:was|were)\s+(\w+)'?s?.*(?:before|when).*(?:passed|died)/i,
];

// ============================================================================
// TOPIC EXTRACTION
// ============================================================================

const TOPIC_PATTERNS: Array<{ pattern: RegExp; topic: string }> = [
  { pattern: /work|job|career|office/i, topic: 'work' },
  { pattern: /money|financial|debt|pay/i, topic: 'finances' },
  { pattern: /health|sick|hospital|doctor/i, topic: 'health' },
  { pattern: /kid|child|parent/i, topic: 'family' },
  { pattern: /vacation|trip|travel/i, topic: 'travel' },
  { pattern: /house|home|move|moving/i, topic: 'housing' },
  { pattern: /school|college|study/i, topic: 'education' },
  { pattern: /wedding|engaged|married/i, topic: 'relationship' },
  { pattern: /worried|stressed|anxious/i, topic: 'stress' },
  { pattern: /happy|excited|great/i, topic: 'positive events' },
];

// ============================================================================
// EXTRACTION FUNCTIONS
// ============================================================================

export interface RelationshipExtractionOptions {
  /** Minimum confidence to include (0-1) */
  minConfidence?: number;
  /** Existing relationships to merge with */
  existingRelationships?: Relationship[];
}

export interface RelationshipExtractionResult {
  relationships: Relationship[];
  processingTimeMs: number;
}

/**
 * Extract relationships from conversation text
 */
export function extractRelationships(
  text: string,
  options: RelationshipExtractionOptions = {}
): RelationshipExtractionResult {
  const startTime = Date.now();
  const { minConfidence = 0.5 } = options;

  const extractedRelationships: Relationship[] = [];
  const seenNames = new Set<string>();

  for (const patternDef of RELATIONSHIP_PATTERNS) {
    const match = text.match(patternDef.pattern);
    if (!match) continue;

    const name = patternDef.extractName?.(match);
    if (!name) continue;

    // Avoid duplicates
    const normalizedName = name.toLowerCase();
    if (seenNames.has(normalizedName)) continue;
    seenNames.add(normalizedName);

    // Determine valence
    const valence = determineValence(text, name);

    // Check if deceased
    const isDeceased = checkDeceased(text, name);

    // Extract associated topics
    const topics = extractTopics(text);

    // Calculate confidence
    const confidence = calculateConfidence(match, text);
    if (confidence < minConfidence) continue;

    // Determine type (may be overridden from pattern)
    let type = patternDef.type;
    if (isDeceased) {
      type = 'deceased';
    } else if (checkEstranged(text, name)) {
      type = 'estranged';
    }

    // Build role
    let role = patternDef.role;
    if (!role && match[1]) {
      role = match[1].toLowerCase();
    }

    // Determine trigger categories
    const triggerCategories = determineTriggerCategories(type, valence, isDeceased);

    const relationship: Relationship = {
      id: `rel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      aliases: [name],
      type,
      role,
      emotionalValence: valence,
      isDeceased,
      triggerCategories,
      mentionFrequency: 1, // Will be updated over time
      associatedTopics: topics,
      extractedAt: new Date(),
      confidence,
    };

    extractedRelationships.push(relationship);
    log.debug({ name, type, valence, isDeceased }, 'Extracted relationship');
  }

  const processingTimeMs = Date.now() - startTime;

  log.info(
    { relationshipsFound: extractedRelationships.length, processingTimeMs },
    'Relationship extraction complete'
  );

  return { relationships: extractedRelationships, processingTimeMs };
}

/**
 * Determine the emotional valence of a relationship
 */
function determineValence(text: string, name: string): EmotionalValence {
  // Look for valence indicators near the name
  const nameContext = extractContext(text, name, 100);

  // Check for complicated first (takes precedence)
  for (const { pattern, valence, weight } of COMPLICATED_PATTERNS) {
    if (pattern.test(nameContext) && weight >= 0.5) {
      return valence;
    }
  }

  // Check positive patterns
  let positiveScore = 0;
  for (const { pattern, weight } of POSITIVE_VALENCE_PATTERNS) {
    if (pattern.test(nameContext)) {
      positiveScore += weight;
    }
  }

  // Check negative patterns
  let negativeScore = 0;
  for (const { pattern, weight } of NEGATIVE_VALENCE_PATTERNS) {
    if (pattern.test(nameContext)) {
      negativeScore += weight;
    }
  }

  // Determine valence based on scores
  if (positiveScore >= 0.8 && negativeScore < 0.3) return 'very_positive';
  if (positiveScore >= 0.4 && negativeScore < 0.3) return 'positive';
  if (negativeScore >= 0.8 && positiveScore < 0.3) return 'very_negative';
  if (negativeScore >= 0.4 && positiveScore < 0.3) return 'negative';
  if (positiveScore > 0.2 && negativeScore > 0.2) return 'complicated';

  return 'neutral';
}

/**
 * Check if person is mentioned as deceased
 */
function checkDeceased(text: string, name: string): boolean {
  const nameContext = extractContext(text, name, 150);

  for (const pattern of DECEASED_PATTERNS) {
    if (pattern.test(nameContext)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if relationship is estranged
 */
function checkEstranged(text: string, name: string): boolean {
  const nameContext = extractContext(text, name, 150);

  const estrangedPatterns = [
    /estranged/i,
    /don't\s+(?:talk|speak)\s+(?:to|with)/i,
    /cut\s+(?:off|out)/i,
    /no\s+(?:longer|more)\s+(?:talk|speak|contact)/i,
    /not\s+on\s+speaking\s+terms/i,
  ];

  return estrangedPatterns.some((p) => p.test(nameContext));
}

/**
 * Extract topics associated with the conversation
 */
function extractTopics(text: string): string[] {
  const topics: string[] = [];

  for (const { pattern, topic } of TOPIC_PATTERNS) {
    if (pattern.test(text)) {
      topics.push(topic);
    }
  }

  return [...new Set(topics)];
}

/**
 * Extract context around a name mention
 */
function extractContext(text: string, name: string, radius: number): string {
  const index = text.toLowerCase().indexOf(name.toLowerCase());
  if (index === -1) return text;

  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + name.length + radius);

  return text.slice(start, end);
}

/**
 * Calculate confidence score
 */
function calculateConfidence(match: RegExpMatchArray, text: string): number {
  let confidence = 0.6; // Base confidence

  // Increase for longer match
  if (match[0].length > 15) {
    confidence += 0.1;
  }

  // Increase for first-person mentions
  if (/\bmy\b/i.test(match[0])) {
    confidence += 0.1;
  }

  // Increase if name is mentioned multiple times
  const name = match[match.length - 1] || match[1];
  if (name) {
    const mentions = (text.match(new RegExp(name, 'gi')) || []).length;
    if (mentions > 1) {
      confidence += Math.min(0.2, mentions * 0.05);
    }
  }

  return Math.min(1, confidence);
}

/**
 * Determine trigger categories based on relationship type and valence
 */
function determineTriggerCategories(
  type: RelationshipType,
  valence: EmotionalValence,
  isDeceased: boolean
): string[] {
  const categories = new Set<string>(['relational']);

  // Add based on type
  if (type === 'family') categories.add('family');
  if (type === 'romantic') categories.add('romantic');
  if (type === 'friend') categories.add('friendship');

  // Add based on valence
  if (valence === 'very_negative' || valence === 'negative') {
    categories.add('emotional');
    categories.add('behavioral'); // May trigger avoidance patterns
  }
  if (valence === 'complicated') {
    categories.add('emotional');
  }

  // Add for deceased
  if (isDeceased) {
    categories.add('grief');
    categories.add('temporal'); // Anniversary triggers
  }

  return Array.from(categories);
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Quick check if text mentions any relationships
 */
export function hasRelationshipMentions(text: string): boolean {
  const quickPatterns = [
    /my\s+(mom|dad|mother|father|brother|sister)/i,
    /my\s+(wife|husband|partner|girlfriend|boyfriend)/i,
    /my\s+(friend|boss|colleague)/i,
    /my\s+(son|daughter|child)/i,
    /my\s+(grandma|grandmother|grandpa|grandfather)/i,
    /my\s+(aunt|uncle|cousin)/i,
    /my\s+(dog|cat|pet)/i,
  ];

  return quickPatterns.some((p) => p.test(text));
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  extractRelationships,
  hasRelationshipMentions,
};
