/**
 * Wellbeing Tracker
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Core system for tracking wellbeing continuously through conversation.
 * Unlike clinical assessments, this system:
 * - Gathers data naturally through conversation
 * - Builds personalized baselines
 * - Detects changes from YOUR normal, not population averages
 * - Shows progress in meaningful ways
 *
 * @module WellbeingTracking/Tracker
 */

import { createLogger } from '../../utils/safe-logger.js';
import type {
  WellbeingSnapshot,
  WellbeingProfile,
  WellbeingDimension,
  WellbeingDimensions,
  WellbeingSignal,
  WellbeingTrend,
  WellbeingAlert,
  AlertType,
  ALL_DIMENSIONS,
} from './types.js';

const log = createLogger({ module: 'WellbeingTracker' });

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

/** User profiles */
const profiles = new Map<string, WellbeingProfile>();

/** User snapshots (limited to last 100 per user) */
const snapshots = new Map<string, WellbeingSnapshot[]>();

// ============================================================================
// SIGNAL DETECTION PATTERNS
// ============================================================================

/**
 * Patterns for detecting wellbeing signals from text.
 */
const DETECTION_PATTERNS: Record<WellbeingDimension, {
  positive: Array<{ pattern: RegExp; value: number; confidence: number }>;
  negative: Array<{ pattern: RegExp; value: number; confidence: number }>;
}> = {
  mood: {
    positive: [
      { pattern: /\b(great|amazing|wonderful|fantastic|excellent)\b/i, value: 0.9, confidence: 0.7 },
      { pattern: /\b(good|happy|pleased|content|fine)\b/i, value: 0.7, confidence: 0.6 },
      { pattern: /\b(okay|alright|decent|not bad)\b/i, value: 0.5, confidence: 0.5 },
    ],
    negative: [
      { pattern: /\b(terrible|awful|horrible|miserable|devastated)\b/i, value: -0.9, confidence: 0.7 },
      { pattern: /\b(bad|sad|down|low|unhappy|depressed)\b/i, value: -0.7, confidence: 0.6 },
      { pattern: /\b(meh|blah|not great|could be better)\b/i, value: -0.3, confidence: 0.5 },
    ],
  },

  energy: {
    positive: [
      { pattern: /\b(energized|energetic|pumped|wired|ready to go)\b/i, value: 0.9, confidence: 0.7 },
      { pattern: /\b(good energy|feeling strong|rested)\b/i, value: 0.7, confidence: 0.6 },
    ],
    negative: [
      { pattern: /\b(exhausted|drained|wiped out|burnt out|depleted)\b/i, value: 0.1, confidence: 0.7 },
      { pattern: /\b(tired|fatigued|low energy|sluggish)\b/i, value: 0.3, confidence: 0.6 },
      { pattern: /\b(a bit tired|kind of tired)\b/i, value: 0.4, confidence: 0.5 },
    ],
  },

  motivation: {
    positive: [
      { pattern: /\b(motivated|driven|inspired|excited to)\b/i, value: 0.9, confidence: 0.7 },
      { pattern: /\b(want to|looking forward|can't wait)\b/i, value: 0.7, confidence: 0.6 },
    ],
    negative: [
      { pattern: /\b(no motivation|can't be bothered|don't care|what's the point)\b/i, value: 0.1, confidence: 0.7 },
      { pattern: /\b(unmotivated|not feeling it|hard to get started)\b/i, value: 0.3, confidence: 0.6 },
      { pattern: /\b(just going through the motions)\b/i, value: 0.2, confidence: 0.6 },
    ],
  },

  worry: {
    positive: [
      { pattern: /\b(calm|peaceful|relaxed|at ease|not worried)\b/i, value: 0.1, confidence: 0.6 },
    ],
    negative: [
      { pattern: /\b(terrified|panicking|freaking out|can't stop worrying)\b/i, value: 0.9, confidence: 0.7 },
      { pattern: /\b(anxious|worried|stressed|nervous|on edge)\b/i, value: 0.7, confidence: 0.6 },
      { pattern: /\b(a little worried|kind of anxious|slightly stressed)\b/i, value: 0.4, confidence: 0.5 },
    ],
  },

  sleepQuality: {
    positive: [
      { pattern: /\b(slept great|slept well|good sleep|rested|8 hours)\b/i, value: 0.9, confidence: 0.7 },
      { pattern: /\b(decent sleep|okay sleep|fine sleep)\b/i, value: 0.6, confidence: 0.5 },
    ],
    negative: [
      { pattern: /\b(insomnia|didn't sleep|can't sleep|no sleep)\b/i, value: 0.1, confidence: 0.7 },
      { pattern: /\b(slept badly|terrible sleep|restless|tossed and turned)\b/i, value: 0.2, confidence: 0.6 },
      { pattern: /\b(not enough sleep|only.*hours|woke up tired)\b/i, value: 0.3, confidence: 0.5 },
    ],
  },

  loneliness: {
    positive: [
      { pattern: /\b(connected|supported|loved|surrounded by|good friends)\b/i, value: 0.1, confidence: 0.6 },
    ],
    negative: [
      { pattern: /\b(completely alone|no one|nobody understands|isolated)\b/i, value: 0.9, confidence: 0.7 },
      { pattern: /\b(lonely|alone|disconnected|no friends)\b/i, value: 0.7, confidence: 0.6 },
      { pattern: /\b(haven't seen anyone|been by myself)\b/i, value: 0.5, confidence: 0.5 },
    ],
  },

  hopefulness: {
    positive: [
      { pattern: /\b(hopeful|optimistic|things will get better|looking up)\b/i, value: 0.8, confidence: 0.7 },
      { pattern: /\b(excited for the future|good things coming)\b/i, value: 0.9, confidence: 0.6 },
    ],
    negative: [
      { pattern: /\b(hopeless|no point|what's the point|never get better)\b/i, value: 0.1, confidence: 0.8 },
      { pattern: /\b(pessimistic|don't see a way|stuck forever)\b/i, value: 0.2, confidence: 0.7 },
      { pattern: /\b(hard to see|don't know if)\b/i, value: 0.4, confidence: 0.5 },
    ],
  },

  // Simplified patterns for remaining dimensions
  moodStability: { positive: [], negative: [] },
  physicalTension: {
    positive: [
      { pattern: /\b(relaxed|loose|calm body)\b/i, value: 0.1, confidence: 0.6 },
    ],
    negative: [
      { pattern: /\b(tense|tight|clenched|headache|body aches)\b/i, value: 0.7, confidence: 0.6 },
    ],
  },
  socialSatisfaction: { positive: [], negative: [] },
  meaningfulness: {
    positive: [
      { pattern: /\b(meaningful|purpose|matters|making a difference)\b/i, value: 0.8, confidence: 0.6 },
    ],
    negative: [
      { pattern: /\b(pointless|meaningless|empty|going through motions)\b/i, value: 0.2, confidence: 0.6 },
    ],
  },
  selfCareLevel: {
    positive: [
      { pattern: /\b(taking care of myself|self-care|exercise|eating well)\b/i, value: 0.8, confidence: 0.6 },
    ],
    negative: [
      { pattern: /\b(neglecting|not taking care|skipping meals|not exercising)\b/i, value: 0.2, confidence: 0.6 },
    ],
  },
};

// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================

/**
 * Get or create a wellbeing profile for a user.
 */
function getOrCreateProfile(userId: string): WellbeingProfile {
  let profile = profiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      current: null,
      recentAverage: {},
      personalBaseline: {},
      baselineConfidence: 0,
      baselineSnapshots: 0,
      weeklyTrend: createEmptyTrend('week'),
      monthlyTrend: createEmptyTrend('month'),
      temporalPatterns: [],
      triggerPatterns: [],
      alerts: [],
      createdAt: new Date(),
      lastUpdated: new Date(),
      totalSnapshots: 0,
    };
    profiles.set(userId, profile);
  }
  return profile;
}

/**
 * Create an empty trend object.
 */
function createEmptyTrend(period: 'week' | 'month' | 'quarter'): WellbeingTrend {
  return {
    period,
    direction: 'stable',
    magnitude: 0,
    confidence: 0,
    byDimension: {},
    observations: [],
  };
}

// ============================================================================
// SIGNAL DETECTION
// ============================================================================

/**
 * Detect wellbeing signals from user text.
 */
export function detectWellbeingSignals(
  message: string,
  context?: {
    topic?: string;
    emotion?: string;
    emotionIntensity?: number;
  }
): WellbeingSignal[] {
  const signals: WellbeingSignal[] = [];
  const lowerMessage = message.toLowerCase();

  // Check each dimension's patterns
  for (const [dimension, patterns] of Object.entries(DETECTION_PATTERNS)) {
    const dim = dimension as WellbeingDimension;

    // Check positive patterns
    for (const { pattern, value, confidence } of patterns.positive) {
      if (pattern.test(lowerMessage)) {
        signals.push({
          dimension: dim,
          signal: pattern.source,
          value,
          confidence,
          source: 'text',
        });
      }
    }

    // Check negative patterns
    for (const { pattern, value, confidence } of patterns.negative) {
      if (pattern.test(lowerMessage)) {
        signals.push({
          dimension: dim,
          signal: pattern.source,
          value,
          confidence,
          source: 'text',
        });
      }
    }
  }

  // Enhance from emotion context
  if (context?.emotion && context?.emotionIntensity) {
    const emotionSignal = mapEmotionToWellbeing(context.emotion, context.emotionIntensity);
    if (emotionSignal) {
      signals.push(emotionSignal);
    }
  }

  return signals;
}

/**
 * Map detected emotion to wellbeing signal.
 */
function mapEmotionToWellbeing(
  emotion: string,
  intensity: number
): WellbeingSignal | null {
  const emotionMappings: Record<string, { dimension: WellbeingDimension; direction: 'positive' | 'negative' }> = {
    joy: { dimension: 'mood', direction: 'positive' },
    happy: { dimension: 'mood', direction: 'positive' },
    excited: { dimension: 'energy', direction: 'positive' },
    sad: { dimension: 'mood', direction: 'negative' },
    depressed: { dimension: 'mood', direction: 'negative' },
    anxious: { dimension: 'worry', direction: 'negative' },
    worried: { dimension: 'worry', direction: 'negative' },
    stressed: { dimension: 'worry', direction: 'negative' },
    tired: { dimension: 'energy', direction: 'negative' },
    exhausted: { dimension: 'energy', direction: 'negative' },
    lonely: { dimension: 'loneliness', direction: 'negative' },
    hopeless: { dimension: 'hopefulness', direction: 'negative' },
  };

  const mapping = emotionMappings[emotion.toLowerCase()];
  if (!mapping) return null;

  const value = mapping.direction === 'positive'
    ? 0.5 + (intensity * 0.5)
    : mapping.dimension === 'worry' || mapping.dimension === 'loneliness'
      ? intensity
      : 0.5 - (intensity * 0.5);

  return {
    dimension: mapping.dimension,
    signal: `emotion:${emotion}`,
    value,
    confidence: intensity * 0.7,
    source: 'pattern',
  };
}

// ============================================================================
// SNAPSHOT RECORDING
// ============================================================================

/**
 * Record a wellbeing snapshot from detected signals.
 */
export function recordSnapshot(
  userId: string,
  signals: WellbeingSignal[],
  source: WellbeingSnapshot['source'] = 'detected',
  context?: {
    topic?: string;
    emotion?: string;
    turnCount?: number;
  }
): WellbeingSnapshot | null {
  if (signals.length === 0) return null;

  const profile = getOrCreateProfile(userId);

  // Aggregate signals into dimensions
  const dimensions: Partial<WellbeingDimensions> = {};
  const confidence: Partial<Record<WellbeingDimension, number>> = {};

  for (const signal of signals) {
    // Use highest confidence signal per dimension
    if (!confidence[signal.dimension] || signal.confidence > confidence[signal.dimension]!) {
      dimensions[signal.dimension] = signal.value;
      confidence[signal.dimension] = signal.confidence;
    }
  }

  // Create snapshot
  const snapshot: WellbeingSnapshot = {
    id: `snapshot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId,
    timestamp: new Date(),
    source,
    dimensions,
    confidence,
    signals,
    context,
  };

  // Store snapshot
  const userSnapshots = snapshots.get(userId) || [];
  userSnapshots.push(snapshot);

  // Keep only last 100
  if (userSnapshots.length > 100) {
    userSnapshots.shift();
  }
  snapshots.set(userId, userSnapshots);

  // Update profile
  profile.current = snapshot;
  profile.totalSnapshots++;
  profile.lastUpdated = new Date();

  // Update baseline if we have enough data
  updateBaseline(profile, userSnapshots);

  // Update trends
  updateTrends(profile, userSnapshots);

  // Check for alerts
  checkForAlerts(profile, snapshot);

  log.debug(
    {
      userId,
      snapshotId: snapshot.id,
      dimensionCount: Object.keys(dimensions).length,
      signalCount: signals.length,
    },
    '📊 Wellbeing snapshot recorded'
  );

  return snapshot;
}

/**
 * Update the user's personal baseline.
 */
function updateBaseline(profile: WellbeingProfile, userSnapshots: WellbeingSnapshot[]): void {
  if (userSnapshots.length < 10) return;

  // Calculate rolling average of dimensions
  const dimensionSums: Partial<Record<WellbeingDimension, { sum: number; count: number }>> = {};

  for (const snapshot of userSnapshots.slice(-30)) { // Last 30 snapshots
    for (const [dim, value] of Object.entries(snapshot.dimensions)) {
      const dimension = dim as WellbeingDimension;
      if (!dimensionSums[dimension]) {
        dimensionSums[dimension] = { sum: 0, count: 0 };
      }
      dimensionSums[dimension]!.sum += value as number;
      dimensionSums[dimension]!.count++;
    }
  }

  // Calculate averages
  for (const [dim, { sum, count }] of Object.entries(dimensionSums)) {
    profile.personalBaseline[dim as WellbeingDimension] = sum / count;
  }

  profile.baselineConfidence = Math.min(1, userSnapshots.length / 30);
  profile.baselineSnapshots = userSnapshots.length;
}

/**
 * Update weekly and monthly trends.
 */
function updateTrends(profile: WellbeingProfile, userSnapshots: WellbeingSnapshot[]): void {
  const now = new Date();

  // Weekly trend
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekSnapshots = userSnapshots.filter((s) => s.timestamp > weekAgo);
  profile.weeklyTrend = calculateTrend(weekSnapshots, 'week', profile.personalBaseline);

  // Monthly trend
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthSnapshots = userSnapshots.filter((s) => s.timestamp > monthAgo);
  profile.monthlyTrend = calculateTrend(monthSnapshots, 'month', profile.personalBaseline);
}

/**
 * Calculate trend for a set of snapshots.
 */
function calculateTrend(
  snapshots: WellbeingSnapshot[],
  period: 'week' | 'month' | 'quarter',
  baseline: Partial<WellbeingDimensions>
): WellbeingTrend {
  if (snapshots.length < 3) {
    return createEmptyTrend(period);
  }

  // Split into first and second half
  const midpoint = Math.floor(snapshots.length / 2);
  const firstHalf = snapshots.slice(0, midpoint);
  const secondHalf = snapshots.slice(midpoint);

  // Calculate average mood for each half
  const firstAvg = calculateAverageMood(firstHalf);
  const secondAvg = calculateAverageMood(secondHalf);

  const change = secondAvg - firstAvg;

  let direction: 'improving' | 'stable' | 'declining';
  if (change > 0.1) direction = 'improving';
  else if (change < -0.1) direction = 'declining';
  else direction = 'stable';

  const observations: string[] = [];

  if (direction === 'improving') {
    observations.push('Your overall wellbeing has been trending upward');
  } else if (direction === 'declining') {
    observations.push('Your wellbeing has been lower than usual');
  } else {
    observations.push('Your wellbeing has been relatively stable');
  }

  return {
    period,
    direction,
    magnitude: Math.abs(change),
    confidence: Math.min(1, snapshots.length / 10),
    byDimension: {},
    observations,
  };
}

/**
 * Calculate average mood from snapshots.
 */
function calculateAverageMood(snapshots: WellbeingSnapshot[]): number {
  let sum = 0;
  let count = 0;

  for (const snapshot of snapshots) {
    if (snapshot.dimensions.mood !== undefined) {
      sum += snapshot.dimensions.mood;
      count++;
    }
  }

  return count > 0 ? sum / count : 0.5;
}

// ============================================================================
// ALERT DETECTION
// ============================================================================

/**
 * Check for wellbeing alerts based on current snapshot.
 */
function checkForAlerts(profile: WellbeingProfile, snapshot: WellbeingSnapshot): void {
  const alerts: WellbeingAlert[] = [];

  // Check for depression risk
  if (
    snapshot.dimensions.mood !== undefined &&
    snapshot.dimensions.mood < 0 &&
    snapshot.dimensions.hopefulness !== undefined &&
    snapshot.dimensions.hopefulness < 0.3
  ) {
    alerts.push(createAlert(
      profile.userId,
      'depression_risk',
      'concern',
      'Low mood combined with low hopefulness detected',
      snapshot.signals.filter((s) => s.dimension === 'mood' || s.dimension === 'hopefulness'),
    ));
  }

  // Check for anxiety spike
  if (snapshot.dimensions.worry !== undefined && snapshot.dimensions.worry > 0.8) {
    alerts.push(createAlert(
      profile.userId,
      'anxiety_spike',
      'watch',
      'High anxiety/worry levels detected',
      snapshot.signals.filter((s) => s.dimension === 'worry'),
    ));
  }

  // Check for burnout trajectory
  if (
    snapshot.dimensions.energy !== undefined &&
    snapshot.dimensions.energy < 0.3 &&
    snapshot.dimensions.motivation !== undefined &&
    snapshot.dimensions.motivation < 0.3
  ) {
    alerts.push(createAlert(
      profile.userId,
      'burnout_trajectory',
      'concern',
      'Low energy combined with low motivation - possible burnout trajectory',
      snapshot.signals.filter((s) => s.dimension === 'energy' || s.dimension === 'motivation'),
    ));
  }

  // Check for isolation
  if (snapshot.dimensions.loneliness !== undefined && snapshot.dimensions.loneliness > 0.7) {
    alerts.push(createAlert(
      profile.userId,
      'isolation_pattern',
      'watch',
      'High loneliness/isolation indicated',
      snapshot.signals.filter((s) => s.dimension === 'loneliness'),
    ));
  }

  // Add new alerts (avoid duplicates)
  for (const alert of alerts) {
    const existing = profile.alerts.find(
      (a) => a.type === alert.type && a.status === 'active'
    );
    if (!existing) {
      profile.alerts.push(alert);
      log.warn(
        {
          userId: profile.userId,
          alertType: alert.type,
          severity: alert.severity,
        },
        '⚠️ Wellbeing alert created'
      );
    }
  }
}

/**
 * Create an alert object.
 */
function createAlert(
  userId: string,
  type: AlertType,
  severity: WellbeingAlert['severity'],
  message: string,
  signals: WellbeingSignal[]
): WellbeingAlert {
  return {
    id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    userId,
    createdAt: new Date(),
    type,
    severity,
    message,
    signals,
    recommendations: getAlertRecommendations(type, severity),
    status: 'active',
  };
}

/**
 * Get recommendations for an alert type.
 */
function getAlertRecommendations(
  type: AlertType,
  severity: WellbeingAlert['severity']
): WellbeingAlert['recommendations'] {
  const recommendations: WellbeingAlert['recommendations'] = [];

  switch (type) {
    case 'depression_risk':
      recommendations.push(
        { target: 'ferni', action: 'Increase warmth and validation', priority: 'high' },
        { target: 'user', action: 'Small wins matter - celebrate any forward movement', priority: 'medium' },
        { target: 'ferni', action: 'Gently check on basic self-care', priority: 'medium' },
      );
      if (severity === 'urgent') {
        recommendations.push(
          { target: 'professional', action: 'Consider suggesting professional support', priority: 'high' },
        );
      }
      break;

    case 'anxiety_spike':
      recommendations.push(
        { target: 'ferni', action: 'Offer grounding or breathing exercises', priority: 'high' },
        { target: 'user', action: 'Remember: this feeling will pass', priority: 'medium' },
      );
      break;

    case 'burnout_trajectory':
      recommendations.push(
        { target: 'ferni', action: 'Explore what\'s draining them', priority: 'high' },
        { target: 'user', action: 'What\'s one thing you could take off your plate?', priority: 'medium' },
      );
      break;

    case 'isolation_pattern':
      recommendations.push(
        { target: 'ferni', action: 'Be extra present and connected', priority: 'high' },
        { target: 'user', action: 'Even small connections count', priority: 'medium' },
      );
      break;

    default:
      recommendations.push(
        { target: 'ferni', action: 'Monitor and support', priority: 'medium' },
      );
  }

  return recommendations;
}

// ============================================================================
// ACCESS FUNCTIONS
// ============================================================================

/**
 * Get the wellbeing profile for a user.
 */
export function getWellbeingProfile(userId: string): WellbeingProfile | null {
  return profiles.get(userId) || null;
}

/**
 * Get recent snapshots for a user.
 */
export function getRecentSnapshots(userId: string, limit: number = 20): WellbeingSnapshot[] {
  const userSnapshots = snapshots.get(userId) || [];
  return userSnapshots.slice(-limit);
}

/**
 * Get active alerts for a user.
 */
export function getActiveAlerts(userId: string): WellbeingAlert[] {
  const profile = profiles.get(userId);
  return profile?.alerts.filter((a) => a.status === 'active') || [];
}

/**
 * Acknowledge an alert.
 */
export function acknowledgeAlert(userId: string, alertId: string): void {
  const profile = profiles.get(userId);
  if (!profile) return;

  const alert = profile.alerts.find((a) => a.id === alertId);
  if (alert) {
    alert.status = 'acknowledged';
  }
}

/**
 * Resolve an alert.
 */
export function resolveAlert(userId: string, alertId: string): void {
  const profile = profiles.get(userId);
  if (!profile) return;

  const alert = profile.alerts.find((a) => a.id === alertId);
  if (alert) {
    alert.status = 'resolved';
    alert.resolvedAt = new Date();
  }
}

/**
 * Get a summary for display.
 */
export function getWellbeingSummary(userId: string): WellbeingSummary | null {
  const profile = profiles.get(userId);
  if (!profile || profile.totalSnapshots < 3) return null;

  return {
    overallScore: calculateOverallScore(profile),
    trend: profile.weeklyTrend.direction,
    keyInsights: generateInsights(profile),
    activeAlerts: profile.alerts.filter((a) => a.status === 'active').length,
    daysTracked: calculateDaysTracked(profile),
  };
}

/**
 * Calculate overall wellbeing score.
 */
function calculateOverallScore(profile: WellbeingProfile): number {
  if (!profile.current) return 0.5;

  const weights: Partial<Record<WellbeingDimension, number>> = {
    mood: 0.25,
    energy: 0.15,
    motivation: 0.1,
    worry: -0.15, // Negative contribution
    hopefulness: 0.15,
    sleepQuality: 0.1,
    loneliness: -0.1, // Negative contribution
  };

  let score = 0.5; // Start at neutral
  let totalWeight = 0;

  for (const [dim, weight] of Object.entries(weights)) {
    const value = profile.current.dimensions[dim as WellbeingDimension];
    if (value !== undefined) {
      score += value * weight;
      totalWeight += Math.abs(weight);
    }
  }

  // Normalize to 0-1
  return Math.max(0, Math.min(1, score));
}

/**
 * Generate personalized insights.
 */
function generateInsights(profile: WellbeingProfile): string[] {
  const insights: string[] = [];

  // Trend insight
  if (profile.weeklyTrend.direction === 'improving') {
    insights.push('Your wellbeing has been improving this week 📈');
  } else if (profile.weeklyTrend.direction === 'declining') {
    insights.push('This week has been a bit harder - be gentle with yourself');
  }

  // Baseline comparison
  if (profile.current && profile.baselineConfidence > 0.5) {
    const currentMood = profile.current.dimensions.mood;
    const baselineMood = profile.personalBaseline.mood;

    if (currentMood !== undefined && baselineMood !== undefined) {
      if (currentMood > baselineMood + 0.2) {
        insights.push("You're in a better place than your typical baseline");
      } else if (currentMood < baselineMood - 0.2) {
        insights.push("You're below your usual baseline - extra self-care might help");
      }
    }
  }

  return insights;
}

/**
 * Calculate days tracked.
 */
function calculateDaysTracked(profile: WellbeingProfile): number {
  const userSnapshots = snapshots.get(profile.userId) || [];
  if (userSnapshots.length === 0) return 0;

  const first = userSnapshots[0].timestamp;
  const last = userSnapshots[userSnapshots.length - 1].timestamp;

  return Math.ceil((last.getTime() - first.getTime()) / (24 * 60 * 60 * 1000));
}

// ============================================================================
// TYPES
// ============================================================================

export interface WellbeingSummary {
  overallScore: number;
  trend: 'improving' | 'stable' | 'declining';
  keyInsights: string[];
  activeAlerts: number;
  daysTracked: number;
}

