/**
 * 🧬 Creative DNA Tracking
 *
 * Tracks user's creative profile across:
 * - Content preferences (videos, podcasts)
 * - Learning patterns and topics
 * - Engagement style (deep dives vs. variety)
 * - Saved insights and quotes
 *
 * ✨ "MORE THAN HUMAN" FEATURES:
 * - Learns from what you watch and discuss
 * - Connects content to your conversations
 * - Identifies growth patterns over time
 */

import { getLogger } from '../../utils/safe-logger.js';
import type { VideoCategory } from './youtube-integration.js';
import type { PodcastCategory } from './podcast-discovery.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface CreativeDNA {
  userId: string;

  // Content Preferences
  topVideoCategories: Array<{ category: VideoCategory; score: number }>;
  topPodcastCategories: Array<{ category: PodcastCategory; score: number }>;
  preferredContentLength: 'short' | 'medium' | 'long';
  preferredMoods: Array<'learn' | 'chill' | 'inspire' | 'reflect'>;

  // Learning Style
  learningStyle: LearningStyle;
  engagementPattern: EngagementPattern;

  // Interest Topics
  topTopics: Array<{ topic: string; score: number }>;
  emergingInterests: string[]; // Recently explored topics

  // Engagement Stats
  totalVideosWatched: number;
  totalPodcastsListened: number;
  totalInsightsSaved: number;
  averageWatchCompletion: number; // 0-100%
  discussionParticipation: number; // 0-100%

  // Personality
  personalityLabel: string;
  personalityDescription: string;

  // Timestamps
  lastUpdated: string;
  firstCreated: string;
}

export type LearningStyle =
  | 'deep-diver' // Goes deep into topics
  | 'explorer' // Likes variety
  | 'practical' // Prefers actionable content
  | 'philosophical' // Prefers reflective content
  | 'visual' // Prefers video over audio
  | 'audio'; // Prefers podcasts;

export type EngagementPattern =
  | 'daily-learner' // Consistent daily engagement
  | 'weekend-warrior' // Heavy weekend use
  | 'mood-based' // Engages based on emotional state
  | 'goal-driven' // Focused on specific topics
  | 'spontaneous'; // Random engagement

export interface CreativeInsight {
  id: string;
  userId: string;
  content: string;
  source: {
    type: 'video' | 'podcast' | 'conversation';
    id: string;
    title: string;
  };
  topic?: string;
  savedAt: string;
  tags: string[];
}

export interface CreativeJourneyStats {
  totalContentConsumed: number;
  totalTimeSpent: number; // minutes
  insightsSaved: number;
  topicsExplored: number;
  currentStreak: number;
  longestStreak: number;
  completionRate: number;
}

// ============================================================================
// CREATIVE DNA STORAGE
// ============================================================================

// In-memory store (would be Firestore in production)
const creativeDNAStore = new Map<string, CreativeDNA>();
const insightsStore = new Map<string, CreativeInsight[]>();

/**
 * Get or create Creative DNA for a user
 */
export function getCreativeDNA(userId: string): CreativeDNA {
  let dna = creativeDNAStore.get(userId);

  if (!dna) {
    dna = createInitialCreativeDNA(userId);
    creativeDNAStore.set(userId, dna);
  }

  return dna;
}

/**
 * Update Creative DNA based on activity
 */
