/**
 * Lightweight Entity Detector
 *
 * Improved entity detection for graph context queries.
 * Uses rule-based heuristics that are fast and don't require ML models.
 *
 * Features:
 * - Multi-word name detection (Sarah Johnson)
 * - Titles and honorifics (Dr., Mr., Mrs.)
 * - Session-scoped pronoun resolution (her → Sarah)
 * - Capitalized word detection
 * - Known entity matching
 *
 * @module intelligence/entity-detector
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'EntityDetector' });

// ============================================================================
// TYPES
// ============================================================================

export interface DetectedEntity {
  /** The entity name */
  name: string;
  /** Entity type if determinable */
  type: 'person' | 'place' | 'organization' | 'unknown';
  /** Confidence in detection (0-1) */
  confidence: number;
  /** How the entity was detected */
  method: 'pattern' | 'capitalization' | 'pronoun' | 'known';
  /** Original text that matched */
  originalText: string;
}

export interface EntityDetectorOptions {
  /** Known entities to match against (from Spanner) */
  knownEntities?: string[];
  /** Last mentioned entities for pronoun resolution */
  pronounContext?: Map<string, string>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Common titles and honorifics */
const TITLES = new Set([
  'mr',
  'mrs',
  'ms',
  'miss',
  'dr',
  'prof',
  'professor',
  'rev',
  'reverend',
  'sir',
  'madam',
  'lord',
  'lady',
  'captain',
  'major',
  'colonel',
  'general',
  'senator',
  'president',
  'governor',
  'mayor',
  'judge',
  'justice',
]);

/** Common first names (sample for validation) */
const COMMON_FIRST_NAMES = new Set([
  'james',
  'john',
  'robert',
  'michael',
  'william',
  'david',
  'richard',
  'joseph',
  'thomas',
  'charles',
  'mary',
  'patricia',
  'jennifer',
  'linda',
  'elizabeth',
  'barbara',
  'susan',
  'jessica',
  'sarah',
  'karen',
  'emma',
  'olivia',
  'ava',
  'sophia',
  'isabella',
  'mia',
  'charlotte',
  'amelia',
  'harper',
  'evelyn',
  'liam',
  'noah',
  'oliver',
  'elijah',
  'lucas',
  'mason',
  'logan',
  'alexander',
  'ethan',
  'jacob',
  'mike',
  'tom',
  'bob',
  'joe',
  'jim',
  'bill',
  'dan',
  'sam',
  'alex',
  'chris',
  'matt',
  'nick',
  'ben',
  'katie',
  'amy',
  'anna',
  'lisa',
  'laura',
  'emily',
  'rachel',
  'amanda',
  'ashley',
  'nicole',
]);

/** Words that indicate a following entity is a person */
const PERSON_INDICATORS = new Set([
  'my',
  'friend',
  'colleague',
  'coworker',
  'brother',
  'sister',
  'mother',
  'father',
  'mom',
  'dad',
  'husband',
  'wife',
  'partner',
  'boss',
  'manager',
  'doctor',
  'therapist',
  'son',
  'daughter',
  'aunt',
  'uncle',
  'cousin',
  'grandma',
  'grandpa',
  'neighbor',
  'roommate',
  'boyfriend',
  'girlfriend',
  'ex',
  'best',
  'good',
  'old',
  'new',
  'close',
]);

/** Words that should not be detected as entities */
const STOP_ENTITIES = new Set([
  'i',
  'you',
  'we',
  'they',
  'it',
  'he',
  'she',
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  'today',
  'tomorrow',
  'yesterday',
  'morning',
  'afternoon',
  'evening',
  'night',
  'ferni',
  'peter',
  'maya',
  'jordan',
  'alex',
  'nayan', // Our personas
]);

/** Personal pronouns and what gender they map to */
const PRONOUN_MAP: Record<string, 'male' | 'female' | 'neutral'> = {
  he: 'male',
  him: 'male',
  his: 'male',
  himself: 'male',
  she: 'female',
  her: 'female',
  hers: 'female',
  herself: 'female',
  they: 'neutral',
  them: 'neutral',
  their: 'neutral',
  themselves: 'neutral',
};

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

/** Pattern: "My [relationship] [Name]" */
const RELATIONSHIP_NAME_PATTERN =
  /(?:my|the)\s+(?:friend|colleague|coworker|brother|sister|mom|dad|mother|father|husband|wife|partner|boss|manager|doctor|therapist|son|daughter|aunt|uncle|cousin|neighbor|roommate|boyfriend|girlfriend)(?:'s?\s+)?\s*,?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;

/** Pattern: "[Title] [Name]" */
const TITLE_NAME_PATTERN =
  /(?:Dr|Mr|Mrs|Ms|Miss|Prof|Professor|Rev)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;

/** Pattern: "called/named [Name]" */
const CALLED_NAMED_PATTERN =
  /(?:called|named|known as|goes by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;

/** Pattern: "[Name] is my [relationship]" */
const NAME_IS_RELATIONSHIP_PATTERN =
  /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:is|was|is\s+my|was\s+my)\s+(?:friend|colleague|brother|sister|mother|father|husband|wife|partner|boss|doctor|therapist)/gi;

/** Pattern: "talk to/with/about [Name]" */
const TALK_TO_PATTERN =
  /(?:talk(?:ing|ed)?|spoke|speak(?:ing)?|met|meet(?:ing)?|saw|see(?:ing)?|called|visited)\s+(?:to|with|about)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi;

// ============================================================================
// MAIN DETECTION FUNCTION
// ============================================================================

/**
 * Detect entities in text using multiple strategies
 *
 * @param text - Input text to analyze
 * @param options - Detection options
 * @returns Array of detected entities
 */
export function detectEntities(
  text: string,
  options: EntityDetectorOptions = {}
): DetectedEntity[] {
  const { knownEntities = [], pronounContext } = options;
  const detected: DetectedEntity[] = [];
  const seen = new Set<string>();

  // 1. Match against known entities first (highest confidence)
  for (const knownEntity of knownEntities) {
    const regex = new RegExp(`\\b${escapeRegex(knownEntity)}\\b`, 'gi');
    if (regex.test(text) && !seen.has(knownEntity.toLowerCase())) {
      detected.push({
        name: knownEntity,
        type: 'person', // Assume known entities are people for now
        confidence: 0.95,
        method: 'known',
        originalText: knownEntity,
      });
      seen.add(knownEntity.toLowerCase());
    }
  }

  // 2. Pattern-based detection
  const patterns = [
    { pattern: RELATIONSHIP_NAME_PATTERN, type: 'person' as const, confidence: 0.85 },
    { pattern: TITLE_NAME_PATTERN, type: 'person' as const, confidence: 0.9 },
    { pattern: CALLED_NAMED_PATTERN, type: 'person' as const, confidence: 0.85 },
    { pattern: NAME_IS_RELATIONSHIP_PATTERN, type: 'person' as const, confidence: 0.8 },
    { pattern: TALK_TO_PATTERN, type: 'person' as const, confidence: 0.7 },
  ];

  for (const { pattern, type, confidence } of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1]?.trim();
      if (name && !seen.has(name.toLowerCase()) && isValidEntityName(name)) {
        detected.push({
          name,
          type,
          confidence,
          method: 'pattern',
          originalText: match[0],
        });
        seen.add(name.toLowerCase());
      }
    }
  }

