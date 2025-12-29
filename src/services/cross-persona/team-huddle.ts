/**
 * Team Huddle Intelligence - Cross-Persona Coordination
 *
 * > "Six brilliant minds. One conversation. Coordinated care."
 *
 * This is the "Better than Human" brain that makes the team work together.
 * Human support networks don't coordinate - your therapist doesn't talk to
 * your coach who doesn't talk to your friend. Ferni's team DOES.
 *
 * The Team Huddle:
 * 1. Gathers observations from all personas
 * 2. Identifies patterns across domains
 * 3. Coordinates handoffs and referrals
 * 4. Synthesizes a unified understanding
 * 5. Triggers proactive team interventions
 *
 * Example Flow:
 * - Maya notices: "Sleep habits declining for 2 weeks"
 * - Peter notices: "Stress mentions up 40%"
 * - Jordan notices: "No exercise in calendar for 10 days"
 * - Team Huddle synthesizes: "User may be in a stress-sleep-exercise spiral"
 * - Ferni receives: "Your team has noticed something. Want to explore it together?"
 *
 * @module services/cross-persona/team-huddle
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getPersonaDisplayName } from '../../personas/voice-registry.js';

const log = createLogger({ module: 'TeamHuddle' });

// ============================================================================
// TYPES
// ============================================================================

export type PersonaId = 'ferni' | 'peter' | 'maya' | 'jordan' | 'alex' | 'nayan';

export interface PersonaObservation {
  personaId: PersonaId;
  observationType: 'pattern' | 'concern' | 'opportunity' | 'milestone' | 'insight';
  content: string;
  confidence: number;
  detectedAt: Date;
  domain: string;
  relatedTopics?: string[];
  suggestedAction?: string;
}

export interface CrossDomainConnection {
  /** First observation */
  observation1: PersonaObservation;
  /** Second observation */
  observation2: PersonaObservation;
  /** How they're connected */
  connectionType: 'causal' | 'correlated' | 'temporal' | 'thematic';
  /** Synthesized insight */
  synthesis: string;
  /** Combined confidence */
  confidence: number;
}

export interface TeamHuddleSummary {
  /** When this huddle was generated */
  generatedAt: Date;
  /** All active observations from the team */
  observations: PersonaObservation[];
  /** Cross-domain connections identified */
  connections: CrossDomainConnection[];
  /** Unified understanding / synthesis */
  synthesis: string;
  /** Recommended actions for Ferni */
  recommendations: TeamRecommendation[];
  /** Overall user state assessment */
  userStateAssessment: UserStateAssessment;
}

export interface TeamRecommendation {
  type: 'handoff' | 'mention' | 'coordinate' | 'proactive_outreach';
  targetPersona?: PersonaId;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  suggestedApproach: string;
  /** If true, Ferni should mention "the team noticed something" */
  shouldMentionTeam: boolean;
}

export interface UserStateAssessment {
  /** Overall wellbeing estimate (0-1) */
  wellbeing: number;
  /** Key areas of concern */
  concerns: string[];
  /** Areas of strength/growth */
  strengths: string[];
  /** Current life chapter/theme */
  currentTheme: string;
  /** Trajectory: improving, stable, declining */
  trajectory: 'improving' | 'stable' | 'declining';
}

// ============================================================================
// IN-MEMORY OBSERVATION STORE
// ============================================================================

/** Store observations per user */
const userObservations = new Map<string, PersonaObservation[]>();

/** Max observations to keep per user */
const MAX_OBSERVATIONS_PER_USER = 50;

/** Observation expiry time (7 days) */
const OBSERVATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ============================================================================
// OBSERVATION COLLECTION
// ============================================================================

/**
 * Record an observation from a persona.
 * Call this whenever a persona notices something significant.
 */
export function recordObservation(
  userId: string,
  observation: Omit<PersonaObservation, 'detectedAt'>
): void {
  const fullObservation: PersonaObservation = {
    ...observation,
    detectedAt: new Date(),
  };

  let observations = userObservations.get(userId) || [];

  // Add new observation
  observations.push(fullObservation);

  // Prune old observations
  const cutoff = Date.now() - OBSERVATION_TTL_MS;
  observations = observations.filter(
    (obs) => obs.detectedAt.getTime() > cutoff
  );

  // Keep within limit
  if (observations.length > MAX_OBSERVATIONS_PER_USER) {
    observations = observations.slice(-MAX_OBSERVATIONS_PER_USER);
  }

  userObservations.set(userId, observations);

  log.debug(
    {
      userId,
      persona: observation.personaId,
      type: observation.observationType,
      domain: observation.domain,
    },
    '📋 Team observation recorded'
  );
}

/**
 * Get all recent observations for a user.
 */
