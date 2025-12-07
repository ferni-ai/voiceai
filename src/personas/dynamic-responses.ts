/**
 * Dynamic Response Generator
 *
 * CRITICAL FIX: Replaces static response lists with persona-trait-based generation.
 *
 * Problem solved: All personas had 80%+ identical backchannels, comfort phrases,
 * and thinking sounds because they shared the same static JSON files.
 *
 * This generator:
 * 1. Uses persona personality traits to vary responses
 * 2. Tracks what's been used to avoid repetition
 * 3. Generates contextually-appropriate variations
 * 4. Makes each persona sound distinctly different
 */

import { getLogger } from '../utils/safe-logger.js';
import type { PersonaConfig } from './types.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface PersonaVoiceTraits {
  warmth: number; // 0-1
  energy: number; // 0-1
  formality: number; // 0-1
  humor: number; // 0-1
  directness: number; // 0-1
}

export type ResponseCategory =
  | 'backchannel_neutral'
  | 'backchannel_engaged'
  | 'backchannel_empathetic'
  | 'backchannel_thinking'
  | 'comfort_phrase'
  | 'acknowledgment'
  | 'transition';

interface ResponseVariant {
  text: string;
  minWarmth?: number;
  maxWarmth?: number;
  minEnergy?: number;
  maxEnergy?: number;
  minFormality?: number;
  maxFormality?: number;
  minDirectness?: number;
  maxDirectness?: number;
}

// ============================================================================
// PERSONA VOICE PROFILES
// ============================================================================

/**
 * Extract voice traits from persona config
 */
export function extractVoiceTraits(persona: PersonaConfig): PersonaVoiceTraits {
  const personality = persona.personality || {};

  return {
    warmth: personality.warmth ?? 0.7,
    energy: personality.energy ?? 0.6,
    formality: 1 - (personality.directness ?? 0.5), // More direct = less formal
    humor: personality.humorLevel ?? 0.4,
    directness: personality.directness ?? 0.5,
  };
}

// ============================================================================
// RESPONSE VARIANTS BY TRAIT
// ============================================================================

/**
 * Backchannel variants with trait requirements
 */
