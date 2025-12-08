/**
 * ANT (Automatic Negative Thought) Tracker
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Tracks patterns of automatic negative thoughts over time.
 * This enables:
 * - Identifying a user's most common thinking traps
 * - Detecting temporal patterns (morning anxiety, Sunday scaries)
 * - Measuring progress in cognitive restructuring
 * - Informing personalized interventions
 *
 * @module CognitiveIntelligence/ANTTracker
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  CognitiveDistortion,
  ANTInstance,
  ANTProfile,
  DistortionDetection,
} from './types.js';

const log = createLogger({ module: 'ANTTracker' });

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

/** ANT profiles per user */
const profiles = new Map<string, ANTProfile>();

/** Individual ANT instances per user (for detailed analysis) */
const antInstances = new Map<string, ANTInstance[]>();

// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================

/**
 * Get or create an ANT profile for a user.
 */
function getOrCreateProfile(userId: string): ANTProfile {
  let profile = profiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      totalDetected: 0,
      byDistortion: new Map(),
      topDistortions: [],
      byTimeOfDay: new Map(),
      byDayOfWeek: new Map(),
      topicTriggers: new Map(),
      emotionCorrelations: new Map(),
      trend: 'stable',
      reframeSuccessRate: 0,
      lastUpdated: new Date(),
    };
    profiles.set(userId, profile);
  }
  return profile;
}

/**
 * Get time of day bucket.
 */
function getTimeOfDay(date: Date): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// ============================================================================
// RECORDING ANTS
// ============================================================================

/**
 * Record an ANT instance from a distortion detection.
 */
