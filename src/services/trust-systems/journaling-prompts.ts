/**
 * Journaling Prompts
 *
 * Generates personalized journaling prompts based on current context,
 * growth areas, and relationship history.
 *
 * Philosophy: The right question at the right time can unlock
 * profound self-discovery. Generic prompts don't land.
 *
 * BETTER THAN HUMAN: This module now supports LLM-powered dynamic
 * prompt generation. Static templates are used as fallback and for
 * category guidance, but the best prompts are generated based on:
 * - What we know about the user (struggles, wins, growth areas)
 * - Their relationship with Ferni
 * - Current emotional state
 * - Time of day and context
 *
 * Prompt Types:
 * - Reflection (processing experiences)
 * - Exploration (discovering patterns)
 * - Gratitude (appreciating growth)
 * - Challenge (gentle pushing)
 * - Integration (connecting insights)
 *
 * @module JournalingPrompts
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  generateQuestion,
  type QuestionContext,
  type QuestionType,
} from '../../intelligence/dynamic-questions.js';

const log = createLogger({ module: 'JournalingPrompts' });

// ============================================================================
// TYPES
// ============================================================================

export type PromptCategory =
  | 'reflection'
  | 'exploration'
  | 'gratitude'
  | 'challenge'
  | 'integration'
  | 'growth'
  | 'relationship'
  | 'future'
  | 'healing';

export interface JournalingPrompt {
  id: string;
  category: PromptCategory;
  prompt: string;
  followUp?: string;
  context: string;
  difficulty: 'gentle' | 'moderate' | 'deep';
  estimatedMinutes: number;
  tags: string[];
  personalizedFor?: string; // What made this prompt relevant
}

export interface PromptContext {
  userId: string;
  currentEmotion?: string;
  recentTopics?: string[];
  growthAreas?: string[];
  struggles?: string[];
  wins?: string[];
  relationships?: string[];
  upcomingEvents?: string[];
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  relationshipStage?: 'new' | 'building' | 'established' | 'deep';
  lastJournaledAt?: Date;
  preferredStyle?: 'direct' | 'exploratory' | 'poetic';
}

export interface PromptResponse {
  promptId: string;
  userId: string;
  responseText?: string;
  completedAt: Date;
  timeSpent?: number; // minutes
  rating?: 1 | 2 | 3 | 4 | 5;
  insightsGained?: string[];
}

export interface JournalingPattern {
  preferredCategories: PromptCategory[];
  avgTimeSpent: number;
  completionRate: number;
  bestTimeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  insightsCount: number;
}

// ============================================================================
// PROMPT TEMPLATES
// ============================================================================

const TEMPLATES: Record<PromptCategory, string[]> = {
  reflection: [
    "What's been taking up the most space in your mind this week?",
    'If today had a color, what would it be? Why?',
    'What moment from today do you want to remember?',
    'What are you avoiding thinking about?',
    'How did you show up for yourself today?',
    "What would you tell yesterday's version of you?",
    "What's one thing that surprised you about yourself recently?",
  ],

  exploration: [
    'When do you feel most like yourself?',
    'What patterns do you notice in your relationships?',
    "If you weren't afraid, what would you do differently?",
    'What story do you tell yourself most often? Is it true?',
    "What does your ideal day look like? What's stopping you?",
    'Who do you become when no one is watching?',
    'What beliefs have you outgrown?',
  ],

  gratitude: [
    'What small thing brought you unexpected joy recently?',
    'Who made a difference in your life this week, even unknowingly?',
    'What challenge are you grateful you went through?',
    'What about your life would past-you be proud of?',
    "What's working in your life right now?",
    "What's a mundane thing you'd miss if it were gone?",
  ],

  challenge: [
    'What uncomfortable truth are you ready to face?',
    'Where are you settling for less than you deserve?',
    'What conversation have you been putting off?',
    'What would happen if you stopped trying to be perfect?',
    "What's one thing you could do that scares you a little?",
    'Where are you playing small?',
  ],

  integration: [
    'What have your recent struggles been trying to teach you?',
    'How does this current chapter connect to your larger story?',
    'What wisdom are you gaining from this season of life?',
    'How are your past experiences serving you now?',
    "What's becoming clearer to you lately?",
  ],

  growth: [
    'How have you changed in the last year?',
    'What are you becoming?',
    "What's one way you've surprised yourself recently?",
    'What growth are you proud of that no one else knows about?',
    'What would embracing your growth look like?',
  ],

  relationship: [
    'What do you need from your relationships right now?',
    'Who do you need to forgive (including yourself)?',
    'What boundaries are you learning to set?',
    'How do you want to show up for the people you love?',
    'What relationship truth have you been avoiding?',
  ],

  future: [
    'What are you looking forward to?',
    'What would your future self thank you for starting today?',
    'What seeds are you planting?',
    'Where do you want to be a year from now?',
    'What legacy are you building?',
  ],

  healing: [
    'What part of you needs the most compassion right now?',
    'What would letting go look like?',
    'What old wound is asking for attention?',
    'What do you need to hear right now?',
    'If you treated yourself like someone you loved, what would change?',
  ],
};

// Contextual templates that use variables
const CONTEXTUAL_TEMPLATES: Record<string, (ctx: PromptContext) => JournalingPrompt | null> = {
  recentWin: (ctx) => {
    if (!ctx.wins?.length) return null;
    const win = ctx.wins[0];
    return {
      id: `ctx-win-${Date.now()}`,
      category: 'growth',
      prompt: `You recently ${win}. What did it take to get there? What did you learn about yourself?`,
      context: `Based on recent win: ${win}`,
      difficulty: 'moderate',
      estimatedMinutes: 10,
      tags: ['growth', 'achievement'],
      personalizedFor: 'your recent accomplishment',
    };
  },

  currentStruggle: (ctx) => {
    if (!ctx.struggles?.length) return null;
    const struggle = ctx.struggles[0];
    return {
      id: `ctx-struggle-${Date.now()}`,
      category: 'healing',
      prompt: `You've been dealing with ${struggle}. What would you say to a friend going through the same thing?`,
      followUp: 'Can you offer that same compassion to yourself?',
      context: `Based on current struggle: ${struggle}`,
      difficulty: 'deep',
      estimatedMinutes: 15,
      tags: ['healing', 'self-compassion'],
      personalizedFor: "what you're working through",
    };
  },

  upcomingEvent: (ctx) => {
    if (!ctx.upcomingEvents?.length) return null;
    const event = ctx.upcomingEvents[0];
    return {
      id: `ctx-event-${Date.now()}`,
      category: 'future',
      prompt: `${event} is coming up. What outcome do you really want? What's in your control?`,
      context: `Based on upcoming: ${event}`,
      difficulty: 'moderate',
      estimatedMinutes: 10,
      tags: ['planning', 'intention'],
      personalizedFor: 'your upcoming event',
    };
  },

  emotionalState: (ctx) => {
    if (!ctx.currentEmotion) return null;
    const emotionPrompts: Record<string, string> = {
      anxious: 'What would it feel like to trust that things will work out?',
      sad: 'What does this sadness want you to know?',
      angry: "Under the anger, what need isn't being met?",
      overwhelmed: 'If you could only do one thing today, what matters most?',
      happy: "What's contributing to this good feeling? How can you create more of it?",
      confused: 'What would clarity look like right now?',
    };

    const prompt = emotionPrompts[ctx.currentEmotion];
    if (!prompt) return null;

    return {
      id: `ctx-emotion-${Date.now()}`,
      category: 'reflection',
      prompt,
      context: `Based on current emotion: ${ctx.currentEmotion}`,
      difficulty: 'moderate',
      estimatedMinutes: 10,
      tags: ['emotion', ctx.currentEmotion],
      personalizedFor: `how you're feeling (${ctx.currentEmotion})`,
    };
  },

  growthArea: (ctx) => {
    if (!ctx.growthAreas?.length) return null;
    const area = ctx.growthAreas[0];
    return {
      id: `ctx-growth-${Date.now()}`,
      category: 'growth',
      prompt: `You've been working on ${area}. Where have you seen even small progress? What's still challenging?`,
      context: `Based on growth area: ${area}`,
      difficulty: 'moderate',
      estimatedMinutes: 12,
      tags: ['growth', 'self-awareness'],
      personalizedFor: 'your growth journey',
    };
  },

  relationship: (ctx) => {
    if (!ctx.relationships?.length) return null;
    const person = ctx.relationships[0];
    return {
      id: `ctx-relationship-${Date.now()}`,
      category: 'relationship',
      prompt: `You've been thinking about ${person}. What do you wish they understood about you?`,
      followUp: 'Have you shared this with them?',
      context: `Based on important relationship: ${person}`,
      difficulty: 'deep',
      estimatedMinutes: 15,
      tags: ['relationship', 'communication'],
      personalizedFor: 'a relationship on your mind',
    };
  },
};

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

const userResponses = new Map<string, PromptResponse[]>();
const userPatterns = new Map<string, JournalingPattern>();
const deliveredPrompts = new Map<string, Set<string>>(); // userId -> promptIds

// ============================================================================
// PROMPT GENERATION
// ============================================================================

/**
 * Generate personalized prompts for user
 */
