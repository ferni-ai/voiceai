/**
 * Engagement Context Builder
 *
 * Integrates all engagement features into conversation context:
 * - Daily rituals
 * - Memory callbacks
 * - Team dynamics
 * - Seasonal events
 * - Persona evolution stories
 *
 * This is the "brain" that decides what engagement opportunities to surface.
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { UserProfile } from '../../types/user-profile.js';
import { getDailyRitualsService, PERSONA_RITUALS } from '../../services/daily-rituals.js';
import { getMemoryEngagementEngine, buildMemoryEngagementContext } from '../memory-engagement.js';
import { getTeamEngagementService } from '../../services/engagement/team-engagement.js';
import {
  registerContextBuilder,
  createStandardInjection,
  createHintInjection,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface EngagementContext {
  // What the persona should consider
  opportunities: EngagementOpportunity[];

  // Formatted for prompt injection
  promptAddition: string;

  // Metadata
  hasActiveRitual: boolean;
  hasMemoryCallback: boolean;
  hasSeasonalEvent: boolean;
  hasTeamHuddle: boolean;
  hasEvolutionStory: boolean;
}

export interface EngagementOpportunity {
  type:
    | 'daily_ritual'
    | 'memory_callback'
    | 'seasonal_event'
    | 'team_huddle'
    | 'persona_evolution'
    | 'cross_reference'
    | 'streak_at_risk'
    | 'anniversary'
    | 'prediction_due';
  priority: number; // 1-10
  content: string;
  personaId?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// ENGAGEMENT CONTEXT BUILDER
// ============================================================================

/**
 * Build complete engagement context for a conversation turn
 */
export async function buildEngagementContext(
  userId: string,
  profile: UserProfile | null,
  personaId: string,
  turnCount: number,
  options?: {
    includeRituals?: boolean;
    includeMemory?: boolean;
    includeTeam?: boolean;
    includeSeasonal?: boolean;
  }
): Promise<EngagementContext> {
  const {
    includeRituals = true,
    includeMemory = true,
    includeTeam = true,
    includeSeasonal = true,
  } = options || {};

  const opportunities: EngagementOpportunity[] = [];
  const sections: string[] = [];

  // 1. Check for daily rituals
  let hasActiveRitual = false;
  if (includeRituals && turnCount <= 3) {
    const ritualOpportunity = checkRitualOpportunity(userId, personaId);
    if (ritualOpportunity) {
      opportunities.push(ritualOpportunity);
      hasActiveRitual = true;
    }
  }

  // 2. Check for memory callbacks (mid-conversation)
  let hasMemoryCallback = false;
  if (includeMemory && profile) {
    const memoryContext = buildMemoryEngagementContext(profile, personaId, turnCount);
    if (memoryContext) {
      sections.push(memoryContext);
      hasMemoryCallback = true;
    }
  }

  // 3. Check for seasonal events (early in conversation)
  let hasSeasonalEvent = false;
  if (includeSeasonal && turnCount <= 2) {
    const seasonalOpportunity = checkSeasonalOpportunity(personaId);
    if (seasonalOpportunity) {
      opportunities.push(seasonalOpportunity);
      hasSeasonalEvent = true;
    }

    // Check for Ferniday
    const anniversaryOpportunity = checkAnniversaryOpportunity(profile, personaId);
    if (anniversaryOpportunity) {
      opportunities.push(anniversaryOpportunity);
      hasSeasonalEvent = true;
    }
  }

  // 4. Check for persona evolution stories (deeper in conversation)
  let hasEvolutionStory = false;
  if (includeTeam && turnCount >= 5 && profile) {
    const evolutionOpportunity = await checkEvolutionOpportunity(userId, profile, personaId);
    if (evolutionOpportunity) {
      opportunities.push(evolutionOpportunity);
      hasEvolutionStory = true;
    }
  }

  // 5. Check for team huddle opportunity (weekly/special occasions)
  let hasTeamHuddle = false;
  if (includeTeam && turnCount === 1 && profile && shouldOfferTeamHuddle(profile)) {
    opportunities.push({
      type: 'team_huddle',
      priority: 6,
      content: 'Consider offering a team huddle - the whole group checking in on user progress',
    });
    hasTeamHuddle = true;
  }

  // 6. Check for cross-persona reference opportunity
  if (includeTeam && turnCount >= 3 && Math.random() < 0.1) {
    const crossRef = checkCrossReferenceOpportunity(personaId);
    if (crossRef) {
      opportunities.push(crossRef);
    }
  }

  // 7. Check for streak-at-risk alerts
  if (includeRituals) {
    const streakAlert = checkStreakAtRisk(userId, personaId);
    if (streakAlert) {
      opportunities.push(streakAlert);
    }
  }

  // Sort opportunities by priority
  opportunities.sort((a, b) => b.priority - a.priority);

  // Build prompt addition
  if (opportunities.length > 0 || sections.length > 0) {
    sections.unshift('[ENGAGEMENT OPPORTUNITIES]');
    sections.push('');
    sections.push('Consider these engagement opportunities if they fit naturally:');

    for (const opp of opportunities.slice(0, 3)) {
      sections.push(`• [${opp.type}] (Priority ${opp.priority}/10): ${opp.content}`);
    }

    sections.push('');
    sections.push('Guidelines:');
    sections.push('- Only use if it feels natural to the conversation');
    sections.push("- User needs come first - don't force engagement");
    sections.push('- One engagement per conversation is usually enough');
    sections.push('- Make it feel genuine, not scripted');
  }

  getLogger().debug(
    {
      userId,
      personaId,
      turnCount,
      opportunities: opportunities.length,
      hasActiveRitual,
      hasMemoryCallback,
      hasSeasonalEvent,
    },
    'Built engagement context'
  );

  return {
    opportunities,
    promptAddition: sections.join('\n'),
    hasActiveRitual,
    hasMemoryCallback,
    hasSeasonalEvent,
    hasTeamHuddle,
    hasEvolutionStory,
  };
}

