/**
 * Content Curator - Automated Content Recommendation Engine
 *
 * Part of the "Better Than Human" automation layer.
 * Proactively surfaces relevant content (articles, podcasts, books, videos)
 * based on user interests, goals, struggles, and conversation context.
 *
 * Humans rarely remember to find helpful resources.
 * Ferni curates and delivers the right content at the right time.
 *
 * @module services/automation/content-curator
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'content-curator' });

// ============================================================================
// Types
// ============================================================================

export type ContentType = 'article' | 'podcast' | 'book' | 'video' | 'course' | 'exercise' | 'meditation';

export type ContentCategory =
  | 'personal_growth'
  | 'relationships'
  | 'career'
  | 'health_wellness'
  | 'finance'
  | 'creativity'
  | 'mindfulness'
  | 'productivity'
  | 'grief_healing'
  | 'parenting'
  | 'communication'
  | 'motivation';

export type DeliveryChannel = 'email' | 'push' | 'in_conversation' | 'sms';

export interface ContentItem {
  id: string;
  type: ContentType;
  title: string;
  description: string;
  url?: string;
  source: string;
  author?: string;
  duration?: number;
  categories: ContentCategory[];
  tags: string[];
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  emotionalTone?: 'uplifting' | 'reflective' | 'practical' | 'challenging' | 'comforting';
  createdAt: string;
}

export interface ContentRecommendation {
  id: string;
  userId: string;
  content: ContentItem;
  reason: string;
  triggerSource: ContentTrigger;
  relevanceScore: number;
  deliveryChannel: DeliveryChannel;
  scheduledFor?: string;
  deliveredAt?: string;
  userInteraction?: UserContentInteraction;
  createdAt: string;
}

export interface UserContentInteraction {
  viewed: boolean;
  viewedAt?: string;
  completed?: boolean;
  rating?: 1 | 2 | 3 | 4 | 5;
  feedback?: 'helpful' | 'not_relevant' | 'too_long' | 'saved_for_later';
}

export interface ContentTrigger {
  type: 'interest' | 'goal' | 'struggle' | 'conversation' | 'milestone' | 'seasonal';
  source: string;
  context?: string;
  confidence: number;
}

export interface UserContentPreferences {
  userId: string;
  preferredTypes: ContentType[];
  preferredCategories: ContentCategory[];
  preferredDuration: { min: number; max: number };
  preferredTone: string[];
  blockedSources: string[];
  maxPerWeek: number;
  preferredChannel: DeliveryChannel;
  lastUpdated: string;
}

export interface ContentCurationRule {
  id: string;
  name: string;
  trigger: {
    type: 'topic_mentioned' | 'goal_related' | 'struggle_detected' | 'milestone_achieved';
    patterns: string[];
    minOccurrences?: number;
  };
  content: {
    categories: ContentCategory[];
    types?: ContentType[];
    tags?: string[];
    tone?: string[];
  };
  delivery: {
    channel: DeliveryChannel;
    delay?: number;
    personaContext?: string;
  };
  enabled: boolean;
}

// ============================================================================
// Curation Rules
// ============================================================================

export const CURATION_RULES: ContentCurationRule[] = [
  {
    id: 'grief_support',
    name: 'Grief Support Resources',
    trigger: {
      type: 'topic_mentioned',
      patterns: ['loss', 'grief', 'passed away', 'died', 'mourning'],
    },
    content: {
      categories: ['grief_healing'],
      tone: ['comforting', 'reflective'],
    },
    delivery: {
      channel: 'email',
      delay: 24,
      personaContext: 'Nayan shares this with gentle care',
    },
    enabled: true,
  },
  {
    id: 'career_transition',
    name: 'Career Transition Resources',
    trigger: {
      type: 'topic_mentioned',
      patterns: ['career change', 'new job', 'job search', 'quit my job', 'laid off'],
    },
    content: {
      categories: ['career'],
      types: ['article', 'podcast', 'book'],
      tone: ['practical', 'uplifting'],
    },
    delivery: {
      channel: 'email',
      delay: 4,
      personaContext: 'Alex found these resources helpful',
    },
    enabled: true,
  },
  {
    id: 'habit_building',
    name: 'Habit Building Resources',
    trigger: {
      type: 'goal_related',
      patterns: ['build habit', 'new habit', 'routine', 'daily practice'],
    },
    content: {
      categories: ['productivity', 'personal_growth'],
      types: ['book', 'article'],
      tags: ['atomic habits', 'tiny habits'],
    },
    delivery: {
      channel: 'push',
      delay: 2,
      personaContext: 'Maya wants to share this with you',
    },
    enabled: true,
  },
  {
    id: 'anxiety_support',
    name: 'Anxiety Management Resources',
    trigger: {
      type: 'struggle_detected',
      patterns: ['anxious', 'worried', 'overthinking', 'stressed'],
      minOccurrences: 2,
    },
    content: {
      categories: ['mindfulness', 'health_wellness'],
      types: ['meditation', 'exercise', 'article'],
      tone: ['comforting', 'practical'],
    },
    delivery: {
      channel: 'push',
      delay: 1,
      personaContext: 'Ferni found something that might help',
    },
    enabled: true,
  },
  {
    id: 'financial_goals',
    name: 'Financial Education',
    trigger: {
      type: 'goal_related',
      patterns: ['save money', 'invest', 'budget', 'financial freedom'],
    },
    content: {
      categories: ['finance'],
      types: ['book', 'podcast', 'article'],
    },
    delivery: {
      channel: 'email',
      delay: 24,
      personaContext: 'Peter-John recommends this reading',
    },
    enabled: true,
  },
];

// ============================================================================
// Sample Content Library
// ============================================================================

export const CONTENT_LIBRARY: ContentItem[] = [
  {
    id: 'book_atomic_habits',
    type: 'book',
    title: 'Atomic Habits',
    description: 'Small changes, remarkable results.',
    source: 'James Clear',
    author: 'James Clear',
    categories: ['personal_growth', 'productivity'],
    tags: ['habits', 'behavior change'],
    difficulty: 'beginner',
    emotionalTone: 'practical',
    createdAt: '2024-01-01',
  },
  {
    id: 'book_mans_search',
    type: 'book',
    title: "Man's Search for Meaning",
    description: 'Finding purpose through suffering.',
    source: 'Viktor Frankl',
    author: 'Viktor Frankl',
    categories: ['personal_growth', 'grief_healing'],
    tags: ['meaning', 'purpose'],
    difficulty: 'intermediate',
    emotionalTone: 'reflective',
    createdAt: '2024-01-01',
  },
  {
    id: 'meditation_anxiety',
    type: 'meditation',
    title: '10-Minute Anxiety Relief',
    description: 'A calming guided meditation.',
    source: 'Calm',
    duration: 10,
    categories: ['mindfulness', 'health_wellness'],
    tags: ['anxiety', 'calm'],
    difficulty: 'beginner',
    emotionalTone: 'comforting',
    createdAt: '2024-01-01',
  },
  {
    id: 'video_growth_mindset',
    type: 'video',
    title: 'The Power of Believing You Can Improve',
    description: 'Carol Dweck on growth mindset.',
    url: 'https://ted.com/growth-mindset',
    source: 'TED',
    author: 'Carol Dweck',
    duration: 10,
    categories: ['personal_growth', 'motivation'],
    tags: ['growth mindset', 'potential'],
    difficulty: 'beginner',
    emotionalTone: 'uplifting',
    createdAt: '2024-01-01',
  },
];

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Find matching content for a rule
 */
