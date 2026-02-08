/**
 * Cameo Timing Configuration
 *
 * Centralized timing constants for the Team Cameo system.
 * These values are carefully tuned for natural, human-like transitions.
 *
 * Philosophy: Cameos should feel like a friend briefly chiming in -
 * quick enough to not disrupt flow, long enough to add value.
 */

import type { CameoConfig, CameoPersonaId, PersonaCameoConfig } from './types.js';
import { getPersonaColor, getPersonaGlowColor } from '../../config/brand-colors.js';

// ============================================================================
// CORE TIMING CONSTANTS
// ============================================================================

/**
 * Timing constants for cameo transitions
 */
export const CAMEO_TIMING = {
  // ========================================
  // Transition Timing
  // ========================================

  /** Delay before voice switch after cameo announced (ms) - allows sound + visual */
  ARRIVAL_DELAY: 500, // 500ms gives better timing margin for sound/visual sync

  /** Delay before returning to Ferni after cameo ends (ms) */
  RETURN_DELAY: 300,

  /** Duration of arrival sound effect (ms) */
  ARRIVAL_SOUND_DURATION: 500,

  /** Duration of return sound effect (ms) */
  RETURN_SOUND_DURATION: 400,

  // ========================================
  // Cameo Duration Limits
  // ========================================

  /** Maximum time a cameo can last (ms) - hard limit */
  MAX_DURATION: 15_000, // 15 seconds

  /** Ideal/target duration for cameos (ms) */
  IDEAL_DURATION: 5_000, // 5 seconds - the sweet spot

  /** Minimum duration for a cameo to be worthwhile (ms) */
  MIN_DURATION: 2_000, // 2 seconds

  /** Warning threshold - prompt handback if exceeded (ms) */
  WARNING_DURATION: 10_000, // 10 seconds

  // ========================================
  // Cooldown & Rate Limiting
  // ========================================

  /** Minimum time between cameos (ms) */
  COOLDOWN: 60_000, // 60 seconds

  /** Reduced cooldown for high-priority cameos (ms) */
  HIGH_PRIORITY_COOLDOWN: 30_000, // 30 seconds

  /** Celebration cameos can happen more frequently (ms) */
  CELEBRATION_COOLDOWN: 20_000, // 20 seconds

  /** Maximum cameos per session */
  MAX_PER_SESSION: 6,

  /** Maximum cameos in a 10-minute window */
  MAX_PER_WINDOW: 3,

  /** Window size for rate limiting (ms) */
  RATE_LIMIT_WINDOW: 10 * 60 * 1000, // 10 minutes

  // ========================================
  // Animation Timing (synced with frontend)
  // ========================================

  /** Visual transition duration for avatar morph (ms) */
  VISUAL_TRANSITION: 350,

  /** Glow pulse duration during cameo (ms) */
  GLOW_PULSE_DURATION: 600,

  /** Text morph duration (ms) */
  TEXT_MORPH_DURATION: 250,

  /** Color transition duration (ms) */
  COLOR_TRANSITION: 400,

  // ========================================
  // Voice Timing
  // ========================================

  /** Buffer time for voice switch to complete (ms) */
  VOICE_SWITCH_BUFFER: 100,

  /** Time to wait for TTS to start after voice switch (ms) */
  TTS_START_BUFFER: 50,

  // ========================================
  // Orchestrator Synchronization
  // ========================================

  /** Max time to wait for the voice-agent handler to confirm greeting (ms) */
  HANDLER_TIMEOUT: 10_000,
} as const;

// ============================================================================
// PERSONA-SPECIFIC CONFIGURATIONS
// ============================================================================

/**
 * Persona-specific cameo configurations
 * Each persona has their own style, energy, and typical duration
 */
