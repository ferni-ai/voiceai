/**
 * Hope Trajectory Tracking System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Long-term emotional resilience monitoring - tracking not just
 * momentary emotions but the trajectory of hope, resilience, and
 * groundedness over time.
 *
 * This is superhuman because it requires memory and pattern recognition
 * across many conversations that even therapists struggle to maintain.
 */

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'HopeTrajectory' });

// ============================================================================
// TYPES
// ============================================================================

export type TrajectoryDirection = 'improving' | 'stable' | 'declining' | 'volatile';
export type UrgencyLevel = 'proactive' | 'watchful' | 'urgent' | 'critical';

export interface HopeObservation {
  /** Timestamp */
  timestamp: Date;

  /** Session ID */
  sessionId: string;

  /** Hope indicators (0-1) */
  indicators: {
    futureOrientation: number; // Talking about future positively
    agencyLanguage: number; // "I can", "I will"
    meaningMaking: number; // Finding purpose/meaning
    connectionSeeking: number; // Reaching out, wanting connection
    selfCompassion: number; // Being kind to self
  };

  /** Composite hope score */
  hopeScore: number;

  /** Resilience indicators */
  resilience: {
    bounceBackSpeed: number; // How quickly they recover
    copingUtilization: number; // Using healthy coping
    perspectiveTaking: number; // Seeing bigger picture
  };

  /** Risk indicators */
  risk: {
    hopelessnessLanguage: boolean;
    isolationMentions: boolean;
    helplessnessPatterns: boolean;
    negativeRumination: boolean;
  };

  /** Context */
  context: {
    topicsDuring: string[];
    emotionRange: string[];
    stressLevel: number;
  };
}

export interface HopeTrajectory {
  /** Current state */
  current: {
    hopeLevel: number; // 0-1
    resilienceScore: number; // 0-1
    groundedness: number; // Stability, 0-1
    lastAssessed: Date;
  };

  /** Trend over time */
  trend: {
    direction: TrajectoryDirection;
    rate: number; // Speed of change (positive = improving)
    volatility: number; // How much it swings
    confidence: number; // How confident we are in trend
  };

  /** What anchors their hope */
  anchors: {
    sources: Array<{
      description: string;
      strength: number;
      lastMentioned: Date;
    }>;
    threats: Array<{
      description: string;
      severity: number;
      lastMentioned: Date;
    }>;
    protectiveFactors: string[];
  };

  /** Intervention timing */
  intervention: {
    bestWindowForSupport: boolean;
    urgencyLevel: UrgencyLevel;
    suggestedApproach: string;
  };
}

export interface HopeProfile {
  userId: string;

  /** Observation history */
  observations: HopeObservation[];

  /** Current trajectory */
  trajectory: HopeTrajectory;

  /** Patterns learned */
  patterns: {
    baselineHope: number;
    recoveryRate: number; // How fast they bounce back
    triggerTopics: string[]; // Topics that impact hope
    stabilizingFactors: string[];
  };

  /** Metadata */
  metadata: {
    firstObservation: Date;
    totalObservations: number;
    lastUpdated: Date;
  };
}

// ============================================================================
// HOPE DETECTION PATTERNS
// ============================================================================