export function getObservations(userId: string): PersonaObservation[] {
  const observations = userObservations.get(userId) || [];

  // Filter out expired
  const cutoff = Date.now() - OBSERVATION_TTL_MS;
  return observations.filter((obs) => obs.detectedAt.getTime() > cutoff);
}

/**
 * Clear all observations for a user (primarily for testing).
 */
export function clearObservations(userId: string): void {
  userObservations.delete(userId);
}

// ============================================================================
// CROSS-DOMAIN CONNECTION DETECTION
// ============================================================================

/**
 * Detect connections between observations from different personas.
 * This is the "superhuman" part - seeing patterns humans can't.
 */
function detectConnections(
  observations: PersonaObservation[]
): CrossDomainConnection[] {
  const connections: CrossDomainConnection[] = [];

  // Group by persona
  const byPersona = new Map<PersonaId, PersonaObservation[]>();
  for (const obs of observations) {
    const arr = byPersona.get(obs.personaId) || [];
    arr.push(obs);
    byPersona.set(obs.personaId, arr);
  }

  // Look for cross-persona patterns
  const personas = Array.from(byPersona.keys());

  for (let i = 0; i < personas.length; i++) {
    for (let j = i + 1; j < personas.length; j++) {
      const persona1Obs = byPersona.get(personas[i]) || [];
      const persona2Obs = byPersona.get(personas[j]) || [];

      // Check each pair for connections
      for (const obs1 of persona1Obs) {
        for (const obs2 of persona2Obs) {
          const connection = findConnection(obs1, obs2);
          if (connection) {
            connections.push(connection);
          }
        }
      }
    }
  }

  // Sort by confidence
  connections.sort((a, b) => b.confidence - a.confidence);

  return connections.slice(0, 10); // Top 10 connections
}

/**
 * Check if two observations are connected.
 */
function findConnection(
  obs1: PersonaObservation,
  obs2: PersonaObservation
): CrossDomainConnection | null {
  // Same topic connection
  const sharedTopics = (obs1.relatedTopics || []).filter((t) =>
    (obs2.relatedTopics || []).includes(t)
  );

  if (sharedTopics.length > 0) {
    return {
      observation1: obs1,
      observation2: obs2,
      connectionType: 'thematic',
      synthesis: `${getPersonaDisplayName(obs1.personaId)} and ${getPersonaDisplayName(obs2.personaId)} both noticed patterns related to ${sharedTopics[0]}.`,
      confidence: Math.min(obs1.confidence, obs2.confidence) * 0.9,
    };
  }

  // Temporal connection (both happened around same time)
  const timeDiff = Math.abs(
    obs1.detectedAt.getTime() - obs2.detectedAt.getTime()
  );
  if (timeDiff < 24 * 60 * 60 * 1000) {
    // Within 24 hours
    // Check for known causal patterns
    const causalPattern = detectCausalPattern(obs1, obs2);
    if (causalPattern) {
      return causalPattern;
    }
  }

  return null;
}

/**
 * Detect known causal patterns between domains.
 */
function detectCausalPattern(
  obs1: PersonaObservation,
  obs2: PersonaObservation
): CrossDomainConnection | null {
  // Known patterns (domain1 → domain2)
  const patterns: Array<{
    domain1: string;
    domain2: string;
    keywords1: string[];
    keywords2: string[];
    synthesis: string;
  }> = [
    {
      domain1: 'habits',
      domain2: 'research',
      keywords1: ['sleep', 'rest', 'tired'],
      keywords2: ['stress', 'anxiety', 'overwhelmed'],
      synthesis: 'Sleep disruption and stress often feed each other. Addressing one may help the other.',
    },
    {
      domain1: 'habits',
      domain2: 'milestones',
      keywords1: ['exercise', 'activity', 'workout'],
      keywords2: ['energy', 'motivation', 'productivity'],
      synthesis: 'Physical activity patterns are connected to energy and goal progress.',
    },
    {
      domain1: 'research',
      domain2: 'communication',
      keywords1: ['work', 'career', 'job'],
      keywords2: ['boundaries', 'schedule', 'calendar'],
      synthesis: 'Work stress may be connected to boundary/scheduling challenges.',
    },
    {
      domain1: 'milestones',
      domain2: 'wisdom',
      keywords1: ['goal', 'deadline', 'achievement'],
      keywords2: ['purpose', 'meaning', 'direction'],
      synthesis: 'Goals and purpose alignment are interconnected.',
    },
  ];

  for (const pattern of patterns) {
    const obs1Match =
      obs1.domain === pattern.domain1 &&
      pattern.keywords1.some((kw) =>
        obs1.content.toLowerCase().includes(kw)
      );
    const obs2Match =
      obs2.domain === pattern.domain2 &&
      pattern.keywords2.some((kw) =>
        obs2.content.toLowerCase().includes(kw)
      );

    if (obs1Match && obs2Match) {
      return {
        observation1: obs1,
        observation2: obs2,
        connectionType: 'causal',
        synthesis: pattern.synthesis,
        confidence: Math.min(obs1.confidence, obs2.confidence),
      };
    }

    // Check reverse
    const obs1MatchRev =
      obs1.domain === pattern.domain2 &&
      pattern.keywords2.some((kw) =>
        obs1.content.toLowerCase().includes(kw)
      );
    const obs2MatchRev =
      obs2.domain === pattern.domain1 &&
      pattern.keywords1.some((kw) =>
        obs2.content.toLowerCase().includes(kw)
      );

    if (obs1MatchRev && obs2MatchRev) {
      return {
        observation1: obs2,
        observation2: obs1,
        connectionType: 'causal',
        synthesis: pattern.synthesis,
        confidence: Math.min(obs1.confidence, obs2.confidence),
      };
    }
  }

  return null;
}

