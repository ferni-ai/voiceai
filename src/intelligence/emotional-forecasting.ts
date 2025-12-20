/**
 * Emotional Forecasting Service
 *
 * > "Tomorrow might be hard. Let's talk about it tonight."
 *
 * Predicts emotional state 24-48 hours ahead by combining:
 * - Upcoming difficult dates (anniversaries, deadlines)
 * - Sleep trends (from biometrics)
 * - Conversation weight trends
 * - Calendar stress indicators
 * - Historical temporal patterns
 *
 * This enables PROACTIVE support before users reach crisis.
 *
 * @module @ferni/emotional-forecasting
 */

import { createLogger } from '../utils/safe-logger.js';
import type { UserProfile, LifeEvent } from '../types/user-profile.js';

const log = createLogger({ module: 'EmotionalForecasting' });

// ============================================================================
// TYPES
// ============================================================================

export type ForecastPeriod = '24h' | '48h' | '1week';

export type PredictedState = 'vulnerable' | 'stable' | 'elevated' | 'unknown';

export type ProactiveApproach =
  | 'check_in' // Light touch
  | 'gentle_support' // More intentional
  | 'celebration' // Positive anticipation
  | 'grounding' // Help them prepare
  | 'none'; // No action needed

export interface ContributingFactor {
  type:
    | 'upcoming_event'
    | 'sleep_trend'
    | 'conversation_trend'
    | 'calendar_stress'
    | 'temporal_pattern'
    | 'biometric_trend';
  description: string;
  weight: number; // 0-1 impact on prediction
  evidence?: string;
}

export interface ProactiveAction {
  shouldReachOut: boolean;
  optimalTiming?: Date;
  approach: ProactiveApproach;
  suggestedOpener?: string;
  reason: string;
}

export interface EmotionalForecast {
  userId: string;
  period: ForecastPeriod;
  generatedAt: Date;

  prediction: {
    likelyState: PredictedState;
    confidence: number; // 0-1
    contributingFactors: ContributingFactor[];
  };

  proactiveActions: ProactiveAction;

  signals: {
    upcomingEvents: UpcomingEventSignal[];
    sleepTrend: 'declining' | 'stable' | 'improving' | 'unknown';
    conversationTrend: 'heavier' | 'stable' | 'lighter' | 'unknown';
    engagementTrend: 'less' | 'same' | 'more' | 'unknown';
    biometricTrend?: BiometricTrendSignal;
  };
}

export interface UpcomingEventSignal {
  type: 'anniversary' | 'deadline' | 'milestone' | 'difficult_date' | 'celebration';
  description: string;
  date: Date;
  sentiment: 'positive' | 'neutral' | 'difficult' | 'mixed';
  emotionalWeight: number; // 0-1
}

export interface BiometricTrendSignal {
  hrvTrend: 'declining' | 'stable' | 'improving';
  sleepQualityTrend: 'declining' | 'stable' | 'improving';
  activityTrend: 'declining' | 'stable' | 'improving';
  stressAccumulating: boolean;
}

// ============================================================================
// STATE
// ============================================================================

interface UserForecastState {
  lastForecast?: EmotionalForecast;
  lastForecastTime?: Date;
  conversationWeights: Array<{ date: Date; weight: number }>;
  sessionDurations: Array<{ date: Date; durationMinutes: number }>;
  emotionalTones: Array<{ date: Date; tone: 'heavy' | 'light' | 'neutral' }>;
  difficultDates: DifficultDate[];
}

interface DifficultDate {
  date: Date; // Month and day (year is ignored)
  type: 'anniversary' | 'loss' | 'breakup' | 'difficult_milestone';
  description: string;
  firstMentioned: Date;
  significanceLevel: number; // 0-1
}

const userForecasts = new Map<string, UserForecastState>();

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

function getOrCreateState(userId: string): UserForecastState {
  let state = userForecasts.get(userId);
  if (!state) {
    state = {
      conversationWeights: [],
      sessionDurations: [],
      emotionalTones: [],
      difficultDates: [],
    };
    userForecasts.set(userId, state);
  }
  return state;
}

