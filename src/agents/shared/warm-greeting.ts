/**
 * Warm Greeting Generator
 *
 * Generates instant greetings during prewarm so first response is immediate.
 * This provides a fallback greeting that can be spoken while the personalized
 * greeting loads in the background.
 *
 * Performance impact: -100-200ms on first response
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'WarmGreeting' });

// ============================================================================
// WARM GREETING CACHE
// ============================================================================

interface WarmGreetingCache {
  greeting: string;
  personaId: string;
  generatedAt: number;
  isGeneric: boolean;
}

let warmGreetingCache: WarmGreetingCache | null = null;

// ============================================================================
// PERSONA-SPECIFIC INSTANT GREETINGS
// ============================================================================

// IMPORTANT: These should feel like FERNI, not customer service
// No "How can I help you?" - we're friends, not agents
const INSTANT_GREETINGS: Record<string, string[]> = {
  ferni: [
    "Hey! What's going on?",
    "Oh hey! What's up?",
    "Hey you. What's happening?",
    'Hey! Talk to me.',
    "Hey there. What's on your mind?",
  ],
  'alex-chen': [
    "Alex here. What's up?",
    "Hey, it's Alex. What's going on?",
    'Alex here. Talk to me.',
  ],
  'maya-santos': [
    "Hey! Maya here. What's going on?",
    "Hi! It's Maya. How are you?",
    "Maya here. What's on your mind?",
  ],
  'jordan-taylor': [
    'Oh! Hey! What are we doing?',
    "Hey! It's Jordan. What's happening?",
    'Jordan here! Tell me everything!',
  ],
  'peter-john': [
    'Peter here. What are you thinking about?',
    "Hey! Peter here. What's interesting?",
    "Hey! What's on your mind?",
  ],
  'nayan-patel': [
    "Nayan here. I'm listening.",
    'Hello, friend. What brings you?',
    "Hey. What's on your mind?",
  ],
};

const DEFAULT_GREETINGS = ["Hey! What's going on?", "Hey there. What's up?", 'Hey! Talk to me.'];

// ============================================================================
// GREETING GENERATION
// ============================================================================

/**
 * Generate an instant greeting for a persona.
 * This is called during prewarm to have a greeting ready immediately.
 */
export function generateWarmGreeting(personaId: string): string {
  const greetings = INSTANT_GREETINGS[personaId] || DEFAULT_GREETINGS;
  const index = Math.floor(Math.random() * greetings.length);
  return greetings[index];
}

/**
 * Pre-warm a greeting during agent initialization.
 * Call this during prewarm to have instant first response.
 */
export function prewarmGreeting(personaId: string): void {
  const greeting = generateWarmGreeting(personaId);

  warmGreetingCache = {
    greeting,
    personaId,
    generatedAt: Date.now(),
    isGeneric: true,
  };

  log.debug({ personaId, greeting: greeting.slice(0, 30) }, 'Prewarmed greeting');
}

/**
 * Get the prewarmed greeting if available.
 * Returns null if no greeting is prewarmed or it's stale (>5 min old).
 */
export function getWarmGreeting(personaId?: string): string | null {
  if (!warmGreetingCache) return null;

  // Check if greeting is stale (older than 5 minutes)
  const age = Date.now() - warmGreetingCache.generatedAt;
  if (age > 5 * 60 * 1000) {
    log.debug('Warm greeting expired');
    warmGreetingCache = null;
    return null;
  }

  // If personaId provided, check it matches
  if (personaId && warmGreetingCache.personaId !== personaId) {
    log.debug(
      { cached: warmGreetingCache.personaId, requested: personaId },
      'Warm greeting persona mismatch'
    );
    return null;
  }

  return warmGreetingCache.greeting;
}

/**
 * Clear the warm greeting cache.
 * Call this after the personalized greeting has been generated.
 */
export function clearWarmGreeting(): void {
  warmGreetingCache = null;
}

/**
 * Check if we have a valid warm greeting.
 */
export function hasWarmGreeting(personaId?: string): boolean {
  return getWarmGreeting(personaId) !== null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generateWarmGreeting,
  prewarmGreeting,
  getWarmGreeting,
  clearWarmGreeting,
  hasWarmGreeting,
};
