/**
 * Sentiment Timeline
 *
 * Tracks emotional journey over time, creating a visual
 * history of mood patterns, peaks, valleys, and growth.
 *
 * Philosophy: Seeing your emotional journey helps you
 * understand yourself. Patterns become visible over time.
 *
 * Features:
 * - Daily emotional snapshots
 * - Trend detection (improving, stable, declining)
 * - Peak/valley identification
 * - Correlation with life events
 * - Exportable for therapy/coaching
 *
 * @module SentimentTimeline
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SentimentTimeline' });

// ============================================================================
// TYPES
// ============================================================================

export type EmotionCategory =
  | 'joy'
  | 'sadness'
  | 'anxiety'
  | 'anger'
  | 'fear'
  | 'surprise'
  | 'disgust'
  | 'trust'
  | 'anticipation'
  | 'neutral';

export interface EmotionalSnapshot {
  id: string;
  timestamp: Date;
  primaryEmotion: EmotionCategory;
  secondaryEmotions: EmotionCategory[];
  intensity: number; // 0-1
  valence: number; // -1 (negative) to +1 (positive)
  arousal: number; // 0-1 (calm to excited)
  context?: {
    topic?: string;
    trigger?: string;
    lifeEventId?: string;
  };
  source: 'detected' | 'self_reported' | 'voice_analysis';
}

export interface DailyMoodSummary {
  date: Date;
  avgValence: number;
  avgArousal: number;
  dominantEmotion: EmotionCategory;
  emotionDistribution: Record<EmotionCategory, number>;
  snapshotCount: number;
  notable?: string;
}

export interface TimelineTrend {
  period: 'week' | 'month' | 'quarter';
  startValence: number;
  endValence: number;
  change: number;
  direction: 'improving' | 'stable' | 'declining';
  volatility: number; // 0-1 (stable to volatile)
}

export interface EmotionalPeak {
  type: 'peak' | 'valley';
  date: Date;
  valence: number;
  emotion: EmotionCategory;
  context?: string;
  duration: number; // days
  recovery?: number; // days to return to baseline
}

export interface SentimentTimeline {
  userId: string;
  snapshots: EmotionalSnapshot[];
  dailySummaries: DailyMoodSummary[];
  trends: TimelineTrend[];
  peaks: EmotionalPeak[];
  
  // Current state
  currentMood: EmotionalSnapshot | null;
  baselineValence: number;
  baselineArousal: number;
  
  // Insights
  patterns: EmotionalPattern[];
  
  lastUpdated: Date;
}

export interface EmotionalPattern {
  id: string;
  type: 'recurring' | 'cyclical' | 'triggered' | 'growth';
  description: string;
  frequency?: string;
  trigger?: string;
  confidence: number;
}

// ============================================================================
// EMOTION MAPPINGS
// ============================================================================

const EMOTION_VALENCE: Record<EmotionCategory, number> = {
  joy: 0.8,
  trust: 0.6,
  anticipation: 0.4,
  surprise: 0.2,
  neutral: 0,
  fear: -0.4,
  sadness: -0.6,
  disgust: -0.5,
  anger: -0.7,
  anxiety: -0.5,
};

const EMOTION_AROUSAL: Record<EmotionCategory, number> = {
  surprise: 0.9,
  anger: 0.8,
  fear: 0.8,
  joy: 0.7,
  anxiety: 0.7,
  anticipation: 0.6,
  disgust: 0.5,
  sadness: 0.3,
  trust: 0.4,
  neutral: 0.3,
};

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

const timelines = new Map<string, SentimentTimeline>();

// ============================================================================
// SNAPSHOT RECORDING
// ============================================================================

/**
 * Record an emotional snapshot
 */
export function recordEmotionalSnapshot(
  userId: string,
  snapshot: Omit<EmotionalSnapshot, 'id' | 'timestamp' | 'valence' | 'arousal'>
): EmotionalSnapshot {
  const timeline = getOrCreateTimeline(userId);
  
  // Calculate valence and arousal
  const valence = calculateValence(snapshot.primaryEmotion, snapshot.intensity);
  const arousal = calculateArousal(snapshot.primaryEmotion, snapshot.intensity);
  
  const fullSnapshot: EmotionalSnapshot = {
    ...snapshot,
    id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date(),
    valence,
    arousal,
  };
  
  timeline.snapshots.push(fullSnapshot);
  timeline.currentMood = fullSnapshot;
  
  // Update daily summary
  updateDailySummary(timeline, fullSnapshot);
  
  // Update baseline if stable
  updateBaseline(timeline);
  
  // Detect peaks/valleys
  detectPeaksValleys(timeline);
  
  // Update trends
  updateTrends(timeline);
  
  // Detect patterns
  detectPatterns(timeline);
  
  timeline.lastUpdated = new Date();
  
  log.debug({
    userId,
    emotion: snapshot.primaryEmotion,
    valence,
    arousal,
  }, '💭 Emotional snapshot recorded');
  
  return fullSnapshot;
}

