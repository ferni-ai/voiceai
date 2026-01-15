/**
 * PersonaBehaviorManager - Singleton for managing persona behaviors at runtime
 *
 * This service loads, caches, and provides access to persona behavior content
 * for dynamic humanization during conversations.
 */

import { getLogger } from '../utils/safe-logger.js';
import type { PersonaRelationshipStage } from '../types/user-profile.js';
import { join } from 'path';
import { promises as fs } from 'fs';

const logger = getLogger().child({ service: 'PersonaBehaviorManager' });

// Base path for persona bundles
const BUNDLES_PATH = join(process.cwd(), 'src', 'personas', 'bundles');

// ============================================================================
// Types
// ============================================================================

export interface EmotionalContext {
  userMood?: 'distressed' | 'excited' | 'sad' | 'angry' | 'neutral' | 'reflective';
  energyLevel?: 'low' | 'medium' | 'high';
  conversationTone?: 'casual' | 'serious' | 'celebratory' | 'supportive';
}

export interface ConversationContext {
  personaId: string;
  relationshipStage: PersonaRelationshipStage;
  meetingCount: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  lastTopic?: string;
  emotional: EmotionalContext;
}

export interface BehaviorResult {
  phrase: string;
  type: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Behavior Cache
// ============================================================================

interface CachedBehaviors {
  loadedAt: Date;
  data: Record<string, unknown>;
}

const behaviorCache = new Map<string, CachedBehaviors>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isCacheValid(cached: CachedBehaviors): boolean {
  return Date.now() - cached.loadedAt.getTime() < CACHE_TTL_MS;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Load behaviors for a persona (with caching)
 */
export async function loadPersonaBehaviors(
  personaId: string
): Promise<Record<string, unknown> | null> {
  // Check cache first
  const cached = behaviorCache.get(personaId);
  if (cached && isCacheValid(cached)) {
    return cached.data;
  }

  try {
    const behaviorsPath = join(BUNDLES_PATH, personaId, 'content', 'behaviors');
    const behaviors: Record<string, unknown> = {};

    try {
      const files = await fs.readdir(behaviorsPath);

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = join(behaviorsPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const behaviorName = file.replace('.json', '');
          behaviors[behaviorName] = JSON.parse(content);
        }
      }
    } catch (dirError) {
      // Behaviors directory may not exist for all personas
      logger.debug({ personaId }, 'No behaviors directory found');
      return null;
    }

    if (Object.keys(behaviors).length === 0) {
      return null;
    }

    // Cache the behaviors
    behaviorCache.set(personaId, {
      loadedAt: new Date(),
      data: behaviors,
    });

    return behaviors;
  } catch (error) {
    logger.error({ error, personaId }, 'Failed to load persona behaviors');
    return null;
  }
}

/**
 * Get a random phrase from an array
 */
function getRandomPhrase(phrases: string[] | undefined): string | null {
  if (!phrases || phrases.length === 0) return null;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get time of day
 */
export function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// ============================================================================
// Behavior Retrieval Functions
// ============================================================================

/**
 * Get an emotional intelligence response based on detected emotion
 */
export async function getEmotionalResponse(
  personaId: string,
  detectedEmotion: string,
  context: ConversationContext
): Promise<BehaviorResult | null> {
  const behaviors = await loadPersonaBehaviors(personaId);
  if (!behaviors) return null;

  const ei = behaviors['emotional-intelligence'] as Record<string, unknown> | undefined;
  if (!ei) return null;

  // Map emotion to category
  const emotionMap: Record<string, string> = {
    distressed: 'detecting_distress',
    stressed: 'detecting_distress',
    overwhelmed: 'detecting_distress',
    excited: 'detecting_excitement',
    happy: 'detecting_excitement',
    sad: 'detecting_sadness',
    angry: 'detecting_anger',
    frustrated: 'detecting_anger',
  };

  const category = emotionMap[detectedEmotion.toLowerCase()] || 'detecting_distress';
  const emotionData = ei[category] as { phrases?: string[] } | undefined;

  if (!emotionData?.phrases) return null;

  const phrase = getRandomPhrase(emotionData.phrases);
  if (!phrase) return null;

  return {
    phrase,
    type: 'emotional_response',
    metadata: { detectedEmotion, category },
  };
}

/**
 * Get a comfort phrase for difficult moments
 */
export async function getComfortPhrase(
  personaId: string,
  context: ConversationContext
): Promise<BehaviorResult | null> {
  const behaviors = await loadPersonaBehaviors(personaId);
  if (!behaviors) return null;

  // Try emotional-intelligence comfort phrases
  const ei = behaviors['emotional-intelligence'] as Record<string, unknown> | undefined;
  const comfort = ei?.['comfort_phrases'] as
    | { general?: string[]; after_vulnerability?: string[] }
    | undefined;

  if (comfort) {
    const phrases =
      context.emotional.userMood === 'reflective' ? comfort.after_vulnerability : comfort.general;

    const phrase = getRandomPhrase(phrases);
    if (phrase) {
      return { phrase, type: 'comfort', metadata: { source: 'emotional_intelligence' } };
    }
  }

  // Fallback to encouragement
  const encouragement = behaviors['encouragement'] as { general_struggles?: string[] } | undefined;
  const phrase = getRandomPhrase(encouragement?.general_struggles);

  return phrase ? { phrase, type: 'comfort', metadata: { source: 'encouragement' } } : null;
}

/**
 * Get a celebration phrase
 */
export async function getCelebrationPhrase(
  personaId: string,
  celebrationType: string,
  context: ConversationContext
): Promise<BehaviorResult | null> {
  const behaviors = await loadPersonaBehaviors(personaId);
  if (!behaviors) return null;

  const celebrationsRaw = behaviors['celebrations'];
  if (!celebrationsRaw || typeof celebrationsRaw !== 'object') return null;

  const celebrations = celebrationsRaw as Record<string, unknown>;

  // Try specific type first, then fallback to 'win'
  const phrasesRaw =
    celebrations[celebrationType] || celebrations['win'] || celebrations['progress'];
  const phrases = Array.isArray(phrasesRaw) ? (phrasesRaw as string[]) : undefined;
  const phrase = getRandomPhrase(phrases);

  if (!phrase) return null;

  // Check for relationship-based celebrations
  const byRelationship = celebrations['by_relationship_stage'] as
    | Record<string, string[]>
    | undefined;
  if (byRelationship && Math.random() > 0.6) {
    const relationshipPhrase = getRandomPhrase(byRelationship[context.relationshipStage]);
    if (relationshipPhrase) {
      return {
        phrase: relationshipPhrase,
        type: 'celebration',
        metadata: { celebrationType, relationshipBased: true },
      };
    }
  }

  return { phrase, type: 'celebration', metadata: { celebrationType } };
}

/**
 * Get a backchannel phrase (active listening cue)
 */
export async function getBackchannelPhrase(
  personaId: string,
  type: 'neutral' | 'engaged' | 'empathetic' = 'neutral'
): Promise<BehaviorResult | null> {
  const behaviors = await loadPersonaBehaviors(personaId);
  if (!behaviors) return null;

  const backchannels = behaviors['backchannels'] as Record<string, string[]> | undefined;
  if (!backchannels) return null;

  const phrases = backchannels[type] || backchannels['neutral'];
  const phrase = getRandomPhrase(phrases);

  return phrase ? { phrase, type: 'backchannel', metadata: { backchannelType: type } } : null;
}

/**
 * Get a compliment phrase
 */
export async function getComplimentPhrase(
  personaId: string,
  complimentType: string,
  context: ConversationContext
): Promise<BehaviorResult | null> {
  const behaviors = await loadPersonaBehaviors(personaId);
  if (!behaviors) return null;

  const complimentsRaw = behaviors['compliments'];
  if (!complimentsRaw || typeof complimentsRaw !== 'object') return null;

  const compliments = complimentsRaw as Record<string, unknown>;

  // Check relationship-gated compliments
  const byRelationship = compliments['by_relationship_stage'] as
    | Record<string, string[]>
    | undefined;
  if (byRelationship && context.relationshipStage !== 'stranger') {
    const relationshipPhrase = getRandomPhrase(byRelationship[context.relationshipStage]);
    if (relationshipPhrase && Math.random() > 0.5) {
      return {
        phrase: relationshipPhrase,
        type: 'compliment',
        metadata: { complimentType, relationshipBased: true },
      };
    }
  }

  // Get type-specific or character compliments
  const phrasesRaw = compliments[complimentType] || compliments['character_compliments'];
  const phrases = Array.isArray(phrasesRaw) ? (phrasesRaw as string[]) : undefined;
  const phrase = getRandomPhrase(phrases);

  return phrase ? { phrase, type: 'compliment', metadata: { complimentType } } : null;
}

/**
 * Get a speech imperfection (for naturalness)
 */
export async function getSpeechImperfection(
  personaId: string,
  type: 'trailing_off' | 'self_corrections' | 'restarts' | 'filler_sounds' | 'thinking_aloud'
): Promise<BehaviorResult | null> {
  const behaviors = await loadPersonaBehaviors(personaId);
  if (!behaviors) return null;

  const imperfections = behaviors['speech-imperfections'] as Record<string, string[]> | undefined;
  if (!imperfections) return null;

  const phrases = imperfections[type];
  const phrase = getRandomPhrase(phrases);

  return phrase ? { phrase, type: 'imperfection', metadata: { imperfectionType: type } } : null;
}

/**
 * Get a memory callback phrase (referencing past conversations)
 */
export async function getMemoryCallbackPhrase(
  personaId: string,
  topic: string,
  callbackType: 'topic' | 'goal' | 'struggle' | 'person' = 'topic'
): Promise<BehaviorResult | null> {
  const behaviors = await loadPersonaBehaviors(personaId);
  if (!behaviors) return null;

  const memory = behaviors['memory-patterns'] as Record<string, unknown> | undefined;
  if (!memory) return null;

  let phrases: string[] | undefined;

  switch (callbackType) {
    case 'topic':
      phrases = (memory['topic_callbacks'] as { templates?: string[] })?.templates;
      break;
    case 'goal':
      phrases = (memory['progress_tracking'] as { goal_follow_up?: string[] })?.goal_follow_up;
      break;
    case 'struggle':
      phrases = (memory['progress_tracking'] as { struggle_follow_up?: string[] })
        ?.struggle_follow_up;
      break;
    case 'person':
      phrases = (memory['relationship_callbacks'] as { mentioned_person?: string[] })
        ?.mentioned_person;
      break;
  }

  const phrase = getRandomPhrase(phrases);
  if (!phrase) return null;

  // Replace placeholder with actual topic
  const filledPhrase = phrase
    .replace('{topic}', topic)
    .replace('{goal}', topic)
    .replace('{person}', topic);

  return { phrase: filledPhrase, type: 'memory_callback', metadata: { callbackType, topic } };
}

/**
 * Get contextual nuance based on situation
 */
export async function getContextualPhrase(
  personaId: string,
  context: ConversationContext
): Promise<BehaviorResult | null> {
  const behaviors = await loadPersonaBehaviors(personaId);
  if (!behaviors) return null;

  const nuances = behaviors['contextual-nuances'] as Record<string, unknown> | undefined;
  if (!nuances) return null;

  // Check time of day
  const timeOfDay = nuances['time_of_day'] as Record<string, { phrases?: string[] }> | undefined;
  if (timeOfDay && Math.random() > 0.7) {
    const todPhrases = timeOfDay[context.timeOfDay]?.phrases;
    const phrase = getRandomPhrase(todPhrases);
    if (phrase) {
      return { phrase, type: 'contextual', metadata: { context: 'time_of_day' } };
    }
  }

  // Check energy adaptation
  const energyAdaptation = nuances['user_energy_adaptation'] as
    | Record<string, { phrases?: string[] }>
    | undefined;
  if (energyAdaptation && context.emotional.energyLevel) {
    const energyKey = context.emotional.energyLevel === 'low' ? 'low_energy' : 'high_energy';
    const phrase = getRandomPhrase(energyAdaptation[energyKey]?.phrases);
    if (phrase) {
      return { phrase, type: 'contextual', metadata: { context: 'energy_adaptation' } };
    }
  }

  return null;
}

/**
 * Check if persona should share vulnerability based on relationship
 */
export function canShareVulnerability(
  relationshipStage: PersonaRelationshipStage,
  vulnerabilityLevel: 'mild' | 'deep' | 'secret'
): boolean {
  const gateMap: Record<string, PersonaRelationshipStage[]> = {
    mild: ['acquaintance', 'friend', 'trusted_advisor'],
    deep: ['friend', 'trusted_advisor'],
    secret: ['trusted_advisor'],
  };

  return gateMap[vulnerabilityLevel]?.includes(relationshipStage) ?? false;
}

/**
 * Get a vulnerability phrase (relationship-gated)
 */
export async function getVulnerabilityPhrase(
  personaId: string,
  context: ConversationContext
): Promise<BehaviorResult | null> {
  // Check relationship gate
  if (!canShareVulnerability(context.relationshipStage, 'deep')) {
    return null;
  }

  const behaviors = await loadPersonaBehaviors(personaId);
  if (!behaviors) return null;

  // Try vulnerability.json
  const vulnerability = behaviors['vulnerability'] as Record<string, string[]> | undefined;
  if (vulnerability) {
    const categories = Object.keys(vulnerability);
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    const phrase = getRandomPhrase(vulnerability[randomCategory]);
    if (phrase) {
      return { phrase, type: 'vulnerability', metadata: { category: randomCategory } };
    }
  }

  // Try self-doubt for friends+
  const selfDoubt = behaviors['self-doubt'] as Record<string, string[]> | undefined;
  if (selfDoubt && context.relationshipStage !== 'stranger') {
    const phrase = getRandomPhrase(selfDoubt['questioning_self'] || selfDoubt['admitting_limits']);
    if (phrase) {
      return { phrase, type: 'vulnerability', metadata: { category: 'self_doubt' } };
    }
  }

  return null;
}

/**
 * Get SSML pacing multiplier based on persona and context
 */
export function getPacingMultiplier(personaId: string, context: ConversationContext): number {
  // Base multipliers by persona
  const personaMultipliers: Record<string, number> = {
    ferni: 1.0,
    'jordan-taylor': 0.85,
    'nayan-patel': 1.4,
    'peter-john': 0.75,
    'alex-chen': 0.9,
    'maya-santos': 1.1,
  };

  let multiplier = personaMultipliers[personaId] || 1.0;

  // Adjust for user emotion
  if (context.emotional.userMood === 'distressed') {
    multiplier *= 1.3; // Slow down for distressed users
  } else if (context.emotional.userMood === 'excited') {
    multiplier *= 0.85; // Speed up slightly for excited users
  }

  // Adjust for energy level
  if (context.emotional.energyLevel === 'low') {
    multiplier *= 1.2;
  }

  return multiplier;
}

/**
 * Apply pacing multiplier to SSML breaks in a phrase
 */
export function applyPacing(phrase: string, multiplier: number): string {
  return phrase.replace(/time="(\d+)ms"/g, (_, ms) => {
    const newMs = Math.round(parseInt(ms) * multiplier);
    return `time="${newMs}ms"`;
  });
}

// ============================================================================
// Cache Management
// ============================================================================

/**
 * Clear the behavior cache for a persona
 */
export function clearBehaviorCache(personaId?: string): void {
  if (personaId) {
    behaviorCache.delete(personaId);
    logger.debug({ personaId }, 'Cleared behavior cache for persona');
  } else {
    behaviorCache.clear();
    logger.debug('Cleared all behavior caches');
  }
}

/**
 * Preload behaviors for all personas
 */
export async function preloadAllBehaviors(): Promise<void> {
  const personas = [
    'ferni',
    'jordan-taylor',
    'nayan-patel',
    'peter-john',
    'alex-chen',
    'maya-santos',
  ];

  await Promise.all(
    personas.map(async (id) => {
      await loadPersonaBehaviors(id);
      logger.debug({ personaId: id }, 'Preloaded behaviors');
    })
  );

  logger.info({ count: personas.length }, 'Preloaded all persona behaviors');
}

// Export singleton-style access
export const PersonaBehaviorManager = {
  load: loadPersonaBehaviors,
  getEmotionalResponse,
  getComfortPhrase,
  getCelebrationPhrase,
  getBackchannelPhrase,
  getComplimentPhrase,
  getSpeechImperfection,
  getMemoryCallbackPhrase,
  getContextualPhrase,
  getVulnerabilityPhrase,
  getPacingMultiplier,
  applyPacing,
  clearCache: clearBehaviorCache,
  preload: preloadAllBehaviors,
  getTimeOfDay,
  canShareVulnerability,
};

export default PersonaBehaviorManager;