  // 3. Capitalized word detection (lower confidence)
  const capitalizedPattern = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)?)\b/g;
  let capMatch: RegExpExecArray | null;
  while ((capMatch = capitalizedPattern.exec(text)) !== null) {
    const name = capMatch[1].trim();
    if (name && !seen.has(name.toLowerCase()) && isValidEntityName(name)) {
      // Check if it looks like a name
      const firstWord = name.split(' ')[0].toLowerCase();
      if (COMMON_FIRST_NAMES.has(firstWord)) {
        detected.push({
          name,
          type: 'person',
          confidence: 0.6,
          method: 'capitalization',
          originalText: capMatch[0],
        });
        seen.add(name.toLowerCase());
      }
    }
  }

  // 4. Pronoun resolution (if context provided)
  if (pronounContext && pronounContext.size > 0) {
    for (const [pronoun, gender] of Object.entries(PRONOUN_MAP)) {
      const pronounRegex = new RegExp(`\\b${pronoun}\\b`, 'gi');
      if (pronounRegex.test(text)) {
        const resolvedName = pronounContext.get(gender);
        if (resolvedName && !seen.has(resolvedName.toLowerCase())) {
          detected.push({
            name: resolvedName,
            type: 'person',
            confidence: 0.5,
            method: 'pronoun',
            originalText: pronoun,
          });
          seen.add(resolvedName.toLowerCase());
        }
      }
    }
  }

  log.debug(
    { input: text.slice(0, 50), detected: detected.length },
    '🔍 Entity detection complete'
  );

  return detected;
}