/**
 * Calculate valence from emotion and intensity
 */
function calculateValence(emotion: EmotionCategory, intensity: number): number {
  const base = EMOTION_VALENCE[emotion] || 0;
  return base * intensity;
}

/**
 * Calculate arousal from emotion and intensity
 */
function calculateArousal(emotion: EmotionCategory, intensity: number): number {
  const base = EMOTION_AROUSAL[emotion] || 0.3;
  return base * intensity;
}

/**
 * Update daily summary
 */
function updateDailySummary(
  timeline: SentimentTimeline,
  snapshot: EmotionalSnapshot
): void {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let summary = timeline.dailySummaries.find(
    s => s.date.getTime() === today.getTime()
  );
  
  if (!summary) {
    summary = {
      date: today,
      avgValence: 0,
      avgArousal: 0,
      dominantEmotion: 'neutral',
      emotionDistribution: {} as Record<EmotionCategory, number>,
      snapshotCount: 0,
    };
    timeline.dailySummaries.push(summary);
  }
  
  // Update averages
  const prevCount = summary.snapshotCount;
  summary.snapshotCount++;
  summary.avgValence = (summary.avgValence * prevCount + snapshot.valence) / summary.snapshotCount;
  summary.avgArousal = (summary.avgArousal * prevCount + snapshot.arousal) / summary.snapshotCount;
  
  // Update distribution
  summary.emotionDistribution[snapshot.primaryEmotion] =
    (summary.emotionDistribution[snapshot.primaryEmotion] || 0) + 1;
  
  // Find dominant emotion
  let maxCount = 0;
  for (const [emotion, count] of Object.entries(summary.emotionDistribution)) {
    if (count > maxCount) {
      maxCount = count;
      summary.dominantEmotion = emotion as EmotionCategory;
    }
  }
}

/**
 * Update baseline (rolling average of stable periods)
 */
function updateBaseline(timeline: SentimentTimeline): void {
  const recentSnapshots = timeline.snapshots.slice(-50);
  if (recentSnapshots.length < 10) return;
  
  // Calculate variance to check for stability
  const valences = recentSnapshots.map(s => s.valence);
  const avgValence = valences.reduce((a, b) => a + b, 0) / valences.length;
  const variance = valences.reduce((sum, v) => sum + Math.pow(v - avgValence, 2), 0) / valences.length;
  
  // Only update baseline if relatively stable
  if (variance < 0.2) {
    timeline.baselineValence = avgValence;
    timeline.baselineArousal = recentSnapshots.map(s => s.arousal).reduce((a, b) => a + b, 0) / recentSnapshots.length;
  }
}

/**
 * Detect peaks and valleys
 */
function detectPeaksValleys(timeline: SentimentTimeline): void {
  const summaries = timeline.dailySummaries.slice(-30);
  if (summaries.length < 7) return;
  
  const baseline = timeline.baselineValence;
  const threshold = 0.3; // Deviation from baseline
  
  // Look for significant deviations
  for (let i = 1; i < summaries.length - 1; i++) {
    const prev = summaries[i - 1].avgValence;
    const curr = summaries[i].avgValence;
    const next = summaries[i + 1].avgValence;
    
    // Local maximum (peak)
    if (curr > prev && curr > next && curr > baseline + threshold) {
      const existingPeak = timeline.peaks.find(
        p => p.date.getTime() === summaries[i].date.getTime()
      );
      
      if (!existingPeak) {
        timeline.peaks.push({
          type: 'peak',
          date: summaries[i].date,
          valence: curr,
          emotion: summaries[i].dominantEmotion,
          context: summaries[i].notable,
          duration: 1,
        });
      }
    }
    
    // Local minimum (valley)
    if (curr < prev && curr < next && curr < baseline - threshold) {
      const existingValley = timeline.peaks.find(
        p => p.date.getTime() === summaries[i].date.getTime()
      );
      
      if (!existingValley) {
        timeline.peaks.push({
          type: 'valley',
          date: summaries[i].date,
          valence: curr,
          emotion: summaries[i].dominantEmotion,
          context: summaries[i].notable,
          duration: 1,
        });
      }
    }
  }
  
  // Keep only last 20 peaks/valleys
  timeline.peaks = timeline.peaks.slice(-20);
}

/**
 * Update trends
 */
