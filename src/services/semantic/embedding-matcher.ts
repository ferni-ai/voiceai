/**
 * Embedding-Based Semantic Matcher
 *
 * Uses vector embeddings for high-accuracy semantic matching.
 * Overcomes limitations of pattern-based detection by understanding
 * conceptual similarity rather than exact phrases.
 *
 * Used for:
 * - Habit intent detection
 * - Trust signal detection
 * - Calendar intent detection
 * - General semantic classification
 *
 * @module EmbeddingMatcher
 */

import { createLogger } from '../../utils/safe-logger.js';
// Centralized similarity operations - uses SIMD-ready implementation from rust-accelerator
import { cosineSimilarity } from '../memory/rust-accelerator.js';

const log = createLogger({ module: 'EmbeddingMatcher' });

// ============================================================================
// TYPES
// ============================================================================

export type EmbeddingVector = number[];

export interface SemanticCategory {
  id: string;
  name: string;
  description: string;
  examples: string[];
  /** Pre-computed embedding for description */
  descriptionEmbedding?: EmbeddingVector;
  /** Pre-computed embeddings for examples */
  exampleEmbeddings?: EmbeddingVector[];
}

export interface MatchResult {
  categoryId: string;
  score: number;
  confidence: 'high' | 'medium' | 'low' | 'none';
  matchedExample?: string;
  reason: string;
}

// ============================================================================
// EMBEDDING PROVIDER
// ============================================================================

const embeddingCache = new Map<string, EmbeddingVector>();
let googleApiKey: string | null = null;

/**
 * Get embedding for text using Google's text-embedding model
 */
// Type for Google embedding API response
interface EmbeddingResponse {
  embedding?: {
    values?: number[];
  };
}

async function getEmbedding(text: string): Promise<EmbeddingVector | null> {
  // Check cache
  const cacheKey = text.toLowerCase().trim();
  const cached = embeddingCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // Get API key
  if (!googleApiKey) {
    googleApiKey = process.env.GOOGLE_API_KEY ?? null;
    if (!googleApiKey) {
      log.warn('GOOGLE_API_KEY not set - embedding matching disabled');
      return null;
    }
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${googleApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text }] },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      log.error({ error, status: response.status }, 'Embedding API error');
      return null;
    }

    const data = (await response.json()) as EmbeddingResponse;
    const embedding = data.embedding?.values ?? null;

    if (embedding !== null) {
      embeddingCache.set(cacheKey, embedding);
    }

    return embedding;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get embedding');
    return null;
  }
}

// Note: cosineSimilarity is imported from rust-accelerator.js (SIMD-accelerated)

// ============================================================================
// HABIT DETECTION CATEGORIES
// ============================================================================

export const HABIT_CATEGORIES: SemanticCategory[] = [
  {
    id: 'routine_building',
    name: 'Building Routines',
    description: 'User wants to create, establish, or build a new daily routine or habit',
    examples: [
      'I want to start a morning routine',
      'Help me build better habits',
      'I need to be more consistent with my schedule',
      'Want to establish a bedtime ritual',
      'Looking to develop better daily practices',
      'I need structure in my day',
      'Help me create a workout habit',
      'I want to meditate every day',
    ],
  },
  {
    id: 'habit_struggle',
    name: 'Struggling with Habits',
    description: 'User is having difficulty maintaining habits or routines',
    examples: [
      "I can't stick to my routine",
      'Keep falling off the wagon',
      'My habits never last',
      "I start things but don't finish",
      'Struggling with consistency',
      'I keep procrastinating',
      'Lost my momentum',
      "Can't seem to follow through",
    ],
  },
  {
    id: 'productivity',
    name: 'Productivity & Focus',
    description: 'User wants to improve productivity, focus, or time management',
    examples: [
      'I need to be more productive',
      "Can't focus on anything",
      'My days feel wasted',
      'Want to manage my time better',
      'I get distracted too easily',
      'Need to stop procrastinating',
      'Want to accomplish more',
      'Feeling unproductive lately',
    ],
  },
  {
    id: 'sleep_habits',
    name: 'Sleep Habits',
    description: 'User wants to improve sleep patterns or bedtime routines',
    examples: [
      "I can't sleep well",
      'Need better sleep habits',
      'Want to wake up earlier',
      'My sleep schedule is off',
      'Staying up too late',
      'Need a bedtime routine',
      'Trouble falling asleep',
      'Want to fix my sleep',
    ],
  },
  {
    id: 'exercise_fitness',
    name: 'Exercise & Fitness',
    description: 'User wants to establish exercise or fitness habits',
    examples: [
      'I want to work out regularly',
      'Need to go to the gym more',
      'Want to start exercising',
      "Can't stick to my fitness routine",
      'Looking to be more active',
      'Need motivation to exercise',
      'Want to run every day',
      'Start a yoga practice',
    ],
  },
];