export function findContentForRule(rule: ContentCurationRule): ContentItem[] {
  return CONTENT_LIBRARY.filter((item) => {
    const categoryMatch = rule.content.categories.some((cat) => item.categories.includes(cat));
    if (!categoryMatch) return false;

    if (rule.content.types && rule.content.types.length > 0) {
      if (!rule.content.types.includes(item.type)) return false;
    }

    if (rule.content.tone && rule.content.tone.length > 0) {
      if (item.emotionalTone && !rule.content.tone.includes(item.emotionalTone)) return false;
    }

    return true;
  });
}

/**
 * Detect content triggers from conversation
 */
export async function detectContentTriggers(
  userId: string,
  conversationText: string
): Promise<ContentTrigger[]> {
  const triggers: ContentTrigger[] = [];
  const lowerText = conversationText.toLowerCase();

  for (const rule of CURATION_RULES) {
    if (!rule.enabled) continue;

    const matches = rule.trigger.patterns.some((p) => lowerText.includes(p.toLowerCase()));
    if (matches) {
      triggers.push({
        type: 'conversation',
        source: rule.id,
        context: rule.name,
        confidence: 0.7,
      });
    }
  }

  log.debug({ userId, triggerCount: triggers.length }, 'Detected content triggers');
  return triggers;
}

