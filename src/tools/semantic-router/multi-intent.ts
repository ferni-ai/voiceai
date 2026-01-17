/**
 * Multi-Intent Detection for Compound User Queries
 *
 * Detects when users express multiple simultaneous needs:
 * - "I'm stressed about work AND my relationship"
 * - "Help me plan my week and also check on my mom"
 * - "I need to budget better and start exercising"
 *
 * Returns multiple tool candidates that should all be considered.
 *
 * @module tools/semantic-router/multi-intent
 */

import {
  analyzeHolisticContext,
  detectRelationshipContext,
  type HolisticContext,
} from './shared-vocabulary.js';

// ============================================================================
// TYPES
// ============================================================================

export interface DetectedIntent {
  type: string;
  text: string; // The portion of text that triggered this intent
  confidence: number;
  domains: string[];
  entities: Map<string, string>;
  holisticContext: HolisticContext;
}

export interface MultiIntentResult {
  isCompound: boolean;
  primaryIntent: DetectedIntent | null;
  secondaryIntents: DetectedIntent[];
  allIntents: DetectedIntent[];
  compoundType: 'sequential' | 'parallel' | 'conditional' | 'none';
  suggestedToolCategories: string[];
  overallUrgency: 'low' | 'medium' | 'high' | 'critical';
}

// ============================================================================
// COMPOUND INTENT PATTERNS
// ============================================================================

/**
 * Patterns that indicate compound intents.
 */
const COMPOUND_PATTERNS = {
  // Sequential: do X then Y
  sequential: [
    /(.+?)\s+(?:and then|then|after that|afterwards|next)\s+(.+)/i,
    /(?:first|initially)\s+(.+?)\s+(?:and then|then)\s+(.+)/i,
  ],
  // Parallel: do X and Y at the same time
  parallel: [
    /(.+?)\s+(?:and also|and|plus|as well as)\s+(.+)/i,
    /(?:both)\s+(.+?)\s+(?:and)\s+(.+)/i,
    /(.+?)\s+(?:while also|while)\s+(.+)/i,
  ],
  // Conditional: if X then Y
  conditional: [/(?:if)\s+(.+?)\s+(?:then|,)\s+(.+)/i, /(.+?)\s+(?:unless|otherwise)\s+(.+)/i],
  // Multiple concerns
  concerns: [
    /(?:i(?:'m| am)?\s+(?:worried|stressed|anxious|concerned)\s+about)\s+(.+?)\s+(?:and|but also|plus)\s+(.+)/i,
    /(?:i\s+need\s+(?:help|to))\s+(?:with\s+)?(.+?)\s+(?:and|but also|plus)\s+(.+)/i,
    /(.+?)\s+(?:is|are)\s+(?:bothering|stressing|worrying)\s+me\s+(?:and|,\s*and)\s+(?:so\s+is|also)\s+(.+)/i,
  ],
};

/**
 * Patterns that indicate a single-focus intent (not compound).
 */
const SINGLE_FOCUS_PATTERNS = [
  /^(?:just|only|simply)\s+/i,
  /^(?:i\s+just\s+(?:want|need)\s+to)\s+/i,
  /^(?:can you (?:just|quickly))\s+/i,
];

// ============================================================================
// INTENT SPLITTING
// ============================================================================

/**
 * Split text into separate intent segments.
 */
function splitIntoIntents(text: string): {
  segments: string[];
  compoundType: 'sequential' | 'parallel' | 'conditional' | 'none';
} {
  const normalized = text.trim();

  // Check if explicitly single-focus
  for (const pattern of SINGLE_FOCUS_PATTERNS) {
    if (pattern.test(normalized)) {
      return { segments: [normalized], compoundType: 'none' };
    }
  }

  // Try each compound pattern type
  for (const [type, patterns] of Object.entries(COMPOUND_PATTERNS)) {
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match && match[1] && match[2]) {
        const segment1 = match[1].trim();
        const segment2 = match[2].trim();

        // Recursively check if segments themselves are compound
        const sub1 = splitIntoIntents(segment1);
        const sub2 = splitIntoIntents(segment2);

        const allSegments = [...sub1.segments, ...sub2.segments];

        return {
          segments: allSegments,
          compoundType: type as 'sequential' | 'parallel' | 'conditional',
        };
      }
    }
  }

  return { segments: [normalized], compoundType: 'none' };
}

/**
 * Extract entities from an intent segment.
 */
function extractEntities(text: string): Map<string, string> {
  const entities = new Map<string, string>();

  // Person/relationship entities
  const relationship = detectRelationshipContext(text);
  if (relationship) {
    entities.set('relationship_type', relationship.type);
    entities.set('relationship_context', relationship.context);
  }

  // Time entities
  const timeMatch = text.match(
    /\b(today|tomorrow|this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|tonight)\b/i
  );
  if (timeMatch) {
    entities.set('time', timeMatch[1].toLowerCase());
  }

  // Duration entities
  const durationMatch = text.match(
    /\b(\d+)\s*(minute|minutes|hour|hours|day|days|week|weeks|month|months)\b/i
  );
  if (durationMatch) {
    entities.set('duration_value', durationMatch[1]);
    entities.set('duration_unit', durationMatch[2].toLowerCase());
  }

  // Amount/number entities
  const amountMatch = text.match(/\$(\d+(?:\.\d{2})?)/);
  if (amountMatch) {
    entities.set('amount', amountMatch[1]);
    entities.set('currency', 'USD');
  }

  // Contact name entities (simple extraction)
  const contactMatch = text.match(/(?:call|text|email|message|contact|reach)\s+(?:my\s+)?(\w+)/i);
  if (contactMatch && !['the', 'a', 'my'].includes(contactMatch[1].toLowerCase())) {
    entities.set('contact', contactMatch[1]);
  }

  return entities;
}