// ============================================================================
// TRUST SIGNAL CATEGORIES
// ============================================================================

export const TRUST_CATEGORIES: SemanticCategory[] = [
  {
    id: 'boundary',
    name: 'Setting Boundaries',
    description: 'User is expressing or implying boundaries around topics to avoid',
    examples: [
      "I don't want to talk about that",
      "Let's not discuss my family",
      "I'd rather not go there",
      'Can we change the subject',
      "I'm not ready to discuss that",
      'That topic is off limits',
      "I'd prefer to avoid that",
      'We agreed not to bring that up',
    ],
  },
  {
    id: 'permission_seeking',
    name: 'Permission Seeking',
    description: 'User is testing if it is safe to share something vulnerable',
    examples: [
      'Can I tell you something personal?',
      'Is it okay if I share this?',
      'Promise you wont judge?',
      "I've been dealing with something",
      "There's something on my mind",
      'I need to get something off my chest',
      'This is hard to talk about',
      "I've never told anyone this",
    ],
  },
  {
    id: 'growth_reflection',
    name: 'Growth & Change',
    description: 'User is reflecting on personal growth or change over time',
    examples: [
      "I've changed so much",
      'Looking back, I realize',
      'I used to be different',
      "I've grown a lot",
      "That's not who I am anymore",
      "I've come a long way",
      'Compared to before, I',
      'I never would have done that before',
    ],
  },
  {
    id: 'sensitive_topic',
    name: 'Sensitive Content',
    description: 'User is touching on deeply personal or vulnerable topics',
    examples: [
      'This is really personal',
      "It's hard to talk about",
      'I feel vulnerable saying this',
      'My childhood was difficult',
      "I've been struggling with",
      'This is a delicate subject',
      'I feel exposed sharing this',
      'Not many people know this about me',
    ],
  },
  {
    id: 'rapport_callback',
    name: 'Rapport & Shared History',
    description: 'User is referencing shared experiences or inside jokes',
    examples: [
      'Remember when we talked about',
      'Like you said before',
      'That reminds me of what we discussed',
      'You mentioned once that',
      'Our conversation about',
      'That thing you said about',
      'When we first talked',
      'Going back to what you said',
    ],
  },
];

// ============================================================================
// CALENDAR INTENT CATEGORIES
// ============================================================================

export const CALENDAR_CATEGORIES: SemanticCategory[] = [
  {
    id: 'scheduling',
    name: 'Scheduling',
    description: 'User wants to schedule, plan, or book something',
    examples: [
      'I need to schedule a meeting',
      "Let's set up a time",
      'Can you book this for me',
      'Add to my calendar',
      'What does my week look like',
      'When am I free',
      'Schedule a call with',
      'Block off time for',
    ],
  },
  {
    id: 'time_awareness',
    name: 'Time Awareness',
    description: 'User is asking about upcoming events or commitments',
    examples: [
      "What's on my schedule today",
      'Do I have anything tomorrow',
      'What are my plans this week',
      'Remind me what I have coming up',
      "What's happening next week",
      'Any conflicts in my calendar',
      'Am I double booked',
      "What's my day look like",
    ],
  },
  {
    id: 'rescheduling',
    name: 'Rescheduling',
    description: 'User wants to move, cancel, or reschedule something',
    examples: [
      'I need to reschedule',
      'Can we move this meeting',
      'Cancel my appointment',
      'Push this to next week',
      'Change the time of',
      'I cant make it then',
      'Need to move something around',
      'Reschedule my call with',
    ],
  },
];

// ============================================================================
// SEMANTIC MATCHING
// ============================================================================

/**
 * Initialize category embeddings (call once on startup)
 * Note: Sequential API calls are intentional to avoid rate limiting
 */
export async function initializeCategoryEmbeddings(categories: SemanticCategory[]): Promise<void> {
  log.info({ categoryCount: categories.length }, 'Initializing category embeddings');

  // Process categories sequentially to avoid rate limiting (intentional await in loop)
  for (const category of categories) {
    // Get description embedding (sequential to avoid rate limits)
    const descEmbed = await getEmbedding(category.description); // eslint-disable-line no-await-in-loop
    category.descriptionEmbedding = descEmbed ?? undefined;

    // Get example embeddings sequentially to avoid API rate limits
    category.exampleEmbeddings = [];
    for (const example of category.examples) {
      const embedding = await getEmbedding(example); // eslint-disable-line no-await-in-loop
      if (embedding !== null) {
        category.exampleEmbeddings.push(embedding);
      }
    }

    log.debug(
      { categoryId: category.id, exampleCount: category.exampleEmbeddings.length },
      'Category embeddings loaded'
    );
  }
}

