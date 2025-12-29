/**
 * News → Mood Cross-Domain Connection
 *
 * "Better Than Human" feature: Detects heavy/stressful news content
 * and offers to skip, summarize, or provide emotional support.
 *
 * Examples:
 * - "The news is pretty heavy today. Want me to just give you the highlights?"
 * - "I notice you seem stressed. Maybe skip the news for now?"
 * - "There's been some difficult news. Want to hear it, or take a break?"
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../../utils/safe-logger.js';
import type { NewsMoodAnalysis, MoodContext, CrossDomainInsight } from './types.js';

const log = getLogger();

// ============================================================================
// HEAVY TOPIC DETECTION
// ============================================================================

/**
 * Topics that might negatively affect mood
 */
const HEAVY_TOPICS = [
  // Violence & conflict
  'war',
  'attack',
  'bombing',
  'shooting',
  'massacre',
  'terrorism',
  'violence',
  'conflict',
  'death toll',
  'casualties',
  'killed',
  'murder',
  'assault',

  // Disasters
  'disaster',
  'earthquake',
  'hurricane',
  'tornado',
  'flood',
  'wildfire',
  'tsunami',
  'explosion',
  'crash',
  'collapse',
  'tragedy',

  // Economic anxiety
  'recession',
  'layoffs',
  'unemployment',
  'inflation crisis',
  'market crash',
  'bankruptcy',
  'foreclosure',

  // Health crises
  'pandemic',
  'outbreak',
  'epidemic',
  'health crisis',
  'disease spread',

  // Political tension
  'political crisis',
  'impeachment',
  'scandal',
  'corruption',
  'investigation',

  // Social issues (sensitive)
  'hate crime',
  'discrimination',
  'injustice',
  'abuse',
  'exploitation',
];

/**
 * Topics that might be uplifting
 */
const POSITIVE_TOPICS = [
  'breakthrough',
  'discovery',
  'achievement',
  'success',
  'wins',
  'victory',
  'rescue',
  'recovery',
  'reunion',
  'celebrates',
  'hero',
  'innovation',
  'progress',
  'milestone',
  'award',
  'record-breaking',
  'inspiring',
];

/**
 * Analyze news content for emotional impact
 */
function analyzeNewsContent(headlines: string[]): {
  heavyCount: number;
  positiveCount: number;
  heavyTopics: string[];
  overallSentiment: NewsMoodAnalysis['overallSentiment'];
} {
  const lowerHeadlines = headlines.map((h) => h.toLowerCase()).join(' ');
  const heavyTopics: string[] = [];

  let heavyCount = 0;
  let positiveCount = 0;

  for (const topic of HEAVY_TOPICS) {
    if (lowerHeadlines.includes(topic)) {
      heavyCount++;
      heavyTopics.push(topic);
    }
  }

  for (const topic of POSITIVE_TOPICS) {
    if (lowerHeadlines.includes(topic)) {
      positiveCount++;
    }
  }

  // Determine overall sentiment
  let overallSentiment: NewsMoodAnalysis['overallSentiment'];
  if (heavyCount >= 3) {
    overallSentiment = 'heavy';
  } else if (heavyCount > positiveCount) {
    overallSentiment = 'negative';
  } else if (positiveCount > heavyCount) {
    overallSentiment = 'positive';
  } else {
    overallSentiment = 'neutral';
  }

  return { heavyCount, positiveCount, heavyTopics, overallSentiment };
}

// ============================================================================
// MOOD-AWARE NEWS DELIVERY
// ============================================================================

/**
 * Analyze news and user mood to determine best delivery approach
 */
export async function analyzeNewsMoodImpact(
  newsHeadlines: string[],
  userMood?: MoodContext
): Promise<NewsMoodAnalysis> {
  log.info(
    { headlineCount: newsHeadlines.length, userMood: userMood?.currentMood },
    '📰→😊 Analyzing news mood impact'
  );

  const { heavyCount, positiveCount, heavyTopics, overallSentiment } =
    analyzeNewsContent(newsHeadlines);

  // Determine recommendation based on news content and user mood
  let recommendation: NewsMoodAnalysis['recommendation'];
  let reason: string;

  // If user is already stressed/anxious
  if (userMood?.currentMood === 'stressed' || userMood?.currentMood === 'anxious') {
    if (overallSentiment === 'heavy' || overallSentiment === 'negative') {
      recommendation = 'skip';
      reason =
        "You seem a bit stressed, and today's news is heavy. " +
        'Maybe skip it for now and check in later?';
    } else {
      recommendation = 'summarize';
      reason = "I'll give you a brief summary to keep you informed without overwhelming you.";
    }
  }
  // If news is particularly heavy
  else if (overallSentiment === 'heavy') {
    recommendation = 'offer_break';
    reason =
      "Today's news is pretty heavy. Want me to share it, or would you prefer a lighter update?";
  }
  // If news is negative but not overwhelming
  else if (overallSentiment === 'negative' && heavyCount > 0) {
    recommendation = 'summarize';
    reason = "There's some difficult news today. I'll keep the summary brief.";
  }
  // Normal delivery
  else {
    recommendation = 'proceed';
    reason =
      overallSentiment === 'positive'
        ? "Good news today! Here's what's happening."
        : "Here's your news update.";
  }

  return {
    overallSentiment,
    heavyTopics,
    recommendation,
    reason,
  };
}

/**
 * Generate a mood-sensitive news introduction
 */
