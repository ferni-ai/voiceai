/**
 * Trajectory-Aware Routing Boost
 *
 * Uses emotional trajectory data from semantic intelligence to boost relevant tools.
 * "Rising stress" trajectory → boost capacity/burnout tools
 * "Falling mood" trajectory → boost depression/support tools
 *
 * @module tools/semantic-router/trajectory-routing-boost
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'TrajectoryRoutingBoost' });

// ============================================================================
// LOCAL TYPES (to avoid coupling to main router types)
// ============================================================================

interface ScoredToolMatch {
  toolId: string;
  score: number;
  domain?: string;
  category?: string;
}

// ============================================================================
// TYPES
// ============================================================================

export interface EmotionalArc {
  id: string;
  type: 'stress' | 'mood' | 'energy' | 'anxiety' | 'recovery' | 'confidence' | 'motivation';
  direction: 'rising' | 'falling' | 'stable' | 'volatile';
  intensity: 'low' | 'medium' | 'high';
  durationDays: number;
  startedAt: string;
}

export interface TrajectoryBoost {
  domains: string[];
  boost: number;
  reason: string;
}

// ============================================================================
// TRAJECTORY → DOMAIN MAPPING
// ============================================================================

type TrajectoryKey = `${EmotionalArc['type']}_${EmotionalArc['direction']}`;

const TRAJECTORY_DOMAIN_BOOST: Record<TrajectoryKey, { domains: string[]; boost: number }> = {
  // Stress trajectories
  stress_rising: {
    domains: ['burnout', 'capacity', 'stress', 'anxiety', 'self-care', 'boundaries'],
    boost: 0.18,
  },
  stress_falling: {
    domains: ['celebration', 'growth', 'momentum', 'progress'],
    boost: 0.08,
  },
  stress_stable: {
    domains: [],
    boost: 0,
  },
  stress_volatile: {
    domains: ['stress', 'grounding', 'stability', 'routine'],
    boost: 0.12,
  },

  // Mood trajectories
  mood_rising: {
    domains: ['celebration', 'goals', 'growth', 'momentum'],
    boost: 0.08,
  },
  mood_falling: {
    domains: ['depression', 'emotional-support', 'grief', 'hope', 'meaning'],
    boost: 0.18,
  },
  mood_stable: {
    domains: [],
    boost: 0,
  },
  mood_volatile: {
    domains: ['stability', 'grounding', 'routine', 'emotional-regulation'],
    boost: 0.12,
  },

  // Energy trajectories
  energy_rising: {
    domains: ['exercise', 'productivity', 'goals', 'momentum'],
    boost: 0.08,
  },
  energy_falling: {
    domains: ['burnout', 'rest', 'self-care', 'sleep', 'new-parent'],
    boost: 0.15,
  },
  energy_stable: {
    domains: [],
    boost: 0,
  },
  energy_volatile: {
    domains: ['health', 'sleep', 'routine', 'energy-management'],
    boost: 0.1,
  },

  // Anxiety trajectories
  anxiety_rising: {
    domains: ['anxiety', 'grounding', 'panic', 'coping', 'safety'],
    boost: 0.2,
  },
  anxiety_falling: {
    domains: ['celebration', 'progress', 'growth'],
    boost: 0.05,
  },
  anxiety_stable: {
    domains: [],
    boost: 0,
  },
  anxiety_volatile: {
    domains: ['anxiety', 'stability', 'routine', 'grounding'],
    boost: 0.15,
  },

  // Recovery trajectories (sobriety, healing)
  recovery_rising: {
    domains: ['sobriety', 'celebration', 'milestones', 'growth', 'progress'],
    boost: 0.12,
  },
  recovery_falling: {
    domains: ['sobriety', 'crisis', 'support', 'relapse-prevention'],
    boost: 0.25, // High boost - falling recovery is serious
  },
  recovery_stable: {
    domains: ['sobriety', 'maintenance', 'routine'],
    boost: 0.05,
  },
  recovery_volatile: {
    domains: ['sobriety', 'triggers', 'coping', 'support'],
    boost: 0.18,
  },

  // Confidence trajectories
  confidence_rising: {
    domains: ['growth', 'goals', 'career', 'leadership'],
    boost: 0.08,
  },
  confidence_falling: {
    domains: ['self-esteem', 'shame', 'identity', 'support'],
    boost: 0.15,
  },
  confidence_stable: {
    domains: [],
    boost: 0,
  },
  confidence_volatile: {
    domains: ['identity', 'stability', 'self-compassion'],
    boost: 0.1,
  },

  // Motivation trajectories
  motivation_rising: {
    domains: ['goals', 'planning', 'productivity', 'momentum'],
    boost: 0.08,
  },
  motivation_falling: {
    domains: ['motivation', 'meaning', 'purpose', 'burnout', 'stuck'],
    boost: 0.15,
  },
  motivation_stable: {
    domains: [],
    boost: 0,
  },
  motivation_volatile: {
    domains: ['motivation', 'routine', 'accountability'],
    boost: 0.1,
  },
};

// ============================================================================
// BOOST FUNCTIONS
// ============================================================================

/**
 * Get trajectory boosts based on active emotional arcs
 */
