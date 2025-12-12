/**
 * Inside Jokes System
 *
 * "Remember when you called it the 'productivity monster'?" - Shared humor.
 *
 * Real relationships have inside jokes - funny moments that become shorthand.
 * This system captures those moments and references them at the right time.
 *
 * @module conversation/superhuman/inside-jokes
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'InsideJokes' });

// ============================================================================
// TYPES
// ============================================================================

export interface InsideJoke {
  id: string;
  userId: string;
  // The funny moment
  originalContext: string;
  funnyPart: string;
  shorthand?: string; // e.g., "the productivity monster"
  // Metadata
  createdAt: Date;
  timesReferenced: number;
  lastReferenced?: Date;
  // When to surface
  relatedTopics: string[];
  mood: 'light' | 'supportive' | 'celebratory';
}

export interface JokeReference {
  joke: InsideJoke;
  introduction: string;
  naturalUsage: string;
}

// ============================================================================
// JOKE DETECTION PATTERNS
// ============================================================================

// Patterns that indicate a humorous moment
const HUMOR_INDICATORS = [
  /haha|lol|😂|🤣|😆/i,
  /that('s| is) (so|pretty|kind of) funny/i,
  /I (can't|couldn't) stop laughing/i,
  /you('re| are) (going to|gonna) laugh/i,
  /the (funny|ridiculous|absurd) (thing|part)/i,
];

// Patterns that indicate nickname creation (potential inside joke)
const NICKNAME_PATTERNS = [
  /I('ll| will) call (it|that|this|them|him|her) ["']?(\w+(\s+\w+)?)["']?/i,
  /let('s| us) call (it|that|this) ["']?(\w+(\s+\w+)?)["']?/i,
  /my ["']?(\w+(\s+\w+)?)["']? (as I call it|nickname)/i,
  /the ["']?(\w+(\s+\w+)?)["']? (monster|demon|beast|gremlin|thing)/i,
];

// Common topics that generate inside jokes
const JOKE_TOPICS = [
  'procrastination',
  'anxiety',
  'coffee',
  'sleep',
  'work',
  'exercise',
  'eating',
  'relationships',
  'technology',
  'habits',
];

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const jokeStore = new Map<string, InsideJoke[]>();

// ============================================================================
// JOKE DETECTION
// ============================================================================

/**
 * Detect a potential inside joke moment
 */