/**
 * Generate recommendations from triggers
 */
export async function generateRecommendations(
  userId: string,
  triggers: ContentTrigger[],
  preferences?: UserContentPreferences
): Promise<ContentRecommendation[]> {
  const recommendations: ContentRecommendation[] = [];

  for (const trigger of triggers) {
    const rule = CURATION_RULES.find((r) => r.id === trigger.source);
    if (!rule) continue;

    let matchingContent = findContentForRule(rule);

    if (preferences) {
      matchingContent = matchingContent.filter((item) => {
        if (preferences.blockedSources.includes(item.source)) return false;
        if (item.duration) {
          if (item.duration < preferences.preferredDuration.min) return false;
          if (item.duration > preferences.preferredDuration.max) return false;
        }
        return true;
      });
    }

    if (matchingContent.length === 0) continue;

    const selected = matchingContent[Math.floor(Math.random() * matchingContent.length)];

    recommendations.push({
      id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId,
      content: selected,
      reason: rule.delivery.personaContext || `Based on your interest in ${rule.name}`,
      triggerSource: trigger,
      relevanceScore: trigger.confidence,
      deliveryChannel: preferences?.preferredChannel || rule.delivery.channel,
      scheduledFor: rule.delivery.delay
        ? new Date(Date.now() + rule.delivery.delay * 60 * 60 * 1000).toISOString()
        : undefined,
      createdAt: new Date().toISOString(),
    });
  }

  log.info({ userId, recommendationCount: recommendations.length }, 'Generated recommendations');
  return recommendations;
}

/**
 * Store a recommendation
 */
export async function storeRecommendation(rec: ContentRecommendation): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(rec.userId)
      .collection('content_recommendations')
      .doc(rec.id)
      .set(rec);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to store recommendation');
  }
}

/**
 * Get pending recommendations ready for delivery
 */
export async function getPendingRecommendations(userId: string): Promise<ContentRecommendation[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const now = new Date().toISOString();
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('content_recommendations')
      .where('deliveredAt', '==', null)
      .where('scheduledFor', '<=', now)
      .limit(10)
      .get();

    return snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.data() as ContentRecommendation);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get pending recommendations');
    return [];
  }
}

/**
 * Record user interaction with content
 */
export async function recordContentInteraction(
  userId: string,
  recommendationId: string,
  interaction: Partial<UserContentInteraction>
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('content_recommendations')
      .doc(recommendationId)
      .update({ userInteraction: interaction });

    log.info({ userId, recommendationId }, 'Recorded content interaction');
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to record interaction');
  }
}

/**
 * Main entry: Process conversation for content
 */
export async function processConversationForContent(
  userId: string,
  conversationText: string
): Promise<ContentRecommendation[]> {
  try {
    const triggers = await detectContentTriggers(userId, conversationText);
    if (triggers.length === 0) return [];

    const recommendations = await generateRecommendations(userId, triggers);

    for (const rec of recommendations) {
      await storeRecommendation(rec);
    }

    return recommendations;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to process conversation for content');
    return [];
  }
}
