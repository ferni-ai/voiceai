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
// CONTEXT-AWARE GREETING SYSTEM
// "Better than Human" - greetings that feel emotionally attuned
// ============================================================================

export interface GreetingContext {
  /** Hour of day (0-23) */
  hour?: number;
  /** User's last emotional state */
  lastEmotion?: string;
  /** Last emotion intensity (0-1) */
  lastEmotionIntensity?: number;
  /** Days since last conversation */
  daysSinceLastChat?: number;
  /** Whether this is a returning user */
  isReturningUser?: boolean;
  /** User's name if known */
  userName?: string;
  /** Relationship stage */
  relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
}

// Time-of-day appropriate greetings
// HUMAN patterns - not just warm, genuinely human speech:
// - Incomplete thoughts ("...hey")
// - Caught mid-moment ("Hmm? Oh, hey")
// - Natural hesitations
// - Varying energy levels
const TIME_BASED_OPENERS = {
  earlyMorning: [
    // 5am-8am - still waking up, soft
    { text: '...hey.', emotion: null, energy: 'calm' },
    { text: 'Hmm? Oh, hey.', emotion: null, energy: 'calm' },
    { text: 'Morning.', emotion: null, energy: 'calm' },
    { text: 'Hey.', emotion: 'affectionate', energy: 'calm' },
  ],
  morning: [
    // 8am-12pm - settling in
    { text: 'Hey.', emotion: null, energy: 'warm' },
    { text: 'Oh. Hey.', emotion: null, energy: 'warm' },
    { text: '...hey there.', emotion: 'affectionate', energy: 'warm' },
    { text: 'Hey.', emotion: 'affectionate', energy: 'warm' },
  ],
  afternoon: [
    // 12pm-6pm - present, engaged
    { text: 'Hey.', emotion: null, energy: 'warm' },
    { text: 'Oh, hey.', emotion: null, energy: 'warm' },
    { text: 'Hey.', emotion: 'curious', energy: 'warm' },
    { text: '...hey.', emotion: 'affectionate', energy: 'warm' },
  ],
  evening: [
    // 6pm-10pm - winding down
    { text: 'Hey.', emotion: null, energy: 'calm' },
    { text: '...hey.', emotion: 'affectionate', energy: 'calm' },
    { text: 'Oh. Hey.', emotion: null, energy: 'calm' },
    { text: 'Hey.', emotion: 'affectionate', energy: 'calm' },
  ],
  lateNight: [
    // 10pm-5am - quiet, present
    { text: '...hey.', emotion: null, energy: 'calm' },
    { text: 'Hey.', emotion: null, energy: 'calm' },
    { text: 'Oh. Hey.', emotion: 'affectionate', energy: 'calm' },
    { text: '...still up?', emotion: null, energy: 'calm' },
  ],
};

// Follow-ups - HUMAN, not interview questions
// Some are questions, some are just statements, some are incomplete
const EMOTION_MIDDLES = {
  neutral: [
    { text: "What's going on?", pause: 200 },
    { text: "What's up?", pause: 180 },
    { text: 'Talk to me.', pause: 220 },
    { text: "So... what's happening?", pause: 200 },
    { text: "What's on your mind?", pause: 220 },
    { text: '', pause: 0 }, // Sometimes just the opener is enough
  ],
  hadHardTime: [
    // After heavy conversation - gentle, not probing
    { text: 'How are you?', pause: 250 },
    { text: "How's it going?", pause: 220 },
    { text: '', pause: 0 }, // Just presence, no question
  ],
  lateNight: [
    // Late night - quiet presence
    { text: "What's on your mind?", pause: 250 },
    { text: '', pause: 0 }, // Just there
    { text: "What's keeping you up?", pause: 250 },
  ],
  returningAfterLongTime: [
    // Been a while - warm acknowledgment
    { text: "It's been a minute.", pause: 220 },
    { text: 'Good to see you.', pause: 200 },
    { text: '', pause: 0 }, // Just recognition
  ],
};

// Relationship-appropriate flavors
const RELATIONSHIP_FLAVORS = {
  stranger: [], // No flavor for new users - keep it simple
  acquaintance: [{ text: 'Perfect timing.', chance: 0.1 }],
  friend: [
    { text: 'Come in, come in.', chance: 0.15 },
    { text: 'I was just thinking about something.', chance: 0.1 },
    { text: 'Perfect timing.', chance: 0.12 },
    { text: '[laughter] Sorry— I was in my head.', chance: 0.08 },
  ],
  trusted_advisor: [
    { text: "I was hoping you'd call.", chance: 0.12 },
    { text: 'I was just thinking about you.', chance: 0.1 },
    { text: 'Perfect timing.', chance: 0.15 },
    { text: '[laughter] Sorry— I was lost in thought.', chance: 0.08 },
  ],
};