// ============================================================================
// SYNTHESIS & RECOMMENDATIONS
// ============================================================================

/**
 * Generate a unified synthesis from observations and connections.
 */
function synthesizeInsights(
  observations: PersonaObservation[],
  connections: CrossDomainConnection[]
): string {
  if (observations.length === 0) {
    return 'The team is still getting to know this user.';
  }

  const parts: string[] = [];

  // Count by observation type
  const concerns = observations.filter((o) => o.observationType === 'concern');
  const opportunities = observations.filter((o) => o.observationType === 'opportunity');
  const patterns = observations.filter((o) => o.observationType === 'pattern');

  if (concerns.length > 0) {
    parts.push(`The team has ${concerns.length} active concern${concerns.length > 1 ? 's' : ''}.`);
  }

  if (connections.length > 0) {
    parts.push(`${connections.length} cross-domain connection${connections.length > 1 ? 's' : ''} detected.`);
  }

  if (opportunities.length > 0) {
    parts.push(`${opportunities.length} growth opportunit${opportunities.length > 1 ? 'ies' : 'y'} identified.`);
  }

  // Add top connection insight
  if (connections.length > 0) {
    parts.push(`Key insight: ${connections[0].synthesis}`);
  }

  return parts.join(' ');
}

/**
 * Generate recommendations based on team observations.
 */
function generateRecommendations(
  observations: PersonaObservation[],
  connections: CrossDomainConnection[]
): TeamRecommendation[] {
  const recommendations: TeamRecommendation[] = [];

  // High-confidence concerns → Proactive mention
  const highConfidenceConcerns = observations.filter(
    (o) => o.observationType === 'concern' && o.confidence > 0.7
  );

  if (highConfidenceConcerns.length > 0) {
    const mostUrgent = highConfidenceConcerns[0];
    recommendations.push({
      type: 'mention',
      reason: `${getPersonaDisplayName(mostUrgent.personaId)} noticed: ${mostUrgent.content}`,
      priority: 'high',
      suggestedApproach: `Naturally bring up: "I've been thinking about what ${getPersonaDisplayName(mostUrgent.personaId).split(' ')[0]} mentioned..."`,
      shouldMentionTeam: true,
    });
  }

  // Cross-domain connections → Suggest coordination
  if (connections.length > 0) {
    const topConnection = connections[0];
    const personas = [
      topConnection.observation1.personaId,
      topConnection.observation2.personaId,
    ];

    recommendations.push({
      type: 'coordinate',
      targetPersona: personas[0],
      reason: topConnection.synthesis,
      priority: 'medium',
      suggestedApproach: `Consider: "I've noticed something ${getPersonaDisplayName(personas[0]).split(' ')[0]} and ${getPersonaDisplayName(personas[1]).split(' ')[0]} both picked up on..."`,
      shouldMentionTeam: true,
    });
  }

  // Opportunities → Suggest handoff
  const opportunities = observations.filter(
    (o) => o.observationType === 'opportunity' && o.confidence > 0.6
  );

  for (const opp of opportunities.slice(0, 2)) {
    if (opp.personaId !== 'ferni') {
      recommendations.push({
        type: 'handoff',
        targetPersona: opp.personaId,
        reason: opp.content,
        priority: 'low',
        suggestedApproach: opp.suggestedAction || `Would you like to talk to ${getPersonaDisplayName(opp.personaId)}?`,
        shouldMentionTeam: false,
      });
    }
  }

  return recommendations;
}

/**
 * Assess overall user state from observations.
 */
