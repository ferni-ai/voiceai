/**
 * Advanced Humanization Loader
 *
 * Loads rich persona-specific humanization content from JSON files.
 * This content enables "Better than Human" responses including:
 * - Subtext responses (detecting deflection, minimizing, testing waters)
 * - Emotional aftercare (holding space, grounding, integration)
 * - Energy regulation (matching low energy, leading up, grounding)
 * - Micro-affirmations (acknowledgments, validations, encouragements)
 *
 * Each persona has their own flavor of these responses that matches
 * their personality and expertise.
 *
 * @module AdvancedHumanizationLoader
 */

import { createLogger } from '../../utils/safe-logger.js';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const log = createLogger({ module: 'AdvancedHumanizationLoader' });

// ============================================================================
// TYPES
// ============================================================================

export interface SubtextResponses {
  description?: string;
  deflection?: string[];
  minimizing?: string[];
  testing_waters?: string[];
  seeking_permission?: string[];
}

export interface EmotionalAftercare {
  transition_phrases?: {
    holding?: string[];
    integrating?: string[];
    grounding?: string[];
  };
  check_in_questions?: string[];
}

export interface HopeInjection {
  possibility_anchors?: string[];
  reframing?: string[];
}

export interface EnergyRegulation {
  matching_low?: string[];
  leading_up?: string[];
  grounding?: string[];
}

export interface MicroAffirmations {
  acknowledgments?: string[];
  validations?: string[];
  encouragements?: string[];
}

export interface ParadoxicalInterventions {
  paradoxical_questions?: string[];
  meta_observations?: string[];
  normalize_inaction?: string[];
}

export interface UsageRules {
  subtext_min_relationship?: string;
  aftercare_trigger_threshold?: number;
  energy_immediate?: boolean;
  affirmation_density?: number;
  paradoxical_min_resistance_count?: number;
}

export interface AdvancedHumanization {
  schema_version: number;
  description: string;
  philosophy: string;
  subtext_responses?: SubtextResponses;
  emotional_aftercare?: EmotionalAftercare;
  hope_injection?: HopeInjection;
  energy_regulation?: EnergyRegulation;
  micro_affirmations?: MicroAffirmations;
  paradoxical_interventions?: ParadoxicalInterventions;
  usage_rules?: UsageRules;
}

// ============================================================================
// CACHE
// ============================================================================

const cache = new Map<string, AdvancedHumanization | null>();

// ============================================================================
// LOADER
// ============================================================================

/**
 * Get the path to the advanced humanization JSON for a persona
 */
function getAdvancedHumanizationPath(personaId: string): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  return join(__dirname, personaId, 'content', 'behaviors', 'advanced-humanization.json');
}

/**
 * Load advanced humanization content for a persona
 *
 * @param personaId - The persona ID (e.g., 'maya-santos', 'nayan-patel')
 * @returns The advanced humanization content, or null if not found
 */
export async function loadAdvancedHumanization(
  personaId: string
): Promise<AdvancedHumanization | null> {
  // Check cache first
  if (cache.has(personaId)) {
    return cache.get(personaId)!;
  }

  try {
    const filePath = getAdvancedHumanizationPath(personaId);
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content) as AdvancedHumanization;

    // Validate schema version
    if (data.schema_version !== 2) {
      log.warn({ personaId, version: data.schema_version }, 'Unknown schema version');
    }

    cache.set(personaId, data);
    log.debug({ personaId }, 'Loaded advanced humanization');
    return data;
  } catch (error) {
    // Not all personas have advanced humanization - this is expected
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      log.debug({ personaId }, 'No advanced humanization file found');
    } else {
      log.warn({ personaId, error: String(error) }, 'Failed to load advanced humanization');
    }
    cache.set(personaId, null);
    return null;
  }
}

/**
 * Clear the cache (useful for testing or hot reload)
 */
export function clearAdvancedHumanizationCache(): void {
  cache.clear();
}

// ============================================================================
// CONTENT SELECTORS
// ============================================================================

/**
 * Select a random item from an array
 */
