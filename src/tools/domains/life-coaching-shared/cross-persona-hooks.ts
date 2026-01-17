/**
 * Life Coaching Cross-Persona Hooks
 *
 * Integrates life coaching domains with the cross-persona intelligence system.
 * Enables personas to share life coaching insights during handoffs.
 *
 * INSIGHT FLOWS:
 * - Maya → Others: Boundary struggles, burnout signals, habit patterns
 * - Alex → Others: Social skill progress, dating readiness, communication growth
 * - Nayan → Others: Midlife reflections, trauma processing stage, emotional depth
 * - Jordan → Others: Life transition stage, breakup recovery phase, future plans
 *
 * @module tools/domains/life-coaching-shared/cross-persona-hooks
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getLifeCoachingProfile } from './user-profile.js';
import type { LifeCoachingProfile, FourTendency, EmotionalState } from './types.js';

const log = createLogger({ module: 'LifeCoachingCrossPersona' });

// ============================================================================
// TYPES
// ============================================================================

export type LifeCoachingPersona = 'maya' | 'alex' | 'nayan' | 'jordan' | 'ferni';

export interface LifeCoachingHandoffContext {
  domain: string;
  userStage: string;
  keyInsights: string[];
  safetyNotes: string[];
  suggestedApproach: string;
  tendencyAwareness?: {
    tendency: FourTendency;
    guidance: string;
  };
  emotionalState?: EmotionalState;
  progressHighlights?: string[];
}

export interface DomainHandoffInsight {
  fromDomain: string;
  toPersona: LifeCoachingPersona;
  insight: string;
  priority: 'high' | 'medium' | 'low';
  expiresInHours: number;
}

// ============================================================================
// DOMAIN → PERSONA ROUTING
// ============================================================================

/**
 * Which persona is best for each life coaching domain
 */
const DOMAIN_TO_PERSONA: Record<string, LifeCoachingPersona> = {
  // Maya's domains (habits, wellness, self-care)
  boundaries: 'maya',
  procrastination: 'maya',
  perfectionism: 'maya',
  'burnout-recovery': 'maya',
  'digital-wellness': 'maya',
  'body-relationship': 'maya',

  // Alex's domains (communication, social)
  'social-skills': 'alex',
  dating: 'alex',

  // Nayan's domains (wisdom, depth, healing)
  'trauma-support': 'nayan',
  intimacy: 'nayan',
  midlife: 'nayan',
  anger: 'nayan',
  'chronic-conditions': 'nayan',

  // Jordan's domains (life planning, transitions)
  'breakup-recovery': 'jordan',
  neurodiversity: 'jordan',
};

/**
 * Get the best persona for a life coaching domain
 */
export function getBestPersonaForDomain(domain: string): LifeCoachingPersona {
  return DOMAIN_TO_PERSONA[domain] || 'ferni';
}

// ============================================================================
// HANDOFF CONTEXT BUILDERS
// ============================================================================

/**
 * Build handoff context for boundaries domain
 */
async function buildBoundariesContext(
  userId: string,
  profile: LifeCoachingProfile
): Promise<LifeCoachingHandoffContext> {
  const keyInsights: string[] = [];
  const safetyNotes: string[] = [];

  // Check boundary history
  if (profile.boundaryHistory && profile.boundaryHistory.length > 0) {
    const maintained = profile.boundaryHistory.filter((b) => b.outcome === 'maintained').length;
    const total = profile.boundaryHistory.length;
    const rate = Math.round((maintained / total) * 100);

    if (rate < 50) {
      keyInsights.push(`Struggling with boundary maintenance (${rate}% success rate)`);
    } else {
      keyInsights.push(`Making progress with boundaries (${rate}% success rate)`);
    }

    // Check for patterns
    const personTypes = profile.boundaryHistory.map((b) => b.personType);
    const familyCount = personTypes.filter((t) => t === 'parent' || t === 'family').length;
    if (familyCount > total / 2) {
      keyInsights.push('Family boundaries are a particular challenge');
    }
  }

  return {
    domain: 'boundaries',
    userStage: profile.boundaryHistory?.length ? 'working' : 'exploring',
    keyInsights,
    safetyNotes,
    suggestedApproach: 'Gentle, validating approach - boundaries often trigger guilt',
    tendencyAwareness: profile.fourTendency
      ? {
          tendency: profile.fourTendency,
          guidance: getTendencyGuidanceForBoundaries(profile.fourTendency),
        }
      : undefined,
    emotionalState: profile.currentEmotionalState,
  };
}

/**
 * Build handoff context for trauma-support domain
 */
async function buildTraumaSupportContext(
  userId: string,
  profile: LifeCoachingProfile
): Promise<LifeCoachingHandoffContext> {
  return {
    domain: 'trauma-support',
    userStage: 'needs-assessment',
    keyInsights: ['High-sensitivity domain - proceed with extra care'],
    safetyNotes: [
      'Always assess readiness before deeper work',
      'Have grounding exercises ready',
      'Watch for dissociation signs',
    ],
    suggestedApproach: 'Slow, grounding presence. No rushing. Meet them exactly where they are.',
    emotionalState: profile.currentEmotionalState,
  };
}

/**
 * Build handoff context for anger domain
 */
