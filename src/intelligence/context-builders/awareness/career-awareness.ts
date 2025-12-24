/**
 * Career Awareness Context Builder
 *
 * Tracks career-related sentiment over time from conversations.
 * "Better than Human" - notice career frustration patterns before they become crises.
 *
 * Superhuman Capabilities:
 * - "Last month you mentioned job frustration 5 times. Should we talk about what's really going on?"
 * - "Your energy around work has shifted lately - I've noticed more stress signals."
 * - "You haven't mentioned that promotion in a while - still on your mind?"
 *
 * @module intelligence/context-builders/awareness/career-awareness
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  registerContextBuilder,
  createStandardInjection,
  createHighInjection,
  createHintInjection,
  type ContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from '../index.js';
import { BuilderCategory } from '../core/categories.js';

const log = createLogger({ module: 'context:career-awareness' });

// ============================================================================
// CAREER SENTIMENT TRACKING
// ============================================================================

interface CareerMention {
  timestamp: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  topic: string;
  intensity: number;
}

interface CareerSentimentProfile {
  mentions: CareerMention[];
  lastUpdated: number;
  averageSentiment: number;
  trendDirection: 'improving' | 'declining' | 'stable';
  topConcerns: string[];
  recentWins: string[];
}

// In-memory cache per user (would be persisted to Firestore in production)
const careerProfiles = new Map<string, CareerSentimentProfile>();

// Keywords for career topic detection
const CAREER_KEYWORDS = {
  job: ['job', 'work', 'office', 'workplace', 'career', 'profession'],
  frustration: [
    'frustrated',
    'annoyed',
    'stressed',
    'overwhelmed',
    'burned out',
    'burnout',
    'hate my job',
    'quit',
    'quitting',
  ],
  satisfaction: [
    'love my job',
    'promotion',
    'raise',
    'recognition',
    'appreciated',
    'proud',
    'achievement',
  ],
  transition: [
    'interview',
    'resume',
    'job search',
    'new job',
    'leaving',
    'starting',
    'opportunity',
  ],
  growth: ['learning', 'skill', 'mentor', 'career path', 'advancement', 'grow', 'development'],
  relationships: ['boss', 'manager', 'coworker', 'team', 'colleague', 'leadership'],
};

const NEGATIVE_SIGNALS = [
  'frustrated',
  'hate',
  'stressed',
  'burned out',
  'burnout',
  'exhausted',
  'quit',
  'leaving',
  'toxic',
  'unfair',
  'undervalued',
  'overlooked',
  'stuck',
  'trapped',
  'bored',
  'meaningless',
];

const POSITIVE_SIGNALS = [
  'promotion',
  'raise',
  'excited',
  'love',
  'proud',
  'achievement',
  'recognized',
  'appreciated',
  'opportunity',
  'growth',
  'learning',
  'mentor',
  'dream job',
];

// ============================================================================
// ANALYSIS FUNCTIONS
// ============================================================================

/**
 * Detect if conversation is about career/work
 */
function detectCareerTopic(text: string): { isCareerRelated: boolean; topics: string[] } {
  const lowerText = text.toLowerCase();
  const detectedTopics: string[] = [];

  for (const [category, keywords] of Object.entries(CAREER_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        detectedTopics.push(category);
        break;
      }
    }
  }

  return {
    isCareerRelated: detectedTopics.length > 0,
    topics: [...new Set(detectedTopics)],
  };
}

/**
 * Analyze career sentiment from text
 */
function analyzeCareerSentiment(text: string): {
  sentiment: 'positive' | 'negative' | 'neutral';
  intensity: number;
} {
  const lowerText = text.toLowerCase();

  let positiveScore = 0;
  let negativeScore = 0;

  for (const signal of POSITIVE_SIGNALS) {
    if (lowerText.includes(signal)) positiveScore += 1;
  }

  for (const signal of NEGATIVE_SIGNALS) {
    if (lowerText.includes(signal)) negativeScore += 1;
  }

  const total = positiveScore + negativeScore;
  if (total === 0) return { sentiment: 'neutral', intensity: 0 };

  const netScore = positiveScore - negativeScore;
  const intensity = Math.min(1, total / 5); // Normalize to 0-1

  if (netScore > 0) return { sentiment: 'positive', intensity };
  if (netScore < 0) return { sentiment: 'negative', intensity };
  return { sentiment: 'neutral', intensity: 0.3 };
}