function assessUserState(
  observations: PersonaObservation[],
  connections: CrossDomainConnection[]
): UserStateAssessment {
  // Count positive vs negative observations
  const concerns = observations.filter((o) => o.observationType === 'concern');
  const opportunities = observations.filter(
    (o) => o.observationType === 'opportunity' || o.observationType === 'milestone'
  );

  // Calculate wellbeing estimate
  const totalObs = observations.length || 1;
  const wellbeing = Math.max(
    0.2,
    Math.min(0.9, 0.5 + (opportunities.length - concerns.length) / totalObs * 0.3)
  );

  // Extract concerns and strengths
  const concernTexts = concerns.map((c) => c.content).slice(0, 3);
  const strengthTexts = opportunities.map((o) => o.content).slice(0, 3);

  // Determine trajectory
  const recentObs = observations.filter(
    (o) => Date.now() - o.detectedAt.getTime() < 3 * 24 * 60 * 60 * 1000
  );
  const recentConcerns = recentObs.filter((o) => o.observationType === 'concern').length;
  const olderConcerns = concerns.length - recentConcerns;

  let trajectory: 'improving' | 'stable' | 'declining' = 'stable';
  if (recentConcerns > olderConcerns) {
    trajectory = 'declining';
  } else if (recentConcerns < olderConcerns) {
    trajectory = 'improving';
  }

  // Determine theme from most common domains
  const domains = observations.map((o) => o.domain);
  const domainCounts = new Map<string, number>();
  for (const d of domains) {
    domainCounts.set(d, (domainCounts.get(d) || 0) + 1);
  }
  const topDomain = Array.from(domainCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'general';

  return {
    wellbeing,
    concerns: concernTexts,
    strengths: strengthTexts,
    currentTheme: topDomain,
    trajectory,
  };
}

// ============================================================================
// MAIN HUDDLE FUNCTION
// ============================================================================

/**
 * Generate a Team Huddle summary for a user.
 * Call this before starting a conversation to give Ferni the full picture.
 */
export async function generateTeamHuddle(userId: string): Promise<TeamHuddleSummary> {
  const observations = getObservations(userId);
  const connections = detectConnections(observations);
  const synthesis = synthesizeInsights(observations, connections);
  const recommendations = generateRecommendations(observations, connections);
  const userStateAssessment = assessUserState(observations, connections);

  const summary: TeamHuddleSummary = {
    generatedAt: new Date(),
    observations,
    connections,
    synthesis,
    recommendations,
    userStateAssessment,
  };

  log.info(
    {
      userId,
      observationCount: observations.length,
      connectionCount: connections.length,
      recommendationCount: recommendations.length,
      wellbeing: userStateAssessment.wellbeing,
      trajectory: userStateAssessment.trajectory,
    },
    '🤝 Team Huddle generated'
  );

  return summary;
}

// ============================================================================
// CONTEXT FORMATTING FOR LLM
// ============================================================================

/**
 * Format Team Huddle for injection into Ferni's context.
 */
export function formatTeamHuddleForLLM(huddle: TeamHuddleSummary): string {
  const lines: string[] = [];

  lines.push('[TEAM HUDDLE - What Your Team Has Noticed]');
  lines.push('');

  // User state
  const state = huddle.userStateAssessment;
  lines.push(`User wellbeing: ${(state.wellbeing * 100).toFixed(0)}% | Trajectory: ${state.trajectory}`);
  if (state.concerns.length > 0) {
    lines.push(`Areas of concern: ${state.concerns.join('; ')}`);
  }
  if (state.strengths.length > 0) {
    lines.push(`Areas of strength: ${state.strengths.join('; ')}`);
  }
  lines.push('');

  // Synthesis
  lines.push(`Team synthesis: ${huddle.synthesis}`);
  lines.push('');

  // Top recommendations
  if (huddle.recommendations.length > 0) {
    lines.push('Suggested approaches:');
    for (const rec of huddle.recommendations.slice(0, 3)) {
      const prefix = rec.priority === 'high' || rec.priority === 'urgent' ? '⚠️' : '💡';
      lines.push(`${prefix} ${rec.suggestedApproach}`);
    }
    lines.push('');
  }

  // Key connections
  if (huddle.connections.length > 0) {
    lines.push('Cross-domain insight to weave in naturally:');
    lines.push(`"${huddle.connections[0].synthesis}"`);
    lines.push('');
  }

  // Guidance
  lines.push('GUIDANCE:');
  lines.push('- You can reference team insights naturally: "I was talking with Maya about..." or "Peter mentioned..."');
  lines.push('- Don\'t list observations - weave them into conversation');
  lines.push('- If trajectory is declining, show extra care');
  lines.push('- Cross-domain insights make you seem wise, not surveillance-y');

  return lines.join('\n');
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export {
  getObservations as getTeamObservations,
  recordObservation as recordTeamObservation,
};