// ============================================================================
// DATA RECORDING
// ============================================================================

/**
 * Record a conversation's emotional weight (call after each session)
 */
export function recordConversationWeight(
  userId: string,
  weight: number,
  tone: 'heavy' | 'light' | 'neutral'
): void {
  const state = getOrCreateState(userId);
  const now = new Date();

  state.conversationWeights.push({ date: now, weight });
  state.emotionalTones.push({ date: now, tone });

  // Keep last 30 days
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  state.conversationWeights = state.conversationWeights.filter((w) => w.date > thirtyDaysAgo);
  state.emotionalTones = state.emotionalTones.filter((t) => t.date > thirtyDaysAgo);

  log.debug({ userId, weight, tone }, 'Recorded conversation weight');
}

/**
 * Record session duration for engagement tracking
 */
export function recordSessionDuration(userId: string, durationMinutes: number): void {
  const state = getOrCreateState(userId);
  const now = new Date();

  state.sessionDurations.push({ date: now, durationMinutes });

  // Keep last 30 days
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  state.sessionDurations = state.sessionDurations.filter((s) => s.date > thirtyDaysAgo);
}

/**
 * Record a difficult date from conversation (e.g., "my mom's anniversary is next week")
 */
export function recordDifficultDate(
  userId: string,
  date: Date,
  type: DifficultDate['type'],
  description: string,
  significanceLevel = 0.7
): void {
  const state = getOrCreateState(userId);

  // Check if we already have this date
  const monthDay = `${date.getMonth()}-${date.getDate()}`;
  const existing = state.difficultDates.find((d) => {
    const existingMonthDay = `${d.date.getMonth()}-${d.date.getDate()}`;
    return existingMonthDay === monthDay;
  });

  if (existing) {
    // Update significance if mentioned again
    existing.significanceLevel = Math.min(1, existing.significanceLevel + 0.1);
    existing.description = description; // Update description
  } else {
    state.difficultDates.push({
      date,
      type,
      description,
      firstMentioned: new Date(),
      significanceLevel,
    });
  }

  log.info({ userId, date: monthDay, type }, 'Recorded difficult date');
}

// ============================================================================
// TREND CALCULATION
// ============================================================================

function calculateConversationTrend(
  state: UserForecastState
): 'heavier' | 'stable' | 'lighter' | 'unknown' {
  const recentWeights = state.conversationWeights.slice(-7);
  const olderWeights = state.conversationWeights.slice(-14, -7);

  if (recentWeights.length < 3 || olderWeights.length < 3) {
    return 'unknown';
  }

  const recentAvg = recentWeights.reduce((sum, w) => sum + w.weight, 0) / recentWeights.length;
  const olderAvg = olderWeights.reduce((sum, w) => sum + w.weight, 0) / olderWeights.length;

  const diff = recentAvg - olderAvg;

  if (diff > 0.15) return 'heavier';
  if (diff < -0.15) return 'lighter';
  return 'stable';
}

function calculateEngagementTrend(state: UserForecastState): 'less' | 'same' | 'more' | 'unknown' {
  const recentSessions = state.sessionDurations.slice(-7);
  const olderSessions = state.sessionDurations.slice(-14, -7);

  if (recentSessions.length < 2 || olderSessions.length < 2) {
    return 'unknown';
  }

  // Compare both frequency and duration
  const recentFrequency = recentSessions.length;
  const olderFrequency = olderSessions.length;

  const recentAvgDuration =
    recentSessions.reduce((sum, s) => sum + s.durationMinutes, 0) / recentSessions.length;
  const olderAvgDuration =
    olderSessions.reduce((sum, s) => sum + s.durationMinutes, 0) / olderSessions.length;

  // Score based on both factors
  const frequencyChange = (recentFrequency - olderFrequency) / Math.max(olderFrequency, 1);
  const durationChange = (recentAvgDuration - olderAvgDuration) / Math.max(olderAvgDuration, 1);

  const combinedChange = frequencyChange * 0.5 + durationChange * 0.5;

  if (combinedChange > 0.2) return 'more';
  if (combinedChange < -0.2) return 'less';
  return 'same';
}