const HOPE_INDICATORS = {
  futureOrientation: [
    /i('m| am)\s+(going\s+to|planning\s+to|excited\s+about)/i,
    /looking\s+forward\s+to/i,
    /next\s+(year|month|week|step)/i,
    /when\s+i\s+(finally|eventually)/i,
    /someday\s+i('ll| will)/i,
  ],
  agencyLanguage: [
    /i\s+(can|will|am\s+going\s+to|'ll|'m\s+going\s+to)/i,
    /i\s+decided\s+to/i,
    /i('m| am)\s+choosing\s+to/i,
    /i\s+(made|took)\s+(a\s+)?(decision|step|choice)/i,
    /it's\s+(up\s+to|in)\s+(me|my\s+hands)/i,
  ],
  meaningMaking: [
    /this\s+(taught|showed|made)\s+me/i,
    /i\s+(learned|realized|understand\s+now)/i,
    /there's\s+a\s+reason/i,
    /it\s+(means|matters)\s+(something|a\s+lot)/i,
    /purpose/i,
    /grateful\s+for/i,
  ],
  connectionSeeking: [
    /i\s+(miss|need|want)\s+(to\s+)?(see|talk\s+to|connect)/i,
    /thank\s+(you|goodness)\s+for\s+(you|being\s+here|listening)/i,
    /i('m| am)\s+glad\s+(we|i\s+can)/i,
    /this\s+helps/i,
  ],
  selfCompassion: [
    /i('m| am)\s+(being|trying\s+to\s+be)\s+(kind|patient|gentle)\s+(to|with)\s+myself/i,
    /it's\s+okay\s+(that|to)/i,
    /i('m| am)\s+doing\s+(my|the)\s+best/i,
    /i\s+deserve/i,
    /i\s+forgive\s+(myself|me)/i,
  ],
};

const HOPELESSNESS_INDICATORS = [
  /what's\s+the\s+point/i,
  /nothing\s+(matters|will\s+(change|help|work))/i,
  /i\s+(don't|can't)\s+see\s+(a\s+)?(way|future|point)/i,
  /why\s+(bother|try|even)/i,
  /i('ll| will)\s+never/i,
  /it's\s+(hopeless|pointless|useless)/i,
  /give(n)?\s+up/i,
  /no\s+point\s+(in|to)/i,
];

const ISOLATION_INDICATORS = [
  /no\s+one\s+(cares|understands|listens)/i,
  /i('m| am)\s+(all\s+)?alone/i,
  /everyone\s+(left|leaves|has\s+left)/i,
  /i\s+(don't|have\s+no)\s+(have\s+)?(anyone|friends|support)/i,
  /isolated/i,
  /disconnected/i,
];

const HELPLESSNESS_INDICATORS = [
  /i\s+can't\s+(do\s+anything|change|control)/i,
  /nothing\s+i\s+(do|can\s+do)/i,
  /it's\s+out\s+of\s+my\s+(hands|control)/i,
  /i('m| am)\s+(helpless|powerless|stuck)/i,
  /there's\s+nothing\s+i\s+can/i,
];

const RUMINATION_INDICATORS = [
  /i\s+keep\s+thinking\s+about/i,
  /can't\s+stop\s+thinking/i,
  /over\s+and\s+over/i,
  /playing\s+(it\s+)?in\s+my\s+(head|mind)/i,
  /i\s+should('ve| have)\s+.{5,}/i,
  /if\s+only\s+i\s+had/i,
];

// ============================================================================
// STORAGE
// ============================================================================

const profiles = new Map<string, HopeProfile>();

/**
 * Get or create hope profile
 */
export function getHopeProfile(userId: string): HopeProfile {
  let profile = profiles.get(userId);

  if (!profile) {
    profile = {
      userId,
      observations: [],
      trajectory: {
        current: {
          hopeLevel: 0.5,
          resilienceScore: 0.5,
          groundedness: 0.5,
          lastAssessed: new Date(),
        },
        trend: {
          direction: 'stable',
          rate: 0,
          volatility: 0,
          confidence: 0,
        },
        anchors: {
          sources: [],
          threats: [],
          protectiveFactors: [],
        },
        intervention: {
          bestWindowForSupport: true,
          urgencyLevel: 'proactive',
          suggestedApproach: 'Standard supportive presence',
        },
      },
      patterns: {
        baselineHope: 0.5,
        recoveryRate: 0.5,
        triggerTopics: [],
        stabilizingFactors: [],
      },
      metadata: {
        firstObservation: new Date(),
        totalObservations: 0,
        lastUpdated: new Date(),
      },
    };
    profiles.set(userId, profile);
  }

  return profile;
}

// ============================================================================
// HOPE ANALYSIS ENGINE
// ============================================================================

export interface HopeAnalysis {
  /** Observation from this conversation */
  observation: HopeObservation;

  /** Updated trajectory */
  trajectory: HopeTrajectory;

  /** Alerts if any */
  alerts: Array<{
    type: 'hopelessness' | 'isolation' | 'declining_trend' | 'volatility';
    severity: 'low' | 'medium' | 'high';
    message: string;
  }>;

  /** Guidance for this session */
  guidance: {
    approach: string;
    reinforce: string[];
    avoid: string[];
    checkIn: string | null;
  };
}

/**
 * Analyze hope trajectory
 */
export function analyzeHope(
  userId: string,
  sessionId: string,
  text: string,
  topics: string[],
  emotions: string[],
  stressLevel: number
): HopeAnalysis {
  const profile = getHopeProfile(userId);

  // ========== CALCULATE INDICATORS ==========

  const indicators = {
    futureOrientation: calculateIndicatorScore(text, HOPE_INDICATORS.futureOrientation),
    agencyLanguage: calculateIndicatorScore(text, HOPE_INDICATORS.agencyLanguage),
    meaningMaking: calculateIndicatorScore(text, HOPE_INDICATORS.meaningMaking),
    connectionSeeking: calculateIndicatorScore(text, HOPE_INDICATORS.connectionSeeking),
    selfCompassion: calculateIndicatorScore(text, HOPE_INDICATORS.selfCompassion),
  };

  // Composite hope score
  const hopeScore =
    indicators.futureOrientation * 0.25 +
    indicators.agencyLanguage * 0.25 +
    indicators.meaningMaking * 0.2 +
    indicators.connectionSeeking * 0.15 +
    indicators.selfCompassion * 0.15;

  // ========== CALCULATE RESILIENCE ==========

  const resilience = {
    bounceBackSpeed: profile.patterns.recoveryRate,
    copingUtilization: calculateCopingScore(text),
    perspectiveTaking: calculatePerspectiveScore(text),
  };

  // ========== DETECT RISKS ==========

  const risk = {
    hopelessnessLanguage: HOPELESSNESS_INDICATORS.some((p) => p.test(text)),
    isolationMentions: ISOLATION_INDICATORS.some((p) => p.test(text)),
    helplessnessPatterns: HELPLESSNESS_INDICATORS.some((p) => p.test(text)),
    negativeRumination: RUMINATION_INDICATORS.some((p) => p.test(text)),
  };

  // ========== CREATE OBSERVATION ==========

  const observation: HopeObservation = {
    timestamp: new Date(),
    sessionId,
    indicators,
    hopeScore,
    resilience,
    risk,
    context: {
      topicsDuring: topics,
      emotionRange: emotions,
      stressLevel,
    },
  };

  // Add to history
  profile.observations.push(observation);
  if (profile.observations.length > 100) {
    profile.observations.shift();
  }

  // ========== UPDATE TRAJECTORY ==========

  updateTrajectory(profile, observation);

  // ========== GENERATE ALERTS ==========

  const alerts = generateAlerts(profile, observation);

  // ========== BUILD GUIDANCE ==========

  const guidance = buildHopeGuidance(profile, observation, alerts);

  // Update metadata
  profile.metadata.totalObservations++;
  profile.metadata.lastUpdated = new Date();

  log.debug(
    { userId, hopeScore: hopeScore.toFixed(2), direction: profile.trajectory.trend.direction },
    '🌱 Hope trajectory updated'
  );

  return {
    observation,
    trajectory: profile.trajectory,
    alerts,
    guidance,
  };
}

/**
 * Calculate indicator score from patterns
 */
function calculateIndicatorScore(text: string, patterns: RegExp[]): number {
  let matches = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) matches++;
  }
  return Math.min(1, matches / 2); // 2+ matches = 1.0
}

/**
 * Calculate coping utilization score
 */
function calculateCopingScore(text: string): number {
  const copingPatterns = [
    /i\s+(went|go|did|do)\s+(for\s+a\s+)?(walk|run|exercise)/i,
    /talked\s+to\s+(someone|a\s+friend|my)/i,
    /took\s+(a\s+break|time|care)/i,
    /breathing|meditation|journal/i,
    /sleep|rest|self-care/i,
  ];

  let score = 0;
  for (const pattern of copingPatterns) {
    if (pattern.test(text)) score += 0.3;
  }
  return Math.min(1, score);
}

/**
 * Calculate perspective taking score
 */
function calculatePerspectiveScore(text: string): number {
  const perspectivePatterns = [
    /in\s+the\s+(big|grand)\s+(picture|scheme)/i,
    /when\s+i\s+look\s+back/i,
    /it('ll| will)\s+(be\s+)?(okay|fine|pass)/i,
    /i\s+know\s+(this|it)\s+(won't|isn't)/i,
    /temporary/i,
    /part\s+of\s+(the\s+process|life|growing)/i,
  ];

  let score = 0;
  for (const pattern of perspectivePatterns) {
    if (pattern.test(text)) score += 0.35;
  }
  return Math.min(1, score);
}

/**
 * Update trajectory based on new observation
 */
function updateTrajectory(profile: HopeProfile, observation: HopeObservation): void {
  const { trajectory } = profile;
  const { observations } = profile;
  const alpha = 0.3; // Learning rate

  // Update current state
  trajectory.current.hopeLevel =
    alpha * observation.hopeScore + (1 - alpha) * trajectory.current.hopeLevel;

  const resilienceScore =
    observation.resilience.bounceBackSpeed * 0.4 +
    observation.resilience.copingUtilization * 0.3 +
    observation.resilience.perspectiveTaking * 0.3;

  trajectory.current.resilienceScore =
    alpha * resilienceScore + (1 - alpha) * trajectory.current.resilienceScore;

  // Groundedness based on risk factors
  const riskCount = Object.values(observation.risk).filter(Boolean).length;
  const groundedness = Math.max(0, 1 - riskCount * 0.2);
  trajectory.current.groundedness =
    alpha * groundedness + (1 - alpha) * trajectory.current.groundedness;

  trajectory.current.lastAssessed = new Date();

  // Calculate trend (need at least 3 observations)
  if (observations.length >= 3) {
    const recent = observations.slice(-5);
    const older = observations.slice(-10, -5);

    if (older.length > 0) {
      const recentAvg = recent.reduce((s, o) => s + o.hopeScore, 0) / recent.length;
      const olderAvg = older.reduce((s, o) => s + o.hopeScore, 0) / older.length;

      const change = recentAvg - olderAvg;
      trajectory.trend.rate = change;

      if (change > 0.1) trajectory.trend.direction = 'improving';
      else if (change < -0.1) trajectory.trend.direction = 'declining';
      else trajectory.trend.direction = 'stable';

      // Calculate volatility
      const variance =
        recent.reduce((s, o) => s + Math.pow(o.hopeScore - recentAvg, 2), 0) / recent.length;
      trajectory.trend.volatility = Math.sqrt(variance);

      if (trajectory.trend.volatility > 0.2) {
        trajectory.trend.direction = 'volatile';
      }

      trajectory.trend.confidence = Math.min(0.9, observations.length / 10);
    }
  }

  // Update intervention guidance
  updateInterventionGuidance(trajectory, observation);

  // Update anchors
  updateAnchors(profile, observation);

  // Update patterns
  updatePatterns(profile, observation);
}

/**
 * Update intervention guidance
 */
function updateInterventionGuidance(
  trajectory: HopeTrajectory,
  observation: HopeObservation
): void {
  const { current } = trajectory;
  const risks = observation.risk;

  // Determine urgency
  if (risks.hopelessnessLanguage && current.hopeLevel < 0.3) {
    trajectory.intervention.urgencyLevel = 'critical';
    trajectory.intervention.suggestedApproach =
      'Direct, warm presence. Check in on safety. Avoid advice.';
    trajectory.intervention.bestWindowForSupport = true;
  } else if (
    trajectory.trend.direction === 'declining' ||
    risks.isolationMentions ||
    current.hopeLevel < 0.35
  ) {
    trajectory.intervention.urgencyLevel = 'urgent';
    trajectory.intervention.suggestedApproach =
      'Increase warmth and connection. Acknowledge struggle. Explore hope anchors.';
    trajectory.intervention.bestWindowForSupport = true;
  } else if (
    current.hopeLevel < 0.5 ||
    risks.negativeRumination ||
    trajectory.trend.direction === 'volatile'
  ) {
    trajectory.intervention.urgencyLevel = 'watchful';
    trajectory.intervention.suggestedApproach =
      'Monitor closely. Gently reinforce agency and connection.';
    trajectory.intervention.bestWindowForSupport = observation.context.stressLevel < 0.6;
  } else {
    trajectory.intervention.urgencyLevel = 'proactive';
    trajectory.intervention.suggestedApproach = 'Standard supportive presence. Build on strengths.';
    trajectory.intervention.bestWindowForSupport = true;
  }
}

/**
 * Update hope anchors
 */
function updateAnchors(profile: HopeProfile, observation: HopeObservation): void {
  const { anchors } = profile.trajectory;

  // Track positive topics as potential sources
  if (observation.hopeScore > 0.6) {
    for (const topic of observation.context.topicsDuring) {
      const existing = anchors.sources.find((s) =>
        s.description.toLowerCase().includes(topic.toLowerCase())
      );

      if (existing) {
        existing.strength = Math.min(1, existing.strength + 0.1);
        existing.lastMentioned = new Date();
      } else if (topic.length > 3) {
        anchors.sources.push({
          description: topic,
          strength: 0.5,
          lastMentioned: new Date(),
        });
      }
    }

    // Keep only top 5 sources
    anchors.sources.sort((a, b) => b.strength - a.strength);
    anchors.sources = anchors.sources.slice(0, 5);
  }

  // Track threats
  if (observation.hopeScore < 0.4) {
    for (const topic of observation.context.topicsDuring) {
      const existing = anchors.threats.find((t) =>
        t.description.toLowerCase().includes(topic.toLowerCase())
      );

      if (existing) {
        existing.severity = Math.min(1, existing.severity + 0.1);
        existing.lastMentioned = new Date();
      } else if (topic.length > 3) {
        anchors.threats.push({
          description: topic,
          severity: 0.5,
          lastMentioned: new Date(),
        });
      }
    }

    anchors.threats.sort((a, b) => b.severity - a.severity);
    anchors.threats = anchors.threats.slice(0, 5);
  }
}

/**
 * Update learned patterns
 */
function updatePatterns(profile: HopeProfile, observation: HopeObservation): void {
  const alpha = 0.1;

  // Update baseline
  profile.patterns.baselineHope =
    alpha * observation.hopeScore + (1 - alpha) * profile.patterns.baselineHope;

  // Track trigger topics (topics during low hope)
  if (observation.hopeScore < 0.35) {
    for (const topic of observation.context.topicsDuring) {
      if (!profile.patterns.triggerTopics.includes(topic) && topic.length > 3) {
        profile.patterns.triggerTopics.push(topic);
        if (profile.patterns.triggerTopics.length > 10) {
          profile.patterns.triggerTopics.shift();
        }
      }
    }
  }

  // Track stabilizing factors (topics during high hope)
  if (observation.hopeScore > 0.65) {
    for (const topic of observation.context.topicsDuring) {
      if (!profile.patterns.stabilizingFactors.includes(topic) && topic.length > 3) {
        profile.patterns.stabilizingFactors.push(topic);
        if (profile.patterns.stabilizingFactors.length > 10) {
          profile.patterns.stabilizingFactors.shift();
        }
      }
    }
  }
}

/**
 * Generate alerts based on trajectory
 */
function generateAlerts(
  profile: HopeProfile,
  observation: HopeObservation
): HopeAnalysis['alerts'] {
  const alerts: HopeAnalysis['alerts'] = [];

  if (observation.risk.hopelessnessLanguage) {
    alerts.push({
      type: 'hopelessness',
      severity: observation.hopeScore < 0.3 ? 'high' : 'medium',
      message: 'Hopelessness language detected. Prioritize connection and safety.',
    });
  }

  if (observation.risk.isolationMentions) {
    alerts.push({
      type: 'isolation',
      severity: 'medium',
      message: 'Isolation mentioned. Reinforce connection and belonging.',
    });
  }

  if (
    profile.trajectory.trend.direction === 'declining' &&
    profile.trajectory.trend.confidence > 0.5
  ) {
    alerts.push({
      type: 'declining_trend',
      severity: profile.trajectory.trend.rate < -0.2 ? 'high' : 'medium',
      message: `Hope trajectory declining over recent sessions.`,
    });
  }

  if (profile.trajectory.trend.direction === 'volatile') {
    alerts.push({
      type: 'volatility',
      severity: 'low',
      message: 'Emotional volatility detected. Provide stability and grounding.',
    });
  }

  return alerts;
}

/**
 * Build guidance for this session
 */
function buildHopeGuidance(
  profile: HopeProfile,
  observation: HopeObservation,
  alerts: HopeAnalysis['alerts']
): HopeAnalysis['guidance'] {
  const hasHighAlert = alerts.some((a) => a.severity === 'high');
  const hasMediumAlert = alerts.some((a) => a.severity === 'medium');

  const approach = profile.trajectory.intervention.suggestedApproach;

  // Reinforcement suggestions
  const reinforce: string[] = [];
  if (profile.trajectory.anchors.sources.length > 0) {
    reinforce.push(
      `Hope sources: ${profile.trajectory.anchors.sources.map((s) => s.description).join(', ')}`
    );
  }
  if (observation.indicators.agencyLanguage > 0.5) {
    reinforce.push('Reinforce their sense of agency and capability');
  }
  if (observation.indicators.connectionSeeking > 0.5) {
    reinforce.push('Affirm the value of connection and support-seeking');
  }

  // Things to avoid
  const avoid: string[] = [];
  if (observation.risk.hopelessnessLanguage) {
    avoid.push("Don't offer solutions or silver linings");
    avoid.push('Avoid "things will get better" without acknowledging present pain');
  }
  if (hasHighAlert) {
    avoid.push('Avoid advice-giving');
    avoid.push("Don't minimize their experience");
  }
  if (profile.patterns.triggerTopics.length > 0 && hasMediumAlert) {
    avoid.push(`Sensitive topics: ${profile.patterns.triggerTopics.slice(0, 3).join(', ')}`);
  }

  // Check-in suggestion
  let checkIn: string | null = null;
  if (hasHighAlert) {
    checkIn = "I want to make sure you're okay. How are you really feeling right now?";
  } else if (observation.risk.hopelessnessLanguage) {
    checkIn = "That sounds really heavy. I'm here with you.";
  } else if (profile.trajectory.trend.direction === 'declining') {
    checkIn = 'How have you been feeling overall lately?';
  }

  return { approach, reinforce, avoid, checkIn };
}

// ============================================================================
// PROMPT FORMATTING
// ============================================================================

/**
 * Format hope analysis for prompt injection
 */
export function formatHopeForPrompt(analysis: HopeAnalysis): string {
  const lines = ['[HOPE TRAJECTORY AWARENESS]'];

  // Current state
  lines.push(
    `Hope level: ${(analysis.trajectory.current.hopeLevel * 100).toFixed(0)}% | Trend: ${analysis.trajectory.trend.direction}`
  );

  // Urgency
  if (analysis.trajectory.intervention.urgencyLevel !== 'proactive') {
    lines.push(`Urgency: ${analysis.trajectory.intervention.urgencyLevel}`);
  }

  // Alerts
  for (const alert of analysis.alerts) {
    lines.push(`[${alert.severity.toUpperCase()}] ${alert.message}`);
  }

  // Approach
  lines.push(`Approach: ${analysis.guidance.approach}`);

  // Reinforce
  if (analysis.guidance.reinforce.length > 0) {
    lines.push(`Reinforce: ${analysis.guidance.reinforce[0]}`);
  }

  // Avoid
  if (analysis.guidance.avoid.length > 0) {
    lines.push(`Avoid: ${analysis.guidance.avoid[0]}`);
  }

  // Check-in
  if (analysis.guidance.checkIn) {
    lines.push(`Consider: "${analysis.guidance.checkIn}"`);
  }

  return lines.join('\n');
}

// ============================================================================
// IMPORT/EXPORT (for persistence)
// ============================================================================

/**
 * Import a hope profile into memory (for persistence)
 */
export function importHopeProfile(profile: HopeProfile): void {
  profiles.set(profile.userId, profile);
}

// ============================================================================
// RESET (for testing)
// ============================================================================

/**
 * Reset all hope trajectory state (for testing)
 */
export function resetHopeTrajectory(): void {
  profiles.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getHopeProfile,
  analyzeHope,
  formatHopeForPrompt,
  resetHopeTrajectory,
};
