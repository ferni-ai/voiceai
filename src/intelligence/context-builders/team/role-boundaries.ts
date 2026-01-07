/**
 * Role Boundary Enforcement Context Builder
 *
 * CRITICAL FIX: Actively detects when user asks about another persona's domain
 * and STRONGLY suggests handoff instead of answering.
 *
 * Problem solved: Ferni would answer finance questions, Maya would give life
 * advice, etc. because there was no enforcement of "stay in your lane."
 *
 * This builder:
 * 1. Detects domain violations in user's message
 * 2. Identifies the correct persona for the topic
 * 3. Injects STRONG guidance to hand off, not answer
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  createCriticalInjection,
  registerContextBuilder,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { isTeamMemberUnlocked } from './team-availability.js';

const log = createLogger({ module: 'RoleBoundaries' });

// ============================================================================
// DOMAIN DETECTION
// ============================================================================

interface DomainMatch {
  domain: string;
  owner: string;
  confidence: number;
  handoffTool: string;
  patterns: RegExp[];
}

/**
 * Domain ownership map - WHO owns WHAT
 */
const DOMAIN_OWNERSHIP: DomainMatch[] = [
  // PETER - Stock Research
  {
    domain: 'stock_research',
    owner: 'peter-john',
    handoffTool: 'handoffToPeter',
    confidence: 0.9,
    patterns: [
      /\b(stock|stocks|share|shares|ticker|NYSE|NASDAQ)\b/i,
      /\b(buy|sell|invest in)\s+(apple|google|tesla|amazon|microsoft|nvidia)/i,
      /\b(PE ratio|EPS|earnings|market cap|dividend)\b/i,
      /\b(analyze|research)\s+(this|that|a)?\s*(company|stock)/i,
      /\bten.?bagger\b/i,
      /\bwhat('s| is) (the )?(price|value) of/i,
    ],
  },

  // NAYAN - Investment Philosophy
  {
    domain: 'investment_philosophy',
    owner: 'nayan-patel',
    handoffTool: 'handoffToNayan',
    confidence: 0.85,
    patterns: [
      /\b(index fund|vanguard|passive invest|buy and hold)\b/i,
      /\bstay the course\b/i,
      /\b(long.?term|patient|compound)\s*(invest|growth|strategy)/i,
      /\b(market timing|time the market)\b/i,
      /\b(cost|expense) ratio\b/i,
    ],
  },

  // MAYA - Habits & Budgeting
  {
    domain: 'habits',
    owner: 'maya-santos',
    handoffTool: 'handoffToMaya',
    confidence: 0.9,
    patterns: [
      /\b(habit|habits|routine|routines)\b/i,
      /\b(track|tracking|streak|streaks)\b/i,
      /\b(budget|budgeting|spending|expenses)\b/i,
      /\b(savings|save money|saving money)\b/i,
      /\b(workout|exercise|meditation|sleep)\s*(habit|routine|schedule)/i,
      /\bsmall (win|wins|step|steps)\b/i,
      /\btiny habit\b/i,
    ],
  },

  // ALEX - Calendar & Communication
  {
    domain: 'calendar_communication',
    owner: 'alex-chen',
    handoffTool: 'handoffToAlex',
    confidence: 0.9,
    patterns: [
      /\b(schedule|scheduling|calendar|appointment)\b/i,
      /\b(email|draft|message|text|call)\s+(to|for|about)/i,
      /\b(send|write|compose)\s+(an?\s+)?(email|message|text)/i,
      /\b(meeting|meetings)\s+(with|for|about|at)/i,
      /\b(remind|reminder|reminders)\b/i,
      /\b(organize|plan)\s+(my )?(day|week|schedule)/i,
    ],
  },

  // JORDAN - Events & Celebrations
  {
    domain: 'events_celebrations',
    owner: 'jordan-taylor',
    handoffTool: 'handoffToJordan',
    confidence: 0.85,
    patterns: [
      /\b(party|parties|celebration|celebrate)\b/i,
      /\b(wedding|birthday|anniversary|graduation)\b/i,
      /\b(event|events)\s+(planning|plan|organize)/i,
      /\b(life('s)? firsts?|milestone|milestones)\b/i,
      /\b(baby shower|bridal shower|reception)\b/i,
      /\b(venue|catering|guest list)\b/i,
    ],
  },

  // FERNI - Life Coaching (default, but also explicit)
  {
    domain: 'life_coaching',
    owner: 'ferni',
    handoffTool: 'handoffToFerni',
    confidence: 0.8,
    patterns: [
      /\b(purpose|meaning|meaning of life)\b/i,
      /\b(relationship|relationships)\s+(advice|help|issue)/i,
      /\b(mental health|anxiety|depression|therapy)\b/i,
      /\bwho am i\b/i,
      /\bwhat (should|do) i do with my life\b/i,
      /\b(big|deep|hard) (question|questions|decision)\b/i,
    ],
  },
];

// ============================================================================
// BOUNDARY DETECTION
// ============================================================================

interface BoundaryViolation {
  domain: string;
  correctOwner: string;
  currentPersona: string;
  handoffTool: string;
  confidence: number;
}

/**
 * Detect if user message is asking about another persona's domain
 */
function detectBoundaryViolation(
  userText: string,
  currentPersonaId: string
): BoundaryViolation | null {
  const text = userText.toLowerCase();

  for (const domain of DOMAIN_OWNERSHIP) {
    // Skip if this IS the current persona's domain
    if (domain.owner === currentPersonaId) continue;

    // Check if any patterns match
    for (const pattern of domain.patterns) {
      if (pattern.test(text)) {
        return {
          domain: domain.domain,
          correctOwner: domain.owner,
          currentPersona: currentPersonaId,
          handoffTool: domain.handoffTool,
          confidence: domain.confidence,
        };
      }
    }
  }

  return null;
}

/**
 * Get display name for persona ID
 */
function getPersonaDisplayName(personaId: string): string {
  const names: Record<string, string> = {
    ferni: 'Ferni',
    'maya-santos': 'Maya',
    'alex-chen': 'Alex',
    'peter-john': 'Peter',
    'nayan-patel': 'Nayan',
    'jordan-taylor': 'Jordan',
  };
  return names[personaId] || personaId;
}

// ============================================================================
// ROLE BOUNDARY BUILDER
// ============================================================================

/**
 * Role Boundary Enforcement Context Builder
 */
const roleBoundaryBuilder: ContextBuilder = {
  name: 'role-boundaries',
  description: 'Detects domain violations and enforces handoffs',
  priority: 10, // Very early, right after identity

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { userText, persona, userProfile } = input;
    const injections: ContextInjection[] = [];

    const currentPersonaId = persona?.identity?.id || 'ferni';

    // Get subscription tier for unlock checking
    const tier: 'free' | 'friend' | 'partner' =
      (userProfile?.subscription?.tier as 'free' | 'friend' | 'partner') || 'free';

    // Detect boundary violation
    const violation = detectBoundaryViolation(userText, currentPersonaId);

    if (!violation) {
      return injections;
    }

    // Only enforce high-confidence violations
    if (violation.confidence < 0.8) {
      return injections;
    }

    // Check if the correct owner is unlocked
    const ownerUnlocked = isTeamMemberUnlocked(violation.correctOwner, userProfile, tier);

    const correctPersonaName = getPersonaDisplayName(violation.correctOwner);
    const currentPersonaName = getPersonaDisplayName(violation.currentPersona);

    // =========================================================================
    // CRITICAL: Strong guidance to hand off (or defer if locked)
    // =========================================================================
    let boundaryGuidance: string;

    if (ownerUnlocked) {
      // The correct persona is unlocked - suggest handoff
      boundaryGuidance = `[DOMAIN BOUNDARY VIOLATION DETECTED]
The user is asking about ${violation.domain.replace('_', ' ')} - this is ${correctPersonaName}'s specialty, NOT yours.

DO NOT try to answer this yourself. Instead:
1. Acknowledge briefly: "That's actually ${correctPersonaName}'s area..."
2. Offer handoff: "Want me to bring them in?" or "Should I get ${correctPersonaName}?"
3. Use tool: ${violation.handoffTool}

YOU ARE ${currentPersonaName}. Stay in your lane. ${correctPersonaName} handles this.`;
    } else {
      // The correct persona is NOT unlocked - don't mention them by name
      boundaryGuidance = `[DOMAIN OUTSIDE YOUR EXPERTISE]
The user is asking about ${violation.domain.replace('_', ' ')} - this isn't your specialty.

DO NOT try to be an expert on this. Instead:
1. Acknowledge: "That's actually an area where I have a friend who specializes..."
2. Be honest: "We'll need to get to know each other better before I can introduce you to them."
3. Offer what you CAN do: general support, listening, helping them think through the bigger picture

YOU ARE ${currentPersonaName}. You have teammates who could help with this, but the user hasn't met them yet. Don't name specific people they haven't been introduced to.`;
    }

    injections.push(
      createCriticalInjection('role_boundary_violation', boundaryGuidance, {
        category: 'boundary',
        confidence: violation.confidence,
      })
    );

    log.info(
      {
        domain: violation.domain,
        current: currentPersonaName,
        correct: correctPersonaName,
        confidence: violation.confidence,
        ownerUnlocked,
      },
      'Domain boundary violation detected'
    );

    return injections;
  },
};

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder(roleBoundaryBuilder);

export { detectBoundaryViolation, DOMAIN_OWNERSHIP, roleBoundaryBuilder, type BoundaryViolation };
