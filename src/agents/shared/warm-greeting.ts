/**
 * Warm Greeting Generator
 *
 * Generates instant greetings during prewarm so first response is immediate.
 * This provides a fallback greeting that can be spoken while the personalized
 * greeting loads in the background.
 *
 * NOW WITH DYNAMIC SSML - Greetings feel alive, not scripted
 *
 * ZERO DEPENDENCIES - This module is loaded during prewarm hot path.
 * Do NOT import heavy modules like safe-logger here.
 *
 * Performance impact: -100-200ms on first response
 */

// Lightweight logging (zero dependencies - don't import safe-logger!)
const _log = (level: string, msg: string, data?: Record<string, unknown>) => {
  if (process.env.NODE_ENV !== 'production' || level === 'error') {
    const dataStr = data ? ` ${JSON.stringify(data)}` : '';
    process.stderr.write(`[warm-greeting] [${level}] ${msg}${dataStr}\n`);
  }
};

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
// DYNAMIC GREETING COMPONENTS
// ============================================================================

// Greeting atoms that get combined dynamically
const FERNI_OPENERS = [
  { text: 'Hey!', emotion: 'happy', energy: 'high' },
  { text: 'Oh hey!', emotion: 'surprised', energy: 'high' },
  { text: 'Hey.', emotion: null, energy: 'calm' },
  { text: 'Hey there.', emotion: 'affectionate', energy: 'warm' },
  { text: 'Oh!', emotion: 'surprised', energy: 'high' },
];

const FERNI_MIDDLES = [
  { text: "What's going on?", pause: 150 },
  { text: "What's up?", pause: 100 },
  { text: "What's happening?", pause: 150 },
  { text: 'Talk to me.', pause: 200 },
  { text: "What's on your mind?", pause: 200 },
  { text: 'Good to see you.', pause: 150 },
];

const FERNI_FLAVOR = [
  // Optional additions that make it feel alive
  { text: 'Come in, come in.', chance: 0.15 },
  { text: 'I was just thinking about something.', chance: 0.1 },
  { text: 'Perfect timing.', chance: 0.12 },
  { text: '[laughter] Sorry— I was in my head.', chance: 0.08 },
];

/**
 * Build a dynamic SSML greeting for Ferni
 */
function buildDynamicFerniGreeting(): string {
  const opener = FERNI_OPENERS[Math.floor(Math.random() * FERNI_OPENERS.length)];
  const middle = FERNI_MIDDLES[Math.floor(Math.random() * FERNI_MIDDLES.length)];

  // Maybe add flavor
  const flavor = FERNI_FLAVOR.find((f) => Math.random() < f.chance);

  // Build with SSML
  let greeting = '';

  // Opening with emotion
  if (opener.emotion) {
    greeting += `<emotion value="${opener.emotion}"/>`;
  }
  greeting += opener.text;

  // Pause between opener and middle
  const pauseMs = opener.energy === 'high' ? 100 : opener.energy === 'calm' ? 250 : 150;
  greeting += `<break time="${pauseMs}ms"/>`;

  // Maybe add flavor before the question
  if (flavor) {
    greeting += `${flavor.text}<break time="200ms"/>`;
  }

  // Main question/statement
  greeting += middle.text;

  return greeting;
}

// ============================================================================
// PERSONA-SPECIFIC INSTANT GREETINGS (Fallback static list)
// ============================================================================

// IMPORTANT: These should feel like FERNI, not customer service
// No "How can I help you?" - we're friends, not agents
const INSTANT_GREETINGS: Record<string, string[]> = {
  ferni: [
    // These are fallbacks - prefer buildDynamicFerniGreeting()
    '<emotion value="happy"/>Hey!<break time="150ms"/>What\'s going on?',
    '<emotion value="surprised"/>Oh hey!<break time="100ms"/>What\'s up?',
    'Hey.<break time="200ms"/>What\'s happening?',
    '<emotion value="affectionate"/>Hey there.<break time="150ms"/>Talk to me.',
    'Hey!<break time="100ms"/>What\'s on your mind?',
  ],
  'alex-chen': [
    'Alex here.<break time="150ms"/>What\'s up?',
    'Hey, it\'s Alex.<break time="100ms"/>What\'s going on?',
    'Alex here.<break time="150ms"/>Talk to me.',
  ],
  'maya-santos': [
    '<emotion value="happy"/>Hey!<break time="100ms"/>Maya here.<break time="150ms"/>What\'s going on?',
    'Hi!<break time="100ms"/>It\'s Maya.<break time="150ms"/>How are you?',
    'Maya here.<break time="150ms"/>What\'s on your mind?',
  ],
  'jordan-taylor': [
    '<emotion value="surprised"/>Oh!<break time="100ms"/>Hey!<break time="100ms"/>What are we doing?',
    '<emotion value="happy"/>Hey!<break time="100ms"/>It\'s Jordan.<break time="150ms"/>What\'s happening?',
    'Jordan here!<break time="100ms"/>Tell me everything!',
  ],
  'peter-john': [
    '<emotion value="curious"/>Peter here.<break time="150ms"/>What are you thinking about?',
    'Hey!<break time="100ms"/>Peter here.<break time="150ms"/>What\'s interesting?',
    'Hey!<break time="150ms"/>What\'s on your mind?',
  ],
  'nayan-patel': [
    'Nayan here.<break time="200ms"/>I\'m listening.',
    '<emotion value="affectionate"/>Hello, friend.<break time="200ms"/>What brings you?',
    'Hey.<break time="200ms"/>What\'s on your mind?',
  ],
};

const DEFAULT_GREETINGS = [
  '<emotion value="happy"/>Hey!<break time="150ms"/>What\'s going on?',
  'Hey there.<break time="150ms"/>What\'s up?',
  'Hey!<break time="100ms"/>Talk to me.',
];

// ============================================================================
// GREETING GENERATION
// ============================================================================

/**
 * Generate an instant greeting for a persona.
 * This is called during prewarm to have a greeting ready immediately.
 *
 * For Ferni: Uses dynamic SSML builder for variety
 * For others: Uses persona-specific static greetings with SSML
 */
export function generateWarmGreeting(personaId: string): string {
  // For Ferni, use dynamic builder 70% of the time for more variety
  if (personaId === 'ferni' && Math.random() < 0.7) {
    return buildDynamicFerniGreeting();
  }

  // Fall back to static list (with SSML)
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

  _log('debug', 'Prewarmed greeting', { personaId, greeting: greeting.slice(0, 30) });
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
    _log('debug', 'Warm greeting expired');
    warmGreetingCache = null;
    return null;
  }

  // If personaId provided, check it matches
  if (personaId && warmGreetingCache.personaId !== personaId) {
    _log('debug', 'Warm greeting persona mismatch', {
      cached: warmGreetingCache.personaId,
      requested: personaId,
    });
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