// ============================================================================
// UPCOMING EVENT DETECTION
// ============================================================================

function getUpcomingDifficultDates(
  state: UserForecastState,
  daysAhead: number
): UpcomingEventSignal[] {
  const now = new Date();
  const upcoming: UpcomingEventSignal[] = [];

  for (const difficultDate of state.difficultDates) {
    // Create this year's and next year's version of the date
    const thisYear = new Date(
      now.getFullYear(),
      difficultDate.date.getMonth(),
      difficultDate.date.getDate()
    );
    const nextYear = new Date(
      now.getFullYear() + 1,
      difficultDate.date.getMonth(),
      difficultDate.date.getDate()
    );

    // Check which one is upcoming
    let targetDate = thisYear;
    if (thisYear < now) {
      targetDate = nextYear;
    }

    const daysUntil = Math.floor((targetDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    if (daysUntil <= daysAhead && daysUntil >= 0) {
      upcoming.push({
        type: 'difficult_date',
        description: difficultDate.description,
        date: targetDate,
        sentiment: 'difficult',
        emotionalWeight: difficultDate.significanceLevel,
      });
    }
  }

  return upcoming;
}

async function getUpcomingLifeEvents(
  userId: string,
  userProfile: UserProfile | undefined,
  daysAhead: number
): Promise<UpcomingEventSignal[]> {
  const events: UpcomingEventSignal[] = [];

  if (!userProfile?.lifeEvents) {
    return events;
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  for (const event of userProfile.lifeEvents) {
    if (!event.date) continue;

    const eventDate = event.date instanceof Date ? event.date : new Date(event.date);

    if (eventDate >= now && eventDate <= cutoff) {
      events.push({
        type: mapLifeEventType(event.type),
        description: event.title,
        date: eventDate,
        sentiment: mapEventSentiment(event),
        emotionalWeight: mapEmotionalSignificance(event.emotionalSignificance),
      });
    }
  }

  return events;
}

function mapLifeEventType(type: LifeEvent['type']): UpcomingEventSignal['type'] {
  switch (type) {
    case 'loss':
      return 'difficult_date';
    case 'wedding':
    case 'baby':
    case 'graduation':
    case 'celebration':
      return 'celebration';
    case 'milestone_birthday':
      return 'milestone';
    default:
      return 'milestone';
  }
}

function mapEventSentiment(event: LifeEvent): UpcomingEventSignal['sentiment'] {
  if (event.type === 'loss') return 'difficult';
  if (event.userSentiment === 'anxious' || event.userSentiment === 'stressed') return 'mixed';
  if (event.type === 'celebration' || event.type === 'wedding' || event.type === 'baby') {
    return 'positive';
  }
  return 'neutral';
}

function mapEmotionalSignificance(significance: LifeEvent['emotionalSignificance']): number {
  switch (significance) {
    case 'life_changing':
      return 1.0;
    case 'major':
      return 0.8;
    case 'meaningful':
      return 0.6;
    case 'routine':
    default:
      return 0.3;
  }
}

// ============================================================================
// FORECAST GENERATION
// ============================================================================

/**
 * Generate an emotional forecast for the next 24-48 hours
 */
export async function generateForecast(
  userId: string,
  userProfile?: UserProfile,
  period: ForecastPeriod = '48h'
): Promise<EmotionalForecast> {
  const state = getOrCreateState(userId);

  // Check cache (don't regenerate within 6 hours)
  if (
    state.lastForecast &&
    state.lastForecastTime &&
    Date.now() - state.lastForecastTime.getTime() < 6 * 60 * 60 * 1000
  ) {
    return state.lastForecast;
  }

  const daysAhead = period === '24h' ? 1 : period === '48h' ? 2 : 7;

  // Gather signals
  const difficultDates = getUpcomingDifficultDates(state, daysAhead);
  const lifeEvents = await getUpcomingLifeEvents(userId, userProfile, daysAhead);
  const upcomingEvents = [...difficultDates, ...lifeEvents];

  const conversationTrend = calculateConversationTrend(state);
  const engagementTrend = calculateEngagementTrend(state);

  // Build contributing factors
  const contributingFactors: ContributingFactor[] = [];

  // Factor 1: Upcoming difficult dates
  for (const event of upcomingEvents) {
    if (event.sentiment === 'difficult') {
      contributingFactors.push({
        type: 'upcoming_event',
        description: `${event.description} coming up`,
        weight: event.emotionalWeight,
        evidence: `Scheduled for ${event.date.toLocaleDateString()}`,
      });
    }
  }

  // Factor 2: Conversation trend
  if (conversationTrend === 'heavier') {
    contributingFactors.push({
      type: 'conversation_trend',
      description: 'Recent conversations have been emotionally heavier',
      weight: 0.6,
      evidence: 'Based on last 7 days vs previous week',
    });
  }

  // Factor 3: Engagement trend
  if (engagementTrend === 'less') {
    contributingFactors.push({
      type: 'temporal_pattern',
      description: 'Engagement has been lower recently',
      weight: 0.4,
      evidence: 'Fewer or shorter sessions than usual',
    });
  }

  // Calculate predicted state
  const { likelyState, confidence } = calculatePredictedState(contributingFactors, upcomingEvents);

  // Determine proactive action
  const proactiveActions = determineProactiveAction(likelyState, confidence, contributingFactors);

  const forecast: EmotionalForecast = {
    userId,
    period,
    generatedAt: new Date(),
    prediction: {
      likelyState,
      confidence,
      contributingFactors,
    },
    proactiveActions,
    signals: {
      upcomingEvents,
      sleepTrend: 'unknown', // Would come from biometrics
      conversationTrend,
      engagementTrend,
    },
  };

  // Cache
  state.lastForecast = forecast;
  state.lastForecastTime = new Date();

  log.info(
    {
      userId,
      likelyState,
      confidence: confidence.toFixed(2),
      shouldReachOut: proactiveActions.shouldReachOut,
    },
    '🔮 Emotional forecast generated'
  );

  return forecast;
}

function calculatePredictedState(
  factors: ContributingFactor[],
  upcomingEvents: UpcomingEventSignal[]
): { likelyState: PredictedState; confidence: number } {
  if (factors.length === 0) {
    return { likelyState: 'stable', confidence: 0.5 };
  }

  // Calculate weighted vulnerability score
  let vulnerabilityScore = 0;
  let totalWeight = 0;

  for (const factor of factors) {
    vulnerabilityScore += factor.weight;
    totalWeight += 1;
  }

  // Check for positive events
  const positiveEvents = upcomingEvents.filter((e) => e.sentiment === 'positive');
  const difficultEvents = upcomingEvents.filter((e) => e.sentiment === 'difficult');

  // Adjust score
  if (positiveEvents.length > 0 && difficultEvents.length === 0) {
    return {
      likelyState: 'elevated',
      confidence: 0.6 + positiveEvents.length * 0.1,
    };
  }

  const avgVulnerability = vulnerabilityScore / Math.max(totalWeight, 1);

  if (avgVulnerability > 0.6) {
    return { likelyState: 'vulnerable', confidence: Math.min(0.9, 0.5 + avgVulnerability * 0.4) };
  } else if (avgVulnerability > 0.3) {
    return { likelyState: 'stable', confidence: 0.6 };
  } else {
    return { likelyState: 'stable', confidence: 0.7 };
  }
}

function determineProactiveAction(
  likelyState: PredictedState,
  confidence: number,
  factors: ContributingFactor[]
): ProactiveAction {
  // Don't reach out if we're not confident
  if (confidence < 0.5) {
    return {
      shouldReachOut: false,
      approach: 'none',
      reason: 'Not enough confidence in prediction',
    };
  }

  // Vulnerable state - offer support
  if (likelyState === 'vulnerable') {
    const eventFactor = factors.find((f) => f.type === 'upcoming_event');
    const opener = eventFactor
      ? `I was thinking about you - ${eventFactor.description.toLowerCase()}. Just wanted you to know I'm here.`
      : 'Just checking in. How are you really doing?';

    // Calculate optimal timing (evening before if we know a specific date)
    let optimalTiming: Date | undefined;
    if (eventFactor?.evidence) {
      // Parse date from evidence if possible
      const dateMatch = eventFactor.evidence.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (dateMatch) {
        const eventDate = new Date(dateMatch[1]);
        // Day before, evening
        optimalTiming = new Date(eventDate.getTime() - 18 * 60 * 60 * 1000);
      }
    }

    return {
      shouldReachOut: true,
      optimalTiming,
      approach: 'gentle_support',
      suggestedOpener: opener,
      reason: `Predicted vulnerability (${confidence.toFixed(0)}% confidence)`,
    };
  }

  // Elevated state - celebrate
  if (likelyState === 'elevated') {
    return {
      shouldReachOut: true,
      approach: 'celebration',
      suggestedOpener: "Something good coming up? I'd love to hear about it!",
      reason: 'Positive events detected',
    };
  }

  // Stable - light check-in only if engagement declining
  const engagementDecline = factors.find(
    (f) => f.type === 'temporal_pattern' && f.description.includes('lower')
  );

  if (engagementDecline) {
    return {
      shouldReachOut: true,
      approach: 'check_in',
      suggestedOpener: "Hey! Haven't heard from you in a bit. Everything okay?",
      reason: 'Engagement declining',
    };
  }

  return {
    shouldReachOut: false,
    approach: 'none',
    reason: 'No action needed - stable state',
  };
}

// ============================================================================
// INTEGRATION WITH OUTREACH
// ============================================================================

/**
 * Get users who need proactive outreach based on forecasts
 */
export async function getUsersNeedingOutreach(): Promise<
  Array<{ userId: string; forecast: EmotionalForecast }>
> {
  const needsOutreach: Array<{ userId: string; forecast: EmotionalForecast }> = [];

  for (const [userId, state] of userForecasts) {
    if (state.lastForecast?.proactiveActions.shouldReachOut) {
      needsOutreach.push({
        userId,
        forecast: state.lastForecast,
      });
    }
  }

  return needsOutreach;
}

/**
 * Build forecast context for prompts
 */
export function buildForecastContextForPrompt(forecast: EmotionalForecast | null): string {
  if (!forecast) return '';

  const lines: string[] = ['[EMOTIONAL FORECAST]'];

  lines.push(`Predicted state: ${forecast.prediction.likelyState}`);
  lines.push(`Confidence: ${(forecast.prediction.confidence * 100).toFixed(0)}%`);

  if (forecast.prediction.contributingFactors.length > 0) {
    lines.push('');
    lines.push('Why:');
    for (const factor of forecast.prediction.contributingFactors) {
      lines.push(`- ${factor.description}`);
    }
  }

  if (forecast.signals.upcomingEvents.length > 0) {
    lines.push('');
    lines.push('Upcoming:');
    for (const event of forecast.signals.upcomingEvents) {
      const emoji =
        event.sentiment === 'difficult' ? '⚠️' : event.sentiment === 'positive' ? '🎉' : '📅';
      lines.push(`${emoji} ${event.description}`);
    }
  }

  if (forecast.proactiveActions.suggestedOpener) {
    lines.push('');
    lines.push(`Suggested approach: ${forecast.proactiveActions.suggestedOpener}`);
  }

  return lines.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  getOrCreateState as _getOrCreateState, // For testing
};
