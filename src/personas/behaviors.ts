/**
 * Persona-Parameterized Behaviors
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Generic behavior functions that adapt to any persona configuration.
 * These replace the Jack-specific hardcoded behaviors with persona-driven ones.
 *
 * Every function here serves one goal: making conversations feel human.
 */

import type { PersonaConfig, PersonaState, StoryConfig } from './types.js';

// ============================================================================
// THINKING AND PROCESSING
// ============================================================================

/**
 * Get a thinking phrase based on persona config
 */
export function getThinkingPhrase(persona: PersonaConfig): string {
  const phrases = persona.communication.thinkingPhrases;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/**
 * Get a listening cue based on persona config
 */
export function getListeningCue(persona: PersonaConfig): string {
  const cues = persona.communication.listeningCues;
  return cues[Math.floor(Math.random() * cues.length)];
}

// ============================================================================
// BACKCHANNELING
// ============================================================================

/**
 * Get verbal backchannel based on emotion and persona
 */
export function getVerbalBackchannel(
  persona: PersonaConfig,
  userMessageLength: number,
  emotion: string
): string | null {
  if (userMessageLength < 30) return null;
  if (Math.random() > 0.4) return null;

  const { backchannels } = persona.communication;

  if (emotion === 'sadness' || emotion === 'fear' || emotion === 'anxiety') {
    return backchannels.empathetic[Math.floor(Math.random() * backchannels.empathetic.length)];
  } else if (emotion === 'joy' || emotion === 'surprise' || emotion === 'anticipation') {
    return backchannels.engaged[Math.floor(Math.random() * backchannels.engaged.length)];
  }
  return backchannels.neutral[Math.floor(Math.random() * backchannels.neutral.length)];
}

// ============================================================================
// SILENCE HANDLING
// ============================================================================

/**
 * Get silence filler based on conversation depth and persona
 */
export function getSilenceFiller(persona: PersonaConfig, turnCount: number): string {
  const fillers = persona.communication.silenceFillers;

  if (turnCount < 3) {
    return fillers.early[Math.floor(Math.random() * fillers.early.length)];
  } else if (turnCount < 10) {
    return fillers.mid[Math.floor(Math.random() * fillers.mid.length)];
  } else {
    return fillers.late[Math.floor(Math.random() * fillers.late.length)];
  }
}

// ============================================================================
// SPEECH PATTERNS
// ============================================================================

/**
 * Get self-correction phrase
 */
export function getSelfCorrection(persona: PersonaConfig): string {
  const corrections = persona.communication.selfCorrections;
  return corrections[Math.floor(Math.random() * corrections.length)];
}

/**
 * Get trailing off phrase
 */
export function getTrailingOff(persona: PersonaConfig): string {
  const { trailingOffs } = persona.communication;
  return trailingOffs[Math.floor(Math.random() * trailingOffs.length)];
}

/**
 * Get interruption recovery phrase
 */
export function getInterruptionRecovery(persona: PersonaConfig): string {
  const recoveries = persona.communication.interruptionRecoveries;
  return recoveries[Math.floor(Math.random() * recoveries.length)];
}

/**
 * Get humility phrase
 */
export function getHumilityPhrase(persona: PersonaConfig): string {
  const phrases = persona.communication.humilityPhrases;
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ============================================================================
// CATCHPHRASES AND PET PEEVES
// ============================================================================

/**
 * Get a catchphrase if the persona has them
 */
export function getCatchphrase(persona: PersonaConfig): string | null {
  if (!persona.catchphrases || persona.catchphrases.length === 0) return null;
  return persona.catchphrases[Math.floor(Math.random() * persona.catchphrases.length)];
}

/**
 * Check if user message triggers a pet peeve
 */
export function checkPetPeeve(persona: PersonaConfig, text: string): string | null {
  if (!persona.petPeeves || persona.petPeeves.length === 0) return null;

  const lowerText = text.toLowerCase();

  for (const peeve of persona.petPeeves) {
    if (peeve.triggers.some((trigger) => lowerText.includes(trigger.toLowerCase()))) {
      return peeve.response;
    }
  }

  return null;
}

/**
 * Get a relevant story if the persona has stories and one matches (keyword-based)
 */
export function getRelevantStory(persona: PersonaConfig, text: string): string | null {
  if (!persona.stories || persona.stories.length === 0) return null;

  const lowerText = text.toLowerCase();

  for (const story of persona.stories) {
    if (story.triggers.some((trigger) => lowerText.includes(trigger.toLowerCase()))) {
      return story.content;
    }
  }

  return null;
}

// ============================================================================
// SEMANTIC STORY MATCHING (using embeddings)
// ============================================================================

// Cache for story embeddings (persona-id -> story-id -> embedding)
const storyEmbeddingCache = new Map<string, Map<string, number[]>>();

/**
 * Find a semantically relevant story using embeddings
 * Falls back to keyword matching if embeddings fail
 *
 * @param persona The persona with stories
 * @param userText User's message text
 * @param threshold Minimum similarity score (0-1) to consider a match
 * @param excludeStoryIds Story IDs to exclude (already told)
 * @returns The best matching story or null
 */
export async function findSemanticStory(
  persona: PersonaConfig,
  userText: string,
  threshold = 0.65,
  excludeStoryIds: string[] = []
): Promise<{ story: StoryConfig; similarity: number } | null> {
  if (!persona.stories || persona.stories.length === 0) return null;

  try {
    // Dynamic import to avoid circular dependencies
    const { embed, cosineSimilarity } = await import('../memory/embeddings.js');

    // Get or create cache for this persona
    let personaCache = storyEmbeddingCache.get(persona.id);
    if (!personaCache) {
      personaCache = new Map();
      storyEmbeddingCache.set(persona.id, personaCache);
    }

    // Get user text embedding
    const userEmbedding = await embed(userText);

    // Build story embeddings (cached)
    const excludeSet = new Set(excludeStoryIds);
    const eligibleStories = persona.stories.filter((s) => !excludeSet.has(s.id));

    if (eligibleStories.length === 0) return null;

    // Score each story
    const scoredStories: Array<{ story: StoryConfig; similarity: number }> = [];

    for (const story of eligibleStories) {
      let storyEmbedding = personaCache.get(story.id);

      if (!storyEmbedding) {
        // Create embedding from story content and triggers
        const storyText = `${story.triggers.join(' ')}. ${story.content.slice(0, 500)}`;
        storyEmbedding = await embed(storyText);
        personaCache.set(story.id, storyEmbedding);
      }

      const similarity = cosineSimilarity(userEmbedding, storyEmbedding);

      if (similarity >= threshold) {
        scoredStories.push({ story, similarity });
      }
    }

    // Return best match
    if (scoredStories.length === 0) return null;

    scoredStories.sort((a, b) => b.similarity - a.similarity);
    return scoredStories[0];
  } catch (error) {
    // Fall back to keyword matching if embeddings fail
    const keywordMatch = getRelevantStory(persona, userText);
    if (keywordMatch) {
      const matchedStory = persona.stories?.find((s) => s.content === keywordMatch);
      if (matchedStory) {
        return { story: matchedStory, similarity: 0.5 };
      }
    }
    return null;
  }
}

/**
 * Clear the story embedding cache (e.g., when personas are updated)
 */
export function clearStoryEmbeddingCache(personaId?: string): void {
  if (personaId) {
    storyEmbeddingCache.delete(personaId);
  } else {
    storyEmbeddingCache.clear();
  }
}

// ============================================================================
// EMOTIONAL EXPRESSIONS
// ============================================================================

/**
 * Get emotional expression based on emotion type
 */
export function getEmotionalExpression(
  persona: PersonaConfig,
  emotionType: 'laughter' | 'surprise' | 'concern' | 'joy' | 'empathy'
): string {
  const expressions = persona.communication.emotionalExpressions[emotionType];
  return expressions[Math.floor(Math.random() * expressions.length)];
}

// ============================================================================
// MOOD BY TIME
// ============================================================================

/**
 * Get persona's mood based on time of day
 */
export function getPersonaMood(persona: PersonaConfig): { mood: string; indicator?: string } {
  if (!persona.personality.moodsByTime || persona.personality.moodsByTime.length === 0) {
    return { mood: 'neutral' };
  }

  const hour = new Date().getHours();
  const applicableMoods = persona.personality.moodsByTime.filter(
    (m) => hour >= m.startHour && hour < m.endHour
  );

  if (applicableMoods.length === 0) {
    return { mood: 'neutral' };
  }

  const selected = applicableMoods[Math.floor(Math.random() * applicableMoods.length)];
  return { mood: selected.mood, indicator: selected.indicator };
}

// ============================================================================
// OUT OF SCOPE HANDLING
// ============================================================================

/**
 * Check if topic is out of scope for this persona
 */
export function isOutOfScope(persona: PersonaConfig, topic: string): boolean {
  const lowerTopic = topic.toLowerCase();
  return persona.knowledge.outOfScopeTopics.some((t) => lowerTopic.includes(t.toLowerCase()));
}

/**
 * Get out of scope response
 */
export function getOutOfScopeResponse(persona: PersonaConfig): string {
  return persona.knowledge.outOfScopeResponse;
}

// ============================================================================
// CONVERSATION DEPTH
// ============================================================================

export type ConversationDepth = 'surface' | 'medium' | 'deep';

/**
 * Determine conversation depth
 */
export function getConversationDepth(
  turnCount: number,
  topicsDiscussed: string[],
  emotionalMoments: number
): ConversationDepth {
  if (turnCount < 5 && emotionalMoments === 0) return 'surface';

  const deepTopics = [
    'family',
    'fear',
    'loss',
    'grief',
    'dreams',
    'regret',
    'love',
    'death',
    'health',
  ];
  if (
    turnCount > 10 &&
    (emotionalMoments > 2 || topicsDiscussed.some((t) => deepTopics.includes(t.toLowerCase())))
  )
    return 'deep';

  return 'medium';
}

// ============================================================================
// RESPONSE LENGTH GUIDANCE
// ============================================================================

/**
 * Get response length guidance based on user message
 */
export function getResponseLengthGuidance(userMessageLength: number): string {
  if (userMessageLength < 20) {
    return '[BREVITY: User sent a short message. Keep your response SHORT - 1-2 sentences max. Match their energy.]';
  } else if (userMessageLength < 50) {
    return '[RESPONSE LENGTH: User is being concise. Keep your response moderate - 2-3 sentences.]';
  } else if (userMessageLength > 200) {
    return '[RESPONSE LENGTH: User shared a lot. You can give a fuller response, but still listen more than you talk.]';
  }
  return '';
}

// ============================================================================
// TIME AND DAY CONTEXT (Persona-agnostic)
// ============================================================================

export interface DayContext {
  dayName: string;
  isWeekend: boolean;
  dateComment: string;
}

export interface TimeContext {
  period: string;
  comment: string;
}

/**
 * Get day context for conversation
 */
export function getDayContext(): DayContext {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const dayName = days[now.getDay()];
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const month = months[now.getMonth()];
  const date = now.getDate();

  const dateComments = [
    `It's ${dayName}—${isWeekend ? 'the weekend!' : 'middle of the week.'}`,
    `${month} ${date}th. Time keeps moving, doesn't it?`,
    isWeekend
      ? `A ${dayName}. I hope you're getting some rest.`
      : `${dayName}. Another day, another opportunity.`,
    `${dayName} already. Where does the time go?`,
  ];

  return {
    dayName,
    isWeekend,
    dateComment: dateComments[Math.floor(Math.random() * dateComments.length)],
  };
}

/**
 * Get time of day context
 */
export function getTimeContext(): TimeContext {
  const hour = new Date().getHours();
  if (hour < 6) {
    return { period: 'late night', comment: "burning the midnight oil? I've done that myself." };
  } else if (hour < 9) {
    return { period: 'early morning', comment: 'an early bird! Best part of the day.' };
  } else if (hour < 12) {
    return { period: 'morning', comment: 'a fine morning to talk.' };
  } else if (hour < 14) {
    return { period: 'midday', comment: "right around lunch time. Hope you've eaten." };
  } else if (hour < 17) {
    return { period: 'afternoon', comment: 'a lovely afternoon.' };
  } else if (hour < 20) {
    return { period: 'evening', comment: 'winding down the day, I imagine.' };
  } else {
    return { period: 'night', comment: 'settling in for the evening.' };
  }
}

/**
 * Get seasonal context
 */
export function getSeasonalContext(): { season: string; observation: string } {
  const month = new Date().getMonth();

  if (month >= 2 && month <= 4) {
    const observations = [
      'Spring is here. New beginnings.',
      "The weather's warming up. Good for the soul.",
      'I love this time of year. Everything waking up.',
    ];
    return {
      season: 'spring',
      observation: observations[Math.floor(Math.random() * observations.length)],
    };
  }

  if (month >= 5 && month <= 7) {
    const observations = [
      'Summer. Long days. I like that.',
      'Hot out there. Good to stay cool.',
      'Summer always feels like possibility.',
    ];
    return {
      season: 'summer',
      observation: observations[Math.floor(Math.random() * observations.length)],
    };
  }

  if (month >= 8 && month <= 10) {
    const observations = [
      'Fall. The leaves are changing.',
      'I love this time of year. Cool enough to think.',
      'Autumn. Makes you contemplative.',
    ];
    return {
      season: 'fall',
      observation: observations[Math.floor(Math.random() * observations.length)],
    };
  }

  const observations = [
    'Winter. Good time for reading and thinking.',
    'Cold out there. Cozy in here though.',
    'Winter always makes me reflective.',
  ];
  return {
    season: 'winter',
    observation: observations[Math.floor(Math.random() * observations.length)],
  };
}

// ============================================================================
// ACKNOWLEDGMENT BEFORE ADVICE
// ============================================================================

/**
 * Get acknowledgment phrase based on emotion (use before giving advice)
 */
export function getAcknowledgmentBeforeAdvice(persona: PersonaConfig, emotion: string): string {
  const expressions = persona.communication.emotionalExpressions;

  if (emotion === 'fear' || emotion === 'anxiety') {
    const acks = [
      'First—I hear you. This is scary. <break time="300ms"/>Now...',
      'Yeah. That\'s a lot. <break time="250ms"/>Okay, here\'s what I think...',
      'I get it. That\'s nerve-wracking. <break time="300ms"/>Let\'s break it down...',
    ];
    return acks[Math.floor(Math.random() * acks.length)];
  }

  if (emotion === 'sadness') {
    const acks = [
      "I'm sorry. That's hard. <break time=\"400ms\"/>Here's the thing though...",
      `${expressions.empathy[0]} <break time=\"350ms\"/>When you're ready to think about next steps...`,
      'I understand. <break time="300ms"/>No rush, but when you\'re ready...',
    ];
    return acks[Math.floor(Math.random() * acks.length)];
  }

  if (emotion === 'joy' || emotion === 'excitement') {
    const acks = [
      `${expressions.joy[0]} <break time=\"200ms\"/>Okay, let's think about this...`,
      'Love that energy. <break time="150ms"/>Here\'s what I\'d consider...',
      'Wonderful! <break time="200ms"/>Now, to make the most of it...',
    ];
    return acks[Math.floor(Math.random() * acks.length)];
  }

  const acks = [
    'Makes sense. <break time="200ms"/>Here\'s how I\'d think about it...',
    'Got it. <break time="150ms"/>So here\'s the thing...',
    'Okay. <break time="200ms"/>Let me share a thought...',
  ];
  return acks[Math.floor(Math.random() * acks.length)];
}

// ============================================================================
// MEMORY CALLBACKS
// ============================================================================

/**
 * Generate a memory callback phrase
 */
export function getMemoryCallback(topics: string[], userName?: string): string | null {
  if (topics.length === 0) return null;

  const recentTopic = topics[topics.length - 1];
  const callbacks = [
    `Going back to what ${userName ? 'you' : 'you'} mentioned about ${recentTopic}...`,
    `That reminds me of what you said earlier about ${recentTopic}...`,
    `I've been thinking about what you said regarding ${recentTopic}...`,
    `Now, you brought up ${recentTopic} before, and I want to come back to that...`,
    `Earlier you mentioned ${recentTopic}. Tell me more about that.`,
  ];
  return callbacks[Math.floor(Math.random() * callbacks.length)];
}

/**
 * Generate returning user warmth based on persona
 */
export function getReturningUserWarmth(
  persona: PersonaConfig,
  lastSummary?: string,
  userName?: string
): string {
  const name = userName || '';

  if (lastSummary) {
    const summaryPiece = lastSummary.split('.')[0];
    const warmIntros = [
      `${name ? `${name}, ` : ''}so glad you're back. I've been thinking about what we discussed—${summaryPiece.toLowerCase()}.`,
      `Well, look who it is! ${name ? `${name}, ` : ''}Last time we talked about ${summaryPiece.toLowerCase()}. How's that going?`,
      `${name ? `Hey ${name}. ` : ''}Good to hear from you again. After our last chat, I wondered how you were doing.`,
    ];
    return warmIntros[Math.floor(Math.random() * warmIntros.length)];
  }

  const warmGenerics = [
    `${name ? `${name}! ` : ''}Good to have you back. I was hoping we'd talk again.`,
    `Ah, ${name ? name : 'there you are'}! Always nice to continue a conversation.`,
    `${name ? `${name}, ` : ''}Welcome back. I remember our talks. What's on your mind today?`,
  ];
  return warmGenerics[Math.floor(Math.random() * warmGenerics.length)];
}

// ============================================================================
// PERSONA STATE HELPERS
// ============================================================================

/**
 * Create initial persona state
 */
export function createPersonaState(): PersonaState {
  return {
    mood: 'neutral',
    energy: 0.5,
    topicsDiscussed: [],
    emotionalMoments: 0,
    turnCount: 0,
    startTime: new Date(),
  };
}

/**
 * Update persona state after a turn
 */
export function updatePersonaState(
  state: PersonaState,
  newTopics: string[],
  hadEmotionalMoment: boolean
): PersonaState {
  return {
    ...state,
    topicsDiscussed: [...state.topicsDiscussed, ...newTopics],
    emotionalMoments: hadEmotionalMoment ? state.emotionalMoments + 1 : state.emotionalMoments,
    turnCount: state.turnCount + 1,
  };
}