// ============================================================================
// INTENT ANALYSIS
// ============================================================================

/**
 * Analyze a single intent segment.
 */
function analyzeIntentSegment(text: string, index: number): DetectedIntent {
  const holisticContext = analyzeHolisticContext(text);
  const entities = extractEntities(text);

  // Determine domains from holistic context
  const domains = Array.from(holisticContext.domainBoosts.keys());

  // Add domains from life domain detection
  if (holisticContext.lifeDomain) {
    for (const cat of holisticContext.lifeDomain.toolCategories) {
      if (!domains.includes(cat)) {
        domains.push(cat);
      }
    }
  }

  // Calculate confidence based on how much context we detected
  let confidence = 0.5; // Base confidence

  if (holisticContext.relationship) confidence += 0.15;
  if (holisticContext.emotion) confidence += 0.15;
  if (holisticContext.lifeDomain) confidence += 0.15;
  if (holisticContext.intent) confidence += 0.1;
  if (entities.size > 0) confidence += 0.05 * Math.min(entities.size, 3);

  confidence = Math.min(1, confidence);

  // Determine intent type
  let type = 'general';
  if (holisticContext.intent) {
    type = holisticContext.intent.intent;
  } else if (holisticContext.emotion) {
    type = 'emotional';
  } else if (holisticContext.lifeDomain) {
    type = holisticContext.lifeDomain.domain;
  }

  return {
    type,
    text,
    confidence,
    domains,
    entities,
    holisticContext,
  };
}

// ============================================================================
// MAIN DETECTION FUNCTION
// ============================================================================

/**
 * Detect multiple intents in user input.
 *
 * @example
 * detectMultipleIntents("I'm stressed about work and my relationship")
 * // Returns: { isCompound: true, primaryIntent: work-stress, secondaryIntents: [relationship] }
 *
 * @example
 * detectMultipleIntents("Call my mom and then check my calendar")
 * // Returns: { isCompound: true, compoundType: 'sequential', ... }
 */
export function detectMultipleIntents(text: string): MultiIntentResult {
  const { segments, compoundType } = splitIntoIntents(text);

  if (segments.length === 0) {
    return {
      isCompound: false,
      primaryIntent: null,
      secondaryIntents: [],
      allIntents: [],
      compoundType: 'none',
      suggestedToolCategories: [],
      overallUrgency: 'low',
    };
  }

  // Analyze each segment
  const allIntents = segments.map((segment, index) => analyzeIntentSegment(segment, index));

  // Sort by confidence to determine primary
  const sortedIntents = [...allIntents].sort((a, b) => b.confidence - a.confidence);

  const primaryIntent = sortedIntents[0];
  const secondaryIntents = sortedIntents.slice(1);

  // Collect all suggested tool categories
  const categorySet = new Set<string>();
  for (const intent of allIntents) {
    for (const domain of intent.domains) {
      categorySet.add(domain);
    }
  }

  // Determine overall urgency (escalate to highest detected level)
  let overallUrgency: 'low' | 'medium' | 'high' | 'critical' = 'low';
  for (const intent of allIntents) {
    const urgency = intent.holisticContext.overallUrgency;
    if (urgency === 'critical') {
      overallUrgency = 'critical';
      break; // Critical is highest, no need to check further
    } else if (urgency === 'high') {
      overallUrgency = 'high';
    } else if (urgency === 'medium' && overallUrgency === 'low') {
      overallUrgency = 'medium';
    }
  }

  return {
    isCompound: segments.length > 1,
    primaryIntent,
    secondaryIntents,
    allIntents,
    compoundType,
    suggestedToolCategories: Array.from(categorySet),
    overallUrgency,
  };
}

// ============================================================================
// TOOL ROUTING HELPERS
// ============================================================================

/**
 * Get tools to consider based on multi-intent analysis.
 * Returns category boosts that should be applied to tool matching.
 */
export function getMultiIntentBoosts(result: MultiIntentResult): Map<string, number> {
  const boosts = new Map<string, number>();

  if (!result.primaryIntent) return boosts;

  // Primary intent gets full boost
  for (const domain of result.primaryIntent.domains) {
    boosts.set(domain, (boosts.get(domain) || 0) + 0.3);
  }

  // Secondary intents get partial boost
  for (const intent of result.secondaryIntents) {
    for (const domain of intent.domains) {
      boosts.set(domain, (boosts.get(domain) || 0) + 0.15);
    }
  }

  // Compound type adjustments
  if (result.compoundType === 'sequential') {
    // First intent's domains get extra boost for immediate execution
    if (result.allIntents.length > 0) {
      for (const domain of result.allIntents[0].domains) {
        boosts.set(domain, (boosts.get(domain) || 0) + 0.1);
      }
    }
  } else if (result.compoundType === 'parallel') {
    // All domains get even boost for parallel execution
    for (const intent of result.allIntents) {
      for (const domain of intent.domains) {
        boosts.set(domain, (boosts.get(domain) || 0) + 0.05);
      }
    }
  }

  return boosts;
}

/**
 * Check if a tool category matches any detected intent.
 */
export function matchesAnyIntent(result: MultiIntentResult, category: string): boolean {
  return result.suggestedToolCategories.includes(category);
}

/**
 * Get the intent that best matches a tool category.
 */
export function getBestMatchingIntent(
  result: MultiIntentResult,
  category: string
): DetectedIntent | null {
  for (const intent of result.allIntents) {
    if (intent.domains.includes(category)) {
      return intent;
    }
  }
  return null;
}
