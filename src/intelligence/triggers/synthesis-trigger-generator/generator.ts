/**
 * Synthesis Trigger Generator Core
 *
 * Main trigger generation logic that evaluates templates
 * against life context snapshots.
 *
 * @module synthesis-trigger-generator/generator
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  LifeContextSnapshot,
  SynthesisTrigger,
  AggregatorConfig,
} from '../life-context-snapshot.js';
import type { TriggerTemplate } from './types.js';
import { supportTriggerTemplates } from './support-triggers.js';
import { celebrationTriggerTemplates } from './celebration-triggers.js';
import { warningTriggerTemplates } from './warning-triggers.js';
import { nuancedTriggerTemplates } from './nuanced-triggers.js';

const log = createLogger({ module: 'synthesis-trigger-generator' });

/**
 * All trigger templates combined
 */
export const allTriggerTemplates: TriggerTemplate[] = [
  ...supportTriggerTemplates,
  ...celebrationTriggerTemplates,
  ...warningTriggerTemplates,
  ...nuancedTriggerTemplates,
];

/**
 * Generate synthesis triggers from life context snapshot
 */
export function generateSynthesisTriggers(
  snapshot: LifeContextSnapshot,
  config: Partial<AggregatorConfig> = {}
): SynthesisTrigger[] {
  const maxTriggers = config.maxTriggers || 5;
  const supportThreshold = config.supportTriggerThreshold || 0.6;
  const celebrationThreshold = config.celebrationThreshold || 0.7;

  const triggers: SynthesisTrigger[] = [];

  // Evaluate all templates
  for (const template of allTriggerTemplates) {
    const result = template.condition(snapshot);

    if (!result.matches) continue;

    // Apply category-specific confidence thresholds
    const threshold = template.category === 'celebration' ? celebrationThreshold : supportThreshold;
    if (result.confidence < threshold) continue;

    // Select a response (cycle through for variety)
    const responseIndex = Math.floor(Math.random() * template.suggestedResponses.length);
    const suggestedResponse = template.suggestedResponses[responseIndex];

    triggers.push({
      id: template.id,
      category: template.category,
      suggestedResponse,
      reasoning: result.reasoning,
      confidence: result.confidence,
      priority: template.priority,
      contributingDomains: template.contributingDomains,
      recommendedPersona: template.recommendedPersona,
    });
  }

  // Sort by priority and confidence
  const priorityOrder: Record<SynthesisTrigger['priority'], number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  triggers.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.confidence - a.confidence;
  });

  // Limit to max triggers
  const selectedTriggers = triggers.slice(0, maxTriggers);

  log.info(
    {
      userId: snapshot.userId,
      triggersGenerated: selectedTriggers.length,
      categories: selectedTriggers.map((t) => t.category),
      priorities: selectedTriggers.map((t) => t.priority),
    },
    'Synthesis triggers generated'
  );

  return selectedTriggers;
}

/**
 * Populate synthesizedTriggers field in a life context snapshot
 */
export function populateSynthesisTriggers(
  snapshot: LifeContextSnapshot,
  config: Partial<AggregatorConfig> = {}
): LifeContextSnapshot {
  const triggers = generateSynthesisTriggers(snapshot, config);
  return {
    ...snapshot,
    synthesizedTriggers: triggers,
  };
}

/**
 * Get the most important trigger from a snapshot
 */
export function getMostImportantTrigger(snapshot: LifeContextSnapshot): SynthesisTrigger | null {
  if (snapshot.synthesizedTriggers.length === 0) return null;
  return snapshot.synthesizedTriggers[0]; // Already sorted by priority/confidence
}

/**
 * Get triggers by category
 */
export function getTriggersByCategory(
  snapshot: LifeContextSnapshot,
  category: SynthesisTrigger['category']
): SynthesisTrigger[] {
  return snapshot.synthesizedTriggers.filter((t) => t.category === category);
}

/**
 * Get triggers recommended for a specific persona
 */
export function getTriggersForPersona(
  snapshot: LifeContextSnapshot,
  personaId: string
): SynthesisTrigger[] {
  return snapshot.synthesizedTriggers.filter((t) => t.recommendedPersona === personaId);
}