const BACKCHANNEL_VARIANTS: Record<string, ResponseVariant[]> = {
  // NEUTRAL - "I'm listening"
  neutral: [
    // High warmth variants
    { text: 'Mm-hmm', minWarmth: 0.6 },
    { text: 'Yeah', minWarmth: 0.5 },
    { text: 'Mhm', minWarmth: 0.7 },
    // Low formality variants
    { text: 'Uh-huh', maxFormality: 0.4 },
    { text: 'Yup', maxFormality: 0.3 },
    { text: "K", maxFormality: 0.2, minEnergy: 0.6 },
    // High formality variants
    { text: 'I see', minFormality: 0.5 },
    { text: 'Understood', minFormality: 0.7 },
    { text: 'Right', minFormality: 0.4 },
    // High energy variants
    { text: 'Got it!', minEnergy: 0.7 },
    { text: 'Okay!', minEnergy: 0.6 },
    // Low energy variants
    { text: 'Okay', maxEnergy: 0.5 },
    { text: 'Mm', maxEnergy: 0.4, minWarmth: 0.6 },
  ],

  // ENGAGED - "That's interesting"
  engaged: [
    // High warmth + energy
    { text: 'Oh!', minWarmth: 0.6, minEnergy: 0.5 },
    { text: 'Oh wow', minWarmth: 0.7, minEnergy: 0.6 },
    { text: 'No way!', minEnergy: 0.7, maxFormality: 0.4 },
    { text: 'Really?', minWarmth: 0.5 },
    { text: 'Interesting...', minFormality: 0.4 },
    // High formality
    { text: 'That\'s fascinating', minFormality: 0.6 },
    { text: 'How interesting', minFormality: 0.5 },
    // Low formality + high energy
    { text: 'Wait, seriously?', maxFormality: 0.4, minEnergy: 0.6 },
    { text: 'Whoa', maxFormality: 0.3, minEnergy: 0.6 },
    { text: 'Huh!', minEnergy: 0.5 },
    // Warm + curious
    { text: 'Tell me more', minWarmth: 0.6 },
    { text: 'Go on...', minWarmth: 0.5, maxEnergy: 0.6 },
  ],

  // EMPATHETIC - "I hear you"
  empathetic: [
    // High warmth required
    { text: 'I hear you', minWarmth: 0.7 },
    { text: 'That\'s hard', minWarmth: 0.6 },
    { text: 'I get it', minWarmth: 0.5 },
    { text: 'That sounds tough', minWarmth: 0.7 },
    { text: 'Of course', minWarmth: 0.6 },
    { text: 'I understand', minWarmth: 0.5, minFormality: 0.4 },
    // Very warm
    { text: 'Oh, honey', minWarmth: 0.9, maxFormality: 0.3 },
    { text: 'I\'m so sorry', minWarmth: 0.8 },
    { text: 'That must be really hard', minWarmth: 0.8 },
    // Warm + present
    { text: 'I\'m here', minWarmth: 0.7 },
    { text: 'Yeah...', minWarmth: 0.6 },
    { text: 'Mmm...', minWarmth: 0.7 },
  ],

  // THINKING - Processing sounds
  thinking: [
    // Universal
    { text: 'Hmm...' },
    { text: 'Let me think...' },
    { text: 'Well...' },
    // High formality
    { text: 'Let me consider that...', minFormality: 0.6 },
    { text: 'That\'s a good question...', minFormality: 0.4 },
    // Low formality + warm
    { text: 'Okay, so...', maxFormality: 0.5 },
    { text: 'Alright...', maxFormality: 0.4 },
    { text: 'You know...', minWarmth: 0.5, maxFormality: 0.4 },
    // High energy
    { text: 'Oh, let me think...', minEnergy: 0.6 },
    { text: 'Ooh, good question...', minEnergy: 0.6, minWarmth: 0.6 },
    // Low energy + reflective
    { text: 'Hmm, let me sit with that...', maxEnergy: 0.5, minWarmth: 0.6 },
  ],
};

/**
 * Comfort phrase variants with trait requirements
 */
const COMFORT_VARIANTS: ResponseVariant[] = [
  // High warmth
  { text: 'I hear you. That sounds really hard.', minWarmth: 0.7 },
  { text: 'That takes a lot of courage to share.', minWarmth: 0.7 },
  { text: 'You\'re not alone in this.', minWarmth: 0.8 },
  { text: 'Thank you for trusting me with that.', minWarmth: 0.8 },

  // Practical + warm
  { text: 'One step at a time.', minWarmth: 0.5, minDirectness: 0.5 },
  { text: 'You\'re doing better than you think.', minWarmth: 0.6 },
  { text: 'That\'s a lot to carry.', minWarmth: 0.6 },

  // Direct + supportive
  { text: 'That\'s valid.', minDirectness: 0.6 },
  { text: 'Makes sense you\'d feel that way.', minDirectness: 0.5 },
  { text: 'Anyone would struggle with that.', minDirectness: 0.5, minWarmth: 0.5 },

  // Very warm + gentle
  { text: 'Take your time. I\'m here.', minWarmth: 0.8 },
  { text: 'You don\'t have to have it all figured out.', minWarmth: 0.7 },
  { text: 'It\'s okay to not be okay.', minWarmth: 0.8 },

  // Energetic + encouraging
  { text: 'Hey, you showed up. That counts.', minEnergy: 0.6, minWarmth: 0.6 },
  { text: 'You\'ve got this. Seriously.', minEnergy: 0.6, maxFormality: 0.4 },
];

/**
 * Acknowledgment variants
 */
