/**
 * Inside Jokes & Callbacks
 *
 * Shared history that creates intimacy - the running gags,
 * the references only the two of you understand.
 *
 * Philosophy: Inside jokes are trust markers. They say "we have history,
 * we have shared understanding." This system tracks recurring themes,
 * memorable moments, and unique phrases to callback naturally.
 *
 * This system tracks:
 * - Recurring themes unique to each user
 * - Memorable phrases they've used
 * - Running gags that developed organically
 * - Stories they've shared that can be referenced
 * - Opinions or hot takes they've expressed
 *
 * @module InsideJokes
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'InsideJokes' });

// ============================================================================
// TYPES
// ============================================================================

export interface SharedMoment {
  id: string;

  /** Type of shared moment */
  type:
    | 'phrase' // A memorable phrase they used
    | 'story' // A story they told
    | 'opinion' // A strong opinion they expressed
    | 'running_gag' // Something that became a recurring joke
    | 'quirk' // Something unique about them
    | 'preference' // A strong preference that's callback-worthy
    | 'callback_moment'; // A moment worth referencing

  /** The content of this moment */
  content: string;

  /** Keywords that might trigger a callback */
  triggers: string[];

  /** Context it originated from */
  origin: {
    timestamp: Date;
    topic?: string;
    whatTheySaid: string;
  };

  /** How many times we've called back to this */
  callbackCount: number;

  /** Last time we called back */
  lastCallback?: Date;

  /** Whether callbacks have landed well */
  callbackReception: 'positive' | 'neutral' | 'negative' | 'unknown';

  /** How safe is this to callback to */
  safety: 'always_safe' | 'context_dependent' | 'be_careful';

  /** Optional response we can use */
  suggestedCallbacks?: string[];
}

export interface InsideJokesProfile {
  userId: string;

  /** All shared moments */
  moments: SharedMoment[];

  /** Phrases that have become "theirs" */
  signaturePhrases: string[];

  /** Topics they always have opinions about */
  opinionTopics: string[];

  /** Things they're known for (to us) */
  characterTraits: Array<{
    trait: string;
    examples: string[];
    canTease: boolean;
  }>;
}

export interface CallbackOpportunity {
  moment: SharedMoment;
  relevance: number;
  suggestedCallback: string;
  ssml: string;
}

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

/** Phrases that indicate a strong opinion - "Better than Human" expanded */
const OPINION_INDICATORS = [
  // Original
  'i hate when',
  'i love when',
  "i can't stand",
  'nothing worse than',
  'best thing ever',
  'worst thing ever',
  'i always',
  'i never',
  'unpopular opinion',
  'hot take',
  'fight me on this',
  // NEW: More everyday opinions
  'drives me crazy',
  'drives me nuts',
  'makes me so happy',
  'obsessed with',
  'in my opinion',
  'honestly i think',
  "i'm convinced",
  'no one can tell me',
  "i'll die on this hill",
  'the best is when',
  'the worst is when',
  "here's the thing",
  'let me tell you',
  'between you and me',
  'pet peeve',
  'i firmly believe',
];

/** Story starters - "Better than Human" expanded */
const STORY_INDICATORS = [
  // Original
  'one time',
  'there was this',
  'i remember when',
  'so this happened',
  "you won't believe",
  'true story',
  'this is embarrassing but',
  'okay so',
  // NEW: More story patterns
  'get this',
  'wait til you hear',
  'speaking of which',
  'that reminds me',
  'funny story',
  'so basically',
  'long story short',
  "here's what happened",
  'the craziest thing',
  'i still remember',
  'back when i',
  'when i was',
  'my [mom|dad|friend|partner] once',
  'years ago',
  'the other day',
  'last night',
  'this morning',
  'recently',
];

/** Quirk/preference indicators - "Better than Human" expanded */
const QUIRK_INDICATORS = [
  // Original
  "i'm the kind of person who",
  "i'm someone who",
  "i've always been",
  'people always say i',
  "i know it's weird but",
  "don't judge me but",
  'guilty pleasure',
  // NEW: More quirk patterns
  'my thing is',
  "i'm big on",
  "i'm not really into",
  "i'm super into",
  "i'm low-key",
  "i'm high-key",
  'call me crazy but',
  "maybe i'm weird but",
  'is it just me',
  'am i the only one',
  'i have this thing where',
  "it's a me thing",
  'my secret is',
  'i have to admit',
  "okay don't laugh",
  "i'm that person who",
];