export const PERSONA_CAMEO_CONFIGS: Record<CameoPersonaId, PersonaCameoConfig> = {
  'peter-john': {
    introductions: [
      'Quick data point—',
      'Hey, I was crunching some numbers—',
      'Oh! I noticed something interesting—',
      'Sorry to jump in, but I found something—',
      'Quick insight from the data—',
    ],
    handbacks: [
      'Anyway, back to Ferni!',
      "That's all from me. Ferni?",
      'Data delivered. Over to you!',
      "Okay, I'll let you two continue!",
      'Just wanted to share that. Ferni?',
    ],
    triggerTopics: [
      'stock',
      'investment',
      'portfolio',
      'market',
      'research',
      'data',
      'analysis',
      'numbers',
      'statistics',
      'pattern',
      'trend',
      'performance',
      'returns',
      'p/e ratio',
      'dividend',
    ],
    typicalDuration: 5000,
    isEnergetic: false,
    color: getPersonaColor('peter-john'),
    glowColor: getPersonaGlowColor('peter-john'),
  },

  'alex-chen': {
    introductions: [
      'Quick scheduling thought—',
      'Hey, saw something on your calendar—',
      'Just wanted to flag—',
      'Oh! Before I forget—',
      'Quick heads up—',
    ],
    handbacks: [
      'Just wanted you to know. Ferni?',
      'Back to Ferni!',
      "Okay, that's my two cents!",
      "I'll let Ferni take it from here!",
      'All set. Over to you, Ferni!',
    ],
    triggerTopics: [
      'calendar',
      'schedule',
      'meeting',
      'appointment',
      'email',
      'reminder',
      'deadline',
      'busy',
      'free time',
      'availability',
      'communication',
      'message',
      'text',
      'call',
      'event',
    ],
    typicalDuration: 4000,
    isEnergetic: false,
    color: getPersonaColor('alex-chen'),
    glowColor: getPersonaGlowColor('alex-chen'),
  },

  'maya-santos': {
    introductions: [
      'Hey, gentle reminder—',
      'Quick check-in on your habit—',
      'Noticed something about your routine—',
      'Just wanted to pop in—',
      'Small thing, but—',
    ],
    handbacks: [
      'No pressure. Back to Ferni!',
      'Just something to think about. Ferni?',
      "Okay, I'll step back now!",
      "That's all from me. Ferni's got you!",
      'Small steps, big changes. Ferni?',
    ],
    triggerTopics: [
      'habit',
      'routine',
      'morning',
      'evening',
      'exercise',
      'meditation',
      'sleep',
      'budget',
      'spending',
      'saving',
      'tracking',
      'streak',
      'consistency',
      'daily',
      'weekly',
    ],
    typicalDuration: 4500,
    isEnergetic: false,
    color: getPersonaColor('maya-santos'),
    glowColor: getPersonaGlowColor('maya-santos'),
  },

  'jordan-taylor': {
    introductions: [
      'Ooh! This connects to your plans—',
      'Hey, got excited about something—',
      'Quick thought about your goals—',
      'Oh my gosh, this is perfect—',
      'I had to jump in—',
    ],
    handbacks: [
      "Exciting stuff! Ferni's got this!",
      'Back to the conversation!',
      "Okay okay, I'll let you talk!",
      "Can't wait to plan more! Ferni?",
      'So many possibilities! Back to Ferni!',
    ],
    triggerTopics: [
      'vacation',
      'trip',
      'travel',
      'plan',
      'goal',
      'milestone',
      'celebration',
      'birthday',
      'anniversary',
      'wedding',
      'retirement',
      'future',
      'dream',
      'bucket list',
      'event',
    ],
    typicalDuration: 5500,
    isEnergetic: true,
    color: getPersonaColor('jordan-taylor'),
    glowColor: getPersonaGlowColor('jordan-taylor'),
  },

  'nayan-patel': {
    introductions: [
      'A moment of perspective—',
      'Consider this—',
      'The long view suggests—',
      'A thought, if I may—',
      'Something to sit with—',
    ],
    handbacks: [
      'Something to sit with. Ferni?',
      'Namaskaram. Back to Ferni.',
      "I'll leave you with that.",
      'The path unfolds. Ferni?',
      'Patience reveals all. Ferni?',
    ],
    triggerTopics: [
      'meaning',
      'purpose',
      'wisdom',
      'perspective',
      'patience',
      'long-term',
      'legacy',
      'values',
      'philosophy',
      'life',
      'peace',
      'calm',
      'meditation',
      'spiritual',
      'guidance',
    ],
    typicalDuration: 6000,
    isEnergetic: false,
    color: getPersonaColor('nayan-patel'),
    glowColor: getPersonaGlowColor('nayan-patel'),
  },
};

