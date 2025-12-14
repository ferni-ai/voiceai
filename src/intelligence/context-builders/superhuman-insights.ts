/**
 * Superhuman Insights Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 * > "Better than human" - We remember what humans forget.
 *
 * This builder provides the "magical" moments that make Ferni feel genuinely caring:
 *
 * 1. TIME-BASED TRIGGERS
 *    - "Three months ago you mentioned wanting to learn guitar..."
 *    - "It's been a week since you committed to that new routine..."
 *    - "Around this time last year, you were going through something similar..."
 *
 * 2. CROSS-SESSION REFLECTIONS
 *    - "I've been thinking about what you said last time..."
 *    - "Something you mentioned stuck with me..."
 *
 * 3. PATTERN RECOGNITION
 *    - "You've mentioned feeling stuck at work in 3 of our last 5 conversations..."
 *    - "I notice you tend to be harder on yourself on Mondays..."
 *
 * 4. GOAL PROGRESS CHECK-INS
 *    - "How's that morning routine going? It's been two weeks."
 *    - "Remember when you said you'd talk to your manager? Any updates?"
 *
 * @module intelligence/context-builders/superhuman-insights
 */

import type { UserProfile } from '../../types/user-profile.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  BuilderCategory,
  createHighInjection,
  createHintInjection,
  createStandardInjection,
  registerContextBuilder,
  type ContextBuilderInput,
  type ContextInjection,
} from './index.js';

// Cross-session reflection
import { getReflectionMoments, selectBestReflection } from '../cross-session-reflection.js';

// Subconscious goals
import { getSubconsciousSummary } from '../subconscious-goals.js';

// Life rhythm prediction
import { predictUserState } from '../life-rhythm-prediction.js';

const log = createLogger({ module: 'SuperhumanInsights' });

// ============================================================================
// SESSION STATE
// ============================================================================

interface SuperhumanSession {
  /** Insights already surfaced this session (prevent repetition) */
  surfacedInsights: Set<string>;
  /** Turn when each type was last surfaced */
  lastSurfacedTurn: Record<string, number>;
  /** Session start time */
  startTime: Date;
}

const sessions = new Map<string, SuperhumanSession>();

function getSession(sessionId: string): SuperhumanSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      surfacedInsights: new Set(),
      lastSurfacedTurn: {},
      startTime: new Date(),
    };
    sessions.set(sessionId, session);
  }
  return session;
}

// ============================================================================
// TIME-BASED INSIGHTS
// ============================================================================

interface TimeBasedInsight {
  type: 'anniversary' | 'milestone' | 'follow_up' | 'pattern';
  content: string;
  suggestedPhrase: string;
  priority: 'high' | 'standard' | 'hint';
  relevance: number;
}

/**
 * Generate time-based insights from user profile
 */