/**
 * Get time period from hour
 */
function getTimePeriod(hour: number): keyof typeof TIME_BASED_OPENERS {
  if (hour >= 5 && hour < 8) return 'earlyMorning';
  if (hour >= 8 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'lateNight';
}

/**
 * Select appropriate middle based on context
 */
function selectMiddle(ctx: GreetingContext): { text: string; pause: number } {
  const hour = ctx.hour ?? new Date().getHours();
  const timePeriod = getTimePeriod(hour);

  // Late night - use supportive language
  if (timePeriod === 'lateNight') {
    const middles = EMOTION_MIDDLES.lateNight;
    return middles[Math.floor(Math.random() * middles.length)];
  }

  // If last conversation was emotionally intense (>0.7), be gentle
  if (ctx.lastEmotionIntensity && ctx.lastEmotionIntensity > 0.7) {
    const middles = EMOTION_MIDDLES.hadHardTime;
    return middles[Math.floor(Math.random() * middles.length)];
  }

  // If it's been more than 7 days, acknowledge the gap
  if (ctx.daysSinceLastChat && ctx.daysSinceLastChat > 7) {
    const middles = EMOTION_MIDDLES.returningAfterLongTime;
    return middles[Math.floor(Math.random() * middles.length)];
  }

  // Default - neutral middles
  const middles = EMOTION_MIDDLES.neutral;
  return middles[Math.floor(Math.random() * middles.length)];
}

// Legacy static components for fallback
const FERNI_OPENERS = TIME_BASED_OPENERS.afternoon; // Default to afternoon energy

const FERNI_MIDDLES = EMOTION_MIDDLES.neutral;

const FERNI_FLAVOR = RELATIONSHIP_FLAVORS.friend;

/**
 * Build a CONTEXT-AWARE SSML greeting for Ferni
 *
 * "Better than Human" - We don't just greet randomly.
 *
 * SIMPLICITY PRINCIPLE: Less SSML = more natural.
 * The backchannels work because they're simple. Follow that pattern.
 *
 * KEY INSIGHT: "affectionate" sounds warm and genuine.
 * "happy" sounds forced and performative. We use affectionate as default.
 *
 * Pattern: [settle pause] + [emotion] + opener + [breathing pause] + question
 */
function buildDynamicFerniGreeting(ctx?: GreetingContext): string {
  const context = ctx || {};
  const hour = context.hour ?? new Date().getHours();
  const timePeriod = getTimePeriod(hour);
  const relationshipStage = context.relationshipStage || 'friend';

  // Select opener based on time of day
  const openers = TIME_BASED_OPENERS[timePeriod];
  const opener = openers[Math.floor(Math.random() * openers.length)];

  // Select middle based on emotional context
  const middle = selectMiddle(context);

  // Maybe add flavor based on relationship depth
  const flavors = RELATIONSHIP_FLAVORS[relationshipStage] || [];
  const flavor = flavors.find((f) => Math.random() < f.chance);

  // Build with SIMPLE SSML - don't over-engineer!
  let greeting = '';

  // 1. Opening settle pause - ALWAYS add a small one for natural cadence
  // This is like taking a breath before speaking. Even "immediate" responses
  // need a tiny beat to feel human, not robotic.
  const settleMs = opener.energy === 'calm' ? 300 : opener.energy === 'warm' ? 150 : 100;
  greeting += `<break time="${settleMs}ms"/>`;

  // 2. Emotion tag (simple, at the start)
  // Default to affectionate if no emotion specified (sounds warmer than happy)
  const emotion = opener.emotion || 'affectionate';
  greeting += `<emotion value="${emotion}"/>`;

  // 3. The opener word
  greeting += opener.text;

  // 4. Breathing pause - THIS is what makes it human
  // Real humans pause between "Hey." and their next thought
  // Longer pauses for calmer energy, but never too short
  const pauseMs = opener.energy === 'calm' ? 450 : opener.energy === 'warm' ? 350 : 300;
  greeting += `<break time="${pauseMs}ms"/>`;

  // Maybe add flavor before the question (only for friends+)
  if (flavor) {
    greeting += `${flavor.text}<break time="350ms"/>`;
  }

  // If we know their name
  if (context.userName && relationshipStage !== 'stranger' && Math.random() < 0.3) {
    greeting += `${context.userName}.<break time="250ms"/>`;
  }

  // Main question/statement
  greeting += middle.text;

  return greeting;
}

/**
 * Generate a context-aware greeting.
 * This is the NEW "Better than Human" approach.
 *
 * @param personaId - The persona generating the greeting
 * @param ctx - Context about the user and timing
 */
export function generateContextAwareGreeting(personaId: string, ctx: GreetingContext): string {
  if (personaId === 'ferni') {
    return buildDynamicFerniGreeting(ctx);
  }

  // For other personas, fall back to static list for now
  // TODO: Add context-aware greetings for all personas
  const greetings = INSTANT_GREETINGS[personaId] || DEFAULT_GREETINGS;
  return greetings[Math.floor(Math.random() * greetings.length)];
}

// ============================================================================
// PERSONA-SPECIFIC INSTANT GREETINGS (Fallback static list)
// ============================================================================

// IMPORTANT: These should feel like FERNI - warm, present, NOT peppy
// SIMPLICITY: The backchannels work because they're SIMPLE. Follow that pattern.
// KEY: Use "affectionate" (warm) instead of "happy" (forced). No exclamation points with warm emotions.
// Pattern: [settle pause] + emotion + opener + [breathing pause] + question
const INSTANT_GREETINGS: Record<string, string[]> = {
  ferni: [
    // Simple, clean SSML - affectionate = warm, curious = interested
    '<break time="150ms"/><emotion value="affectionate"/>Hey.<break time="350ms"/>What\'s going on?',
    '<emotion value="surprised"/>Oh, hey.<break time="300ms"/>What\'s up?',
    '<break time="150ms"/><emotion value="affectionate"/>Hey.<break time="400ms"/>Talk to me.',
    '<break time="200ms"/><emotion value="affectionate"/>Hey.<break time="450ms"/>What\'s happening?',
    '<break time="150ms"/><emotion value="curious"/>Hey.<break time="350ms"/>What\'s on your mind?',
  ],
  'alex-chen': [
    '<emotion value="happy"/>Hey!<break time="100ms"/>Alex here.<break time="150ms"/>What\'s up?',
    'Oh hey!<break time="100ms"/>It\'s Alex.<break time="150ms"/>What\'s going on?',
    '<emotion value="happy"/>Alex here!<break time="150ms"/>Talk to me.',
  ],
  'maya-santos': [
    '<emotion value="happy"/>Hey!<break time="100ms"/>Maya here.<break time="150ms"/>What\'s going on?',
    '<emotion value="happy"/>Hi!<break time="100ms"/>It\'s Maya.<break time="150ms"/>How are you?',
    '<emotion value="affectionate"/>Maya here.<break time="150ms"/>What\'s on your mind?',
  ],
  'jordan-taylor': [
    '<emotion value="surprised"/>Oh!<break time="100ms"/>Hey!<break time="100ms"/>What are we planning?',
    '<emotion value="happy"/>Hey!<break time="100ms"/>It\'s Jordan!<break time="150ms"/>What\'s happening?',
    '<emotion value="happy"/>Jordan here!<break time="100ms"/>Tell me everything!',
  ],
  'peter-john': [
    '<emotion value="curious"/>Hey!<break time="100ms"/>Peter here.<break time="150ms"/>What are you thinking about?',
    '<emotion value="happy"/>Hey!<break time="100ms"/>Peter here.<break time="150ms"/>What\'s interesting?',
    '<emotion value="curious"/>Hey!<break time="150ms"/>What\'s on your mind?',
  ],
  'nayan-patel': [
    '<emotion value="affectionate"/>Hey.<break time="200ms"/>Nayan here.<break time="150ms"/>I\'m listening.',
    '<emotion value="affectionate"/>Hello, friend.<break time="200ms"/>What brings you?',
    '<emotion value="affectionate"/>Hey.<break time="200ms"/>What\'s on your mind?',
  ],
};

// Simple defaults - let Cartesia do the work
// Use "affectionate" for warmth, not "happy" (sounds forced)
const DEFAULT_GREETINGS = [
  '<break time="150ms"/><emotion value="affectionate"/>Hey.<break time="350ms"/>What\'s going on?',
  '<break time="150ms"/><emotion value="affectionate"/>Hey there.<break time="350ms"/>What\'s up?',
  '<break time="200ms"/><emotion value="affectionate"/>Hey.<break time="400ms"/>Talk to me.',
];

// ============================================================================
// GREETING GENERATION
// ============================================================================

/**
 * Generate an instant greeting for a persona.
 * This is called during prewarm to have a greeting ready immediately.
 *
 * For Ferni: Uses CONTEXT-AWARE dynamic SSML builder
 * For others: Uses persona-specific static greetings with SSML
 *
 * @param personaId - The persona generating the greeting
 * @param ctx - Optional context for "Better than Human" greetings
 */
export function generateWarmGreeting(personaId: string, ctx?: GreetingContext): string {
  // For Ferni, ALWAYS use context-aware builder (Better than Human)
  if (personaId === 'ferni') {
    return buildDynamicFerniGreeting(ctx);
  }

  // Fall back to static list for other personas (with SSML)
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
  generateContextAwareGreeting,
  prewarmGreeting,
  getWarmGreeting,
  clearWarmGreeting,
  hasWarmGreeting,
};

// Note: GreetingContext is already exported as an interface above