/**
 * Check if a name is valid (not a stop word, not too short)
 */
function isValidEntityName(name: string): boolean {
  const lower = name.toLowerCase();

  // Filter out stop entities
  if (STOP_ENTITIES.has(lower)) return false;

  // Must be at least 2 characters
  if (name.length < 2) return false;

  // Must start with a capital letter
  if (!/^[A-Z]/.test(name)) return false;

  // Filter out all-caps (likely acronyms)
  if (name === name.toUpperCase() && name.length > 3) return false;

  return true;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// PRONOUN CONTEXT MANAGEMENT
// ============================================================================

/**
 * Update pronoun context based on detected entities
 *
 * Call this after entity detection to enable pronoun resolution in future turns.
 *
 * @param entities - Detected entities
 * @param context - Existing pronoun context to update
 */
export function updatePronounContext(
  entities: DetectedEntity[],
  context: Map<string, string>
): void {
  // Simple heuristic: last mentioned person of each "gender" based on common names
  for (const entity of entities) {
    if (entity.type === 'person') {
      const firstName = entity.name.split(' ')[0].toLowerCase();

      // Very simple gender guessing based on name (would need a proper DB for accuracy)
      if (isMaleName(firstName)) {
        context.set('male', entity.name);
      } else if (isFemaleName(firstName)) {
        context.set('female', entity.name);
      } else {
        context.set('neutral', entity.name);
      }
    }
  }
}

/**
 * Simple heuristic for male names
 */
function isMaleName(name: string): boolean {
  const maleNames = new Set([
    'james',
    'john',
    'robert',
    'michael',
    'william',
    'david',
    'richard',
    'joseph',
    'thomas',
    'charles',
    'mike',
    'tom',
    'bob',
    'joe',
    'jim',
    'bill',
    'dan',
    'sam',
    'alex',
    'chris',
    'matt',
    'nick',
    'ben',
    'liam',
    'noah',
    'oliver',
    'elijah',
    'lucas',
    'mason',
    'logan',
    'alexander',
    'ethan',
    'jacob',
    'ryan',
    'tyler',
    'kevin',
    'brian',
    'jason',
    'adam',
    'mark',
    'paul',
    'steven',
    'peter',
  ]);
  return maleNames.has(name.toLowerCase());
}

/**
 * Simple heuristic for female names
 */
function isFemaleName(name: string): boolean {
  const femaleNames = new Set([
    'mary',
    'patricia',
    'jennifer',
    'linda',
    'elizabeth',
    'barbara',
    'susan',
    'jessica',
    'sarah',
    'karen',
    'emma',
    'olivia',
    'ava',
    'sophia',
    'isabella',
    'mia',
    'charlotte',
    'amelia',
    'harper',
    'evelyn',
    'katie',
    'amy',
    'anna',
    'lisa',
    'laura',
    'emily',
    'rachel',
    'amanda',
    'ashley',
    'nicole',
    'michelle',
    'stephanie',
    'rebecca',
    'samantha',
    'hannah',
    'natalie',
    'victoria',
    'grace',
    'julia',
  ]);
  return femaleNames.has(name.toLowerCase());
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Extract just the entity names from text
 *
 * @param text - Input text
 * @param options - Detection options
 * @returns Array of entity names
 */
export function extractEntityNames(text: string, options: EntityDetectorOptions = {}): string[] {
  return detectEntities(text, options)
    .sort((a, b) => b.confidence - a.confidence)
    .map((e) => e.name);
}

/**
 * Get the primary entity mentioned in text (highest confidence)
 *
 * @param text - Input text
 * @param options - Detection options
 * @returns Primary entity name or null
 */
export function getPrimaryEntity(text: string, options: EntityDetectorOptions = {}): string | null {
  const entities = detectEntities(text, options);
  if (entities.length === 0) return null;

  // Sort by confidence and return the top one
  entities.sort((a, b) => b.confidence - a.confidence);
  return entities[0].name;
}