export function recordANT(
  userId: string,
  detection: DistortionDetection,
  outcome?: {
    wasAddressed: boolean;
    reframeAttempted?: string;
    userResponse?: 'receptive' | 'resistant' | 'neutral' | 'breakthrough';
  }
): ANTInstance {
  const profile = getOrCreateProfile(userId);
  const now = new Date();

  // Create the ANT instance
  const instance: ANTInstance = {
    id: `ant_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId,
    timestamp: now,
    thought: detection.triggerPhrase,
    distortions: [detection.type],
    confidence: detection.confidence,
    topic: detection.topic,
    emotion: detection.emotion,
    timeOfDay: getTimeOfDay(now),
    dayOfWeek: now.getDay(),
    wasAddressed: outcome?.wasAddressed ?? false,
    reframeAttempted: outcome?.reframeAttempted,
    userResponse: outcome?.userResponse,
  };

  // Store instance
  const userInstances = antInstances.get(userId) || [];
  userInstances.push(instance);

  // Keep only last 500 instances
  if (userInstances.length > 500) {
    userInstances.shift();
  }
  antInstances.set(userId, userInstances);

  // Update profile aggregates
  updateProfileAggregates(profile, instance);

  log.debug(
    {
      userId,
      antId: instance.id,
      distortion: detection.type,
      timeOfDay: instance.timeOfDay,
    },
    '🐜 ANT recorded'
  );

  return instance;
}

/**
 * Update aggregate statistics in the profile.
 */
function updateProfileAggregates(profile: ANTProfile, instance: ANTInstance): void {
  const now = new Date();

  // Update total
  profile.totalDetected++;

  // Update by distortion
  for (const distortion of instance.distortions) {
    const count = profile.byDistortion.get(distortion) || 0;
    profile.byDistortion.set(distortion, count + 1);
  }

  // Update time of day
  const todList = profile.byTimeOfDay.get(instance.timeOfDay) || [];
  todList.push(...instance.distortions);
  profile.byTimeOfDay.set(instance.timeOfDay, todList);

  // Update day of week
  const dowList = profile.byDayOfWeek.get(instance.dayOfWeek) || [];
  dowList.push(...instance.distortions);
  profile.byDayOfWeek.set(instance.dayOfWeek, dowList);

  // Update topic triggers
  if (instance.topic) {
    const topicList = profile.topicTriggers.get(instance.topic) || [];
    topicList.push(...instance.distortions);
    profile.topicTriggers.set(instance.topic, topicList);
  }

  // Update emotion correlations
  if (instance.emotion) {
    const emotionList = profile.emotionCorrelations.get(instance.emotion) || [];
    emotionList.push(...instance.distortions);
    profile.emotionCorrelations.set(instance.emotion, emotionList);
  }

  // Update top distortions
  profile.topDistortions = calculateTopDistortions(profile);

  // Update reframe success rate
  if (instance.userResponse) {
    const isSuccess = instance.userResponse === 'receptive' || instance.userResponse === 'breakthrough';
    profile.reframeSuccessRate = profile.reframeSuccessRate * 0.9 + (isSuccess ? 0.1 : 0);
  }

  profile.lastUpdated = now;
}

/**
 * Calculate the top N most common distortions.
 */
function calculateTopDistortions(profile: ANTProfile, limit: number = 3): CognitiveDistortion[] {
  return [...profile.byDistortion.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([type]) => type);
}

// ============================================================================
// PATTERN ANALYSIS
// ============================================================================

/**
 * Analyze patterns in a user's ANT history.
 */
export function analyzePatterns(userId: string): ANTPatternAnalysis {
  const profile = profiles.get(userId);
  const instances = antInstances.get(userId) || [];

  if (!profile || instances.length < 5) {
    return {
      hasEnoughData: false,
      insights: [],
    };
  }

  const insights: PatternInsight[] = [];

  // 1. Top distortions
  if (profile.topDistortions.length > 0) {
    insights.push({
      type: 'top_distortions',
      message: `Your mind tends toward ${formatDistortionList(profile.topDistortions)}`,
      distortions: profile.topDistortions,
      actionable: 'Notice when these patterns show up—awareness is the first step.',
    });
  }

  // 2. Time of day patterns
  const timePatterns = analyzeTimePatterns(profile);
  if (timePatterns) {
    insights.push(timePatterns);
  }

  // 3. Day of week patterns
  const dayPatterns = analyzeDayPatterns(profile);
  if (dayPatterns) {
    insights.push(dayPatterns);
  }

  // 4. Topic triggers
  const topicPatterns = analyzeTopicTriggers(profile);
  if (topicPatterns) {
    insights.push(topicPatterns);
  }

  // 5. Emotional correlations
  const emotionPatterns = analyzeEmotionCorrelations(profile);
  if (emotionPatterns) {
    insights.push(emotionPatterns);
  }

  // 6. Progress trend
  const trendInsight = calculateTrend(instances);
  if (trendInsight) {
    insights.push(trendInsight);
  }

  return {
    hasEnoughData: true,
    insights,
    profile: {
      totalDetected: profile.totalDetected,
      topDistortions: profile.topDistortions,
      reframeSuccessRate: profile.reframeSuccessRate,
      trend: profile.trend,
    },
  };
}

/**
 * Analyze time-of-day patterns.
 */
function analyzeTimePatterns(profile: ANTProfile): PatternInsight | null {
  const timeCounts: Record<string, number> = {};
  for (const [time, distortions] of profile.byTimeOfDay.entries()) {
    timeCounts[time] = distortions.length;
  }

  const totalCount = Object.values(timeCounts).reduce((a, b) => a + b, 0);
  if (totalCount < 10) return null;

  // Find peak time
  const peakTime = Object.entries(timeCounts)
    .sort((a, b) => b[1] - a[1])[0];

  if (!peakTime || peakTime[1] < totalCount * 0.4) return null;

  const timeLabels: Record<string, string> = {
    morning: 'mornings',
    afternoon: 'afternoons',
    evening: 'evenings',
    night: 'late nights',
  };

  return {
    type: 'time_pattern',
    message: `Your negative thinking tends to spike during ${timeLabels[peakTime[0]] || peakTime[0]}`,
    timeOfDay: peakTime[0] as 'morning' | 'afternoon' | 'evening' | 'night',
    percentage: Math.round((peakTime[1] / totalCount) * 100),
    actionable: `Consider building a grounding practice into your ${peakTime[0]} routine.`,
  };
}

/**
 * Analyze day-of-week patterns.
 */
function analyzeDayPatterns(profile: ANTProfile): PatternInsight | null {
  const dayCounts: Record<number, number> = {};
  for (const [day, distortions] of profile.byDayOfWeek.entries()) {
    dayCounts[day] = distortions.length;
  }

  const totalCount = Object.values(dayCounts).reduce((a, b) => a + b, 0);
  if (totalCount < 10) return null;

  // Find peak day
  const peakDay = Object.entries(dayCounts)
    .sort((a, b) => b[1] - a[1])[0];

  if (!peakDay || Number(peakDay[1]) < totalCount * 0.25) return null;

  const dayLabels: Record<number, string> = {
    0: 'Sundays',
    1: 'Mondays',
    2: 'Tuesdays',
    3: 'Wednesdays',
    4: 'Thursdays',
    5: 'Fridays',
    6: 'Saturdays',
  };

  const dayNum = parseInt(peakDay[0]);

  return {
    type: 'day_pattern',
    message: `${dayLabels[dayNum]} tend to be harder for your thinking patterns`,
    dayOfWeek: dayNum,
    dayName: dayLabels[dayNum],
    percentage: Math.round((Number(peakDay[1]) / totalCount) * 100),
    actionable: `Plan extra self-care or support for ${dayLabels[dayNum]}.`,
  };
}

/**
 * Analyze which topics trigger distorted thinking.
 */
function analyzeTopicTriggers(profile: ANTProfile): PatternInsight | null {
  if (profile.topicTriggers.size === 0) return null;

  const topicCounts: Record<string, number> = {};
  for (const [topic, distortions] of profile.topicTriggers.entries()) {
    topicCounts[topic] = distortions.length;
  }

  const sortedTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (sortedTopics.length === 0) return null;

  return {
    type: 'topic_triggers',
    message: `Topics that tend to trigger negative thinking: ${sortedTopics.map(([t]) => t).join(', ')}`,
    topics: sortedTopics.map(([t, c]) => ({ topic: t, count: c })),
    actionable: 'These are areas where your inner critic gets louder. Extra self-compassion here.',
  };
}

/**
 * Analyze emotional correlations.
 */
function analyzeEmotionCorrelations(profile: ANTProfile): PatternInsight | null {
  if (profile.emotionCorrelations.size === 0) return null;

  const emotionCounts: Record<string, number> = {};
  for (const [emotion, distortions] of profile.emotionCorrelations.entries()) {
    emotionCounts[emotion] = distortions.length;
  }

  const sortedEmotions = Object.entries(emotionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  if (sortedEmotions.length === 0) return null;

  return {
    type: 'emotion_correlation',
    message: `When you're feeling ${sortedEmotions.map(([e]) => e).join(' or ')}, distorted thinking is more likely`,
    emotions: sortedEmotions.map(([e, c]) => ({ emotion: e, count: c })),
    actionable: 'These emotions are signals to slow down and question your thoughts.',
  };
}

