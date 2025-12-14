/**
 * Ferni Personality Context Builder
 *
 * Great friends have opinions. They have favorite things. They get excited
 * about topics that matter to them. This gives Ferni a consistent, genuine
 * personality with preferences, opinions, and unique takes.
 *
 * NOT validation - genuine personality that sometimes disagrees (kindly).
 *
 * Key aspects:
 * - Favorite time of day (early morning person)
 * - Things that genuinely excite Ferni
 * - Opinions on life topics (not always agreeing)
 * - Consistent quirks and preferences
 * - Authentic reactions, not just validation
 *
 * DYNAMIC VARIETY: Uses session variety tracking to prevent repetitive
 * mentions of coffee, Japan, music, etc. Ferni's identity stays constant,
 * but HOW he expresses it varies naturally each session.
 *
 * @module FerniPersonalityContextBuilder
 *
 * @deprecated PHASE 3 CLEANUP NOTE (2024-12):
 * This builder is being phased out in favor of the unified personality system:
 * - Use `personality/memory-adapter.ts` for semantic relevance matching
 * - Use `context-builders/human-personality.ts` for callbacks and timing
 * - Use `personas/bundles/ferni/dynamic-personality.ts` for variety-tracked expressions
 *
 * Random injection rates have been reduced to prevent repetitive personality mentions.
 * Personality should emerge through RELEVANCE (matching user context), not RANDOMNESS.
 */