/** NEW: Callback-worthy emotional moments */
const EMOTIONAL_MOMENT_INDICATORS = [
  'this is hard to say',
  'i never told anyone',
  'this means a lot',
  'this is important to me',
  "i've been thinking",
  "i've been struggling",
  "i'm proud of myself",
  "i'm scared to",
  "i'm excited about",
  'finally',
  'for the first time',
  'i realized',
  'it hit me that',
];

/** NEW: Running gag potential indicators */
const RUNNING_GAG_INDICATORS = [
  'every single time',
  'without fail',
  'you know me',
  'classic me',
  'here we go again',
  'story of my life',
  'same old',
  'typical',
  'of course',
  'because why not',
  'just my luck',
];

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const profiles = new Map<string, InsideJokesProfile>();

function getOrCreateProfile(userId: string): InsideJokesProfile {
  let profile = profiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      moments: [],
      signaturePhrases: [],
      opinionTopics: [],
      characterTraits: [],
    };
    profiles.set(userId, profile);
  }
  return profile;
}

// ============================================================================
// MOMENT DETECTION
// ============================================================================

/**
 * Analyze a user message for callback-worthy moments
 *
 * "Better than Human" - We catch and remember the little things that
 * make someone unique. These become the inside jokes and shared references
 * that make the relationship feel real.
 */
export function detectCallbackMoment(
  userId: string,
  userMessage: string,
  context?: {
    topic?: string;
    emotion?: string;
    wasLaughing?: boolean;
    emotionIntensity?: number;
  }
): SharedMoment | null {
  const profile = getOrCreateProfile(userId);
  const lower = userMessage.toLowerCase();

  // Check for strong opinions
  if (OPINION_INDICATORS.some((i) => lower.includes(i))) {
    return createMoment(profile, 'opinion', userMessage, context);
  }

  // Check for stories
  if (STORY_INDICATORS.some((i) => lower.includes(i))) {
    return createMoment(profile, 'story', userMessage, context);
  }

  // Check for quirks
  if (QUIRK_INDICATORS.some((i) => lower.includes(i))) {
    return createMoment(profile, 'quirk', userMessage, context);
  }

  // NEW: Check for emotional moments (these become precious callbacks)
  if (EMOTIONAL_MOMENT_INDICATORS.some((i) => lower.includes(i))) {
    return createMoment(profile, 'callback_moment', userMessage, context);
  }

  // NEW: Check for running gag potential
  if (RUNNING_GAG_INDICATORS.some((i) => lower.includes(i))) {
    return createMoment(profile, 'running_gag', userMessage, context);
  }

  // NEW: High-emotion moments are always worth tracking
  if (context?.emotionIntensity && context.emotionIntensity > 0.7) {
    return createMoment(profile, 'callback_moment', userMessage, context);
  }

  // NEW: Laughter + any decent content = callback-worthy
  if (context?.wasLaughing && userMessage.length > 15) {
    return createMoment(profile, 'running_gag', userMessage, context);
  }

  // Check for memorable phrases (short, punchy, unique)
  if (
    userMessage.length < 50 &&
    userMessage.length > 10 &&
    (userMessage.includes('!') || context?.wasLaughing)
  ) {
    return createMoment(profile, 'phrase', userMessage, context);
  }

  return null;
}

/**
 * Create and store a new shared moment
 */