export function detectJokeMoment(
  userId: string,
  message: string,
  context: {
    topics?: string[];
    wasLaughing?: boolean;
    conversationMood?: string;
  }
): InsideJoke | null {
  // Check for humor indicators
  const isHumorous = HUMOR_INDICATORS.some((p) => p.test(message)) || context.wasLaughing;

  if (!isHumorous) {
    return null;
  }

  // Look for a nickname or shorthand
  let shorthand: string | undefined;
  for (const pattern of NICKNAME_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      // Extract the nickname from the match
      shorthand = match[3] || match[1];
      break;
    }
  }

  // Extract the funny part
  let funnyPart = message;
  if (message.length > 200) {
    // Find the sentence with the humor
    const sentences = message.split(/[.!?]+/).filter((s) => s.trim());
    const funnySentence = sentences.find(
      (s) => HUMOR_INDICATORS.some((p) => p.test(s)) || NICKNAME_PATTERNS.some((p) => p.test(s))
    );
    funnyPart = funnySentence || sentences[0];
  }

  // Determine related topics
  const relatedTopics = (context.topics || []).filter((t) =>
    JOKE_TOPICS.some((jt) => t.toLowerCase().includes(jt))
  );

  // Only create joke if there's something memorable
  if (!shorthand && funnyPart.length < 20) {
    return null;
  }

  const joke: InsideJoke = {
    id: `joke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    originalContext: message.slice(0, 300),
    funnyPart: funnyPart.trim(),
    shorthand,
    createdAt: new Date(),
    timesReferenced: 0,
    relatedTopics,
    mood: context.conversationMood === 'heavy' ? 'supportive' : 'light',
  };

  log.info({ userId, jokeId: joke.id, shorthand }, '😄 Inside joke moment captured');

  return joke;
}

/**
 * Save an inside joke
 */
export function saveJoke(joke: InsideJoke): void {
  const existing = jokeStore.get(joke.userId) || [];

  // Check for similar jokes
  const isDupe = existing.some(
    (j) =>
      j.shorthand === joke.shorthand ||
      j.funnyPart.toLowerCase().includes(joke.funnyPart.toLowerCase().slice(0, 30))
  );

  if (isDupe) {
    log.debug({ userId: joke.userId }, 'Skipping duplicate joke');
    return;
  }

  existing.push(joke);

  // Keep max 20 inside jokes per user
  if (existing.length > 20) {
    existing.shift();
  }

  jokeStore.set(joke.userId, existing);
}

/**
 * Capture and save a joke in one call
 */
export function captureJoke(
  userId: string,
  message: string,
  context: {
    topics?: string[];
    wasLaughing?: boolean;
    conversationMood?: string;
  }
): InsideJoke | null {
  const joke = detectJokeMoment(userId, message, context);
  if (joke) {
    saveJoke(joke);
  }
  return joke;
}

// ============================================================================
// JOKE SURFACING
// ============================================================================

/**
 * Find a relevant inside joke to reference
 */
export function findRelevantJoke(
  userId: string,
  context: {
    currentTopics?: string[];
    currentMood?: string;
    turnCount?: number;
  }
): JokeReference | null {
  const jokes = jokeStore.get(userId);
  if (!jokes || jokes.length === 0) {
    return null;
  }

  // Don't reference jokes in early conversation
  if ((context.turnCount || 0) < 3) {
    return null;
  }

  // Filter jokes that haven't been referenced too recently
  const eligibleJokes = jokes.filter((j) => {
    if (j.timesReferenced >= 5) return false; // Max 5 times
    if (j.lastReferenced) {
      const daysSince = (Date.now() - j.lastReferenced.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 3) return false; // Wait at least 3 days
    }
    // Don't use supportive jokes in light moods
    if (j.mood === 'supportive' && context.currentMood === 'light') return false;
    return true;
  });

  if (eligibleJokes.length === 0) {
    return null;
  }

  // Score by topic relevance
  const scored = eligibleJokes.map((joke) => {
    let score = 10; // Base score

    // Topic match bonus
    if (
      context.currentTopics?.some((t) =>
        joke.relatedTopics.some(
          (jt) => t.toLowerCase().includes(jt) || jt.includes(t.toLowerCase())
        )
      )
    ) {
      score += 30;
    }

    // Has shorthand bonus (easier to reference)
    if (joke.shorthand) {
      score += 15;
    }

    // Recency bonus for newer jokes
    const daysOld = (Date.now() - joke.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld < 7) {
      score += 10; // Recent jokes are fresher
    }

    return { joke, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (best.score < 20) {
    return null; // Not relevant enough
  }

  // Generate reference
  const introduction = generateJokeIntro(best.joke);
  const naturalUsage = generateNaturalUsage(best.joke);

  return {
    joke: best.joke,
    introduction,
    naturalUsage,
  };
}

/**
 * Generate an introduction to the inside joke
 */
function generateJokeIntro(joke: InsideJoke): string {
  const daysAgo = Math.floor((Date.now() - joke.createdAt.getTime()) / (1000 * 60 * 60 * 24));

  const timeRef =
    daysAgo === 0
      ? 'earlier'
      : daysAgo === 1
        ? 'yesterday'
        : daysAgo < 7
          ? 'the other day'
          : 'a while back';

  const intros = [
    `Remember ${timeRef} when you said`,
    `This reminds me of ${timeRef} when`,
    `Ha! Like that time you mentioned`,
    `Wasn't it you who ${timeRef} called it`,
  ];

  return intros[Math.floor(Math.random() * intros.length)];
}

/**
 * Generate natural usage of the joke
 */
function generateNaturalUsage(joke: InsideJoke): string {
  if (joke.shorthand) {
    const usages = [
      `the "${joke.shorthand}" situation`,
      `your "${joke.shorthand}"`,
      `what you called the "${joke.shorthand}"`,
    ];
    return usages[Math.floor(Math.random() * usages.length)];
  }

  return `"${joke.funnyPart.slice(0, 50)}${joke.funnyPart.length > 50 ? '...' : ''}"`;
}

/**
 * Mark a joke as referenced
 */
export function markJokeReferenced(userId: string, jokeId: string): void {
  const jokes = jokeStore.get(userId);
  if (!jokes) return;

  const joke = jokes.find((j) => j.id === jokeId);
  if (joke) {
    joke.timesReferenced++;
    joke.lastReferenced = new Date();
    log.debug({ userId, jokeId }, '😄 Inside joke referenced');
  }
}

/**
 * Format joke reference for prompt
 */
export function formatJokeForPrompt(reference: JokeReference): string {
  return [
    '[😄 INSIDE JOKE OPPORTUNITY]',
    '',
    `${reference.introduction} ${reference.naturalUsage}?`,
    '',
    `Original context: "${reference.joke.originalContext.slice(0, 150)}..."`,
    '',
    "Use this naturally if it fits. Don't force it.",
    'Inside jokes make relationships feel real.',
  ].join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  captureJoke,
  detectJokeMoment,
  saveJoke,
  findRelevantJoke,
  markJokeReferenced,
  formatJokeForPrompt,
};
