/**
 * Persona Tool Router
 *
 * Routes tool requests to the correct persona based on query intent.
 * Each persona has specialty domains they handle best.
 *
 * When FTIS detects a query that matches a non-Ferni persona specialty,
 * it can either:
 * 1. Suggest a handoff to that persona
 * 2. Execute the tool with cross-persona context
 *
 * @module tools/intelligence/persona-tool-router
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PersonaToolRouter' });

// ============================================================================
// TYPES
// ============================================================================

export type PersonaId = 'ferni' | 'maya' | 'peter' | 'alex' | 'jordan' | 'nayan';

export interface PersonaSpecialty {
  /** Persona identifier */
  personaId: PersonaId;
  /** Display name */
  name: string;
  /** Specialty domains this persona handles */
  domains: string[];
  /** Keywords that indicate this persona's specialty */
  keywords: string[];
  /** Confidence threshold for handoff suggestion */
  handoffThreshold: number;
}

export interface PersonaRoutingDecision {
  /** Recommended persona for this query */
  recommendedPersona: PersonaId;
  /** Current persona */
  currentPersona: PersonaId;
  /** Whether to suggest a handoff */
  suggestHandoff: boolean;
  /** Confidence in the recommendation */
  confidence: number;
  /** Matched specialty domain */
  matchedDomain?: string;
  /** Reason for the recommendation */
  reason: string;
}

// ============================================================================
// PERSONA SPECIALTIES
// ============================================================================

/**
 * Persona-specific tool domain mappings.
 * 
 * Each persona has domains they're most effective at handling.
 */
const PERSONA_SPECIALTIES: PersonaSpecialty[] = [
  {
    personaId: 'ferni',
    name: 'Ferni',
    domains: [
      'general-coaching',
      'daily-support',
      'crisis',
      'telephony',
      'music',
      'weather',
      'entertainment',
      'games',
    ],
    keywords: [
      'talk',
      'chat',
      'help',
      'support',
      'listen',
      'feeling',
      'play music',
      'call',
      'phone',
    ],
    handoffThreshold: 0.8, // High threshold - Ferni is the default
  },
  {
    personaId: 'maya',
    name: 'Maya',
    domains: [
      'habits',
      'habit-coaching',
      'habit-intelligence',
      'habit-persistence',
      'routines',
      'productivity',
      'budgeting',
      'finance',
      'wellness',
      'health',
      'sleep',
      'burnout-recovery',
    ],
    keywords: [
      'habit',
      'routine',
      'morning',
      'evening',
      'workout',
      'exercise',
      'budget',
      'savings',
      'sleep',
      'energy',
      'burnout',
      'wellness',
      'health',
      'track',
      'streak',
    ],
    handoffThreshold: 0.7,
  },
  {
    personaId: 'peter',
    name: 'Peter',
    domains: [
      'research',
      'finance',
      'stocks',
      'investing',
      'analysis',
      'data',
      'news',
      'information',
      'learning',
      'books',
    ],
    keywords: [
      'research',
      'analyze',
      'data',
      'stock',
      'investment',
      'market',
      'learn',
      'study',
      'book',
      'news',
      'deep dive',
      'investigate',
    ],
    handoffThreshold: 0.7,
  },
  {
    personaId: 'alex',
    name: 'Alex',
    domains: [
      'calendar',
      'scheduling',
      'email-intelligence',
      'communication',
      'productivity',
      'tasks',
      'reminders',
      'contacts',
    ],
    keywords: [
      'schedule',
      'calendar',
      'meeting',
      'appointment',
      'email',
      'message',
      'task',
      'todo',
      'reminder',
      'contact',
      'busy',
      'availability',
    ],
    handoffThreshold: 0.7,
  },
  {
    personaId: 'jordan',
    name: 'Jordan',
    domains: [
      'events',
      'milestones',
      'celebrations',
      'birthdays',
      'anniversaries',
      'travel',
      'social-events',
      'party',
      'gift',
    ],
    keywords: [
      'event',
      'party',
      'celebration',
      'birthday',
      'anniversary',
      'milestone',
      'travel',
      'trip',
      'vacation',
      'plan',
      'gift',
      'surprise',
    ],
    handoffThreshold: 0.7,
  },
  {
    personaId: 'nayan',
    name: 'Nayan',
    domains: [
      'wisdom',
      'meaning',
      'purpose',
      'philosophy',
      'spirituality',
      'life-planning',
      'life-thesis',
      'timeless-perspective',
      'grief',
      'loss',
    ],
    keywords: [
      'meaning',
      'purpose',
      'wisdom',
      'philosophy',
      'life',
      'values',
      'spiritual',
      'grief',
      'loss',
      'legacy',
      'mortality',
      'existence',
    ],
    handoffThreshold: 0.7,
  },
];