export function updateCreativeDNA(
  userId: string,
  activity: {
    type: 'video_watched' | 'podcast_listened' | 'insight_saved' | 'discussion_completed';
    category?: VideoCategory | PodcastCategory;
    topics?: string[];
    duration?: number;
    completionPercent?: number;
  }
): CreativeDNA {
  const dna = getCreativeDNA(userId);

  switch (activity.type) {
    case 'video_watched':
      dna.totalVideosWatched++;
      if (activity.category) {
        updateCategoryScore(dna.topVideoCategories, activity.category as VideoCategory);
      }
      if (activity.topics) {
        updateTopicScores(dna.topTopics, activity.topics);
      }
      if (activity.completionPercent) {
        updateAverageCompletion(dna, activity.completionPercent);
      }
      break;

    case 'podcast_listened':
      dna.totalPodcastsListened++;
      if (activity.category) {
        updateCategoryScore(dna.topPodcastCategories, activity.category as PodcastCategory);
      }
      if (activity.topics) {
        updateTopicScores(dna.topTopics, activity.topics);
      }
      break;

    case 'insight_saved':
      dna.totalInsightsSaved++;
      if (activity.topics) {
        updateTopicScores(dna.topTopics, activity.topics);
      }
      break;

    case 'discussion_completed':
      updateDiscussionParticipation(dna);
      break;
  }

  // Recalculate personality
  dna.personalityLabel = calculatePersonalityLabel(dna);
  dna.personalityDescription = calculatePersonalityDescription(dna);

  // Update learning style based on patterns
  dna.learningStyle = calculateLearningStyle(dna);
  dna.engagementPattern = calculateEngagementPattern(dna);

  // Update timestamp
  dna.lastUpdated = new Date().toISOString();

  creativeDNAStore.set(userId, dna);
  log.debug({ userId, activity: activity.type }, '🧬 Creative DNA updated');

  return dna;
}

// ============================================================================
// INSIGHTS MANAGEMENT
// ============================================================================

/**
 * Save an insight
 */