/**
 * Calculate trend from recent mentions
 */
function calculateTrend(mentions: CareerMention[]): 'improving' | 'declining' | 'stable' {
  if (mentions.length < 3) return 'stable';

  // Look at last 30 days
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentMentions = mentions.filter((m) => m.timestamp > thirtyDaysAgo);

  if (recentMentions.length < 2) return 'stable';

  // Compare first half vs second half sentiment
  const midpoint = Math.floor(recentMentions.length / 2);
  const firstHalf = recentMentions.slice(0, midpoint);
  const secondHalf = recentMentions.slice(midpoint);

  const avgFirst =
    firstHalf.reduce(
      (sum, m) => sum + (m.sentiment === 'positive' ? 1 : m.sentiment === 'negative' ? -1 : 0),
      0
    ) / firstHalf.length;
  const avgSecond =
    secondHalf.reduce(
      (sum, m) => sum + (m.sentiment === 'positive' ? 1 : m.sentiment === 'negative' ? -1 : 0),
      0
    ) / secondHalf.length;

  const diff = avgSecond - avgFirst;
  if (diff > 0.3) return 'improving';
  if (diff < -0.3) return 'declining';
  return 'stable';
}

/**
 * Update career profile with new mention
 */
function updateCareerProfile(userId: string, mention: CareerMention): CareerSentimentProfile {
  let profile = careerProfiles.get(userId);

  if (!profile) {
    profile = {
      mentions: [],
      lastUpdated: Date.now(),
      averageSentiment: 0,
      trendDirection: 'stable',
      topConcerns: [],
      recentWins: [],
    };
  }

  // Add new mention
  profile.mentions.push(mention);

  // Keep only last 90 days
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  profile.mentions = profile.mentions.filter((m) => m.timestamp > ninetyDaysAgo);

  // Recalculate metrics
  const sentimentScores: number[] = profile.mentions.map((m) =>
    m.sentiment === 'positive' ? 1 : m.sentiment === 'negative' ? -1 : 0
  );
  profile.averageSentiment = sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length;
  profile.trendDirection = calculateTrend(profile.mentions);
  profile.lastUpdated = Date.now();

  // Extract concerns (negative mentions) and wins (positive mentions)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentMentions = profile.mentions.filter((m) => m.timestamp > thirtyDaysAgo);

  profile.topConcerns = recentMentions
    .filter((m) => m.sentiment === 'negative')
    .map((m) => m.topic);
  profile.recentWins = recentMentions.filter((m) => m.sentiment === 'positive').map((m) => m.topic);

  careerProfiles.set(userId, profile);
  return profile;
}

/**
 * Get career profile for user
 */
function getCareerProfile(userId: string): CareerSentimentProfile | null {
  return careerProfiles.get(userId) || null;
}

// ============================================================================
// INSIGHT GENERATION
// ============================================================================

interface CareerInsight {
  type: 'pattern' | 'concern' | 'celebration' | 'check_in';
  message: string;
  priority: 'high' | 'normal' | 'low';
}

/**
 * Generate career insight from profile
 */