export function getTrajectoryBoosts(arcs: EmotionalArc[]): TrajectoryBoost[] {
  const boosts: TrajectoryBoost[] = [];

  for (const arc of arcs) {
    const key: TrajectoryKey = `${arc.type}_${arc.direction}`;
    const config = TRAJECTORY_DOMAIN_BOOST[key];

    if (config && config.boost > 0) {
      // Scale boost by intensity
      const intensityMultiplier =
        arc.intensity === 'high' ? 1.3 : arc.intensity === 'medium' ? 1.0 : 0.7;

      // Scale boost by duration (longer trajectories are more significant)
      const durationMultiplier = Math.min(1.5, 1 + arc.durationDays / 30);

      const effectiveBoost = config.boost * intensityMultiplier * durationMultiplier;

      boosts.push({
        domains: config.domains,
        boost: effectiveBoost,
        reason: `${arc.direction} ${arc.type} trajectory (${arc.intensity} intensity, ${arc.durationDays} days)`,
      });
    }
  }

  return boosts;
}

/**
 * Apply trajectory boosts to tool matches
 */
export function applyTrajectoryBoosts<T extends ScoredToolMatch>(
  matches: T[],
  arcs: EmotionalArc[]
): T[] {
  const boosts = getTrajectoryBoosts(arcs);

  if (boosts.length === 0) {
    return matches;
  }

  let boostedCount = 0;

  for (const match of matches) {
    const toolDomain = match.domain?.toLowerCase();
    const toolCategory = match.category?.toLowerCase();

    for (const boost of boosts) {
      const shouldBoost = boost.domains.some(
        (domain) =>
          toolDomain?.includes(domain) ||
          toolCategory?.includes(domain) ||
          match.toolId.toLowerCase().includes(domain)
      );

      if (shouldBoost) {
        match.score += boost.boost;
        boostedCount++;

        log.debug(
          {
            toolId: match.toolId,
            boost: boost.boost,
            reason: boost.reason,
            newScore: match.score,
          },
          '📈 Trajectory boost applied'
        );
      }
    }
  }

  // Re-sort by boosted scores
  if (boostedCount > 0) {
    matches.sort((a, b) => b.score - a.score);

    log.debug(
      {
        boostedCount,
        trajectoryCount: arcs.length,
        topMatch: matches[0]?.toolId,
      },
      '📈 Trajectory routing complete'
    );
  }

  return matches;
}

/**
 * Check if any trajectories warrant urgent attention
 */
export function hasUrgentTrajectory(arcs: EmotionalArc[]): boolean {
  return arcs.some((arc) => {
    // Falling recovery is always urgent
    if (arc.type === 'recovery' && arc.direction === 'falling') return true;

    // Rising anxiety with high intensity is urgent
    if (arc.type === 'anxiety' && arc.direction === 'rising' && arc.intensity === 'high')
      return true;

    // Falling mood with high intensity for extended period
    if (
      arc.type === 'mood' &&
      arc.direction === 'falling' &&
      arc.intensity === 'high' &&
      arc.durationDays > 7
    )
      return true;

    return false;
  });
}

/**
 * Get the most concerning trajectory
 */
export function getMostConcerningTrajectory(arcs: EmotionalArc[]): EmotionalArc | null {
  if (arcs.length === 0) return null;

  // Priority: recovery_falling > anxiety_rising > mood_falling > stress_rising
  const priority: Record<string, number> = {
    recovery_falling: 100,
    anxiety_rising: 90,
    mood_falling: 80,
    stress_rising: 70,
    energy_falling: 60,
    motivation_falling: 50,
  };

  return arcs.reduce(
    (most, arc) => {
      const key = `${arc.type}_${arc.direction}`;
      const arcPriority = (priority[key] || 0) * (arc.intensity === 'high' ? 1.5 : 1);
      const mostKey = most ? `${most.type}_${most.direction}` : '';
      const mostPriority = most
        ? (priority[mostKey] || 0) * (most.intensity === 'high' ? 1.5 : 1)
        : 0;

      return arcPriority > mostPriority ? arc : most;
    },
    null as EmotionalArc | null
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getTrajectoryBoosts,
  applyTrajectoryBoosts,
  hasUrgentTrajectory,
  getMostConcerningTrajectory,
  TRAJECTORY_DOMAIN_BOOST,
};