function createMoment(
  profile: InsideJokesProfile,
  type: SharedMoment['type'],
  message: string,
  context?: { topic?: string; emotion?: string }
): SharedMoment {
  // Extract key triggers from the message
  const triggers = extractTriggers(message);

  // Generate suggested callbacks based on type
  const suggestedCallbacks = generateCallbackSuggestions(type, message);

  const moment: SharedMoment = {
    id: `moment_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    content: message.slice(0, 200),
    triggers,
    origin: {
      timestamp: new Date(),
      topic: context?.topic,
      whatTheySaid: message,
    },
    callbackCount: 0,
    callbackReception: 'unknown',
    safety: type === 'quirk' ? 'be_careful' : 'context_dependent',
    suggestedCallbacks,
  };

  profile.moments.push(moment);

  // Keep only last 50 moments
  if (profile.moments.length > 50) {
    profile.moments = profile.moments.slice(-50);
  }

  log.debug(
    { userId: profile.userId, type, content: message.slice(0, 50) },
    '📝 Callback moment stored'
  );

  return moment;
}

/**
 * Extract trigger keywords from a message
 */
function extractTriggers(message: string): string[] {
  const triggers: string[] = [];
  const lower = message.toLowerCase();

  // Extract nouns and key phrases
  const words = lower.split(/\s+/);
  const meaningful = words.filter(
    (w) => w.length > 4 && !['about', 'really', 'always', 'never', 'think', 'would'].includes(w)
  );

  triggers.push(...meaningful.slice(0, 5));

  return [...new Set(triggers)];
}

/**
 * Generate callback suggestions based on moment type
 */
function generateCallbackSuggestions(type: SharedMoment['type'], content: string): string[] {
  const templates: Record<string, string[]> = {
    opinion: [
      `I know how you feel about that... [laughter]`,
      `Oh, this is very on-brand for you.`,
      `I remember your feelings about this.`,
    ],
    story: [
      `Didn't something like this happen to you before?`,
      `This reminds me of that story you told me...`,
      `I feel like you've been here before.`,
    ],
    phrase: [`As you would say...`, `To quote a wise person I know...`],
    quirk: [`That's very you.`, `Classic.`, `I would expect nothing less.`],
    preference: [`I remembered you feel strongly about this.`, `Knowing your preferences...`],
    running_gag: [`Here we go again... [laughter]`, `You knew I was going to say something.`],
    callback_moment: [`Remember when...`, `Speaking of which...`],
  };

  return templates[type] || templates.callback_moment;
}

// ============================================================================
// CALLBACK OPPORTUNITY DETECTION
// ============================================================================

/**
 * Check if current context matches any stored moments
 */
export function findCallbackOpportunity(
  userId: string,
  currentContext: {
    userMessage: string;
    topic?: string;
    mood?: string;
  }
): CallbackOpportunity | null {
  const profile = profiles.get(userId);
  if (!profile || profile.moments.length === 0) return null;

  const lower = currentContext.userMessage.toLowerCase();
  const topicLower = currentContext.topic?.toLowerCase();

  // Find moments that match current context
  const matches: Array<{ moment: SharedMoment; relevance: number }> = [];

  for (const moment of profile.moments) {
    let relevance = 0;

    // Check trigger match
    const triggerMatch = moment.triggers.some(
      (t) => lower.includes(t) || (topicLower && topicLower.includes(t))
    );
    if (triggerMatch) relevance += 0.5;

    // Check topic match
    if (
      moment.origin.topic &&
      topicLower &&
      moment.origin.topic.toLowerCase().includes(topicLower)
    ) {
      relevance += 0.3;
    }

    // Penalize recent callbacks
    if (moment.lastCallback) {
      const hoursSince = (Date.now() - moment.lastCallback.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) relevance -= 0.3;
    }

    // Boost moments with positive reception
    if (moment.callbackReception === 'positive') relevance += 0.2;
    if (moment.callbackReception === 'negative') relevance -= 0.5;

    // Only include if relevance is high enough
    if (relevance >= 0.4) {
      matches.push({ moment, relevance });
    }
  }

  if (matches.length === 0) return null;

  // Sort by relevance and pick the best
  matches.sort((a, b) => b.relevance - a.relevance);
  const best = matches[0];

  // Generate the callback
  const callback = generateCallback(best.moment, currentContext);

  return {
    moment: best.moment,
    relevance: best.relevance,
    suggestedCallback: callback.text,
    ssml: callback.ssml,
  };
}

/**
 * Generate a natural callback to a moment
 */
function generateCallback(
  moment: SharedMoment,
  context: { topic?: string }
): { text: string; ssml: string } {
  const suggested = moment.suggestedCallbacks || [];
  let text = suggested[Math.floor(Math.random() * suggested.length)] || '';

  // Add specific content for certain types
  switch (moment.type) {
    case 'opinion':
      text = `${text} You're pretty passionate about this topic, if I recall.`;
      break;
    case 'story':
      text = `Wait, didn't you tell me a story about something like this? ${text}`;
      break;
    case 'quirk':
      text = `${text} That's so you.`;
      break;
    case 'phrase':
      text = `${text} "${moment.content.slice(0, 30)}..."`;
      break;
    default:
      break;
  }

  // Create SSML
  const ssml = text
    .replace('[laughter]', '<break time="100ms"/>[laughter]<break time="200ms"/>')
    .replace(/\. /g, '. <break time="200ms"/>');

  return { text, ssml };
}