function generateTimeBasedInsights(
  profile: UserProfile | null,
  currentTopics: string[]
): TimeBasedInsight[] {
  if (!profile) return [];

  const insights: TimeBasedInsight[] = [];
  const now = new Date();

  // 1. KEY MOMENTS ANNIVERSARIES
  const keyMoments = profile.keyMoments || [];
  for (const moment of keyMoments) {
    const momentDate = new Date(moment.timestamp);
    const daysSince = Math.floor((now.getTime() - momentDate.getTime()) / (1000 * 60 * 60 * 24));

    // Check for significant time intervals
    if (daysSince === 7) {
      // One week
      insights.push({
        type: 'anniversary',
        content: `One week ago: ${moment.summary}`,
        suggestedPhrase: `It's been a week since ${moment.summary.toLowerCase()}. How are you feeling about it now?`,
        priority: 'standard',
        relevance: 0.7,
      });
    } else if (daysSince === 30 || daysSince === 31) {
      // One month
      insights.push({
        type: 'anniversary',
        content: `One month ago: ${moment.summary}`,
        suggestedPhrase: `About a month ago, ${moment.summary.toLowerCase()}. I've been thinking about that.`,
        priority: 'standard',
        relevance: 0.75,
      });
    } else if (daysSince >= 89 && daysSince <= 91) {
      // Three months
      insights.push({
        type: 'milestone',
        content: `Three months since: ${moment.summary}`,
        suggestedPhrase: `You know, it's been about three months since ${moment.summary.toLowerCase()}. How has that been sitting with you?`,
        priority: 'high',
        relevance: 0.8,
      });
    } else if (daysSince >= 364 && daysSince <= 366) {
      // One year
      insights.push({
        type: 'anniversary',
        content: `One year anniversary: ${moment.summary}`,
        suggestedPhrase: `I was thinking... it's been about a year since ${moment.summary.toLowerCase()}. That feels significant.`,
        priority: 'high',
        relevance: 0.9,
      });
    }
  }

  // 2. GOAL PROGRESS FOLLOW-UPS
  const goals = profile.customData?.goals as
    | Array<{
        goal: string;
        setDate: string;
        status?: string;
      }>
    | undefined;

  if (goals) {
    for (const goal of goals) {
      if (goal.status === 'completed') continue;

      const setDate = new Date(goal.setDate);
      const daysSince = Math.floor((now.getTime() - setDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSince >= 6 && daysSince <= 8) {
        // One week check-in
        insights.push({
          type: 'follow_up',
          content: `Goal set a week ago: ${goal.goal}`,
          suggestedPhrase: `Hey, it's been about a week since you mentioned ${goal.goal.toLowerCase()}. How's that going?`,
          priority: 'standard',
          relevance: 0.7,
        });
      } else if (daysSince >= 13 && daysSince <= 15) {
        // Two week check-in
        insights.push({
          type: 'follow_up',
          content: `Goal set two weeks ago: ${goal.goal}`,
          suggestedPhrase: `Remember when you committed to ${goal.goal.toLowerCase()}? That was about two weeks ago. Any progress?`,
          priority: 'high',
          relevance: 0.8,
        });
      }
    }
  }

  // 3. RECURRING TOPIC PATTERNS
  const topicHistory = profile.customData?.topicHistory as Record<string, number> | undefined;
  if (topicHistory) {
    for (const [topic, count] of Object.entries(topicHistory)) {
      if (count >= 3 && currentTopics.some((t) => t.toLowerCase().includes(topic.toLowerCase()))) {
        insights.push({
          type: 'pattern',
          content: `${topic} mentioned ${count} times`,
          suggestedPhrase: `You know, you've brought up ${topic.toLowerCase()} several times now. I wonder if there's something there worth exploring.`,
          priority: 'hint',
          relevance: 0.6 + count * 0.05,
        });
      }
    }
  }

  // Sort by relevance
  insights.sort((a, b) => b.relevance - a.relevance);

  return insights;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

/**
 * Build superhuman insights context
 */
async function buildSuperhumanInsights(input: ContextBuilderInput): Promise<ContextInjection[]> {
  const { services, userProfile, userData, analysis } = input;
  const injections: ContextInjection[] = [];

  const sessionId = services?.sessionId || 'unknown';
  const userId = services?.userId || services?.userProfile?.id || 'unknown';
  const session = getSession(sessionId);
  const turnCount = userData.turnCount || 1;

  const currentTopics = analysis?.topics?.detected || [];
  const currentEmotion = analysis?.emotion?.primary || 'neutral';

  try {
    // ========================================================================
    // 1. CROSS-SESSION REFLECTION (Turns 2-4)
    // "I've been thinking about what you said..."
    // ========================================================================

    if (
      turnCount >= 2 &&
      turnCount <= 4 &&
      !session.surfacedInsights.has('reflection') &&
      userProfile
    ) {
      const reflectionMoments = getReflectionMoments(userProfile);

      if (reflectionMoments.length > 0) {
        const reflection = selectBestReflection(
          reflectionMoments,
          currentTopics,
          currentEmotion,
          turnCount
        );

        if (reflection && reflection.appropriateness > 0.5) {
          injections.push(
            createHighInjection(
              'superhuman_reflection',
              `[CROSS-SESSION REFLECTION]\n` +
                `Something from our previous conversation to naturally weave in:\n` +
                `→ "${reflection.phrase}"\n` +
                `(Only mention if it feels natural, don't force it)`,
              { category: 'superhuman', confidence: reflection.appropriateness }
            )
          );

          session.surfacedInsights.add('reflection');
          session.lastSurfacedTurn['reflection'] = turnCount;

          log.debug({ momentId: reflection.momentId }, '💭 Cross-session reflection ready');
        }
      }
    }

    // ========================================================================
    // 2. TIME-BASED INSIGHTS (Turns 3-6)
    // "It's been a month since..."
    // ========================================================================

    if (turnCount >= 3 && turnCount <= 6 && !session.surfacedInsights.has('time_based')) {
      const timeInsights = generateTimeBasedInsights(userProfile, currentTopics);

      if (timeInsights.length > 0) {
        const best = timeInsights[0];

        // Don't surface within 3 turns of reflection
        const lastReflectionTurn = session.lastSurfacedTurn['reflection'] || 0;
        if (turnCount - lastReflectionTurn >= 2) {
          const createInjection =
            best.priority === 'high'
              ? createHighInjection
              : best.priority === 'standard'
                ? createStandardInjection
                : createHintInjection;

          injections.push(
            createInjection(
              'superhuman_time',
              `[TIME-BASED INSIGHT: ${best.type.toUpperCase()}]\n` +
                `${best.content}\n` +
                `→ Consider: "${best.suggestedPhrase}"`,
              { category: 'superhuman', confidence: best.relevance }
            )
          );

          session.surfacedInsights.add('time_based');
          session.lastSurfacedTurn['time_based'] = turnCount;

          log.debug({ type: best.type, content: best.content }, '⏰ Time-based insight ready');
        }
      }
    }

    // ========================================================================
    // 3. SUBCONSCIOUS PATTERN INSIGHTS (Turn 5+)
    // "You've mentioned X several times..."
    // ========================================================================

    if (turnCount >= 5 && !session.surfacedInsights.has('subconscious')) {
      const subconscious = getSubconsciousSummary(userId);

      if (subconscious) {
        // Don't surface too close to other insights
        const lastInsightTurn = Math.max(
          session.lastSurfacedTurn['reflection'] || 0,
          session.lastSurfacedTurn['time_based'] || 0
        );

        if (turnCount - lastInsightTurn >= 2) {
          injections.push(
            createHintInjection(
              'superhuman_subconscious',
              subconscious + '\n(Surface gently when relevant, not as an accusation)',
              { category: 'superhuman' }
            )
          );

          session.surfacedInsights.add('subconscious');
          session.lastSurfacedTurn['subconscious'] = turnCount;

          log.debug('🧠 Subconscious pattern insight ready');
        }
      }
    }

    // ========================================================================
    // 4. LIFE RHYTHM PREDICTION (First turn for returning users)
    // "I had a feeling you might reach out today..."
    // ========================================================================

    if (turnCount === 1 && userData.isReturningUser && !session.surfacedInsights.has('rhythm')) {
      const rhythmPrediction = predictUserState(userId);

      if (
        rhythmPrediction.confidence > 0.6 &&
        (rhythmPrediction.prediction.likelyMood !== 'neutral' ||
          rhythmPrediction.reasons.length > 0)
      ) {
        const moodDescriptions: Record<string, string> = {
          elevated: 'you might be in good spirits',
          low: 'today might be a harder day',
          neutral: '',
        };

        const energyDescriptions: Record<string, string> = {
          high: 'feeling energized',
          depleted: 'feeling a bit tired',
          normal: '',
        };

        const moodHint = moodDescriptions[rhythmPrediction.prediction.likelyMood];
        const energyHint = energyDescriptions[rhythmPrediction.prediction.likelyEnergy];
        const combinedHint = moodHint || energyHint;

        if (combinedHint && rhythmPrediction.reasons.length > 0) {
          injections.push(
            createHintInjection(
              'superhuman_rhythm',
              `[LIFE RHYTHM AWARENESS]\n` +
                `Based on patterns, ${combinedHint}.\n` +
                `Reason: ${rhythmPrediction.reasons[0]}\n` +
                `(Don't state this directly - just be attuned to it)`,
              { category: 'superhuman', confidence: rhythmPrediction.confidence }
            )
          );

          session.surfacedInsights.add('rhythm');

          log.debug(
            {
              mood: rhythmPrediction.prediction.likelyMood,
              confidence: rhythmPrediction.confidence,
            },
            '🎵 Life rhythm prediction ready'
          );
        }
      }
    }
  } catch (error) {
    log.warn({ error }, 'Superhuman insights generation failed (non-blocking)');
  }

  return injections;
}

// ============================================================================
// REGISTER BUILDER
// ============================================================================

registerContextBuilder({
  name: 'superhuman_insights',
  description:
    'Time-based memory, cross-session reflection, pattern recognition - the "better than human" moments',
  priority: 80, // High priority - these are the magical moments
  build: buildSuperhumanInsights,
  category: BuilderCategory.MEMORY,
});

// ============================================================================
// EXPORTS
// ============================================================================

export {
  buildSuperhumanInsights,
  generateTimeBasedInsights,
  type SuperhumanSession,
  type TimeBasedInsight,
};

export default {
  buildSuperhumanInsights,
  generateTimeBasedInsights,
};
