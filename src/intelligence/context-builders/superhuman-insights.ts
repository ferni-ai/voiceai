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

/**
 * Clear session data for a specific session (prevents memory leaks).
 */
export function clearSuperhumanInsightsSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * Clear all session data (for shutdown).
 */
export function clearAllSuperhumanInsightsSessions(): void {
  sessions.clear();
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
// LINGUISTIC PATTERN DETECTION
// ============================================================================

interface LinguisticPatternResult {
  type: 'linguistic';
  pattern: 'obligation_language' | 'limiting_belief' | 'dismissal' | 'absolute_thinking' | 'permission_seeking';
  confidence: number;
  phrases: string[];
}

/**
 * Detect linguistic patterns that reveal underlying beliefs or emotions.
 */
export function detectLinguisticPatterns(
  currentMessage: string,
  recentHistory: string[] = []
): LinguisticPatternResult | null {
  const allText = [currentMessage, ...recentHistory].join(' ').toLowerCase();
  
  // "I should" patterns - obligation language
  const shouldMatches = allText.match(/i should\s+\w+/gi) || [];
  if (shouldMatches.length >= 2) {
    return {
      type: 'linguistic',
      pattern: 'obligation_language',
      confidence: Math.min(0.5 + shouldMatches.length * 0.15, 0.95),
      phrases: shouldMatches,
    };
  }
  
  // "I can't" patterns - limiting beliefs
  const cantMatches = allText.match(/i (can't|cannot|can not)\s+\w+/gi) || [];
  if (cantMatches.length >= 2) {
    return {
      type: 'linguistic',
      pattern: 'limiting_belief',
      confidence: Math.min(0.5 + cantMatches.length * 0.15, 0.95),
      phrases: cantMatches,
    };
  }
  
  // "It's fine" patterns - dismissal
  const fineMatches = allText.match(/(it's|i'm)\s+(fine|okay|ok|alright)/gi) || [];
  if (fineMatches.length >= 1) {
    return {
      type: 'linguistic',
      pattern: 'dismissal',
      confidence: 0.6 + fineMatches.length * 0.1,
      phrases: fineMatches,
    };
  }
  
  // "Always/never" patterns - absolute thinking
  const absoluteMatches = allText.match(/\b(always|never)\b/gi) || [];
  if (absoluteMatches.length >= 2) {
    return {
      type: 'linguistic',
      pattern: 'absolute_thinking',
      confidence: Math.min(0.5 + absoluteMatches.length * 0.12, 0.9),
      phrases: absoluteMatches,
    };
  }
  
  // "Can I" / "Is it okay if" patterns - permission seeking
  const permissionMatches = allText.match(/(can i|is it okay|would it be okay|am i allowed)/gi) || [];
  if (permissionMatches.length >= 1) {
    return {
      type: 'linguistic',
      pattern: 'permission_seeking',
      confidence: 0.55 + permissionMatches.length * 0.15,
      phrases: permissionMatches,
    };
  }
  
  return null;
}

// ============================================================================
// REPEATED TOPIC DETECTION
// ============================================================================

interface RepeatedTopicResult {
  type: 'emotional';  // "The Mirror" - emotional pattern surfacing
  topic: string;
  occurrences: number;
  confidence: number;
}

/**
 * Detect topics that keep coming up across conversations - "The Mirror".
 * This surfaces patterns the user may not be consciously aware of.
 */
export function detectRepeatedTopics(
  topics: string[],
  topicHistory: Record<string, number> = {}
): RepeatedTopicResult | null {
  // Need at least 3 topics to detect patterns
  if (topics.length < 3) {
    return null;
  }
  
  // Count current topics
  const counts: Record<string, number> = { ...topicHistory };
  for (const topic of topics) {
    const normalized = topic.toLowerCase().trim();
    counts[normalized] = (counts[normalized] || 0) + 1;
  }
  
  // Find most repeated topic
  let maxTopic: string | null = null;
  let maxCount = 0;
  for (const [topic, count] of Object.entries(counts)) {
    if (count > maxCount && count >= 3) {
      maxCount = count;
      maxTopic = topic;
    }
  }
  
  if (maxTopic && maxCount >= 3) {
    return {
      type: 'emotional',  // "The Mirror" surfaces emotional patterns
      topic: maxTopic,
      occurrences: maxCount,
      confidence: Math.min(0.4 + maxCount * 0.1, 0.95),
    };
  }
  
  return null;
}

// ============================================================================
// EMOTIONAL WEATHER ANALYSIS
// ============================================================================

interface EmotionalWeatherResult {
  type: 'emotional_weather';
  trend: 'improving' | 'declining' | 'stable' | 'volatile';
  volatilityScore: number;
  averageSentiment: number;
  confidence: number;
}

/**
 * Analyze emotional patterns over time - the "emotional weather" of a user.
 * 
 * @param sessionCount - Number of sessions worth of data
 * @param emotions - Array of emotion strings in chronological order
 */
export function analyzeEmotionalWeather(
  sessionCount: number,
  emotions: string[]
): EmotionalWeatherResult | null {
  // Need at least 3 data points to detect a trend
  if (sessionCount < 3 || emotions.length < 3) {
    return null;
  }
  
  // Map emotions to sentiment scores
  const sentimentMap: Record<string, number> = {
    joy: 0.9, happy: 0.8, excited: 0.8, hopeful: 0.7, grateful: 0.75, content: 0.6,
    neutral: 0.5, okay: 0.5,
    concerned: 0.4, worried: 0.35, anxious: 0.3, stressed: 0.25,
    sad: 0.2, frustrated: 0.2, angry: 0.15, overwhelmed: 0.1,
  };
  
  const sentiments = emotions.map(e => sentimentMap[e.toLowerCase()] ?? 0.5);
  
  // Calculate average
  const averageSentiment = sentiments.reduce((sum, s) => sum + s, 0) / sentiments.length;
  
  // Calculate volatility (variance)
  const variance = sentiments.reduce((sum, s) => sum + Math.pow(s - averageSentiment, 2), 0) / sentiments.length;
  const volatilityScore = Math.sqrt(variance);
  
  // Determine trend by comparing recent to older
  const midpoint = Math.floor(sentiments.length / 2);
  const olderAvg = sentiments.slice(0, midpoint).reduce((sum, s) => sum + s, 0) / midpoint;
  const recentAvg = sentiments.slice(midpoint).reduce((sum, s) => sum + s, 0) / (sentiments.length - midpoint);
  
  let trend: 'improving' | 'declining' | 'stable' | 'volatile';
  if (volatilityScore > 0.25) {
    trend = 'volatile';
  } else if (recentAvg > olderAvg + 0.1) {
    trend = 'improving';
  } else if (recentAvg < olderAvg - 0.1) {
    trend = 'declining';
  } else {
    trend = 'stable';
  }
  
  return {
    type: 'emotional_weather',
    trend,
    volatilityScore,
    averageSentiment,
    confidence: Math.min(0.5 + emotions.length * 0.05, 0.9),
  };
}

// ============================================================================
// ANTICIPATORY CUE DETECTION
// ============================================================================

interface AnticipatoryCueResult {
  type: 'hesitant_start' | 'trailing_off' | 'important_incoming' | 'high_stress' | 'topic_avoidance';
  cue: string;
  confidence: number;
}

/**
 * Detect anticipatory cues in speech that suggest what's coming.
 */
export function detectAnticipatoryCues(
  text: string,
  voiceStressLevel?: number
): AnticipatoryCueResult | null {
  const lowercaseText = text.toLowerCase().trim();
  
  // High stress detected from voice analysis
  if (voiceStressLevel !== undefined && voiceStressLevel > 0.7) {
    return {
      type: 'high_stress',
      cue: text,
      confidence: voiceStressLevel,
    };
  }
  
  // Hesitant starts: "um", "so", "the thing is"
  if (/^(um|uh|so|well|the thing is|i mean)/i.test(lowercaseText)) {
    return {
      type: 'hesitant_start',
      cue: text.slice(0, 30),
      confidence: 0.7,
    };
  }
  
  // Trailing off: ends with "..."
  if (/\.\.\.$/.test(text.trim())) {
    return {
      type: 'trailing_off',
      cue: text,
      confidence: 0.75,
    };
  }
  
  // Important incoming: "I need to tell you", "there's something", "I have to say"
  if (/i (need to|have to|want to) (tell|say|share)/i.test(lowercaseText) ||
      /there's something/i.test(lowercaseText)) {
    return {
      type: 'important_incoming',
      cue: text,
      confidence: 0.85,
    };
  }
  
  // Topic avoidance: "anyway", "but yeah", "moving on"
  if (/\b(anyway|but yeah|moving on|let's talk about something else)\b/i.test(lowercaseText)) {
    return {
      type: 'topic_avoidance',
      cue: text,
      confidence: 0.65,
    };
  }
  
  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

// Note: buildSuperhumanInsights and generateTimeBasedInsights are not exported with 'export function'
// so we explicitly export them here along with all the types
export {
  buildSuperhumanInsights,
  generateTimeBasedInsights,
  type SuperhumanSession,
  type TimeBasedInsight,
  type LinguisticPatternResult,
  type RepeatedTopicResult,
  type EmotionalWeatherResult,
  type AnticipatoryCueResult,
};

export default {
  buildSuperhumanInsights,
  generateTimeBasedInsights,
  detectLinguisticPatterns,
  detectRepeatedTopics,
  analyzeEmotionalWeather,
  detectAnticipatoryCues,
};