// ============================================================================
// OPPORTUNITY CHECKERS
// ============================================================================

function checkRitualOpportunity(userId: string, personaId: string): EngagementOpportunity | null {
  const service = getDailyRitualsService();

  // Find ritual for this persona
  const ritualId = Object.keys(PERSONA_RITUALS).find(
    (id) => PERSONA_RITUALS[id].personaId === personaId
  );

  if (!ritualId) return null;

  const ritual = PERSONA_RITUALS[ritualId];
  const dueRituals = service.getDueRituals(userId);

  if (dueRituals.some((r) => r.id === ritualId)) {
    return {
      type: 'daily_ritual',
      priority: 8,
      content: `Offer ${ritual.name} - "${ritual.description}"`,
      personaId,
      metadata: { ritualId },
    };
  }

  return null;
}

function checkSeasonalOpportunity(personaId: string): EngagementOpportunity | null {
  const service = getTeamEngagementService();
  const event = service.getActiveSeasonalEvent();

  if (!event) return null;

  const response = service.getSeasonalResponse(event, personaId);
  if (!response) return null;

  return {
    type: 'seasonal_event',
    priority: 7,
    content: `It's ${event.name}! Response: "${response}"`,
    personaId,
    metadata: { eventId: event.id },
  };
}

function checkAnniversaryOpportunity(
  profile: UserProfile | null,
  personaId: string
): EngagementOpportunity | null {
  if (!profile) return null;

  const service = getTeamEngagementService();
  const ferniday = service.checkFerniday(profile);

  if (ferniday) {
    return {
      type: 'anniversary',
      priority: 9,
      content: `Happy Ferniday! User anniversary with the team. Celebrate their journey.`,
      personaId,
      metadata: { anniversary: ferniday },
    };
  }

  return null;
}

async function checkEvolutionOpportunity(
  userId: string,
  profile: UserProfile | null,
  personaId: string
): Promise<EngagementOpportunity | null> {
  const service = getTeamEngagementService();
  const unlockedEvents = await service.getUnlockedEvolutions(userId, profile, personaId);

  if (unlockedEvents.length === 0) return null;

  // Random chance to share (don't share every time)
  if (Math.random() > 0.15) return null;

  const event = unlockedEvents[Math.floor(Math.random() * unlockedEvents.length)];
  if (!event) return null;

  return {
    type: 'persona_evolution',
    priority: 5,
    content: `Share personal update: "${event.title}" - ${event.description}`,
    personaId,
    metadata: { eventId: event.id },
  };
}

function checkCrossReferenceOpportunity(personaId: string): EngagementOpportunity | null {
  const service = getTeamEngagementService();
  const reference = service.getCrossPersonaReference(personaId);

  if (!reference) return null;

  return {
    type: 'cross_reference',
    priority: 3,
    content: `Naturally reference another team member: "${reference}"`,
    personaId,
  };
}