export function generatePrompts(context: PromptContext, count = 3): JournalingPrompt[] {
  const prompts: JournalingPrompt[] = [];

  // First, try contextual prompts (most personalized)
  for (const generator of Object.values(CONTEXTUAL_TEMPLATES)) {
    if (prompts.length >= count) break;

    const prompt = generator(context);
    if (prompt && !wasRecentlyDelivered(context.userId, prompt.id)) {
      prompts.push(prompt);
    }
  }

  // Fill remaining with category-based prompts
  const categories = selectCategories(context);

  for (const category of categories) {
    if (prompts.length >= count) break;

    const prompt = generateFromCategory(category, context);
    if (prompt && !wasRecentlyDelivered(context.userId, prompt.id)) {
      prompts.push(prompt);
    }
  }

  // Mark as delivered
  prompts.forEach((p) => markDelivered(context.userId, p.id));

  log.debug(
    {
      userId: context.userId,
      promptCount: prompts.length,
      categories: prompts.map((p) => p.category),
    },
    '📝 Journaling prompts generated'
  );

  return prompts;
}

/**
 * Select appropriate categories based on context
 */
function selectCategories(context: PromptContext): PromptCategory[] {
  const categories: PromptCategory[] = [];

  // Time of day influences category
  if (context.timeOfDay === 'morning') {
    categories.push('future', 'gratitude');
  } else if (context.timeOfDay === 'evening' || context.timeOfDay === 'night') {
    categories.push('reflection', 'integration');
  }

  // Emotional state influences category
  if (context.currentEmotion) {
    const emotionMap: Record<string, PromptCategory> = {
      anxious: 'healing',
      sad: 'healing',
      angry: 'exploration',
      overwhelmed: 'integration',
      happy: 'gratitude',
      confused: 'exploration',
    };
    const cat = emotionMap[context.currentEmotion];
    if (cat && !categories.includes(cat)) {
      categories.push(cat);
    }
  }

  // Relationship stage influences depth
  if (context.relationshipStage === 'deep') {
    categories.push('challenge');
  }

  // Add variety
  const all: PromptCategory[] = [
    'reflection',
    'exploration',
    'gratitude',
    'growth',
    'relationship',
    'future',
  ];
  for (const cat of all) {
    if (!categories.includes(cat)) {
      categories.push(cat);
    }
  }

  return categories;
}