function updateTrends(timeline: SentimentTimeline): void {
  const periods: Array<{ name: 'week' | 'month' | 'quarter'; days: number }> = [
    { name: 'week', days: 7 },
    { name: 'month', days: 30 },
    { name: 'quarter', days: 90 },
  ];
  
  timeline.trends = [];
  
  for (const period of periods) {
    const cutoff = new Date(Date.now() - period.days * 24 * 60 * 60 * 1000);
    const periodSummaries = timeline.dailySummaries.filter(s => s.date >= cutoff);
    
    if (periodSummaries.length < 3) continue;
    
    const valences = periodSummaries.map(s => s.avgValence);
    const startValence = valences.slice(0, Math.ceil(valences.length / 3))
      .reduce((a, b) => a + b, 0) / Math.ceil(valences.length / 3);
    const endValence = valences.slice(-Math.ceil(valences.length / 3))
      .reduce((a, b) => a + b, 0) / Math.ceil(valences.length / 3);
    
    const change = endValence - startValence;
    
    // Calculate volatility
    const avgValence = valences.reduce((a, b) => a + b, 0) / valences.length;
    const variance = valences.reduce((sum, v) => sum + Math.pow(v - avgValence, 2), 0) / valences.length;
    const volatility = Math.min(1, Math.sqrt(variance) * 2);
    
    let direction: 'improving' | 'stable' | 'declining' = 'stable';
    if (change > 0.15) direction = 'improving';
    else if (change < -0.15) direction = 'declining';
    
    timeline.trends.push({
      period: period.name,
      startValence,
      endValence,
      change,
      direction,
      volatility,
    });
  }
}

/**
 * Detect emotional patterns
 */
function detectPatterns(timeline: SentimentTimeline): void {
  const patterns: EmotionalPattern[] = [];
  
  // Day of week pattern
  const dayPatterns = detectDayOfWeekPattern(timeline);
  if (dayPatterns) patterns.push(dayPatterns);
  
  // Recurring emotional triggers
  const triggerPatterns = detectTriggerPatterns(timeline);
  patterns.push(...triggerPatterns);
  
  // Growth pattern (improving baseline over time)
  const growthPattern = detectGrowthPattern(timeline);
  if (growthPattern) patterns.push(growthPattern);
  
  timeline.patterns = patterns;
}

/**
 * Detect day of week patterns
 */
function detectDayOfWeekPattern(timeline: SentimentTimeline): EmotionalPattern | null {
  const dayValences: number[][] = [[], [], [], [], [], [], []];
  
  for (const summary of timeline.dailySummaries) {
    const day = summary.date.getDay();
    dayValences[day].push(summary.avgValence);
  }
  
  const dayAvgs = dayValences.map(vals => 
    vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  );
  
  // Find significant differences
  const nonNullAvgs = dayAvgs.filter(v => v !== null) as number[];
  if (nonNullAvgs.length < 5) return null;
  
  const overall = nonNullAvgs.reduce((a, b) => a + b, 0) / nonNullAvgs.length;
  
  let worstDay = -1;
  let worstDiff = 0;
  let bestDay = -1;
  let bestDiff = 0;
  
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  
  dayAvgs.forEach((avg, i) => {
    if (avg === null) return;
    const diff = avg - overall;
    if (diff < worstDiff) {
      worstDiff = diff;
      worstDay = i;
    }
    if (diff > bestDiff) {
      bestDiff = diff;
      bestDay = i;
    }
  });
  
  if (worstDiff < -0.2 || bestDiff > 0.2) {
    const description = worstDiff < -0.2
      ? `${dayNames[worstDay]}s tend to be harder days`
      : `${dayNames[bestDay]}s tend to be your best days`;
    
    return {
      id: `pattern-dow-${Date.now()}`,
      type: 'cyclical',
      description,
      frequency: 'weekly',
      confidence: Math.min(1, Math.abs(worstDiff < -0.2 ? worstDiff : bestDiff) * 2),
    };
  }
  
  return null;
}

/**
 * Detect trigger patterns
 */
function detectTriggerPatterns(timeline: SentimentTimeline): EmotionalPattern[] {
  const patterns: EmotionalPattern[] = [];
  const triggerCounts = new Map<string, { positive: number; negative: number }>();
  
  for (const snapshot of timeline.snapshots) {
    const trigger = snapshot.context?.trigger || snapshot.context?.topic;
    if (!trigger) continue;
    
    const entry = triggerCounts.get(trigger) || { positive: 0, negative: 0 };
    if (snapshot.valence > 0.3) entry.positive++;
    else if (snapshot.valence < -0.3) entry.negative++;
    triggerCounts.set(trigger, entry);
  }
  
  for (const [trigger, counts] of triggerCounts) {
    const total = counts.positive + counts.negative;
    if (total < 3) continue;
    
    if (counts.negative > counts.positive * 2 && counts.negative >= 3) {
      patterns.push({
        id: `pattern-trigger-${trigger}-${Date.now()}`,
        type: 'triggered',
        description: `"${trigger}" often brings up difficult feelings`,
        trigger,
        confidence: Math.min(1, counts.negative / 10),
      });
    }
  }
  
  return patterns;
}