function generateCareerInsight(profile: CareerSentimentProfile): CareerInsight | null {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentNegative = profile.mentions.filter(
    (m) => m.timestamp > thirtyDaysAgo && m.sentiment === 'negative'
  ).length;
  const recentPositive = profile.mentions.filter(
    (m) => m.timestamp > thirtyDaysAgo && m.sentiment === 'positive'
  ).length;

  // High concern: Multiple negative mentions
  if (recentNegative >= 4) {
    return {
      type: 'concern',
      message: `User has mentioned career frustration ${recentNegative} times in the past month. This may indicate a deeper issue worth exploring gently.`,
      priority: 'high',
    };
  }

  // Declining trend
  if (profile.trendDirection === 'declining' && recentNegative >= 2) {
    return {
      type: 'pattern',
      message: `Career sentiment has been declining over the past few weeks. Consider asking how work has been going lately.`,
      priority: 'normal',
    };
  }

  // Celebration: Improving trend
  if (profile.trendDirection === 'improving' && recentPositive >= 2) {
    return {
      type: 'celebration',
      message: `User's career sentiment has been improving! They've shared ${recentPositive} positive work moments recently.`,
      priority: 'normal',
    };
  }

  // Check-in: Haven't discussed work in a while
  const daysSinceCareerMention =
    profile.mentions.length > 0
      ? Math.floor(
          (Date.now() - profile.mentions[profile.mentions.length - 1].timestamp) /
            (24 * 60 * 60 * 1000)
        )
      : 999;

  if (daysSinceCareerMention > 14 && profile.mentions.length > 0) {
    return {
      type: 'check_in',
      message: `It's been ${daysSinceCareerMention} days since they mentioned work. Could be worth a gentle check-in if it comes up naturally.`,
      priority: 'low',
    };
  }

  return null;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Career Awareness Context Builder
 *
 * Priority: 55 (after emotional context, in cognitive range)
 */
export const careerAwarenessBuilder: ContextBuilder = {
  name: 'career-awareness',
  description: 'Tracks career sentiment over time for proactive support',
  priority: 55,
  category: BuilderCategory.EXTERNAL,

  build: async (input: ContextBuilderInput): Promise<ContextInjection[]> => {
    const { services, userText, analysis } = input;
    const userId = services?.userId;

    if (!userId || !userText) return [];

    const injections: ContextInjection[] = [];

    // Check if current message is career-related
    const careerDetection = detectCareerTopic(userText);

    if (careerDetection.isCareerRelated) {
      // Analyze sentiment and update profile
      const sentiment = analyzeCareerSentiment(userText);

      const mention: CareerMention = {
        timestamp: Date.now(),
        sentiment: sentiment.sentiment,
        topic: careerDetection.topics.join(', '),
        intensity: sentiment.intensity,
      };

      const profile = updateCareerProfile(userId, mention);

      log.debug(
        { userId, sentiment: mention.sentiment, topics: careerDetection.topics },
        'Career mention detected and tracked'
      );

      // Generate insight if we have enough data
      if (profile.mentions.length >= 3) {
        const insight = generateCareerInsight(profile);

        if (insight && insight.priority !== 'low') {
          if (insight.priority === 'high') {
            injections.push(
              createHighInjection('career_awareness', insight.message, {
                category: 'career-intelligence',
              })
            );
          } else {
            injections.push(
              createStandardInjection('career_awareness', insight.message, {
                category: 'career-intelligence',
              })
            );
          }
        }
      }
    } else {
      // Not career-related, but check if we should surface a check-in
      const profile = getCareerProfile(userId);

      if (profile && profile.trendDirection === 'declining') {
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const recentNegative = profile.mentions.filter(
          (m) => m.timestamp > thirtyDaysAgo && m.sentiment === 'negative'
        ).length;

        // Only inject if there's a significant pattern (3+ negative mentions)
        if (recentNegative >= 3) {
          injections.push(
            createStandardInjection(
              'career_pattern',
              `[AWARENESS: User has shown declining career sentiment recently (${recentNegative} concerns in past month). If work comes up naturally, approach with extra care and curiosity.]`,
              {
                category: 'career-intelligence',
              }
            )
          );
        }
      }
    }

    return injections;
  },
};

// Register the builder
registerContextBuilder(careerAwarenessBuilder);

export { detectCareerTopic, analyzeCareerSentiment, getCareerProfile };