/**
 * Generate prompt from category
 */
function generateFromCategory(
  category: PromptCategory,
  context: PromptContext
): JournalingPrompt | null {
  const templates = TEMPLATES[category];
  if (!templates?.length) return null;

  // Get user's history to avoid repeats
  const delivered = deliveredPrompts.get(context.userId) || new Set();

  // Find unused template
  const unused = templates.filter((t) => !delivered.has(`${category}-${t.slice(0, 20)}`));
  const template =
    unused.length > 0
      ? unused[Math.floor(Math.random() * unused.length)]
      : templates[Math.floor(Math.random() * templates.length)];

  const difficulty = determineDifficulty(category, context);

  return {
    id: `${category}-${template.slice(0, 20)}-${Date.now()}`,
    category,
    prompt: template,
    context: `Category: ${category}`,
    difficulty,
    estimatedMinutes: difficulty === 'gentle' ? 5 : difficulty === 'moderate' ? 10 : 15,
    tags: [category],
  };
}

/**
 * Determine appropriate difficulty
 */
function determineDifficulty(
  category: PromptCategory,
  context: PromptContext
): 'gentle' | 'moderate' | 'deep' {
  // Deep categories
  if (['challenge', 'healing'].includes(category)) {
    // Only go deep if relationship is established
    if (context.relationshipStage === 'deep') return 'deep';
    return 'moderate';
  }

  // If struggling, be gentler
  if (context.struggles?.length) {
    return 'gentle';
  }

  // Otherwise moderate
  return 'moderate';
}