/**
 * Calculate the overall trend in distortion frequency.
 */
function calculateTrend(instances: ANTInstance[]): PatternInsight | null {
  if (instances.length < 10) return null;

  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

  const thisWeek = instances.filter((i) => i.timestamp.getTime() > oneWeekAgo);
  const lastWeek = instances.filter(
    (i) => i.timestamp.getTime() > twoWeeksAgo && i.timestamp.getTime() <= oneWeekAgo
  );

  if (lastWeek.length === 0) return null;

  const change = ((thisWeek.length - lastWeek.length) / lastWeek.length) * 100;

  let trend: 'improving' | 'stable' | 'declining';
  let message: string;
  let actionable: string;

  if (change <= -20) {
    trend = 'improving';
    message = `Your negative thought patterns have decreased by ${Math.abs(Math.round(change))}% this week!`;
    actionable = 'Keep doing what you\'re doing. The work is paying off.';
  } else if (change >= 20) {
    trend = 'declining';
    message = `Your negative thought patterns have increased ${Math.round(change)}% this week`;
    actionable = 'Be extra gentle with yourself. Consider what\'s been weighing on you.';
  } else {
    trend = 'stable';
    message = 'Your thought patterns have been relatively stable this week';
    actionable = 'Consistency is good. Keep building awareness.';
  }

  return {
    type: 'trend',
    trend,
    message,
    changePercent: Math.round(change),
    actionable,
  };
}

/**
 * Format a list of distortions for display.
 */
function formatDistortionList(distortions: CognitiveDistortion[]): string {
  const labels: Record<CognitiveDistortion, string> = {
    catastrophizing: 'catastrophizing',
    mind_reading: 'mind reading',
    all_or_nothing: 'all-or-nothing thinking',
    fortune_telling: 'fortune telling',
    personalization: 'personalization',
    overgeneralization: 'overgeneralization',
    mental_filtering: 'mental filtering',
    disqualifying_positive: 'disqualifying positives',
    should_statements: '"should" statements',
    emotional_reasoning: 'emotional reasoning',
    labeling: 'labeling',
    magnification: 'magnification',
    minimization: 'minimization',
    jumping_to_conclusions: 'jumping to conclusions',
    blame: 'blame',
  };

  return distortions.map((d) => labels[d] || d).join(', ');
}

// ============================================================================
// PROFILE ACCESS
// ============================================================================

/**
 * Get the ANT profile for a user.
 */
export function getANTProfile(userId: string): ANTProfile | null {
  return profiles.get(userId) || null;
}

/**
 * Get recent ANT instances for a user.
 */
export function getRecentANTs(userId: string, limit: number = 20): ANTInstance[] {
  const instances = antInstances.get(userId) || [];
  return instances.slice(-limit);
}

/**
 * Get ANT count for a specific distortion type.
 */
export function getDistortionCount(userId: string, type: CognitiveDistortion): number {
  const profile = profiles.get(userId);
  return profile?.byDistortion.get(type) || 0;
}

/**
 * Clear ANT data for a user (for privacy/reset).
 */
export function clearANTData(userId: string): void {
  profiles.delete(userId);
  antInstances.delete(userId);
  log.info({ userId }, '🗑️ ANT data cleared');
}

// ============================================================================
// TYPES
// ============================================================================

export interface ANTPatternAnalysis {
  hasEnoughData: boolean;
  insights: PatternInsight[];
  profile?: {
    totalDetected: number;
    topDistortions: CognitiveDistortion[];
    reframeSuccessRate: number;
    trend: 'improving' | 'stable' | 'declining';
  };
}

export interface PatternInsight {
  type:
    | 'top_distortions'
    | 'time_pattern'
    | 'day_pattern'
    | 'topic_triggers'
    | 'emotion_correlation'
    | 'trend';

  message: string;
  actionable: string;

  // Type-specific fields
  distortions?: CognitiveDistortion[];
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek?: number;
  dayName?: string;
  percentage?: number;
  topics?: Array<{ topic: string; count: number }>;
  emotions?: Array<{ emotion: string; count: number }>;
  trend?: 'improving' | 'stable' | 'declining';
  changePercent?: number;
}