export function saveInsight(
  userId: string,
  insight: Omit<CreativeInsight, 'id' | 'savedAt'>
): CreativeInsight {
  const newInsight: CreativeInsight = {
    ...insight,
    id: `insight_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
  };

  const userInsights = insightsStore.get(userId) || [];
  userInsights.push(newInsight);
  insightsStore.set(userId, userInsights);

  // Update DNA
  updateCreativeDNA(userId, {
    type: 'insight_saved',
    topics: insight.tags,
  });

  log.info({ userId, insightId: newInsight.id }, '💡 Insight saved');
  return newInsight;
}

/**
 * Get user's insights
 */
export function getInsights(
  userId: string,
  options: {
    limit?: number;
    topic?: string;
    sourceType?: 'video' | 'podcast' | 'conversation';
  } = {}
): CreativeInsight[] {
  const { limit = 50, topic, sourceType } = options;

  let insights = insightsStore.get(userId) || [];

  if (topic) {
    insights = insights.filter(
      (i) =>
        i.tags.some((t) => t.toLowerCase().includes(topic.toLowerCase())) ||
        i.topic?.toLowerCase().includes(topic.toLowerCase())
    );
  }

  if (sourceType) {
    insights = insights.filter((i) => i.source.type === sourceType);
  }

  return insights
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime())
    .slice(0, limit);
}

/**
 * Delete an insight
 */
export function deleteInsight(userId: string, insightId: string): boolean {
  const userInsights = insightsStore.get(userId);
  if (!userInsights) return false;

  const index = userInsights.findIndex((i) => i.id === insightId);
  if (index === -1) return false;

  userInsights.splice(index, 1);
  insightsStore.set(userId, userInsights);

  return true;
}

// ============================================================================
// JOURNEY STATS
// ============================================================================

/**
 * Get creative journey stats
 */
export function getCreativeJourneyStats(userId: string): CreativeJourneyStats {
  const dna = getCreativeDNA(userId);
  const insights = getInsights(userId, { limit: 1000 });

  return {
    totalContentConsumed: dna.totalVideosWatched + dna.totalPodcastsListened,
    totalTimeSpent: estimateTimeSpent(dna),
    insightsSaved: insights.length,
    topicsExplored: dna.topTopics.length,
    currentStreak: 0, // Would calculate from activity history
    longestStreak: 0, // Would calculate from activity history
    completionRate: dna.averageWatchCompletion,
  };
}

// ============================================================================
// PERSONALITY CALCULATIONS
// ============================================================================

const PERSONALITY_LABELS: Array<{
  label: string;
  description: string;
  match: (dna: CreativeDNA) => number;
}> = [
  {
    label: 'The Curious Explorer',
    description: 'You love discovering new ideas and perspectives across many topics.',
    match: (dna) => {
      const topicVariety = dna.topTopics.length;
      const categoryVariety = dna.topVideoCategories.length + dna.topPodcastCategories.length;
      return topicVariety * 2 + categoryVariety;
    },
  },
  {
    label: 'The Deep Diver',
    description: 'You prefer to deeply understand topics rather than skim the surface.',
    match: (dna) => {
      const avgCompletion = dna.averageWatchCompletion;
      const discussionRate = dna.discussionParticipation;
      return (avgCompletion + discussionRate) / 2;
    },
  },
  {
    label: 'The Reflective Thinker',
    description: 'You engage thoughtfully with content, saving insights along the way.',
    match: (dna) => {
      const insightRatio =
        dna.totalInsightsSaved / Math.max(1, dna.totalVideosWatched + dna.totalPodcastsListened);
      return insightRatio * 100;
    },
  },
  {
    label: 'The Visual Learner',
    description: 'You prefer learning through video content over audio.',
    match: (dna) => {
      const videoRatio =
        dna.totalVideosWatched / Math.max(1, dna.totalVideosWatched + dna.totalPodcastsListened);
      return videoRatio * 100;
    },
  },
  {
    label: 'The Audio Enthusiast',
    description: 'Podcasts are your preferred way to consume content and ideas.',
    match: (dna) => {
      const podcastRatio =
        dna.totalPodcastsListened / Math.max(1, dna.totalVideosWatched + dna.totalPodcastsListened);
      return podcastRatio * 100;
    },
  },
  {
    label: 'The Seeker of Inspiration',
    description: 'You gravitate toward content that inspires and motivates.',
    match: (dna) => {
      const inspireCount = dna.preferredMoods.filter((m) => m === 'inspire').length;
      return inspireCount * 30;
    },
  },
  {
    label: 'The Lifelong Learner',
    description: 'You have a consistent habit of learning and growing through content.',
    match: (dna) => {
      const totalContent = dna.totalVideosWatched + dna.totalPodcastsListened;
      return Math.min(100, totalContent * 5);
    },
  },
];

function calculatePersonalityLabel(dna: CreativeDNA): string {
  if (dna.totalVideosWatched + dna.totalPodcastsListened < 3) {
    return 'The Newcomer';
  }

  let bestMatch = PERSONALITY_LABELS[0];
  let bestScore = 0;

  for (const personality of PERSONALITY_LABELS) {
    const score = personality.match(dna);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = personality;
    }
  }

  return bestMatch.label;
}

function calculatePersonalityDescription(dna: CreativeDNA): string {
  if (dna.totalVideosWatched + dna.totalPodcastsListened < 3) {
    return "You're just getting started on your creative journey. Let's explore together!";
  }

  const personality = PERSONALITY_LABELS.find((p) => p.label === dna.personalityLabel);
  return personality?.description || 'You have a unique creative profile!';
}

function calculateLearningStyle(dna: CreativeDNA): LearningStyle {
  if (dna.averageWatchCompletion > 80 && dna.discussionParticipation > 50) {
    return 'deep-diver';
  }
  if (dna.topTopics.length > 10) {
    return 'explorer';
  }
  if (dna.totalVideosWatched > dna.totalPodcastsListened * 2) {
    return 'visual';
  }
  if (dna.totalPodcastsListened > dna.totalVideosWatched * 2) {
    return 'audio';
  }
  if (dna.preferredMoods.includes('reflect')) {
    return 'philosophical';
  }
  return 'practical';
}

function calculateEngagementPattern(dna: CreativeDNA): EngagementPattern {
  // Would analyze actual timestamps in production
  // For now, return based on total activity
  const total = dna.totalVideosWatched + dna.totalPodcastsListened;
  if (total > 50) return 'daily-learner';
  if (total > 20) return 'goal-driven';
  return 'spontaneous';
}

// ============================================================================
// HELPERS
// ============================================================================

function createInitialCreativeDNA(userId: string): CreativeDNA {
  const now = new Date().toISOString();
  return {
    userId,
    topVideoCategories: [],
    topPodcastCategories: [],
    preferredContentLength: 'medium',
    preferredMoods: [],
    learningStyle: 'explorer',
    engagementPattern: 'spontaneous',
    topTopics: [],
    emergingInterests: [],
    totalVideosWatched: 0,
    totalPodcastsListened: 0,
    totalInsightsSaved: 0,
    averageWatchCompletion: 0,
    discussionParticipation: 0,
    personalityLabel: 'The Newcomer',
    personalityDescription:
      "You're just getting started on your creative journey. Let's explore together!",
    lastUpdated: now,
    firstCreated: now,
  };
}

function updateCategoryScore<T extends string>(
  categories: Array<{ category: T; score: number }>,
  newCategory: T
): void {
  const existing = categories.find((c) => c.category === newCategory);
  if (existing) {
    existing.score += 10;
  } else {
    categories.push({ category: newCategory, score: 10 });
  }
  // Sort by score descending and keep top 10
  categories.sort((a, b) => b.score - a.score);
  categories.splice(10);
}

function updateTopicScores(
  topics: Array<{ topic: string; score: number }>,
  newTopics: string[]
): void {
  for (const topic of newTopics) {
    const existing = topics.find((t) => t.topic.toLowerCase() === topic.toLowerCase());
    if (existing) {
      existing.score += 5;
    } else {
      topics.push({ topic, score: 5 });
    }
  }
  // Sort by score descending and keep top 20
  topics.sort((a, b) => b.score - a.score);
  topics.splice(20);
}

function updateAverageCompletion(dna: CreativeDNA, completion: number): void {
  const total = dna.totalVideosWatched + dna.totalPodcastsListened;
  if (total === 1) {
    dna.averageWatchCompletion = completion;
  } else {
    dna.averageWatchCompletion = (dna.averageWatchCompletion * (total - 1) + completion) / total;
  }
}

function updateDiscussionParticipation(dna: CreativeDNA): void {
  const total = dna.totalVideosWatched + dna.totalPodcastsListened;
  // Increment participation score
  dna.discussionParticipation = Math.min(100, dna.discussionParticipation + 10);
}

function estimateTimeSpent(dna: CreativeDNA): number {
  // Rough estimate: 15 min avg video, 45 min avg podcast
  return dna.totalVideosWatched * 15 + dna.totalPodcastsListened * 45;
}

// ============================================================================
// SHAREABLE CARD DATA
// ============================================================================

export interface CreativeProfileCardData {
  type: 'creative-profile';
  personalityLabel: string;
  personalityDescription: string;
  topTopics: Array<{ name: string; score: number }>;
  totalContent: number;
  insightsSaved: number;
  learningStyle: string;
}

/**
 * Get data for shareable Creative Profile card
 */
export function getCreativeProfileCardData(userId: string): CreativeProfileCardData {
  const dna = getCreativeDNA(userId);

  return {
    type: 'creative-profile',
    personalityLabel: dna.personalityLabel,
    personalityDescription: dna.personalityDescription,
    topTopics: dna.topTopics.slice(0, 4).map((t) => ({
      name: t.topic,
      score: Math.round(t.score),
    })),
    totalContent: dna.totalVideosWatched + dna.totalPodcastsListened,
    insightsSaved: dna.totalInsightsSaved,
    learningStyle: formatLearningStyle(dna.learningStyle),
  };
}

function formatLearningStyle(style: LearningStyle): string {
  const labels: Record<LearningStyle, string> = {
    'deep-diver': 'Deep Diver',
    explorer: 'Explorer',
    practical: 'Practical Learner',
    philosophical: 'Philosophical Thinker',
    visual: 'Visual Learner',
    audio: 'Audio Enthusiast',
  };
  return labels[style];
}
