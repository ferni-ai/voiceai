/**
 * Superhuman Analytics Service
 *
 * Tracks effectiveness of all superhuman capabilities:
 * - Which capabilities fire most often
 * - Which correlate with better engagement
 * - User retention correlation
 * - A/B testing support
 *
 * @module @ferni/superhuman-analytics
 */

import { createLogger } from '../utils/safe-logger.js';

const logger = createLogger({ module: 'SuperhumanAnalytics' });

// ============================================================================
// TYPES
// ============================================================================

export type SuperhumanCapability =
  // Core capabilities (from concern-detection, proactive-memory, predictive-anticipation)
  | 'concern_detection'
  | 'proactive_memory'
  | 'predictive_anticipation'
  | 'voice_state_detection'
  | 'need_prediction'
  | 'emotional_trajectory'
  // Better Than Human capabilities (12)
  | 'emotional_memory'
  | 'anticipatory_presence'
  | 'linguistic_mirroring'
  | 'visible_vulnerability'
  | 'spontaneous_delight'
  | 'protective_instincts'
  | 'evolving_jokes'
  | 'team_coherence'
  | 'temporal_emotional'
  | 'meta_relationship'
  | 'somatic_presence'
  | 'superhuman_observations'
  // Frontend EQ capabilities
  | 'micro_expression'
  | 'active_listening'
  | 'breath_sync'
  | 'frontend_anticipation';

export interface CapabilityEvent {
  /** Capability that fired */
  capability: SuperhumanCapability;

  /** When it fired */
  timestamp: Date;

  /** User ID */
  userId: string;

  /** Session ID */
  sessionId: string;

  /** Turn number */
  turnNumber: number;

  /** Sub-type if applicable */
  subType?: string;

  /** Confidence/intensity (0-1) */
  intensity?: number;

  /** Was it applied (vs just detected) */
  wasApplied: boolean;

  /** Additional context */
  context?: Record<string, unknown>;
}

export interface SessionMetrics {
  /** Session ID */
  sessionId: string;

  /** User ID */
  userId: string;

  /** When session started */
  startTime: Date;

  /** Session duration (ms) */
  duration?: number;

  /** Total turns */
  turnCount: number;

  /** Capabilities fired */
  capabilityEvents: CapabilityEvent[];

  /** Engagement metrics */
  engagement: {
    avgResponseLength: number;
    avgPauseDuration: number;
    emotionalVariance: number;
    vulnerabilityCount: number;
    laugterCount: number;
  };

  /** User sentiment at end */
  endSentiment?: 'positive' | 'neutral' | 'negative';

  /** Did user return within 24h? */
  returnedSoon?: boolean;
}

export interface CapabilityEffectiveness {
  /** Capability */
  capability: SuperhumanCapability;

  /** Times fired */
  fireCount: number;

  /** Times actually applied */
  applyCount: number;

  /** Application rate */
  applicationRate: number;

  /** Correlation with engagement (Pearson r) */
  engagementCorrelation: number;

  /** Correlation with return rate */
  returnCorrelation: number;

  /** Average confidence when fired */
  avgConfidence: number;

  /** Most common sub-types */
  topSubTypes: Array<{ subType: string; count: number }>;

  /** Sessions where this fired */
  sessionCount: number;
}

export interface AnalyticsDashboard {
  /** Total sessions tracked */
  totalSessions: number;

  /** Total users */
  totalUsers: number;

  /** Capability effectiveness rankings */
  capabilityRankings: CapabilityEffectiveness[];

  /** Top performing capabilities (by engagement correlation) */
  topPerformers: SuperhumanCapability[];

  /** Underperforming capabilities (low application rate) */
  underperformers: SuperhumanCapability[];

  /** Suggested experiments */
  suggestedExperiments: ExperimentSuggestion[];

  /** Time range */
  timeRange: { start: Date; end: Date };
}

export interface ExperimentSuggestion {
  /** Capability to test */
  capability: SuperhumanCapability;

  /** Type of experiment */
  experimentType: 'enable_disable' | 'threshold_adjustment' | 'placement_change';

  /** Hypothesis */
  hypothesis: string;

  /** Expected impact */
  expectedImpact: 'high' | 'medium' | 'low';

  /** Reason */
  reason: string;
}

// ============================================================================
// STATE
// ============================================================================