/**
 * Match user input against semantic categories
 */
export async function matchCategories(
  userInput: string,
  categories: SemanticCategory[]
): Promise<MatchResult[]> {
  const results: MatchResult[] = [];

  // Get embedding for user input
  const inputEmbedding = await getEmbedding(userInput);
  if (!inputEmbedding) {
    log.debug('No embedding available, using pattern fallback');
    return [];
  }

  for (const category of categories) {
    let bestScore = 0;
    let bestExample: string | undefined;

    // Check description similarity
    if (category.descriptionEmbedding) {
      const descScore = cosineSimilarity(inputEmbedding, category.descriptionEmbedding);
      if (descScore > bestScore) {
        bestScore = descScore;
      }
    }

    // Check example similarities (usually more accurate)
    if (category.exampleEmbeddings) {
      for (let i = 0; i < category.exampleEmbeddings.length; i++) {
        const exScore = cosineSimilarity(inputEmbedding, category.exampleEmbeddings[i]);
        if (exScore > bestScore) {
          bestScore = exScore;
          bestExample = category.examples[i];
        }
      }
    }

    // Determine confidence level
    let confidence: MatchResult['confidence'] = 'none';
    if (bestScore >= 0.85) confidence = 'high';
    else if (bestScore >= 0.7) confidence = 'medium';
    else if (bestScore >= 0.5) confidence = 'low';

    if (bestScore > 0.4) {
      results.push({
        categoryId: category.id,
        score: bestScore,
        confidence,
        matchedExample: bestExample,
        reason: `Semantic similarity: ${Math.round(bestScore * 100)}%`,
      });
    }
  }

  // Sort by score
  results.sort((a, b) => b.score - a.score);
  return results;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

// Use promise-based initialization to prevent race conditions
let habitCategoriesPromise: Promise<void> | null = null;
let trustCategoriesPromise: Promise<void> | null = null;
let calendarCategoriesPromise: Promise<void> | null = null;

/**
 * Detect habit-related intent using embeddings
 */
export async function detectHabitIntent(userInput: string): Promise<MatchResult | null> {
  if (!habitCategoriesPromise) {
    habitCategoriesPromise = initializeCategoryEmbeddings(HABIT_CATEGORIES);
  }
  await habitCategoriesPromise;

  const results = await matchCategories(userInput, HABIT_CATEGORIES);
  return results.length > 0 ? results[0] : null;
}

/**
 * Detect trust signals using embeddings
 */
export async function detectTrustSignal(userInput: string): Promise<MatchResult | null> {
  if (!trustCategoriesPromise) {
    trustCategoriesPromise = initializeCategoryEmbeddings(TRUST_CATEGORIES);
  }
  await trustCategoriesPromise;

  const results = await matchCategories(userInput, TRUST_CATEGORIES);
  return results.length > 0 ? results[0] : null;
}

/**
 * Detect calendar intent using embeddings
 */
export async function detectCalendarIntent(userInput: string): Promise<MatchResult | null> {
  if (!calendarCategoriesPromise) {
    calendarCategoriesPromise = initializeCategoryEmbeddings(CALENDAR_CATEGORIES);
  }
  await calendarCategoriesPromise;

  const results = await matchCategories(userInput, CALENDAR_CATEGORIES);
  return results.length > 0 ? results[0] : null;
}

/**
 * Get all matches above a threshold
 */
export async function detectAllSignals(userInput: string): Promise<{
  habit: MatchResult | null;
  trust: MatchResult | null;
  calendar: MatchResult | null;
}> {
  const [habit, trust, calendar] = await Promise.all([
    detectHabitIntent(userInput),
    detectTrustSignal(userInput),
    detectCalendarIntent(userInput),
  ]);

  return { habit, trust, calendar };
}

// ============================================================================
// CONTACT/RELATIONSHIP CATEGORIES
// ============================================================================

export const CONTACT_CATEGORIES: SemanticCategory[] = [
  {
    id: 'family',
    name: 'Family Relationships',
    description:
      'User is talking about family members like parents, siblings, children, or extended family',
    examples: [
      'I need to call my mom later',
      'My dad is having surgery next week',
      'My sister just had a baby',
      "I'm visiting my parents this weekend",
      'My brother is getting married',
      'I should check on my grandmother',
      'My uncle gave me advice about this',
      "I'm worried about my son's grades",
      'My daughter is starting college',
      'I want to plan something for my family',
      'My cousin is coming to town',
      'I miss my late grandfather',
    ],
  },
  {
    id: 'professional',
    name: 'Professional Relationships',
    description: 'User is talking about work colleagues, clients, bosses, or professional contacts',
    examples: [
      'I need to email my boss about this',
      'My manager wants to meet tomorrow',
      'I have a call with a client',
      'My coworker is driving me crazy',
      'I need to follow up with my team',
      'My supervisor gave me feedback',
      'I should update my accountant',
      'My lawyer needs documents',
      'My therapist suggested this',
      "I'm meeting with a colleague",
      'My business partner disagrees',
      'The project stakeholders want updates',
    ],
  },
  {
    id: 'social',
    name: 'Social/Friend Relationships',
    description: 'User is talking about friends, acquaintances, neighbors, or social connections',
    examples: [
      "I'm meeting up with a friend",
      'My best friend is going through a hard time',
      'I should reach out to an old friend',
      'My neighbor asked for help',
      "I'm catching up with an old classmate",
      'My roommate is moving out',
      'I joined a new group of people',
      'My mentor gave me advice',
      'I made a new friend at the gym',
      'My buddy wants to hang out',
      "I'm meeting my book club",
      'An acquaintance reached out',
    ],
  },
  {
    id: 'romantic',
    name: 'Romantic Relationships',
    description: 'User is talking about romantic partners, spouses, or dating',
    examples: [
      'My partner and I had a fight',
      'I want to surprise my wife',
      'My husband forgot our anniversary',
      "I'm thinking about my boyfriend",
      'My girlfriend and I are moving in together',
      "We've been dating for three months",
      'My spouse wants to talk',
      'I love my significant other but',
      'My fiancée is planning the wedding',
      'Our relationship is struggling',
      "I'm worried about my marriage",
      'We just started seeing each other',
    ],
  },
];

let contactCategoriesPromise: Promise<void> | null = null;

/**
 * Detect relationship/contact type using embeddings
 */
export async function detectContactRelationship(userInput: string): Promise<MatchResult | null> {
  if (!contactCategoriesPromise) {
    contactCategoriesPromise = initializeCategoryEmbeddings(CONTACT_CATEGORIES);
  }
  await contactCategoriesPromise;

  const results = await matchCategories(userInput, CONTACT_CATEGORIES);
  return results.length > 0 ? results[0] : null;
}

// ============================================================================
// HANDOFF INTENT CATEGORIES
// ============================================================================

export const HANDOFF_CATEGORIES: SemanticCategory[] = [
  {
    id: 'maya-santos',
    name: 'Maya - Habits & Routines',
    description:
      'User needs help with habits, routines, consistency, productivity, or behavior change',
    examples: [
      'I want to build better habits',
      'I need a morning routine',
      "I can't stick to my schedule",
      'Help me be more consistent',
      'I keep procrastinating',
      'My productivity is terrible',
      'I want to exercise regularly',
      'I need help with my sleep schedule',
      'I want to wake up earlier',
      'I need more discipline in my life',
    ],
  },
  {
    id: 'alex-chen',
    name: 'Alex - Communication & Boundaries',
    description:
      'User needs help with difficult conversations, boundaries, conflict, or message crafting',
    examples: [
      'I need to have a difficult conversation',
      'How do I tell my boss this',
      'I need to set better boundaries',
      'Help me draft an email',
      "I can't say no to people",
      'I feel taken advantage of',
      'How do I confront someone',
      "There's tension with my coworker",
      'I need to stand up for myself',
      'Can you help me write a message',
    ],
  },
  {
    id: 'peter-john',
    name: 'Peter - Research & Learning',
    description: 'User wants to learn about or deeply understand a topic, technology, or concept',
    examples: [
      "I'm curious about how this works",
      'Can you explain blockchain to me',
      'I want to understand AI better',
      'How do electric cars actually work',
      'I want to learn more about investing',
      'Tell me about quantum computing',
      'What resources should I read',
      "I don't understand cryptocurrency",
      'Help me research this topic',
      'I want to dive deep into this subject',
    ],
  },
  {
    id: 'jordan-taylor',
    name: 'Jordan - Events & Celebrations',
    description: 'User needs help planning events, trips, celebrations, or milestones',
    examples: [
      'I need to plan a birthday party',
      "We're planning a wedding",
      'Help me organize an event',
      'I want to plan a vacation',
      'Our company is celebrating an anniversary',
      'I need to plan a surprise party',
      "We're organizing a team retreat",
      'Help me plan a trip',
      "It's my friend's graduation",
      'I want to celebrate this milestone',
    ],
  },
  {
    id: 'nayan-patel',
    name: 'Nayan - Wisdom & Life Philosophy',
    description:
      'User is contemplating life meaning, purpose, values, long-term direction, or existential questions',
    examples: [
      "I'm questioning my life choices",
      "What's the meaning of all this",
      'I feel like I have no purpose',
      "I'm thinking about my long-term goals",
      'Does my career align with my values',
      'I want to find my purpose',
      'What really matters in life',
      "I'm at a crossroads in my life",
      'I need some perspective on this',
      "I've been thinking about what I want from life",
    ],
  },
];

let handoffCategoriesPromise: Promise<void> | null = null;

/**
 * Detect handoff intent using embeddings
 */
export async function detectHandoffIntent(userInput: string): Promise<MatchResult | null> {
  if (!handoffCategoriesPromise) {
    handoffCategoriesPromise = initializeCategoryEmbeddings(HANDOFF_CATEGORIES);
  }
  await handoffCategoriesPromise;

  const results = await matchCategories(userInput, HANDOFF_CATEGORIES);
  return results.length > 0 ? results[0] : null;
}

// ============================================================================
// CONFIDENCE TRACKING
// ============================================================================

interface ConfidenceRecord {
  timestamp: Date;
  userInput: string;
  category: string;
  detected: boolean;
  score: number;
  expected?: string;
}

const confidenceHistory: ConfidenceRecord[] = [];
const MAX_HISTORY = 1000;

/**
 * Record a detection result for confidence tracking
 */
export function recordDetection(
  userInput: string,
  category: string,
  detected: boolean,
  score: number,
  expected?: string
): void {
  confidenceHistory.push({
    timestamp: new Date(),
    userInput,
    category,
    detected,
    score,
    expected,
  });

  // Trim history
  if (confidenceHistory.length > MAX_HISTORY) {
    confidenceHistory.splice(0, confidenceHistory.length - MAX_HISTORY);
  }
}

/**
 * Get confidence statistics for pattern gap identification
 */
export function getConfidenceStats(): {
  totalDetections: number;
  byCategory: Record<string, { count: number; avgScore: number; gaps: string[] }>;
  recentMisses: ConfidenceRecord[];
} {
  const byCategory: Record<string, { count: number; totalScore: number; gaps: string[] }> = {};
  const recentMisses: ConfidenceRecord[] = [];

  for (const record of confidenceHistory) {
    const existing = byCategory[record.category];
    if (existing === undefined) {
      byCategory[record.category] = { count: 0, totalScore: 0, gaps: [] };
    }

    const categoryData = byCategory[record.category];
    categoryData.count++;
    categoryData.totalScore += record.score;

    // Track gaps (low confidence detections)
    if (record.score < 0.5 && record.score > 0.3) {
      byCategory[record.category].gaps.push(record.userInput.slice(0, 50));
    }

    // Track recent misses
    if (!record.detected && record.expected) {
      recentMisses.push(record);
    }
  }

  // Calculate averages
  const result: Record<string, { count: number; avgScore: number; gaps: string[] }> = {};
  for (const [cat, data] of Object.entries(byCategory)) {
    result[cat] = {
      count: data.count,
      avgScore: data.count > 0 ? data.totalScore / data.count : 0,
      gaps: data.gaps.slice(-5), // Last 5 gaps
    };
  }

  return {
    totalDetections: confidenceHistory.length,
    byCategory: result,
    recentMisses: recentMisses.slice(-10), // Last 10 misses
  };
}

/**
 * Clear embedding cache (for testing)
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
  habitCategoriesPromise = null;
  trustCategoriesPromise = null;
  calendarCategoriesPromise = null;
  contactCategoriesPromise = null;
  handoffCategoriesPromise = null;
}

export default {
  detectHabitIntent,
  detectTrustSignal,
  detectCalendarIntent,
  detectHandoffIntent,
  detectContactRelationship,
  detectAllSignals,
  matchCategories,
  initializeCategoryEmbeddings,
  recordDetection,
  getConfidenceStats,
  HABIT_CATEGORIES,
  TRUST_CATEGORIES,
  CALENDAR_CATEGORIES,
  HANDOFF_CATEGORIES,
  CONTACT_CATEGORIES,
};