const ACKNOWLEDGMENT_VARIANTS: ResponseVariant[] = [
  // Warm
  { text: 'I appreciate you sharing that.', minWarmth: 0.7 },
  { text: 'Thanks for telling me.', minWarmth: 0.6 },

  // Direct
  { text: 'Got it.', minDirectness: 0.6 },
  { text: 'Okay, I understand.', minDirectness: 0.5 },
  { text: 'Makes sense.', minDirectness: 0.6 },

  // Energetic
  { text: 'Oh, totally!', minEnergy: 0.7, maxFormality: 0.4 },
  { text: 'Yes, exactly!', minEnergy: 0.6 },

  // Formal
  { text: 'I understand completely.', minFormality: 0.6 },
  { text: 'Thank you for clarifying.', minFormality: 0.7 },
];

// ============================================================================
// RESPONSE SELECTION
// ============================================================================

/**
 * Check if a variant matches the persona's traits
 */
function variantMatchesTraits(
  variant: ResponseVariant,
  traits: PersonaVoiceTraits
): boolean {
  if (variant.minWarmth !== undefined && traits.warmth < variant.minWarmth) return false;
  if (variant.maxWarmth !== undefined && traits.warmth > variant.maxWarmth) return false;
  if (variant.minEnergy !== undefined && traits.energy < variant.minEnergy) return false;
  if (variant.maxEnergy !== undefined && traits.energy > variant.maxEnergy) return false;
  if (variant.minFormality !== undefined && traits.formality < variant.minFormality) return false;
  if (variant.maxFormality !== undefined && traits.formality > variant.maxFormality) return false;
  return true;
}

/**
 * Get eligible variants for a persona
 */
function getEligibleVariants(
  variants: ResponseVariant[],
  traits: PersonaVoiceTraits
): ResponseVariant[] {
  return variants.filter((v) => variantMatchesTraits(v, traits));
}

// ============================================================================
// USAGE TRACKING (avoid repetition)
// ============================================================================

// Session-scoped usage tracking
const usageTracking = new Map<string, Map<string, number>>();

function getUsageKey(sessionId: string, category: string): Map<string, number> {
  const key = `${sessionId}:${category}`;
  if (!usageTracking.has(key)) {
    usageTracking.set(key, new Map());
  }
  return usageTracking.get(key)!;
}

function trackUsage(sessionId: string, category: string, text: string): void {
  const usage = getUsageKey(sessionId, category);
  usage.set(text, (usage.get(text) || 0) + 1);
}

function getUsageCount(sessionId: string, category: string, text: string): number {
  const usage = getUsageKey(sessionId, category);
  return usage.get(text) || 0;
}

/**
 * Clear session usage tracking
 */