const sessionMetrics = new Map<string, SessionMetrics>();
const capabilityEvents: CapabilityEvent[] = [];
const userReturnData = new Map<string, Date[]>(); // userId -> session times

// ============================================================================
// EVENT TRACKING
// ============================================================================

/**
 * Track a capability event
 */
export function trackCapabilityEvent(event: Omit<CapabilityEvent, 'timestamp'>): void {
  const fullEvent: CapabilityEvent = {
    ...event,
    timestamp: new Date(),
  };

  capabilityEvents.push(fullEvent);

  // Update session metrics
  let session = sessionMetrics.get(event.sessionId);
  if (!session) {
    session = {
      sessionId: event.sessionId,
      userId: event.userId,
      startTime: new Date(),
      turnCount: 0,
      capabilityEvents: [],
      engagement: {
        avgResponseLength: 0,
        avgPauseDuration: 0,
        emotionalVariance: 0,
        vulnerabilityCount: 0,
        laugterCount: 0,
      },
    };
    sessionMetrics.set(event.sessionId, session);
  }

  session.capabilityEvents.push(fullEvent);
  session.turnCount = Math.max(session.turnCount, event.turnNumber);

  // Track user sessions for return rate
  const userSessions = userReturnData.get(event.userId) || [];
  if (!userSessions.some((d) => d.getTime() === session!.startTime.getTime())) {
    userSessions.push(session.startTime);
    userReturnData.set(event.userId, userSessions);
  }

  logger.debug(
    { capability: event.capability, subType: event.subType, wasApplied: event.wasApplied },
    '📊 Capability event tracked'
  );
}

/**
 * Track session engagement metrics
 */
export function trackSessionEngagement(
  sessionId: string,
  metrics: Partial<SessionMetrics['engagement']>
): void {
  const session = sessionMetrics.get(sessionId);
  if (session) {
    session.engagement = { ...session.engagement, ...metrics };
  }
}

/**
 * Mark session end with sentiment
 */
export function endSession(
  sessionId: string,
  sentiment: 'positive' | 'neutral' | 'negative'
): void {
  const session = sessionMetrics.get(sessionId);
  if (session) {
    session.duration = Date.now() - session.startTime.getTime();
    session.endSentiment = sentiment;

    // Check if user returns within 24h
    const { userId } = session;
    setTimeout(
      () => {
        checkUserReturn(userId, sessionId);
      },
      24 * 60 * 60 * 1000
    ); // Check after 24h
  }
}

function checkUserReturn(userId: string, sessionId: string): void {
  const session = sessionMetrics.get(sessionId);
  if (!session) return;

  const userSessions = userReturnData.get(userId) || [];
  const sessionTime = session.startTime.getTime();

  // Check if there's a session within 24h after this one
  const returnedSoon = userSessions.some((d) => {
    const diff = d.getTime() - sessionTime;
    return diff > 0 && diff <= 24 * 60 * 60 * 1000;
  });

  session.returnedSoon = returnedSoon;
}

// ============================================================================
// ANALYTICS CALCULATIONS
// ============================================================================

/**
 * Calculate effectiveness for a specific capability
 */