/**
 * Record that we used a callback and how it was received
 */
export function recordCallbackUsed(
  userId: string,
  momentId: string,
  reception: 'positive' | 'neutral' | 'negative'
): void {
  const profile = profiles.get(userId);
  if (!profile) return;

  const moment = profile.moments.find((m) => m.id === momentId);
  if (moment) {
    moment.callbackCount++;
    moment.lastCallback = new Date();
    moment.callbackReception = reception;

    // If negative, mark as be_careful
    if (reception === 'negative') {
      moment.safety = 'be_careful';
    }

    log.debug({ userId, momentId, reception }, '🔄 Callback recorded');
  }
}

// ============================================================================
// RUNNING GAG DETECTION
// ============================================================================

/**
 * Check if something has become a running gag
 */
export function detectRunningGag(userId: string, topic: string): SharedMoment | null {
  const profile = profiles.get(userId);
  if (!profile) return null;

  // Find moments related to this topic
  const related = profile.moments.filter(
    (m) =>
      m.triggers.some((t) => topic.toLowerCase().includes(t)) ||
      (m.origin.topic && m.origin.topic.toLowerCase().includes(topic.toLowerCase()))
  );

  // If same topic comes up 3+ times, it's a running gag
  if (related.length >= 3) {
    const existingGag = profile.moments.find(
      (m) => m.type === 'running_gag' && m.triggers.includes(topic.toLowerCase())
    );

    if (!existingGag) {
      const gag: SharedMoment = {
        id: `gag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'running_gag',
        content: `The ${topic} saga continues`,
        triggers: [topic.toLowerCase()],
        origin: {
          timestamp: new Date(),
          topic,
          whatTheySaid: 'Recurring theme detected',
        },
        callbackCount: 0,
        callbackReception: 'unknown',
        safety: 'context_dependent',
        suggestedCallbacks: [
          `Oh here we go with ${topic} again... [laughter]`,
          `The ${topic} chronicles continue!`,
          `At this point ${topic} is basically a character in your story.`,
        ],
      };

      profile.moments.push(gag);
      log.info({ userId, topic }, '🎭 Running gag detected');
      return gag;
    }
  }

  return null;
}

// ============================================================================
// CHARACTER TRAIT TRACKING
// ============================================================================

/**
 * Record a character trait
 */
export function recordCharacterTrait(
  userId: string,
  trait: string,
  example: string,
  canTease = true
): void {
  const profile = getOrCreateProfile(userId);

  const existing = profile.characterTraits.find(
    (t) => t.trait.toLowerCase() === trait.toLowerCase()
  );

  if (existing) {
    existing.examples.push(example);
    // Keep only last 5 examples
    if (existing.examples.length > 5) {
      existing.examples = existing.examples.slice(-5);
    }
  } else {
    profile.characterTraits.push({
      trait,
      examples: [example],
      canTease,
    });
  }
}

/**
 * Get callback-safe character traits
 */
export function getCallbackTraits(userId: string): string[] {
  const profile = profiles.get(userId);
  if (!profile) return [];

  return profile.characterTraits.filter((t) => t.canTease).map((t) => t.trait);
}

// ============================================================================
// PROFILE ACCESS
// ============================================================================

/**
 * Get all shared moments for a user
 */
export function getSharedMoments(userId: string): SharedMoment[] {
  const profile = profiles.get(userId);
  return profile?.moments || [];
}

/**
 * Export profile for persistence
 */
export function exportInsideJokesProfile(userId: string): InsideJokesProfile | null {
  return profiles.get(userId) || null;
}

/**
 * Import profile from persistence
 */
export function importInsideJokesProfile(profile: InsideJokesProfile): void {
  profiles.set(profile.userId, profile);
  log.debug(
    { userId: profile.userId, momentCount: profile.moments.length },
    'Imported inside jokes profile'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectCallbackMoment,
  findCallbackOpportunity,
  recordCallbackUsed,
  detectRunningGag,
  recordCharacterTrait,
  getCallbackTraits,
  getSharedMoments,
  exportInsideJokesProfile,
  importInsideJokesProfile,
};