function checkStreakAtRisk(userId: string, personaId: string): EngagementOpportunity | null {
  const service = getDailyRitualsService();

  const ritualId = Object.keys(PERSONA_RITUALS).find(
    (id) => PERSONA_RITUALS[id].personaId === personaId
  );

  if (!ritualId) return null;

  if (service.shouldRemind(userId, ritualId)) {
    const profile = service.exportProfile(userId);
    const streak = profile?.streaks[ritualId];

    if (streak && streak.currentStreak >= 3) {
      return {
        type: 'streak_at_risk',
        priority: 7,
        content: `User has a ${streak.currentStreak}-day streak at risk! Gently encourage them.`,
        personaId,
        metadata: { streakDays: streak.currentStreak },
      };
    }
  }

  return null;
}

function shouldOfferTeamHuddle(profile: UserProfile | null): boolean {
  if (!profile) return false;

  // Offer weekly huddles for established relationships
  if (profile.relationshipStage === 'new_acquaintance') return false;

  // Check if it's been about a week since last major interaction
  const lastConvo = profile.lastContact ? new Date(profile.lastContact) : null;
  if (!lastConvo) return false;

  const daysSince = Math.floor((Date.now() - lastConvo.getTime()) / (1000 * 60 * 60 * 24));

  // Offer if it's been 5-10 days (natural weekly rhythm)
  return daysSince >= 5 && daysSince <= 10;
}

// ============================================================================
// GREETING ENHANCEMENT
// ============================================================================

/**
 * Enhance a standard greeting with engagement elements
 */
export async function enhanceGreetingWithEngagement(
  baseGreeting: string,
  userId: string,
  profile: UserProfile | null,
  personaId: string
): Promise<string> {
  const context = await buildEngagementContext(userId, profile, personaId, 1);

  if (context.opportunities.length === 0) {
    return baseGreeting;
  }

  // Get highest priority opportunity
  const topOpportunity = context.opportunities[0];

  switch (topOpportunity.type) {
    case 'seasonal_event':
      return `${topOpportunity.content.split('Response: "')[1]?.replace('"', '') || baseGreeting}`;

    case 'anniversary':
      return baseGreeting; // Let the persona handle anniversary naturally

    case 'daily_ritual':
      return baseGreeting; // Offer ritual after greeting

    default:
      return baseGreeting;
  }
}

// ============================================================================
// CONTEXT BUILDER WRAPPER
// ============================================================================

/**
 * Build engagement context as a context builder
 */
async function buildEngagementContextBuilder(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];
  const personaId = input.persona?.id;
  const userId = input.services.userId || input.services.sessionId;
  const turnCount = input.userData.turnCount || 1;

  if (!personaId) {
    return injections;
  }

  // Build engagement context
  const context = await buildEngagementContext(userId, input.userProfile, personaId, turnCount);

  // Add opportunities as injections
  if (context.opportunities.length > 0) {
    const topOpportunities = context.opportunities.slice(0, 2);

    for (const opp of topOpportunities) {
      if (opp.priority >= 7) {
        // High priority - standard injection
        injections.push(
          createStandardInjection('engagement', `[ENGAGEMENT: ${opp.type}] ${opp.content}`, {
            category: 'engagement',
            confidence: opp.priority / 10,
          })
        );
      } else {
        // Lower priority - hint
        injections.push(
          createHintInjection('engagement', `[ENGAGEMENT HINT: ${opp.type}] ${opp.content}`, {
            category: 'engagement',
            confidence: opp.priority / 10,
          })
        );
      }
    }
  }

  // Add memory callback context if present
  if (context.hasMemoryCallback && context.promptAddition) {
    injections.push(
      createHintInjection('engagement-memory', context.promptAddition, {
        category: 'engagement',
        confidence: 0.7,
      })
    );
  }

  return injections;
}

// ============================================================================
// REGISTRATION
// ============================================================================

registerContextBuilder({
  name: 'engagement',
  description: 'Daily rituals, games, team dynamics, memory callbacks, seasonal events',
  priority: 60, // Medium-high priority - adds engagement but yields to safety/emotional
  build: buildEngagementContextBuilder,
});

// ============================================================================
// EXPORTS
// ============================================================================

export default buildEngagementContext;
