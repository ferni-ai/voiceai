/**
 * Superhuman Signal Router
 *
 * Routes extracted signals from LLMSignalExtractor to Superhuman Services.
 * This is the critical bridge that enables "Better than Human" capabilities.
 *
 * Extracted signals → Superhuman services:
 * - Dreams → Dream Keeper
 * - Values → Values Alignment
 * - People → Relationship Network
 * - Commitments → Commitment Keeper (via content analysis)
 * - Fears/Challenges → Capacity Guardian (via stress triggers)
 *
 * @module memory/superhuman-signal-router
 */

import { createLogger } from '../../utils/safe-logger.js';
import { runBackground } from '../../utils/background-task.js';
import type { ExtractedSignals } from '../interfaces/index.js';

const log = createLogger({ module: 'SuperhumanSignalRouter' });

// ============================================================================
// TYPES
// ============================================================================

interface RouterConfig {
  /** Whether to record dreams (default: true) */
  recordDreams: boolean;
  /** Whether to record values (default: true) */
  recordValues: boolean;
  /** Whether to record relationships (default: true) */
  recordRelationships: boolean;
  /** Whether to record stress triggers to capacity (default: true) */
  recordCapacity: boolean;
}

const DEFAULT_CONFIG: RouterConfig = {
  recordDreams: true,
  recordValues: true,
  recordRelationships: true,
  recordCapacity: true,
};

// ============================================================================
// SIGNAL ROUTING
// ============================================================================

/**
 * Route extracted signals to superhuman services.
 *
 * This function is fire-and-forget - it runs in the background
 * and doesn't block the main conversation flow.
 */
export async function routeSignalsToSuperhuman(
  userId: string,
  signals: ExtractedSignals,
  config: Partial<RouterConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Track what we're routing for logging
  const routed: string[] = [];

  // Route dreams to Dream Keeper
  if (cfg.recordDreams && signals.dreams && signals.dreams.length > 0) {
    runBackground(routeDreams(userId, signals.dreams), { task: 'route-dreams', userId });
    routed.push(`dreams(${signals.dreams.length})`);
  }

  // Route values to Values Alignment
  if (cfg.recordValues && signals.values && signals.values.length > 0) {
    runBackground(routeValues(userId, signals.values), { task: 'route-values', userId });
    routed.push(`values(${signals.values.length})`);
  }

  // Route people to Relationship Network (signals.importantPeople may not exist yet)
  const people = (signals as unknown as Record<string, unknown>).importantPeople as
    | Array<{ name: string; relationship?: string; context: string }>
    | undefined;
  if (cfg.recordRelationships && people && people.length > 0) {
    runBackground(routeRelationships(userId, people), { task: 'route-relationships', userId });
    routed.push(`people(${people.length})`);
  }

  // Route stress triggers to Capacity Guardian
  if (cfg.recordCapacity && signals.stressTriggers && signals.stressTriggers.length > 0) {
    runBackground(routeCapacity(userId, signals.stressTriggers), {
      task: 'route-capacity',
      userId,
    });
    routed.push(`stress(${signals.stressTriggers.length})`);
  }

  // Route challenges as patterns to Predictive Coaching
  if (signals.challenges && signals.challenges.length > 0) {
    runBackground(routeChallenges(userId, signals.challenges), {
      task: 'route-challenges',
      userId,
    });
    routed.push(`challenges(${signals.challenges.length})`);
  }

  if (routed.length > 0) {
    log.info({ userId, routed: routed.join(', ') }, '🧠 Routing signals to superhuman services');
  }
}

// ============================================================================
// INDIVIDUAL ROUTERS
// ============================================================================

async function routeDreams(
  userId: string,
  dreams: Array<{ description: string; category: string }>
): Promise<void> {
  try {
    const { recordDreamMention } = await import('../../services/superhuman/dream-keeper.js');

    for (const dream of dreams) {
      await recordDreamMention(userId, {
        statement: dream.description,
        type: (dream.category as 'career' | 'creative' | 'adventure') || 'growth',
        confidence: 0.8,
      });
    }

    log.debug({ userId, count: dreams.length }, 'Routed dreams to Dream Keeper');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to route dreams');
  }
}

async function routeValues(
  userId: string,
  values: Array<{ value: string; evidence: string[] }>
): Promise<void> {
  try {
    const { recordValueMention } = await import('../../services/superhuman/values-alignment.js');

    for (const v of values) {
      await recordValueMention(userId, {
        category: 'growth', // Default to growth category
        statement: `${v.value}: ${v.evidence.join('; ')}`,
        weight: 0.7,
      });
    }

    log.debug({ userId, count: values.length }, 'Routed values to Values Alignment');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to route values');
  }
}

async function routeRelationships(
  userId: string,
  people: Array<{ name: string; relationship?: string; context: string }>
): Promise<void> {
  try {
    const { recordMention } = await import('../../services/superhuman/relationship-network.js');

    for (const person of people) {
      await recordMention(userId, {
        name: person.name,
        type: (person.relationship as 'family' | 'friend' | 'colleague') || 'other',
        context: person.context,
      });
    }

    log.debug({ userId, count: people.length }, 'Routed people to Relationship Network');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to route relationships');
  }
}

async function routeCapacity(
  userId: string,
  stressTriggers: Array<{ trigger: string; category: string }>
): Promise<void> {
  try {
    const { recordEnergyReading } = await import('../../services/superhuman/capacity-guardian.js');

    // If there are multiple stress triggers, energy is likely lower
    const energyScore = Math.max(20, 80 - stressTriggers.length * 15);
    const energyLevel =
      energyScore > 70
        ? 'good'
        : energyScore > 50
          ? 'moderate'
          : energyScore > 30
            ? 'low'
            : 'depleted';

    await recordEnergyReading(userId, {
      energyLevel: energyLevel as 'high' | 'good' | 'moderate' | 'low' | 'depleted',
      energyScore,
      detectedFrom: ['text'],
      indicators: stressTriggers.map((t) => t.trigger),
    });

    log.debug(
      { userId, triggerCount: stressTriggers.length },
      'Routed stress to Capacity Guardian'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to route capacity');
  }
}

async function routeChallenges(
  userId: string,
  challenges: Array<{ challenge: string; status: string }>
): Promise<void> {
  try {
    const { recordObservation } = await import('../../services/superhuman/predictive-coaching.js');

    for (const challenge of challenges) {
      await recordObservation(userId, {
        type: 'behavioral', // Challenges are behavioral patterns
        trigger: challenge.challenge,
        outcome: challenge.status || 'ongoing',
        emotion: 'stressed',
      });
    }

    log.debug({ userId, count: challenges.length }, 'Routed challenges to Predictive Coaching');
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to route challenges');
  }
}