async function buildAngerContext(
  userId: string,
  profile: LifeCoachingProfile
): Promise<LifeCoachingHandoffContext> {
  const keyInsights: string[] = [];

  if (profile.angerPatterns) {
    if (profile.angerPatterns.expression) {
      keyInsights.push(`Anger pattern: ${profile.angerPatterns.expression}`);
    }
    if (profile.angerPatterns.triggers && profile.angerPatterns.triggers.length > 0) {
      keyInsights.push(`Known triggers: ${profile.angerPatterns.triggers.slice(0, 3).join(', ')}`);
    }
  }

  return {
    domain: 'anger',
    userStage: profile.angerPatterns ? 'working' : 'exploring',
    keyInsights,
    safetyNotes: [
      "Validate the anger - it's information, not a flaw",
      'Watch for escalation signs',
    ],
    suggestedApproach:
      'Non-judgmental, normalizing. Anger is often protecting something vulnerable.',
    tendencyAwareness: profile.fourTendency
      ? {
          tendency: profile.fourTendency,
          guidance: getTendencyGuidanceForAnger(profile.fourTendency),
        }
      : undefined,
    emotionalState: profile.currentEmotionalState,
  };
}

/**
 * Build generic life coaching handoff context
 */
async function buildGenericContext(
  userId: string,
  domain: string,
  profile: LifeCoachingProfile
): Promise<LifeCoachingHandoffContext> {
  return {
    domain,
    userStage: 'exploring',
    keyInsights: [],
    safetyNotes: [],
    suggestedApproach: 'Curious, supportive, non-judgmental',
    tendencyAwareness: profile.fourTendency
      ? {
          tendency: profile.fourTendency,
          guidance: `User resonates with ${profile.fourTendency} patterns`,
        }
      : undefined,
    emotionalState: profile.currentEmotionalState,
  };
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Build handoff context when transitioning between life coaching domains
 */
export async function buildLifeCoachingHandoffContext(
  userId: string,
  fromDomain: string,
  toPersona: LifeCoachingPersona
): Promise<LifeCoachingHandoffContext> {
  const profile = await getLifeCoachingProfile(userId);

  // Domain-specific context builders
  switch (fromDomain) {
    case 'boundaries':
      return buildBoundariesContext(userId, profile);
    case 'trauma-support':
      return buildTraumaSupportContext(userId, profile);
    case 'anger':
      return buildAngerContext(userId, profile);
    default:
      return buildGenericContext(userId, fromDomain, profile);
  }
}

/**
 * Generate insights to share during cross-persona handoffs
 */
export async function generateHandoffInsights(
  userId: string,
  fromDomain: string,
  toPersona: LifeCoachingPersona
): Promise<DomainHandoffInsight[]> {
  const profile = await getLifeCoachingProfile(userId);
  const insights: DomainHandoffInsight[] = [];

  // Four Tendencies insight
  if (profile.fourTendency) {
    insights.push({
      fromDomain,
      toPersona,
      insight: `User resonates with ${profile.fourTendency} patterns - ${getTendencyBrief(profile.fourTendency)}`,
      priority: 'high',
      expiresInHours: 24,
    });
  }

  // Progress insight
  if (profile.totalLifeCoachingInteractions > 10) {
    insights.push({
      fromDomain,
      toPersona,
      insight: `User has ${profile.totalLifeCoachingInteractions} life coaching interactions - invested in growth`,
      priority: 'medium',
      expiresInHours: 48,
    });
  }

  // Emotional state insight
  if (profile.currentEmotionalState && profile.currentEmotionalState !== 'neutral') {
    insights.push({
      fromDomain,
      toPersona,
      insight: `Current emotional state: ${profile.currentEmotionalState}`,
      priority: 'high',
      expiresInHours: 1,
    });
  }

  log.debug(
    { userId, fromDomain, toPersona, insightCount: insights.length },
    'Generated handoff insights'
  );

  return insights;
}

/**
 * Format handoff context as human-readable briefing
 */
export function formatHandoffBriefing(context: LifeCoachingHandoffContext): string {
  let briefing = `## Life Coaching Context\n\n`;
  briefing += `**Domain:** ${context.domain}\n`;
  briefing += `**Stage:** ${context.userStage}\n\n`;

  if (context.keyInsights.length > 0) {
    briefing += `**Key Insights:**\n`;
    for (const insight of context.keyInsights) {
      briefing += `- ${insight}\n`;
    }
    briefing += '\n';
  }

  if (context.safetyNotes.length > 0) {
    briefing += `**Safety Notes:**\n`;
    for (const note of context.safetyNotes) {
      briefing += `- ⚠️ ${note}\n`;
    }
    briefing += '\n';
  }

  if (context.tendencyAwareness) {
    briefing += `**Four Tendencies:** ${context.tendencyAwareness.tendency}\n`;
    briefing += `${context.tendencyAwareness.guidance}\n\n`;
  }

  briefing += `**Suggested Approach:** ${context.suggestedApproach}\n`;

  return briefing;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getTendencyGuidanceForBoundaries(tendency: FourTendency): string {
  const guidance: Record<FourTendency, string> = {
    upholder: 'Frame boundaries as commitments to self - they value keeping promises',
    questioner: 'Explain WHY the boundary matters - they need logical reasoning',
    obliger: 'External accountability helps - "I\'ll check in on this"',
    rebel: 'Frame as choice and identity - "This is who you are"',
  };
  return guidance[tendency];
}

function getTendencyGuidanceForAnger(tendency: FourTendency): string {
  const guidance: Record<FourTendency, string> = {
    upholder: 'Anger may come from unmet expectations - explore those',
    questioner: 'Help them understand the WHY behind their anger',
    obliger: 'Anger often comes from over-giving - explore boundaries',
    rebel: 'Validate their sense of injustice - they hate being controlled',
  };
  return guidance[tendency];
}

function getTendencyBrief(tendency: FourTendency): string {
  const briefs: Record<FourTendency, string> = {
    upholder: 'responds well to commitments and structure',
    questioner: 'needs clear reasoning and evidence',
    obliger: 'thrives with external accountability',
    rebel: 'needs choice and identity-based framing',
  };
  return briefs[tendency];
}

// Types are already exported with their interface definitions above