/**
 * Detect growth pattern
 */
function detectGrowthPattern(timeline: SentimentTimeline): EmotionalPattern | null {
  if (timeline.dailySummaries.length < 30) return null;
  
  const monthTrend = timeline.trends.find(t => t.period === 'month');
  const quarterTrend = timeline.trends.find(t => t.period === 'quarter');
  
  if (monthTrend?.direction === 'improving' && quarterTrend?.direction === 'improving') {
    return {
      id: `pattern-growth-${Date.now()}`,
      type: 'growth',
      description: 'Your overall emotional wellbeing has been improving',
      confidence: Math.min(1, (monthTrend.change + (quarterTrend?.change || 0)) * 2),
    };
  }
  
  return null;
}

/**
 * Get or create timeline
 */
function getOrCreateTimeline(userId: string): SentimentTimeline {
  let timeline = timelines.get(userId);
  
  if (!timeline) {
    timeline = {
      userId,
      snapshots: [],
      dailySummaries: [],
      trends: [],
      peaks: [],
      currentMood: null,
      baselineValence: 0,
      baselineArousal: 0.3,
      patterns: [],
      lastUpdated: new Date(),
    };
    timelines.set(userId, timeline);
  }
  
  return timeline;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get timeline
 */
export function getTimeline(userId: string): SentimentTimeline | null {
  return timelines.get(userId) || null;
}

/**
 * Get current mood context
 */
export function getCurrentMoodContext(userId: string): string | null {
  const timeline = timelines.get(userId);
  if (!timeline?.currentMood) return null;
  
  const mood = timeline.currentMood;
  const deviation = mood.valence - timeline.baselineValence;
  
  const parts: string[] = [];
  
  // Current state
  parts.push(`Current: ${mood.primaryEmotion}`);
  
  // Deviation from baseline
  if (Math.abs(deviation) > 0.2) {
    parts.push(deviation > 0 ? 'above baseline' : 'below baseline');
  }
  
  // Recent trend
  const weekTrend = timeline.trends.find(t => t.period === 'week');
  if (weekTrend) {
    parts.push(`week: ${weekTrend.direction}`);
  }
  
  return parts.join(' • ');
}

/**
 * Get recent peaks and valleys
 */
export function getRecentPeaksValleys(
  userId: string,
  limit = 5
): EmotionalPeak[] {
  const timeline = timelines.get(userId);
  if (!timeline) return [];
  
  return timeline.peaks.slice(-limit);
}

/**
 * Get patterns for sharing
 */
export function getInsightfulPatterns(userId: string): EmotionalPattern[] {
  const timeline = timelines.get(userId);
  if (!timeline) return [];
  
  return timeline.patterns.filter(p => p.confidence > 0.5);
}

/**
 * Export timeline for therapy/coaching
 */
export function exportTimelineData(
  userId: string,
  period: 'week' | 'month' | 'quarter' | 'all' = 'month'
): {
  summaries: DailyMoodSummary[];
  trends: TimelineTrend[];
  peaks: EmotionalPeak[];
  patterns: EmotionalPattern[];
} | null {
  const timeline = timelines.get(userId);
  if (!timeline) return null;
  
  const periodDays = {
    week: 7,
    month: 30,
    quarter: 90,
    all: 365 * 10,
  };
  
  const cutoff = new Date(Date.now() - periodDays[period] * 24 * 60 * 60 * 1000);
  
  return {
    summaries: timeline.dailySummaries.filter(s => s.date >= cutoff),
    trends: timeline.trends,
    peaks: timeline.peaks.filter(p => p.date >= cutoff),
    patterns: timeline.patterns,
  };
}

/**
 * Generate timeline summary for context injection
 */
export function generateTimelineSummary(userId: string): string | null {
  const timeline = timelines.get(userId);
  if (!timeline || timeline.dailySummaries.length < 7) return null;
  
  const sections: string[] = [];
  
  sections.push('[EMOTIONAL CONTEXT]');
  
  // Current state
  if (timeline.currentMood) {
    sections.push(`Current mood: ${timeline.currentMood.primaryEmotion}`);
  }
  
  // Trends
  for (const trend of timeline.trends) {
    sections.push(`${trend.period}: ${trend.direction}${trend.volatility > 0.5 ? ' (volatile)' : ''}`);
  }
  
  // Patterns
  for (const pattern of timeline.patterns.filter(p => p.confidence > 0.6)) {
    sections.push(`Pattern: ${pattern.description}`);
  }
  
  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  recordEmotionalSnapshot,
  getTimeline,
  getCurrentMoodContext,
  getRecentPeaksValleys,
  getInsightfulPatterns,
  exportTimelineData,
  generateTimelineSummary,
};