/**
 * Check if prompt was recently delivered
 */
function wasRecentlyDelivered(userId: string, promptId: string): boolean {
  const delivered = deliveredPrompts.get(userId);
  if (!delivered) return false;

  // Check if base ID matches (without timestamp)
  const baseId = promptId.split('-').slice(0, -1).join('-');
  for (const id of delivered) {
    if (id.startsWith(baseId)) return true;
  }

  return false;
}

/**
 * Mark prompt as delivered
 */
function markDelivered(userId: string, promptId: string): void {
  let delivered = deliveredPrompts.get(userId);
  if (!delivered) {
    delivered = new Set();
    deliveredPrompts.set(userId, delivered);
  }

  delivered.add(promptId);

  // Keep only last 50
  if (delivered.size > 50) {
    const arr = Array.from(delivered);
    deliveredPrompts.set(userId, new Set(arr.slice(-50)));
  }
}

// ============================================================================
// RESPONSE TRACKING
// ============================================================================

/**
 * Record prompt response
 */
export function recordResponse(response: PromptResponse): void {
  const responses = userResponses.get(response.userId) || [];
  responses.push(response);

  // Keep last 100
  if (responses.length > 100) {
    responses.shift();
  }

  userResponses.set(response.userId, responses);

  // Update patterns
  updatePatterns(response.userId);

  log.debug(
    {
      userId: response.userId,
      promptId: response.promptId,
      rating: response.rating,
    },
    '✍️ Journaling response recorded'
  );
}

/**
 * Update user patterns
 */