// ============================================================================
// ROUTING FUNCTIONS
// ============================================================================

/**
 * Route a query to the most appropriate persona.
 *
 * @param query - User's query
 * @param currentPersona - Currently active persona
 * @param detectedDomain - Domain detected by FTIS (optional)
 * @returns Routing decision with persona recommendation
 */
export function routeToPersona(
  query: string,
  currentPersona: PersonaId = 'ferni',
  detectedDomain?: string
): PersonaRoutingDecision {
  const queryLower = query.toLowerCase();

  // Score each persona based on query and domain match
  const scores: Array<{ persona: PersonaSpecialty; score: number; reason: string }> = [];

  for (const specialty of PERSONA_SPECIALTIES) {
    let score = 0;
    let reason = '';

    // Domain match (highest priority)
    if (detectedDomain && specialty.domains.includes(detectedDomain)) {
      score += 0.5;
      reason = `Domain match: ${detectedDomain}`;
    }

    // Keyword matches
    const matchedKeywords = specialty.keywords.filter((kw) =>
      queryLower.includes(kw.toLowerCase())
    );
    if (matchedKeywords.length > 0) {
      score += Math.min(matchedKeywords.length * 0.15, 0.45);
      reason = reason
        ? `${reason}, keywords: ${matchedKeywords.slice(0, 3).join(', ')}`
        : `Keywords: ${matchedKeywords.slice(0, 3).join(', ')}`;
    }

    // Bonus for current persona (small preference for staying)
    if (specialty.personaId === currentPersona) {
      score += 0.1;
      reason = reason ? `${reason} (current)` : 'Current persona';
    }

    scores.push({ persona: specialty, score, reason });
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  const topMatch = scores[0];
  const secondMatch = scores[1];

  // Determine if we should suggest a handoff
  const shouldHandoff =
    topMatch.persona.personaId !== currentPersona &&
    topMatch.score >= topMatch.persona.handoffThreshold &&
    topMatch.score - (secondMatch?.score || 0) > 0.15;

  log.debug(
    {
      query: query.substring(0, 50),
      currentPersona,
      recommended: topMatch.persona.personaId,
      score: topMatch.score,
      shouldHandoff,
    },
    'Persona routing decision'
  );

  return {
    recommendedPersona: topMatch.persona.personaId,
    currentPersona,
    suggestHandoff: shouldHandoff,
    confidence: topMatch.score,
    matchedDomain: detectedDomain,
    reason: topMatch.reason || 'Default routing',
  };
}

/**
 * Get the specialty domains for a persona.
 */
export function getPersonaDomains(personaId: PersonaId): string[] {
  const specialty = PERSONA_SPECIALTIES.find((s) => s.personaId === personaId);
  return specialty?.domains || [];
}

/**
 * Get all specialty information for a persona.
 */
export function getPersonaSpecialty(personaId: PersonaId): PersonaSpecialty | undefined {
  return PERSONA_SPECIALTIES.find((s) => s.personaId === personaId);
}

/**
 * Check if a domain is a specialty for a specific persona.
 */
export function isDomainSpecialty(domain: string, personaId: PersonaId): boolean {
  const specialty = PERSONA_SPECIALTIES.find((s) => s.personaId === personaId);
  return specialty?.domains.includes(domain) || false;
}

/**
 * Get the best persona for a specific domain.
 */
export function getBestPersonaForDomain(domain: string): PersonaId {
  for (const specialty of PERSONA_SPECIALTIES) {
    if (specialty.domains.includes(domain)) {
      return specialty.personaId;
    }
  }
  return 'ferni'; // Default to Ferni
}

/**
 * Get handoff suggestion if the query should be handled by another persona.
 *
 * Returns null if no handoff is needed.
 */
export function getHandoffSuggestion(
  query: string,
  currentPersona: PersonaId,
  detectedDomain?: string
): { targetPersona: PersonaId; reason: string } | null {
  const decision = routeToPersona(query, currentPersona, detectedDomain);

  if (decision.suggestHandoff) {
    return {
      targetPersona: decision.recommendedPersona,
      reason: decision.reason,
    };
  }

  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { PERSONA_SPECIALTIES };