// ============================================================================
// FULL CONFIGURATION
// ============================================================================

/**
 * Complete cameo configuration
 */
export const CAMEO_CONFIG: CameoConfig = {
  enabled: true,
  cooldownMs: CAMEO_TIMING.COOLDOWN,
  maxCameosPerSession: CAMEO_TIMING.MAX_PER_SESSION,
  maxDurationMs: CAMEO_TIMING.MAX_DURATION,
  idealDurationMs: CAMEO_TIMING.IDEAL_DURATION,
  arrivalDelayMs: CAMEO_TIMING.ARRIVAL_DELAY,
  returnDelayMs: CAMEO_TIMING.RETURN_DELAY,
  personas: PERSONA_CAMEO_CONFIGS,
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get the cooldown time for a given priority level
 */
export function getCooldownForPriority(priority: 'normal' | 'high' | 'celebration'): number {
  switch (priority) {
    case 'celebration':
      return CAMEO_TIMING.CELEBRATION_COOLDOWN;
    case 'high':
      return CAMEO_TIMING.HIGH_PRIORITY_COOLDOWN;
    default:
      return CAMEO_TIMING.COOLDOWN;
  }
}

/**
 * Get persona-specific cameo configuration
 */
export function getPersonaCameoConfig(personaId: CameoPersonaId): PersonaCameoConfig {
  return PERSONA_CAMEO_CONFIGS[personaId];
}

/**
 * Get a random introduction phrase for a persona
 */
export function getRandomIntroduction(personaId: CameoPersonaId): string {
  const config = PERSONA_CAMEO_CONFIGS[personaId];
  const introductions = config.introductions;
  return introductions[Math.floor(Math.random() * introductions.length)];
}

/**
 * Get a random handback phrase for a persona
 */
export function getRandomHandback(personaId: CameoPersonaId): string {
  const config = PERSONA_CAMEO_CONFIGS[personaId];
  const handbacks = config.handbacks;
  return handbacks[Math.floor(Math.random() * handbacks.length)];
}

/**
 * Check if enough time has passed since last cameo
 * @param lastCameoEndTime - When the last cameo ended
 * @param priority - Priority level affects cooldown
 * @param customCooldownMs - Optional custom cooldown (e.g., from user preferences)
 */
export function isCooldownExpired(
  lastCameoEndTime: number,
  priority: 'normal' | 'high' | 'celebration' = 'normal',
  customCooldownMs?: number
): boolean {
  const baseCooldown = getCooldownForPriority(priority);
  // Use custom cooldown if provided and greater than base (more restrictive wins)
  const cooldown = customCooldownMs ? Math.max(baseCooldown, customCooldownMs) : baseCooldown;
  return Date.now() - lastCameoEndTime >= cooldown;
}

/**
 * Get remaining cooldown time in milliseconds
 * @param lastCameoEndTime - When the last cameo ended
 * @param priority - Priority level affects cooldown
 * @param customCooldownMs - Optional custom cooldown (e.g., from user preferences)
 */
export function getRemainingCooldown(
  lastCameoEndTime: number,
  priority: 'normal' | 'high' | 'celebration' = 'normal',
  customCooldownMs?: number
): number {
  const baseCooldown = getCooldownForPriority(priority);
  // Use custom cooldown if provided and greater than base (more restrictive wins)
  const cooldown = customCooldownMs ? Math.max(baseCooldown, customCooldownMs) : baseCooldown;
  const elapsed = Date.now() - lastCameoEndTime;
  return Math.max(0, cooldown - elapsed);
}

/**
 * Calculate total transition time (arrival + return)
 */
export function getTotalTransitionTime(): number {
  return (
    CAMEO_TIMING.ARRIVAL_DELAY +
    CAMEO_TIMING.ARRIVAL_SOUND_DURATION +
    CAMEO_TIMING.RETURN_DELAY +
    CAMEO_TIMING.RETURN_SOUND_DURATION
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default CAMEO_TIMING;