function pickRandom<T>(items: T[] | undefined): T | undefined {
  if (!items || items.length === 0) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Get a subtext response based on detected subtext type
 *
 * @param humanization - The loaded humanization content
 * @param subtextType - The type of subtext detected
 * @returns A persona-specific subtext response, or undefined
 */
export function getSubtextResponse(
  humanization: AdvancedHumanization | null,
  subtextType: 'deflection' | 'minimizing' | 'testing_waters' | 'seeking_permission'
): string | undefined {
  if (!humanization?.subtext_responses) return undefined;
  return pickRandom(humanization.subtext_responses[subtextType]);
}

/**
 * Get an emotional aftercare phrase
 *
 * @param humanization - The loaded humanization content
 * @param aftercareType - The type of aftercare needed
 * @returns A persona-specific aftercare phrase, or undefined
 */
export function getAftercarePhraseResponse(
  humanization: AdvancedHumanization | null,
  aftercareType: 'holding' | 'integrating' | 'grounding'
): string | undefined {
  if (!humanization?.emotional_aftercare?.transition_phrases) return undefined;
  return pickRandom(humanization.emotional_aftercare.transition_phrases[aftercareType]);
}

/**
 * Get an aftercare check-in question
 *
 * @param humanization - The loaded humanization content
 * @returns A persona-specific check-in question, or undefined
 */
export function getAftercareCheckIn(humanization: AdvancedHumanization | null): string | undefined {
  if (!humanization?.emotional_aftercare?.check_in_questions) return undefined;
  return pickRandom(humanization.emotional_aftercare.check_in_questions);
}

/**
 * Get a hope injection phrase
 *
 * @param humanization - The loaded humanization content
 * @param hopeType - The type of hope to inject
 * @returns A persona-specific hope phrase, or undefined
 */
export function getHopeInjection(
  humanization: AdvancedHumanization | null,
  hopeType: 'possibility_anchors' | 'reframing'
): string | undefined {
  if (!humanization?.hope_injection) return undefined;
  return pickRandom(humanization.hope_injection[hopeType]);
}

/**
 * Get an energy regulation response
 *
 * @param humanization - The loaded humanization content
 * @param energyType - The energy regulation approach
 * @returns A persona-specific energy response, or undefined
 */
export function getEnergyRegulation(
  humanization: AdvancedHumanization | null,
  energyType: 'matching_low' | 'leading_up' | 'grounding'
): string | undefined {
  if (!humanization?.energy_regulation) return undefined;
  return pickRandom(humanization.energy_regulation[energyType]);
}

/**
 * Get a micro-affirmation
 *
 * @param humanization - The loaded humanization content
 * @param affirmationType - The type of affirmation
 * @returns A persona-specific affirmation, or undefined
 */
export function getMicroAffirmation(
  humanization: AdvancedHumanization | null,
  affirmationType: 'acknowledgments' | 'validations' | 'encouragements'
): string | undefined {
  if (!humanization?.micro_affirmations) return undefined;
  return pickRandom(humanization.micro_affirmations[affirmationType]);
}

/**
 * Get a paradoxical intervention
 *
 * @param humanization - The loaded humanization content
 * @param interventionType - The type of paradoxical intervention
 * @returns A persona-specific paradoxical phrase, or undefined
 */
export function getParadoxicalIntervention(
  humanization: AdvancedHumanization | null,
  interventionType: 'paradoxical_questions' | 'meta_observations' | 'normalize_inaction'
): string | undefined {
  if (!humanization?.paradoxical_interventions) return undefined;
  return pickRandom(humanization.paradoxical_interventions[interventionType]);
}

// ============================================================================
// CONTEXT-AWARE SELECTION
// ============================================================================

export interface HumanizationContext {
  personaId: string;
  relationshipStage: string;
  emotionalIntensity: number;
  distressLevel: number;
  userEnergy: 'low' | 'medium' | 'high';
  subtextDetected?: 'deflection' | 'minimizing' | 'testing_waters' | 'seeking_permission';
  needsAftercare?: boolean;
  needsHope?: boolean;
  resistanceCount?: number;
}

export interface HumanizationResult {
  type:
    | 'subtext'
    | 'aftercare_holding'
    | 'aftercare_grounding'
    | 'aftercare_check_in'
    | 'hope'
    | 'energy'
    | 'affirmation'
    | 'paradoxical';
  phrase: string;
  ssml?: string;
}

/**
 * Get the most appropriate humanization response based on context
 *
 * This is the main function for integrating advanced humanization into
 * the personality system. It analyzes the context and returns the most
 * appropriate response.
 *
 * @param context - The current conversation context
 * @returns A humanization result, or null if none appropriate
 */
export async function getContextualHumanization(
  context: HumanizationContext
): Promise<HumanizationResult | null> {
  const humanization = await loadAdvancedHumanization(context.personaId);
  if (!humanization) return null;

  const rules = humanization.usage_rules || {};

  // Priority 1: Subtext response (if detected and relationship allows)
  if (context.subtextDetected) {
    const minRelationship = rules.subtext_min_relationship || 'developing';
    const relationshipOrder = ['stranger', 'acquaintance', 'developing', 'established', 'deep'];
    const minIndex = relationshipOrder.indexOf(minRelationship);
    const currentIndex = relationshipOrder.indexOf(context.relationshipStage);

    if (currentIndex >= minIndex) {
      const phrase = getSubtextResponse(humanization, context.subtextDetected);
      if (phrase) {
        return { type: 'subtext', phrase, ssml: phrase };
      }
    }
  }

  // Priority 2: Aftercare (if needed and intensity threshold met)
  if (context.needsAftercare) {
    const threshold = rules.aftercare_trigger_threshold || 0.5;
    if (context.emotionalIntensity >= threshold) {
      // Choose between holding and grounding based on distress
      if (context.distressLevel > 0.6) {
        const phrase = getAftercarePhraseResponse(humanization, 'grounding');
        if (phrase) {
          return { type: 'aftercare_grounding', phrase, ssml: phrase };
        }
      } else {
        const phrase = getAftercarePhraseResponse(humanization, 'holding');
        if (phrase) {
          return { type: 'aftercare_holding', phrase, ssml: phrase };
        }
      }
    }
  }

  // Priority 3: Energy regulation (immediate if configured)
  if (rules.energy_immediate) {
    if (context.userEnergy === 'low') {
      const phrase = getEnergyRegulation(humanization, 'matching_low');
      if (phrase) {
        return { type: 'energy', phrase, ssml: phrase };
      }
    }
  }

  // Priority 4: Hope injection (if needed)
  if (context.needsHope && context.distressLevel > 0.5) {
    const phrase = getHopeInjection(humanization, 'possibility_anchors');
    if (phrase) {
      return { type: 'hope', phrase, ssml: phrase };
    }
  }

  // Priority 5: Paradoxical intervention (if resistance detected)
  if (context.resistanceCount && rules.paradoxical_min_resistance_count) {
    if (context.resistanceCount >= rules.paradoxical_min_resistance_count) {
      const phrase = getParadoxicalIntervention(humanization, 'paradoxical_questions');
      if (phrase) {
        return { type: 'paradoxical', phrase, ssml: phrase };
      }
    }
  }

  // Priority 6: Micro-affirmation (based on density)
  const density = rules.affirmation_density || 0.3;
  if (Math.random() < density) {
    // Choose type based on context
    if (context.distressLevel > 0.5) {
      const phrase = getMicroAffirmation(humanization, 'validations');
      if (phrase) {
        return { type: 'affirmation', phrase, ssml: phrase };
      }
    } else if (context.emotionalIntensity > 0.5) {
      const phrase = getMicroAffirmation(humanization, 'encouragements');
      if (phrase) {
        return { type: 'affirmation', phrase, ssml: phrase };
      }
    } else {
      const phrase = getMicroAffirmation(humanization, 'acknowledgments');
      if (phrase) {
        return { type: 'affirmation', phrase, ssml: phrase };
      }
    }
  }

  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  loadAdvancedHumanization,
  clearAdvancedHumanizationCache,
  getSubtextResponse,
  getAftercarePhraseResponse,
  getAftercareCheckIn,
  getHopeInjection,
  getEnergyRegulation,
  getMicroAffirmation,
  getParadoxicalIntervention,
  getContextualHumanization,
};