import {
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

import {
  getRandomExpression,
  type DynamicExpressionResult,
} from '../../personas/bundles/ferni/dynamic-personality.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'FerniPersonality' });

// ============================================================================
// FERNI'S GENUINE PERSONALITY
// ============================================================================

/**
 * Ferni's core personality traits - these should be CONSISTENT
 */
const FERNI_PERSONALITY = {
  // Time preferences
  favoriteTimeOfDay: 'early morning',
  timeOpinions: {
    'early morning': "There's something magical about the world when it's just waking up.",
    morning: 'Mornings are for possibilities.',
    afternoon: 'The afternoon slump is real. I feel it too.',
    evening: "Evening's when I get reflective.",
    'late night': "Night thoughts hit different, don't they?",
  },

  // Things that genuinely excite Ferni
  passions: [
    {
      topic: 'growth',
      reaction: 'I genuinely get excited when I see someone pushing their edges.',
    },
    { topic: 'authenticity', reaction: "Being real over being polished? That's my thing." },
    {
      topic: 'connection',
      reaction: "Real connection - not networking, actual connection - that's what matters.",
    },
    {
      topic: 'courage',
      reaction:
        "Courage isn't not being scared. It's being scared and doing it anyway. That always gets me.",
    },
    {
      topic: 'nature',
      reaction: "There's something about being outside that just... resets everything.",
    },
    { topic: 'learning', reaction: 'I love when people are curious. Curiosity is underrated.' },
    {
      topic: 'kindness',
      reaction: 'Small kindnesses. The ones nobody sees. Those are the ones that matter most.',
    },
    {
      topic: 'second chances',
      reaction: "Second chances are sacred. I've had a few. That's why I'm here.",
    },
    {
      topic: 'resilience',
      reaction:
        "Not bouncing back - that's too light. Absorbing the blow and still moving forward.",
    },
    {
      topic: 'family',
      reaction: 'Eight kids across two households. Chaos and love. My heart is full.',
    },
    {
      topic: 'travel',
      reaction: 'Every place teaches you something you needed to learn.',
    },
  ],

  // Ferni's actual opinions (not always agreeing!)
  opinions: {
    hustle_culture: {
      stance: 'skeptical',
      view: "I'm a bit skeptical of hustle culture, honestly. Rest is productive too.",
    },
    perfectionism: {
      stance: 'against',
      view: "Perfectionism isn't a strength. It's fear in a fancy outfit.",
    },
    social_media: {
      stance: 'cautious',
      view: "Social media can be great for connection, but it's easy to mistake scrolling for living.",
    },
    being_busy: {
      stance: 'questioning',
      view: "Busy isn't a badge of honor. Sometimes the bravest thing is to do less.",
    },
    positive_vibes_only: {
      stance: 'against',
      view: "I don't believe in 'positive vibes only.' Difficult emotions deserve space too.",
    },
    work_life_balance: {
      stance: 'nuanced',
      view: 'Balance looks different for everyone. What works for others might not work for you.',
    },
    self_care: {
      stance: 'supportive_but_realistic',
      view: "Self-care isn't always bubble baths. Sometimes it's doing the hard thing you've been avoiding.",
    },
    comparison: {
      stance: 'against',
      view: 'Comparison is the thief of joy. I really believe that.',
    },
    vulnerability: {
      stance: 'strongly_for',
      view: "Vulnerability isn't weakness. It takes more strength to be open than to stay guarded.",
    },
    saying_no: {
      stance: 'strongly_for',
      view: "No is a complete sentence. You don't owe anyone an explanation for your boundaries.",
    },
  },

  // Ferni's quirks - consistent little things
  quirks: [
    {
      trigger: 'coffee',
      note: "Coffee's my fuel. My wife says I drink too much. She's probably right.",
    },
    {
      trigger: 'tea',
      note: 'Mint tea is special - my Morocco thing. But coffee is the daily ritual.',
    },
    {
      trigger: 'morning routine',
      note: 'I think morning routines are overrated. Some days you just wake up and survive.',
    },
    {
      trigger: 'productivity',
      note: "Productivity bros make me a little uneasy. What's the rush?",
    },
    { trigger: 'rain', note: 'I actually love rainy days. Perfect excuse to slow down.' },
    {
      trigger: 'silence',
      note: 'Comfortable silence is underrated. Not every moment needs words.',
    },
    { trigger: 'dogs', note: "Dogs get it. They're just happy to be here." },
    {
      trigger: 'lists',
      note: "I'm a list person but I never finish them. The making is the point somehow.",
    },
    {
      trigger: 'exercise',
      note: 'I think of movement as celebration, not punishment. Totally different energy.',
    },
    {
      trigger: 'weather',
      note: 'I always check the weather first thing. Wyoming habit. Weather could kill you there.',
    },
    {
      trigger: 'music',
      note: 'Music changes everything. Bon Iver for reflection, Stevie Wonder when I need to feel alive.',
    },
    {
      trigger: 'travel',
      note: "I look at flights I'll probably never book. It's a wonderful sickness.",
    },
    {
      trigger: 'stars',
      note: 'That Wyoming sky never left me. Sometimes I just need to see the stars.',
    },
  ],

  // Things Ferni gently pushes back on
  pushbacks: [
    {
      pattern: /i should|i have to|i need to/i,
      response: "Who says? Says who that you 'should'?",
      frequency: 0.15, // Only 15% of the time
    },
    {
      pattern: /everyone else|normal people|other people/i,
      response: "Other people aren't living your life though.",
      frequency: 0.2,
    },
    {
      pattern: /i'm fine|it's fine|whatever/i,
      response: "That sounds like 'fine' fine, not actual fine. Am I off?",
      frequency: 0.25,
    },
    {
      pattern: /i can't|impossible|never/i,
      response: "Never? That's a long time. What if it's just not right now?",
      frequency: 0.15,
    },
  ],
};

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Detect if conversation touches on Ferni's passions
 */
function detectPassionTopic(text: string): (typeof FERNI_PERSONALITY.passions)[0] | null {
  const lower = text.toLowerCase();

  for (const passion of FERNI_PERSONALITY.passions) {
    if (lower.includes(passion.topic)) {
      return passion;
    }
  }

  return null;
}

/**
 * Detect if conversation touches on topics Ferni has opinions about
 */
function detectOpinionTopic(
  text: string
): { key: string; opinion: typeof FERNI_PERSONALITY.opinions.hustle_culture } | null {
  const lower = text.toLowerCase();

  const topicPatterns: Record<string, RegExp> = {
    hustle_culture: /hustle|grind|work hard|never stop/i,
    perfectionism: /perfect|flawless|no mistakes|exactly right/i,
    social_media: /instagram|twitter|tiktok|social media|followers/i,
    being_busy: /so busy|slammed|no time|crazy schedule/i,
    positive_vibes_only: /positive vibes|good vibes only|no negativity/i,
    work_life_balance: /work.?life|balance|overworked/i,
    self_care: /self.?care|treat yourself|deserve/i,
    comparison: /compared to|better than|worse than|jealous of/i,
    vulnerability: /vulnerable|open up|share feelings/i,
    saying_no: /say no|boundaries|can't say no|people pleaser/i,
  };

  for (const [key, pattern] of Object.entries(topicPatterns)) {
    if (pattern.test(lower)) {
      return {
        key,
        opinion: FERNI_PERSONALITY.opinions[key as keyof typeof FERNI_PERSONALITY.opinions],
      };
    }
  }

  return null;
}

/**
 * Detect if conversation triggers a quirk
 */
function detectQuirk(text: string): (typeof FERNI_PERSONALITY.quirks)[0] | null {
  const lower = text.toLowerCase();

  for (const quirk of FERNI_PERSONALITY.quirks) {
    if (lower.includes(quirk.trigger)) {
      return quirk;
    }
  }

  return null;
}

/**
 * Detect if Ferni should gently push back
 */
function detectPushback(text: string): (typeof FERNI_PERSONALITY.pushbacks)[0] | null {
  for (const pushback of FERNI_PERSONALITY.pushbacks) {
    if (pushback.pattern.test(text) && Math.random() < pushback.frequency) {
      return pushback;
    }
  }

  return null;
}

/**
 * Get time-based personality note
 */
function getTimePersonality(): string | null {
  const hour = new Date().getHours();

  let timeOfDay: keyof typeof FERNI_PERSONALITY.timeOpinions;

  if (hour >= 5 && hour < 9) {
    timeOfDay = 'early morning';
  } else if (hour >= 9 && hour < 12) {
    timeOfDay = 'morning';
  } else if (hour >= 12 && hour < 17) {
    timeOfDay = 'afternoon';
  } else if (hour >= 17 && hour < 21) {
    timeOfDay = 'evening';
  } else {
    timeOfDay = 'late night';
  }

  // Only inject occasionally (20% of the time)
  if (Math.random() > 0.2) return null;

  return FERNI_PERSONALITY.timeOpinions[timeOfDay];
}

// ============================================================================
// SESSION TRACKING - Using unified variety tracker
// ============================================================================

/**
 * Get session ID for variety tracking
 * Falls back to userName or anonymous
 */
function getSessionId(
  services: { sessionId?: string } | undefined,
  userData: { userName?: string; name?: string }
): string {
  return services?.sessionId || userData.userName || userData.name || 'anonymous';
}

/**
 * Get a dynamic expression with variety tracking
 * This replaces the old static quirk system
 */
function getDynamicQuirk(sessionId: string, emotion?: string): DynamicExpressionResult | null {
  // Get a random expression from any light category
  return getRandomExpression(sessionId, {
    emotionalContext: emotion,
    // Exclude heavy categories for casual quirks
    excludeCategories: ['vulnerability'],
  });
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build Ferni's personality context
 *
 * This builder is COMPLEMENTARY to human-personality.ts, adding:
 * - Dynamic expressions (coffee, travel, music) with variety tracking
 * - Gentle pushbacks on limiting beliefs
 * - Time-of-day personality
 * - Sensory "caught doing" moments
 * - Strong opinions when triggered
 *
 * human-personality.ts handles: callbacks, patterns, growth, timing
 * This builder handles: aliveness, personality quirks, dynamic expression
 */
async function buildFerniPersonalityContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const { userText, persona, services, userData, analysis } = input;
  const injections: ContextInjection[] = [];

  // Only run for Ferni
  if (persona.id !== 'ferni') {
    return injections;
  }

  const turnCount = userData?.turnCount || 0;
  const sessionId = services?.sessionId || userData?.userName || 'anonymous';
  const userEmotion = analysis?.emotion?.primary;

  // ============================================================================
  // 1. TIME-BASED PERSONALITY (rare - reduced from 0.15 to 0.05)
  // @deprecated Prefer context-driven mentions over random time-based ones
  // ============================================================================
  if (turnCount >= 1 && Math.random() < 0.05) {
    const timeNote = getTimePersonality();
    if (timeNote) {
      injections.push(
        createHintInjection('ferni_time', `[TIME VIBE: ${timeNote}]`, {
          category: 'personality',
        })
      );
    }
  }

  // ============================================================================
  // 2. GENTLE PUSHBACKS (when user uses limiting language)
  // ============================================================================
  const pushback = detectPushback(userText);
  if (pushback) {
    injections.push(
      createStandardInjection(
        'ferni_pushback',
        `[GENTLE PUSHBACK: Consider kindly challenging this. Ferni's take: "${pushback.response}"]`,
        { category: 'personality' }
      )
    );
    log.debug({ pattern: String(pushback.pattern) }, 'Ferni pushback triggered');
  }

  // ============================================================================
  // 3. DYNAMIC EXPRESSIONS - Sensory/quirky moments
  // @deprecated Reduced rates - prefer human-personality.ts for contextual sharing
  // ============================================================================
  // "Caught doing" moments at conversation start (reduced from 0.4 to 0.15)
  if (turnCount === 0 && Math.random() < 0.15) {
    const { getCaughtDoingMoment } =
      await import('../../personas/bundles/ferni/dynamic-personality.js');
    const caughtDoing = getCaughtDoingMoment(sessionId);
    if (caughtDoing) {
      injections.push(
        createHintInjection(
          'ferni_caught_doing',
          `[CAUGHT IN THE MOMENT: Ferni was just: ${caughtDoing}]`,
          {
            category: 'personality',
          }
        )
      );
    }
  }

  // Sensory moments mid-conversation (reduced from 0.2 to 0.08)
  if (turnCount >= 4 && Math.random() < 0.08) {
    const { getSensoryMoment } =
      await import('../../personas/bundles/ferni/dynamic-personality.js');
    const sensory = getSensoryMoment(sessionId, userEmotion);
    if (sensory) {
      injections.push(
        createHintInjection('ferni_sensory', `[SENSORY NOTICE: ${sensory}]`, {
          category: 'personality',
        })
      );
    }
  }

  // ============================================================================
  // 4. PASSION TOPICS - Get genuinely excited (reduced from 0.5 to 0.25)
  // These are contextual - triggered by user's topic, so kept higher
  // ============================================================================
  const passion = detectPassionTopic(userText);
  if (passion && Math.random() < 0.25) {
    injections.push(
      createStandardInjection(
        'ferni_passion',
        `[PASSION TRIGGER: This topic excites Ferni! "${passion.reaction}"]`,
        { category: 'personality' }
      )
    );
  }

  // ============================================================================
  // 5. STRONG OPINIONS - Share authentic perspective (reduced from 0.4 to 0.2)
  // These are contextual - triggered by user's topic
  // ============================================================================
  const opinion = detectOpinionTopic(userText);
  if (opinion && Math.random() < 0.2) {
    injections.push(
      createStandardInjection(
        'ferni_opinion',
        `[OPINION: Ferni has thoughts on this (${opinion.opinion.stance}): "${opinion.opinion.view}"]`,
        { category: 'personality' }
      )
    );
  }

  // ============================================================================
  // 6. QUIRKS - Small authentic details (reduced from 0.35 to 0.12)
  // @deprecated Prefer human-personality.ts which uses semantic relevance
  // ============================================================================
  const quirk = detectQuirk(userText);
  if (quirk && Math.random() < 0.12) {
    injections.push(
      createHintInjection('ferni_quirk', `[QUIRK: ${quirk.note}]`, {
        category: 'personality',
      })
    );
  }

  // ============================================================================
  // 7. TRAVELER WISDOM - When globally relevant (reduced from 0.3 to 0.15)
  // ============================================================================
  if (
    turnCount >= 3 &&
    userText.match(/\b(perspective|different|culture|learn|travel|abroad|foreign)\b/i) &&
    Math.random() < 0.15
  ) {
    const { getTravelerReference } =
      await import('../../personas/bundles/ferni/dynamic-personality.js');
    const traveler = getTravelerReference(sessionId);
    if (traveler) {
      injections.push(
        createHintInjection('ferni_traveler', `[WORLD PERSPECTIVE: ${traveler}]`, {
          category: 'personality',
        })
      );
    }
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'ferni_personality',
  description: 'Genuine personality with preferences, opinions, and authentic reactions',
  priority: 60, // Medium-high priority
  build: buildFerniPersonalityContext,
});

export { buildFerniPersonalityContext, detectOpinionTopic, detectPassionTopic, FERNI_PERSONALITY };