export function clearSessionUsage(sessionId: string): void {
  for (const key of usageTracking.keys()) {
    if (key.startsWith(`${sessionId}:`)) {
      usageTracking.delete(key);
    }
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get a dynamic backchannel for a persona
 */
export function getDynamicBackchannel(
  persona: PersonaConfig,
  sessionId: string,
  type: 'neutral' | 'engaged' | 'empathetic' | 'thinking' = 'neutral'
): string {
  const traits = extractVoiceTraits(persona);
  const variants = BACKCHANNEL_VARIANTS[type] || BACKCHANNEL_VARIANTS.neutral;
  const eligible = getEligibleVariants(variants, traits);

  if (eligible.length === 0) {
    log.warn({ personaId: persona.identity?.id, type }, 'No eligible backchannels');
    return 'Mm-hmm'; // Fallback
  }

  // Sort by least used
  const sorted = [...eligible].sort((a, b) => {
    const aUsage = getUsageCount(sessionId, `backchannel_${type}`, a.text);
    const bUsage = getUsageCount(sessionId, `backchannel_${type}`, b.text);
    return aUsage - bUsage;
  });

  // Pick from top 3 least used (with randomness)
  const topChoices = sorted.slice(0, Math.min(3, sorted.length));
  const selected = topChoices[Math.floor(Math.random() * topChoices.length)];

  trackUsage(sessionId, `backchannel_${type}`, selected.text);

  return selected.text;
}

/**
 * Get a dynamic comfort phrase for a persona
 */
export function getDynamicComfortPhrase(
  persona: PersonaConfig,
  sessionId: string
): string {
  const traits = extractVoiceTraits(persona);
  const eligible = getEligibleVariants(COMFORT_VARIANTS, traits);

  if (eligible.length === 0) {
    return 'I hear you.'; // Fallback
  }

  // Sort by least used
  const sorted = [...eligible].sort((a, b) => {
    const aUsage = getUsageCount(sessionId, 'comfort', a.text);
    const bUsage = getUsageCount(sessionId, 'comfort', b.text);
    return aUsage - bUsage;
  });

  const topChoices = sorted.slice(0, Math.min(3, sorted.length));
  const selected = topChoices[Math.floor(Math.random() * topChoices.length)];

  trackUsage(sessionId, 'comfort', selected.text);

  return selected.text;
}

/**
 * Get a dynamic acknowledgment for a persona
 */
export function getDynamicAcknowledgment(
  persona: PersonaConfig,
  sessionId: string
): string {
  const traits = extractVoiceTraits(persona);
  const eligible = getEligibleVariants(ACKNOWLEDGMENT_VARIANTS, traits);

  if (eligible.length === 0) {
    return 'Got it.'; // Fallback
  }

  const sorted = [...eligible].sort((a, b) => {
    const aUsage = getUsageCount(sessionId, 'acknowledgment', a.text);
    const bUsage = getUsageCount(sessionId, 'acknowledgment', b.text);
    return aUsage - bUsage;
  });

  const topChoices = sorted.slice(0, Math.min(3, sorted.length));
  const selected = topChoices[Math.floor(Math.random() * topChoices.length)];

  trackUsage(sessionId, 'acknowledgment', selected.text);

  return selected.text;
}

/**
 * Get a dynamic thinking sound for a persona
 */
export function getDynamicThinkingSound(
  persona: PersonaConfig,
  sessionId: string
): string {
  return getDynamicBackchannel(persona, sessionId, 'thinking');
}

// ============================================================================
// PERSONA-SPECIFIC OVERRIDES
// ============================================================================

/**
 * Persona-specific phrases that should ONLY come from that persona
 */
const PERSONA_EXCLUSIVE_PHRASES: Record<string, string[]> = {
  ferni: [
    'Second chances are sacred.',
    'Your net worth is not your self-worth.',
    'What would the version of you who\'s already figured this out say?',
    'Let\'s sit with that for a moment.',
  ],
  'maya-santos': [
    'Progress, not perfection.',
    'Small wins compound.',
    'You showed up. That\'s what matters.',
    'Tiny steps, massive results.',
  ],
  'peter-john': [
    'Know what you own!',
    'That\'s a ten-bagger waiting to happen.',
    'The story is everything.',
    'Research before you invest.',
  ],
  'nayan-patel': [
    'Stay the course.',
    'Time in the market beats timing the market.',
    'Cost matters.',
    'Don\'t just do something, stand there.',
  ],
  'alex-chen': [
    'Got it covered.',
    'Systems over intentions.',
    'Consider it handled.',
    'Let me take care of that.',
  ],
  'jordan-taylor': [
    'Life is celebration!',
    'Details matter.',
    'Let\'s make this memorable.',
    'Every milestone deserves a moment.',
  ],
};

/**
 * Get a persona-exclusive phrase (their signature lines)
 */
export function getPersonaExclusivePhrase(
  persona: PersonaConfig,
  sessionId: string
): string | null {
  const personaId = persona.identity?.id;
  if (!personaId) return null;

  const exclusives = PERSONA_EXCLUSIVE_PHRASES[personaId];
  if (!exclusives || exclusives.length === 0) return null;

  // Sort by least used
  const sorted = [...exclusives].sort((a, b) => {
    const aUsage = getUsageCount(sessionId, 'exclusive', a);
    const bUsage = getUsageCount(sessionId, 'exclusive', b);
    return aUsage - bUsage;
  });

  // Only return if not overused (max 2 times per session)
  const selected = sorted[0];
  if (getUsageCount(sessionId, 'exclusive', selected) >= 2) {
    return null;
  }

  trackUsage(sessionId, 'exclusive', selected);
  return selected;
}

// ============================================================================
// HELPER: Get responses by personaId (uses persona trait profiles)
// ============================================================================

/**
 * Persona trait profiles - defines personality characteristics for each persona
 * These are used to generate appropriate backchannels without async registry calls
 */
const PERSONA_TRAIT_PROFILES: Record<string, PersonaVoiceTraits> = {
  ferni: { warmth: 0.85, energy: 0.5, formality: 0.4, humor: 0.5, directness: 0.4 },
  'maya-santos': { warmth: 0.9, energy: 0.75, formality: 0.3, humor: 0.6, directness: 0.5 },
  'alex-chen': { warmth: 0.7, energy: 0.65, formality: 0.6, humor: 0.4, directness: 0.7 },
  'peter-john': { warmth: 0.75, energy: 0.9, formality: 0.3, humor: 0.6, directness: 0.6 },
  'nayan-patel': { warmth: 0.7, energy: 0.4, formality: 0.7, humor: 0.3, directness: 0.5 },
  'jordan-taylor': { warmth: 0.85, energy: 0.85, formality: 0.3, humor: 0.7, directness: 0.5 },
};

/**
 * Get a dynamic backchannel using just personaId
 * This is the main entry point for integration with other systems
 */
export function getDynamicBackchannelByPersonaId(
  personaId: string,
  sessionId: string,
  type: 'neutral' | 'engaged' | 'empathetic' | 'thinking' = 'neutral'
): string {
  // Get traits for this persona, with fallback to balanced defaults
  const traits = PERSONA_TRAIT_PROFILES[personaId] || {
    warmth: 0.7,
    energy: 0.6,
    formality: 0.5,
    humor: 0.4,
    directness: 0.5,
  };

  // Get eligible variants based on traits
  const variants = BACKCHANNEL_VARIANTS[type] || BACKCHANNEL_VARIANTS.neutral;
  const eligible = getEligibleVariants(variants, traits);

  if (eligible.length === 0) {
    // Fallback based on type
    return type === 'empathetic' ? 'I hear you' : type === 'engaged' ? 'Oh?' : 'Mm-hmm';
  }

  // Sort by least used to avoid repetition
  const sorted = [...eligible].sort((a, b) => {
    const aUsage = getUsageCount(sessionId, `backchannel_${type}`, a.text);
    const bUsage = getUsageCount(sessionId, `backchannel_${type}`, b.text);
    return aUsage - bUsage;
  });

  // Pick from top 3 least used
  const topChoices = sorted.slice(0, Math.min(3, sorted.length));
  const selected = topChoices[Math.floor(Math.random() * topChoices.length)];

  trackUsage(sessionId, `backchannel_${type}`, selected.text);

  return selected.text;
}

/**
 * Map emotion/topic context to backchannel type
 */
export function mapContextToBackchannelType(context: {
  topicSeriousness?: 'serious' | 'casual' | 'emotional';
  userEmotion?: string;
  userJustSharedSomethingPersonal?: boolean;
}): 'neutral' | 'engaged' | 'empathetic' | 'thinking' {
  if (context.userJustSharedSomethingPersonal || context.topicSeriousness === 'emotional') {
    return 'empathetic';
  }
  if (context.topicSeriousness === 'serious') {
    return 'empathetic';
  }
  if (context.userEmotion === 'excited' || context.userEmotion === 'happy') {
    return 'engaged';
  }
  return 'neutral';
}

export {
  BACKCHANNEL_VARIANTS,
  COMFORT_VARIANTS,
  ACKNOWLEDGMENT_VARIANTS,
  PERSONA_EXCLUSIVE_PHRASES,
};