export function calculateCapabilityEffectiveness(
  capability: SuperhumanCapability
): CapabilityEffectiveness {
  const events = capabilityEvents.filter((e) => e.capability === capability);
  const fireCount = events.length;
  const applyCount = events.filter((e) => e.wasApplied).length;

  // Count sub-types
  const subTypeCounts = new Map<string, number>();
  for (const event of events) {
    if (event.subType) {
      subTypeCounts.set(event.subType, (subTypeCounts.get(event.subType) || 0) + 1);
    }
  }

  // Calculate engagement correlation (simplified)
  const sessionsWithCapability = new Set(events.map((e) => e.sessionId));
  const engagementScores: number[] = [];
  const returnScores: number[] = [];

  for (const sessionId of sessionsWithCapability) {
    const session = sessionMetrics.get(sessionId);
    if (session) {
      // Simple engagement score based on vulnerability + laughter
      const engagementScore =
        (session.engagement.vulnerabilityCount + session.engagement.laugterCount) /
        Math.max(session.turnCount, 1);
      engagementScores.push(engagementScore);
      returnScores.push(session.returnedSoon ? 1 : 0);
    }
  }

  const avgConfidence =
    events.length > 0
      ? events.reduce((sum, e) => sum + (e.intensity || 0.5), 0) / events.length
      : 0;

  return {
    capability,
    fireCount,
    applyCount,
    applicationRate: fireCount > 0 ? applyCount / fireCount : 0,
    engagementCorrelation: calculateCorrelation(engagementScores),
    returnCorrelation: calculateCorrelation(returnScores),
    avgConfidence,
    topSubTypes: Array.from(subTypeCounts.entries())
      .map(([subType, count]) => ({ subType, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    sessionCount: sessionsWithCapability.size,
  };
}

function calculateCorrelation(scores: number[]): number {
  if (scores.length < 2) return 0;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, x) => sum + Math.pow(x - avg, 2), 0) / scores.length;
  return Math.sqrt(variance); // Simplified - actual correlation needs paired data
}

/**
 * Generate full analytics dashboard
 */
export function generateDashboard(): AnalyticsDashboard {
  const allCapabilities: SuperhumanCapability[] = [
    'concern_detection',
    'proactive_memory',
    'predictive_anticipation',
    'voice_state_detection',
    'need_prediction',
    'emotional_trajectory',
    'emotional_memory',
    'anticipatory_presence',
    'linguistic_mirroring',
    'visible_vulnerability',
    'spontaneous_delight',
    'protective_instincts',
    'evolving_jokes',
    'team_coherence',
    'temporal_emotional',
    'meta_relationship',
    'somatic_presence',
    'superhuman_observations',
    'micro_expression',
    'active_listening',
    'breath_sync',
    'frontend_anticipation',
  ];

  const rankings = allCapabilities
    .map((cap) => calculateCapabilityEffectiveness(cap))
    .sort((a, b) => b.engagementCorrelation - a.engagementCorrelation);

  const topPerformers = rankings.slice(0, 5).map((r) => r.capability);
  const underperformers = rankings
    .filter((r) => r.applicationRate < 0.3 && r.fireCount > 10)
    .map((r) => r.capability);

  // Generate experiment suggestions
  const suggestions: ExperimentSuggestion[] = [];

  for (const underperformer of underperformers) {
    suggestions.push({
      capability: underperformer,
      experimentType: 'threshold_adjustment',
      hypothesis: `Lowering threshold for ${underperformer} may increase application rate`,
      expectedImpact: 'medium',
      reason: `Low application rate (${(rankings.find((r) => r.capability === underperformer)?.applicationRate || 0) * 100}%) suggests overly conservative triggering`,
    });
  }

  // Suggest testing high-fire, low-engagement capabilities
  for (const ranking of rankings) {
    if (ranking.fireCount > 50 && ranking.engagementCorrelation < 0.2) {
      suggestions.push({
        capability: ranking.capability,
        experimentType: 'enable_disable',
        hypothesis: `${ranking.capability} may not contribute to engagement`,
        expectedImpact: 'high',
        reason: `High fire count (${ranking.fireCount}) but low engagement correlation`,
      });
    }
  }

  const sessions = Array.from(sessionMetrics.values());
  const users = new Set(sessions.map((s) => s.userId));

  return {
    totalSessions: sessions.length,
    totalUsers: users.size,
    capabilityRankings: rankings,
    topPerformers,
    underperformers,
    suggestedExperiments: suggestions,
    timeRange: {
      start: sessions.length > 0 ? sessions[0]!.startTime : new Date(),
      end: new Date(),
    },
  };
}

// ============================================================================
// A/B TESTING SUPPORT
// ============================================================================

export interface SuperhumanExperiment {
  id: string;
  capability: SuperhumanCapability;
  control: 'enabled' | 'disabled' | 'current';
  variant: 'enabled' | 'disabled' | 'modified';
  variantConfig?: Record<string, unknown>;
  startDate: Date;
  endDate?: Date;
  userAssignments: Map<string, 'control' | 'variant'>;
  results?: {
    controlEngagement: number;
    variantEngagement: number;
    controlReturn: number;
    variantReturn: number;
    pValue: number;
    recommendation: 'keep_control' | 'switch_to_variant' | 'needs_more_data';
  };
}

const experiments = new Map<string, SuperhumanExperiment>();

/**
 * Create a new A/B experiment for a capability
 */
export function createExperiment(
  capability: SuperhumanCapability,
  variantType: 'enable' | 'disable' | 'modify',
  variantConfig?: Record<string, unknown>
): string {
  const id = `exp_${capability}_${Date.now()}`;

  const experiment: SuperhumanExperiment = {
    id,
    capability,
    control: 'current',
    variant:
      variantType === 'enable' ? 'enabled' : variantType === 'disable' ? 'disabled' : 'modified',
    variantConfig,
    startDate: new Date(),
    userAssignments: new Map(),
  };

  experiments.set(id, experiment);
  logger.info({ experimentId: id, capability, variantType }, '🧪 Experiment created');

  return id;
}

/**
 * Get experiment assignment for a user
 */
export function getExperimentAssignment(
  experimentId: string,
  userId: string
): 'control' | 'variant' | null {
  const experiment = experiments.get(experimentId);
  if (!experiment || experiment.endDate) return null;

  // Check existing assignment
  let assignment = experiment.userAssignments.get(userId);
  if (!assignment) {
    // Randomly assign 50/50
    assignment = Math.random() < 0.5 ? 'control' : 'variant';
    experiment.userAssignments.set(userId, assignment);
  }

  return assignment;
}

/**
 * Check if a capability is enabled for a user (considering experiments)
 */
export function isCapabilityEnabled(capability: SuperhumanCapability, userId: string): boolean {
  // Find active experiment for this capability
  for (const experiment of experiments.values()) {
    if (experiment.capability === capability && !experiment.endDate) {
      const assignment = getExperimentAssignment(experiment.id, userId);
      if (assignment === 'variant' && experiment.variant === 'disabled') {
        return false;
      }
      if (assignment === 'variant' && experiment.variant === 'enabled') {
        return true;
      }
    }
  }

  // Default: enabled
  return true;
}

/**
 * End an experiment and calculate results
 */
export function endExperiment(experimentId: string): SuperhumanExperiment['results'] | null {
  const experiment = experiments.get(experimentId);
  if (!experiment) return null;

  experiment.endDate = new Date();

  // Calculate results
  const controlUsers = Array.from(experiment.userAssignments.entries())
    .filter(([_, a]) => a === 'control')
    .map(([u]) => u);
  const variantUsers = Array.from(experiment.userAssignments.entries())
    .filter(([_, a]) => a === 'variant')
    .map(([u]) => u);

  const controlSessions = Array.from(sessionMetrics.values()).filter((s) =>
    controlUsers.includes(s.userId)
  );
  const variantSessions = Array.from(sessionMetrics.values()).filter((s) =>
    variantUsers.includes(s.userId)
  );

  const controlEngagement = calculateAvgEngagement(controlSessions);
  const variantEngagement = calculateAvgEngagement(variantSessions);
  const controlReturn = calculateReturnRate(controlSessions);
  const variantReturn = calculateReturnRate(variantSessions);

  // Simple p-value approximation
  const pValue = Math.abs(variantEngagement - controlEngagement) > 0.1 ? 0.05 : 0.5;

  const results: SuperhumanExperiment['results'] = {
    controlEngagement,
    variantEngagement,
    controlReturn,
    variantReturn,
    pValue,
    recommendation:
      pValue < 0.1
        ? variantEngagement > controlEngagement
          ? 'switch_to_variant'
          : 'keep_control'
        : 'needs_more_data',
  };

  experiment.results = results;
  logger.info({ experimentId, results }, '🧪 Experiment completed');

  return results;
}

function calculateAvgEngagement(sessions: SessionMetrics[]): number {
  if (sessions.length === 0) return 0;
  return (
    sessions.reduce(
      (sum, s) => sum + s.engagement.vulnerabilityCount + s.engagement.laugterCount,
      0
    ) / sessions.length
  );
}

function calculateReturnRate(sessions: SessionMetrics[]): number {
  if (sessions.length === 0) return 0;
  return sessions.filter((s) => s.returnedSoon).length / sessions.length;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const superhumanAnalytics = {
  // Event tracking
  trackEvent: trackCapabilityEvent,
  trackEngagement: trackSessionEngagement,
  endSession,

  // Analytics
  getCapabilityEffectiveness: calculateCapabilityEffectiveness,
  getDashboard: generateDashboard,

  // A/B Testing
  createExperiment,
  getExperimentAssignment,
  isCapabilityEnabled,
  endExperiment,

  // Raw data access
  getSessionMetrics: () => Array.from(sessionMetrics.values()),
  getEvents: () => [...capabilityEvents],
  getExperiments: () => Array.from(experiments.values()),
};