function updatePatterns(userId: string): void {
  const responses = userResponses.get(userId) || [];
  if (responses.length < 5) return;

  // Calculate stats
  const categoryCount = new Map<PromptCategory, number>();
  let totalTime = 0;
  let completedCount = 0;
  let totalInsights = 0;

  for (const resp of responses) {
    // Count categories (would need to join with prompts data)
    if (resp.timeSpent) {
      totalTime += resp.timeSpent;
    }
    if (resp.responseText) {
      completedCount++;
    }
    if (resp.insightsGained) {
      totalInsights += resp.insightsGained.length;
    }
  }

  const pattern: JournalingPattern = {
    preferredCategories: [], // Would calculate from joined data
    avgTimeSpent: completedCount > 0 ? totalTime / completedCount : 0,
    completionRate: responses.length > 0 ? completedCount / responses.length : 0,
    insightsCount: totalInsights,
  };

  userPatterns.set(userId, pattern);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get single best prompt for moment
 */
export function getBestPrompt(context: PromptContext): JournalingPrompt {
  const prompts = generatePrompts(context, 1);
  return (
    prompts[0] || {
      id: `fallback-${Date.now()}`,
      category: 'reflection',
      prompt: "What's on your mind right now?",
      context: 'Fallback prompt',
      difficulty: 'gentle',
      estimatedMinutes: 5,
      tags: ['general'],
    }
  );
}

/**
 * Get prompts for a specific category
 */
export function getPromptsForCategory(
  userId: string,
  category: PromptCategory,
  count = 3
): JournalingPrompt[] {
  const templates = TEMPLATES[category];
  if (!templates) return [];

  return templates.slice(0, count).map((template, i) => ({
    id: `${category}-${i}-${Date.now()}`,
    category,
    prompt: template,
    context: `Category: ${category}`,
    difficulty: 'moderate' as const,
    estimatedMinutes: 10,
    tags: [category],
  }));
}

/**
 * Get user's journaling patterns
 */
export function getJournalingPatterns(userId: string): JournalingPattern | null {
  return userPatterns.get(userId) || null;
}

/**
 * Generate prompt for specific situation
 */
export function generateSituationalPrompt(
  userId: string,
  situation: 'morning_routine' | 'evening_wind_down' | 'processing_emotion' | 'after_session'
): JournalingPrompt {
  const prompts: Record<string, JournalingPrompt> = {
    morning_routine: {
      id: `sit-morning-${Date.now()}`,
      category: 'future',
      prompt: 'What intention do you want to set for today? What would make today feel successful?',
      context: 'Morning routine',
      difficulty: 'gentle',
      estimatedMinutes: 5,
      tags: ['morning', 'intention'],
    },
    evening_wind_down: {
      id: `sit-evening-${Date.now()}`,
      category: 'reflection',
      prompt: "What are three things that went well today? What's one thing you'd do differently?",
      context: 'Evening wind-down',
      difficulty: 'gentle',
      estimatedMinutes: 5,
      tags: ['evening', 'reflection'],
    },
    processing_emotion: {
      id: `sit-emotion-${Date.now()}`,
      category: 'healing',
      prompt:
        'What are you feeling right now? Where do you feel it in your body? What does it need?',
      followUp: 'What would it look like to give yourself what you need?',
      context: 'Processing emotion',
      difficulty: 'moderate',
      estimatedMinutes: 10,
      tags: ['emotion', 'processing'],
    },
    after_session: {
      id: `sit-session-${Date.now()}`,
      category: 'integration',
      prompt: 'What stood out to you from our conversation? What do you want to remember?',
      followUp: "What's one small action you could take based on what we discussed?",
      context: 'After Ferni session',
      difficulty: 'moderate',
      estimatedMinutes: 8,
      tags: ['integration', 'ferni'],
    },
  };

  return prompts[situation] || prompts.morning_routine;
}

/**
 * Format prompt for voice delivery
 */
export function formatPromptForVoice(prompt: JournalingPrompt): {
  intro: string;
  prompt: string;
  followUp?: string;
  ssml: string;
} {
  const intros = [
    "Here's something to think about:",
    "Here's a journaling prompt for you:",
    'Something to reflect on:',
    'A question for you:',
  ];

  const intro = intros[Math.floor(Math.random() * intros.length)];

  return {
    intro,
    prompt: prompt.prompt,
    followUp: prompt.followUp,
    ssml: `<speak>
      <prosody rate="95%">
        ${intro}
        <break time="500ms"/>
        ${prompt.prompt}
        ${prompt.followUp ? `<break time="800ms"/>${prompt.followUp}` : ''}
      </prosody>
    </speak>`,
  };
}

// ============================================================================
// DYNAMIC PROMPT GENERATION (Better than Human)
// ============================================================================

/**
 * Map journaling category to question type
 */
function categoryToQuestionType(category: PromptCategory): QuestionType {
  const mapping: Record<PromptCategory, QuestionType> = {
    reflection: 'reflective',
    exploration: 'curious',
    gratitude: 'celebratory',
    challenge: 'deepening',
    integration: 'reflective',
    growth: 'deepening',
    relationship: 'curious',
    future: 'curious',
    healing: 'supportive',
  };
  return mapping[category] || 'reflective';
}

/**
 * Convert PromptContext to QuestionContext for dynamic generation
 */
function promptContextToQuestionContext(
  context: PromptContext,
  personaId: string = 'ferni'
): QuestionContext {
  return {
    personaId,
    userId: context.userId,
    sessionId: `journal-${context.userId}-${Date.now()}`,
    knownFacts: [
      ...(context.wins || []).map((w) => `Recent win: ${w}`),
      ...(context.struggles || []).map((s) => `Working on: ${s}`),
      ...(context.growthAreas || []).map((g) => `Growth area: ${g}`),
    ],
    recentTopics: context.recentTopics || [],
    currentStruggle: context.struggles?.[0],
    currentWin: context.wins?.[0],
    relationshipStage: context.relationshipStage || 'building',
    conversationDepth: context.relationshipStage === 'deep' ? 8 : 5,
    emotionalState: context.currentEmotion
      ? { primary: context.currentEmotion, intensity: 0.6 }
      : undefined,
    hourOfDay:
      context.timeOfDay === 'morning'
        ? 8
        : context.timeOfDay === 'afternoon'
          ? 14
          : context.timeOfDay === 'evening'
            ? 19
            : 22,
    isWeekend: false,
    turnCount: 5,
    boundaries: [],
  };
}

/**
 * Generate a dynamic journaling prompt using LLM
 *
 * This is the "Better than Human" version that creates truly personalized
 * prompts based on what we know about the user.
 *
 * @param context - User context including struggles, wins, growth areas
 * @param category - Optional category preference
 * @param personaId - Persona voice to use (default: ferni)
 * @returns Promise<JournalingPrompt>
 */
export async function generateDynamicPrompt(
  context: PromptContext,
  category?: PromptCategory,
  personaId: string = 'ferni'
): Promise<JournalingPrompt> {
  // Determine category if not specified
  const selectedCategory = category || selectCategories(context)[0] || 'reflection';
  const questionType = categoryToQuestionType(selectedCategory);

  try {
    const questionContext = promptContextToQuestionContext(context, personaId);
    const generated = await generateQuestion(questionContext, questionType);

    log.debug(
      {
        userId: context.userId,
        category: selectedCategory,
        intent: generated.intent.seekingToUnderstand,
      },
      '📝 Generated dynamic journaling prompt'
    );

    return {
      id: `dynamic-${selectedCategory}-${Date.now()}`,
      category: selectedCategory,
      prompt: generated.text,
      followUp:
        generated.followUpStrategy.ifPositive !== 'Acknowledge and explore'
          ? generated.followUpStrategy.ifPositive
          : undefined,
      context: `Dynamic: ${generated.intent.seekingToUnderstand}`,
      difficulty: context.relationshipStage === 'deep' ? 'deep' : 'moderate',
      estimatedMinutes: questionType === 'deepening' ? 15 : 10,
      tags: [selectedCategory, 'dynamic'],
      personalizedFor: generated.intent.timingReason,
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'Dynamic prompt generation failed, using static');
    // Fall back to static prompt
    return getBestPrompt(context);
  }
}

/**
 * Generate multiple dynamic prompts
 */
export async function generateDynamicPrompts(
  context: PromptContext,
  count: number = 3,
  personaId: string = 'ferni'
): Promise<JournalingPrompt[]> {
  const categories = selectCategories(context).slice(0, count);
  const prompts: JournalingPrompt[] = [];

  for (const category of categories) {
    try {
      const prompt = await generateDynamicPrompt(context, category, personaId);
      prompts.push(prompt);
    } catch {
      // If one fails, continue with static
      const staticPrompt = generateFromCategory(category, context);
      if (staticPrompt) prompts.push(staticPrompt);
    }
  }

  // Fill with static if needed
  while (prompts.length < count) {
    const category = categories[prompts.length] || 'reflection';
    const staticPrompt = generateFromCategory(category, context);
    if (staticPrompt) prompts.push(staticPrompt);
  }

  return prompts;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  generatePrompts,
  generateDynamicPrompt,
  generateDynamicPrompts,
  getBestPrompt,
  getPromptsForCategory,
  recordResponse,
  getJournalingPatterns,
  generateSituationalPrompt,
  formatPromptForVoice,
};