export function generateNewsMoodIntro(analysis: NewsMoodAnalysis, userMood?: MoodContext): string {
  const { recommendation, reason, overallSentiment, heavyTopics } = analysis;

  switch (recommendation) {
    case 'skip':
      return (
        `I was going to share the news, but ${reason} ` +
        "There's nothing urgent you need to know right now. " +
        'Want to do something else instead?'
      );

    case 'offer_break':
      return (
        `${reason} ` +
        "I can share it if you'd like, summarize just the key points, " +
        'or we can skip it entirely. What feels right?'
      );

    case 'summarize':
      return `${reason} ` + 'Let me know if you want more details on anything.';

    case 'proceed':
    default:
      return reason;
  }
}

/**
 * Generate insights connecting news to mood
 */
export async function getNewsMoodInsights(
  newsHeadlines: string[],
  userMood?: MoodContext
): Promise<CrossDomainInsight[]> {
  log.info({ headlineCount: newsHeadlines.length }, '📰→😊 Generating news-mood insights');

  const insights: CrossDomainInsight[] = [];
  const analysis = await analyzeNewsMoodImpact(newsHeadlines, userMood);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours

  // Generate insight based on analysis
  if (analysis.recommendation !== 'proceed') {
    insights.push({
      id: `news-mood-${now.getTime()}`,
      sourceDomain: 'news',
      targetDomain: 'mood',
      connectionType: 'news_mood',
      message: generateNewsMoodIntro(analysis, userMood),
      suggestion:
        analysis.recommendation === 'skip'
          ? 'How about some music or a relaxing conversation instead?'
          : analysis.recommendation === 'offer_break'
            ? "Take your time deciding. There's no rush."
            : undefined,
      confidence: analysis.overallSentiment === 'heavy' ? 0.9 : 0.75,
      generatedAt: now,
      expiresAt,
      context: {
        overallSentiment: analysis.overallSentiment,
        heavyTopics: analysis.heavyTopics,
        recommendation: analysis.recommendation,
        userMoodAtTime: userMood?.currentMood,
      },
    });
  }

  // Add insight about consecutive heavy news days (if we had history)
  // This could be enhanced with user news consumption history

  return insights;
}

// ============================================================================
// POSITIVE NEWS FINDER
// ============================================================================

/**
 * Find positive/uplifting news when user needs a mood boost
 */
export function filterPositiveNews(headlines: string[]): string[] {
  return headlines.filter((headline) => {
    const lower = headline.toLowerCase();
    return (
      POSITIVE_TOPICS.some((topic) => lower.includes(topic)) &&
      !HEAVY_TOPICS.some((topic) => lower.includes(topic))
    );
  });
}

/**
 * Generate a mood-boosting news summary
 */
export function generateUpliftingNewsSummary(positiveHeadlines: string[]): string {
  if (positiveHeadlines.length === 0) {
    return 'Looking for some good news... Let me find something uplifting for you.';
  }

  return (
    "Here's some good news to brighten your day:\n" +
    positiveHeadlines
      .slice(0, 3)
      .map((h) => `• ${h}`)
      .join('\n')
  );
}

// ============================================================================
// TOOL EXPORTS
// ============================================================================

export function createNewsMoodTools() {
  return {
    analyzeNewsMoodImpact: llm.tool({
      description:
        'Analyze news headlines for emotional impact and determine the best way to ' +
        'deliver them based on content heaviness and user mood.',
      parameters: z.object({
        newsHeadlines: z.array(z.string()).describe('Array of news headlines to analyze'),
        userMoodState: z
          .enum([
            'calm',
            'happy',
            'excited',
            'anxious',
            'stressed',
            'sad',
            'frustrated',
            'tired',
            'neutral',
          ])
          .optional()
          .describe('Current user mood state if known'),
      }),
      execute: async ({ newsHeadlines, userMoodState }) => {
        const userMood: MoodContext | undefined = userMoodState
          ? {
              currentMood: userMoodState,
              confidence: 0.7,
              trend: 'stable',
              energyLevel: 'medium',
              stressIndicators: [],
              assessedAt: new Date(),
            }
          : undefined;

        const analysis = await analyzeNewsMoodImpact(newsHeadlines, userMood);
        return generateNewsMoodIntro(analysis, userMood);
      },
    }),

    getPositiveNewsOnly: llm.tool({
      description:
        'Filter news to show only positive, uplifting stories. ' +
        'Use when user needs a mood boost or wants to avoid heavy news.',
      parameters: z.object({
        newsHeadlines: z.array(z.string()).describe('Array of news headlines to filter'),
      }),
      execute: async ({ newsHeadlines }) => {
        const positiveNews = filterPositiveNews(newsHeadlines);
        return generateUpliftingNewsSummary(positiveNews);
      },
    }),

    shouldSkipNews: llm.tool({
      description:
        'Determine if news should be skipped based on user mood and news content. ' +
        'Returns a recommendation and reason.',
      parameters: z.object({
        newsHeadlines: z.array(z.string()).describe('Headlines to analyze'),
        userMoodState: z
          .enum([
            'calm',
            'happy',
            'excited',
            'anxious',
            'stressed',
            'sad',
            'frustrated',
            'tired',
            'neutral',
          ])
          .describe('Current user mood'),
      }),
      execute: async ({ newsHeadlines, userMoodState }) => {
        const userMood: MoodContext = {
          currentMood: userMoodState,
          confidence: 0.8,
          trend: 'stable',
          energyLevel: 'medium',
          stressIndicators: [],
          assessedAt: new Date(),
        };

        const analysis = await analyzeNewsMoodImpact(newsHeadlines, userMood);

        return JSON.stringify({
          shouldSkip: analysis.recommendation === 'skip',
          recommendation: analysis.recommendation,
          reason: analysis.reason,
          heavyTopicsDetected: analysis.heavyTopics.length,
        });
      },
    }),
  };
}
