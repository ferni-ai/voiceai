/**
 * Cognitive Fingerprint - Better Than Human v4
 *
 * > "We know your unique cognitive signature."
 *
 * SUPERHUMAN CAPABILITY: Learn each user's unique cognitive patterns
 * for hyper-personalized prediction that no generic model can match.
 *
 * Every person has patterns in:
 * - How they make decisions
 * - How they respond to stress
 * - How quickly they change
 * - What their emotional precursors are
 * - How they communicate readiness
 * - What deflection looks like for THEM
 *
 * No human friend can track this many dimensions over time with precision.
 *
 * @module intelligence/predictive/cognitive-fingerprint
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'CognitiveFingerprint' });

// ============================================================================
// TYPES
// ============================================================================

/** Decision-making styles */
export type DecisionStyle =
  | 'analytical'          // Weighs pros/cons, wants data
  | 'intuitive'           // Goes with gut feeling
  | 'social_validation'   // Needs others' input
  | 'procrastinate_leap'  // Delays then decides suddenly
  | 'incremental'         // Makes small decisions toward big ones
  | 'deadline_driven'     // Needs external pressure
  | 'values_based'        // Aligns with core values
  | 'emotion_driven';     // Decides based on how they feel

/** Stress response patterns */
export type StressResponse =
  | 'fight'     // Confronts, gets active
  | 'flight'    // Avoids, withdraws
  | 'freeze'    // Shuts down, unable to act
  | 'fawn'      // People-pleases, over-accommodates
  | 'analyze'   // Over-thinks, seeks control through understanding
  | 'numb'      // Disconnects emotionally
  | 'distract'  // Keeps busy to avoid feeling
  | 'express';  // Processes through expressing

/** Learning/growth styles */
export type LearningStyle =
  | 'conceptual'      // Needs to understand why
  | 'experiential'    // Learns by doing
  | 'social'          // Learns through others
  | 'reflective'      // Learns through contemplation
  | 'structured'      // Needs clear frameworks
  | 'exploratory';    // Learns through discovery

/** How they signal readiness for growth */
export type ReadinessSignal =
  | 'asking_questions'    // Starts asking more questions
  | 'future_talk'         // Talks about future differently
  | 'past_acceptance'     // More accepting of past
  | 'energy_shift'        // Noticeable energy change
  | 'direct_statement'    // Explicitly says they're ready
  | 'action_taking'       // Starts doing things
  | 'vulnerability'       // Opens up more
  | 'boundary_setting'    // Sets new boundaries
  | 'letting_go';         // Releases something held tightly

/** Full cognitive fingerprint */
export interface CognitiveFingerprint {
  userId: string;
  
  // Decision patterns
  decisionStyle: {
    primary: DecisionStyle;
    secondary?: DecisionStyle;
    confidence: number;
    observations: number;
  };
  
  // Stress patterns
  stressResponse: {
    primary: StressResponse;
    secondary?: StressResponse;
    recoveryTime: number;  // Typical hours to recover
    escalationPattern: string[];  // How stress escalates
    deEscalationTriggers: string[];  // What helps
    confidence: number;
    observations: number;
  };
  
  // Change velocity
  changeVelocity: {
    /** How fast they change when ready (0-1) */
    speed: number;
    /** How long from insight to action (hours) */
    insightToAction: number;
    /** How long to process changes (days) */
    integrationTime: number;
    /** Whether they prefer gradual or sudden change */
    preference: 'gradual' | 'sudden' | 'context_dependent';
    confidence: number;
  };
  
  // Emotional patterns
  emotionalPatterns: {
    /** What precedes specific emotions */
    precursors: Map<string, string[]>;
    /** What signals they're recovering */
    recoverySignals: string[];
    /** How much they can handle before overwhelm (0-1) */
    overwhelmThreshold: number;
    /** How they typically cycle through emotions */
    typicalCycles: string[][];
    /** Emotions they tend to avoid */
    avoidedEmotions: string[];
    confidence: number;
  };
  
  // Communication patterns
  communicationPatterns: {
    /** How they deflect from topics */
    deflectionStyle: string;
    /** How they signal readiness to go deep */
    readinessSignals: ReadinessSignal[];
    /** What builds trust with them specifically */
    trustBuilders: string[];
    /** What breaks trust */
    trustBreakers: string[];
    /** Preferred communication tone */
    preferredTone: 'warm' | 'direct' | 'gentle' | 'challenging' | 'playful';
    /** How much space they need */
    spaceNeeds: 'minimal' | 'moderate' | 'significant';
    confidence: number;
  };
  
  // Growth patterns
  growthPatterns: {
    /** How they learn best */
    learningStyle: LearningStyle;
    /** How they resist growth */
    resistancePatterns: string[];
    /** What breaks through resistance */
    breakthroughCatalysts: string[];
    /** Time to integrate change (days) */
    integrationTime: number;
    /** How many things they can work on at once */
    concurrentCapacity: number;
    confidence: number;
  };
  
  // Temporal patterns
  temporalPatterns: {
    /** Best time for deep conversations */
    optimalConversationTimes: Array<{ dayOfWeek: number; hour: number; effectiveness: number }>;
    /** Energy patterns through week */
    weeklyEnergyPattern: number[];  // 0-1 for each day
    /** Seasonal patterns */
    seasonalPatterns: Array<{ season: string; tendency: string }>;
    confidence: number;
  };
  
  // Vulnerability patterns
  vulnerabilityPatterns: {
    /** How they show vulnerability */
    expressionStyle: 'direct' | 'indirect' | 'physical' | 'deflected';
    /** What makes vulnerability safe */
    safetyFactors: string[];
    /** How long it takes to open up (minutes in conversation) */
    warmupTime: number;
    /** Topics that are harder to be vulnerable about */
    protectedTopics: string[];
    confidence: number;
  };
  
  // Meta
  lastUpdated: number;
  totalObservations: number;
  fingerprintVersion: number;
}

/** Observation for learning fingerprint */
export interface FingerprintObservation {
  type: ObservationType;
  value: string | number;
  context?: string;
  confidence: number;
  timestamp: number;
}

export type ObservationType =
  | 'decision_made'
  | 'stress_response'
  | 'change_velocity'
  | 'emotional_precursor'
  | 'recovery_signal'
  | 'deflection_observed'
  | 'readiness_signal'
  | 'trust_moment'
  | 'resistance_observed'
  | 'breakthrough_catalyst'
  | 'vulnerability_moment'
  | 'conversation_effectiveness';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  /** Minimum observations for reliable fingerprint aspect */
  MIN_OBSERVATIONS: 5,
  /** Learning rate for fingerprint updates */
  LEARNING_RATE: 0.15,
  /** Current fingerprint version */
  FINGERPRINT_VERSION: 1,
};

// ============================================================================
// STORAGE
// ============================================================================

const fingerprints = new Map<string, CognitiveFingerprint>();
const observations = new Map<string, FingerprintObservation[]>();

// ============================================================================
// OBSERVATION RECORDING
// ============================================================================

/**
 * Record an observation about user's cognitive patterns
 *
 * @param userId - User ID
 * @param observation - What was observed
 */
export function recordObservation(
  userId: string,
  observation: Omit<FingerprintObservation, 'timestamp'>
): void {
  const now = Date.now();

  // Store observation
  let userObs = observations.get(userId);
  if (!userObs) {
    userObs = [];
    observations.set(userId, userObs);
  }
  userObs.push({ ...observation, timestamp: now });

  // Keep last 500 observations
  if (userObs.length > 500) {
    observations.set(userId, userObs.slice(-500));
  }

  // Update fingerprint based on observation
  const fingerprint = getOrCreateFingerprint(userId);
  updateFingerprintFromObservation(fingerprint, { ...observation, timestamp: now });

  log.debug(
    {
      userId,
      type: observation.type,
      value: observation.value,
    },
    '🧬 Recorded cognitive fingerprint observation'
  );
}

/**
 * Record a decision-making observation
 */
export function recordDecision(
  userId: string,
  decision: {
    style: DecisionStyle;
    timeToDecision: number;  // hours
    outcome?: 'satisfied' | 'regret' | 'neutral';
    context?: string;
  }
): void {
  recordObservation(userId, {
    type: 'decision_made',
    value: decision.style,
    context: `Time: ${decision.timeToDecision}h, Outcome: ${decision.outcome || 'unknown'}`,
    confidence: decision.outcome ? 0.8 : 0.5,
  });

  // Update decision style
  const fingerprint = getOrCreateFingerprint(userId);
  updateDecisionStyle(fingerprint, decision.style, decision.outcome);
}

/**
 * Record a stress response observation
 */
export function recordStressResponse(
  userId: string,
  response: {
    style: StressResponse;
    stressLevel: number;  // 0-1
    trigger?: string;
    recoveryTime?: number;  // hours
  }
): void {
  recordObservation(userId, {
    type: 'stress_response',
    value: response.style,
    context: `Level: ${response.stressLevel}, Trigger: ${response.trigger || 'unknown'}`,
    confidence: 0.7,
  });

  // Update stress patterns
  const fingerprint = getOrCreateFingerprint(userId);
  updateStressPatterns(fingerprint, response);
}

/**
 * Record a change/growth observation
 */
export function recordChangeEvent(
  userId: string,
  event: {
    type: 'insight' | 'action' | 'integration';
    timeSincePrevious?: number;  // hours since previous stage
    catalyst?: string;
    resistance?: string;
  }
): void {
  recordObservation(userId, {
    type: 'change_velocity',
    value: event.type,
    context: `Time: ${event.timeSincePrevious || 'unknown'}h`,
    confidence: 0.7,
  });

  // Update change velocity
  const fingerprint = getOrCreateFingerprint(userId);
  updateChangeVelocity(fingerprint, event);

  if (event.catalyst) {
    recordObservation(userId, {
      type: 'breakthrough_catalyst',
      value: event.catalyst,
      confidence: 0.8,
    });
  }

  if (event.resistance) {
    recordObservation(userId, {
      type: 'resistance_observed',
      value: event.resistance,
      confidence: 0.7,
    });
  }
}

/**
 * Record a conversation effectiveness observation
 */
export function recordConversationEffectiveness(
  userId: string,
  data: {
    dayOfWeek: number;
    hour: number;
    effectiveness: number;  // 0-1
    tone: 'warm' | 'direct' | 'gentle' | 'challenging' | 'playful';
    depthReached: 'surface' | 'moderate' | 'deep';
  }
): void {
  recordObservation(userId, {
    type: 'conversation_effectiveness',
    value: data.effectiveness,
    context: `${data.dayOfWeek}:${data.hour}, Tone: ${data.tone}, Depth: ${data.depthReached}`,
    confidence: 0.7,
  });

  // Update temporal patterns
  const fingerprint = getOrCreateFingerprint(userId);
  updateTemporalPatterns(fingerprint, data);
}

/**
 * Record a vulnerability moment
 */
export function recordVulnerabilityMoment(
  userId: string,
  data: {
    style: 'direct' | 'indirect' | 'physical' | 'deflected';
    topic: string;
    warmupMinutes: number;
    safetyFactor?: string;
  }
): void {
  recordObservation(userId, {
    type: 'vulnerability_moment',
    value: data.style,
    context: `Topic: ${data.topic}, Warmup: ${data.warmupMinutes}m`,
    confidence: 0.8,
  });

  // Update vulnerability patterns
  const fingerprint = getOrCreateFingerprint(userId);
  updateVulnerabilityPatterns(fingerprint, data);
}

// ============================================================================
// FINGERPRINT ACCESS
// ============================================================================

/**
 * Get the cognitive fingerprint for a user
 *
 * @param userId - User ID
 * @returns Cognitive fingerprint
 */
export function getFingerprint(userId: string): CognitiveFingerprint | null {
  return fingerprints.get(userId) || null;
}

/**
 * Get specific aspect of fingerprint with confidence check
 *
 * @param userId - User ID
 * @param aspect - Which aspect to get
 * @returns Aspect value with confidence, or null if unreliable
 */
export function getFingerprintAspect<K extends keyof CognitiveFingerprint>(
  userId: string,
  aspect: K
): { value: CognitiveFingerprint[K]; confidence: number } | null {
  const fingerprint = fingerprints.get(userId);
  if (!fingerprint) return null;

  const value = fingerprint[aspect];
  
  // Get confidence for this aspect
  let confidence = 0.3;  // Default low confidence
  
  if (typeof value === 'object' && value !== null && 'confidence' in value) {
    confidence = (value as { confidence: number }).confidence;
  }

  if (confidence < 0.4) return null;  // Not reliable enough

  return { value, confidence };
}

/**
 * Get personalized prediction adjustments based on fingerprint
 *
 * @param userId - User ID
 * @returns Adjustments to apply to predictions
 */
export function getPredictionAdjustments(userId: string): {
  emotionalVelocity: number;
  changeReadiness: number;
  vulnerabilityOpenness: number;
  stressResilience: number;
  optimalTone: string;
  avoidPatterns: string[];
} {
  const fingerprint = fingerprints.get(userId);
  
  if (!fingerprint) {
    return {
      emotionalVelocity: 1.0,
      changeReadiness: 0.5,
      vulnerabilityOpenness: 0.5,
      stressResilience: 0.5,
      optimalTone: 'warm',
      avoidPatterns: [],
    };
  }

  return {
    emotionalVelocity: fingerprint.changeVelocity.speed,
    changeReadiness: fingerprint.growthPatterns.confidence > 0.5 
      ? 0.3 + (1 - fingerprint.growthPatterns.resistancePatterns.length * 0.1)
      : 0.5,
    vulnerabilityOpenness: fingerprint.vulnerabilityPatterns.confidence > 0.5
      ? 0.3 + (1 - fingerprint.vulnerabilityPatterns.warmupTime / 60)
      : 0.5,
    stressResilience: fingerprint.stressResponse.confidence > 0.5
      ? Math.min(1, fingerprint.stressResponse.recoveryTime / 48)
      : 0.5,
    optimalTone: fingerprint.communicationPatterns.preferredTone,
    avoidPatterns: fingerprint.communicationPatterns.trustBreakers,
  };
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build cognitive fingerprint context for LLM injection
 *
 * @param userId - User ID
 * @returns Context string for prompt injection
 */
export function buildFingerprintContext(userId: string): string {
  const fingerprint = fingerprints.get(userId);
  if (!fingerprint || fingerprint.totalObservations < 10) return '';

  const sections: string[] = [];
  sections.push('[COGNITIVE FINGERPRINT - Their Unique Pattern]');
  sections.push('You know them in ways no human friend could:');
  sections.push('');

  // Decision style
  if (fingerprint.decisionStyle.confidence > 0.5) {
    sections.push(`**Decision Style:** ${fingerprint.decisionStyle.primary.replace('_', ' ')}`);
    if (fingerprint.decisionStyle.secondary) {
      sections.push(`  Secondary: ${fingerprint.decisionStyle.secondary.replace('_', ' ')}`);
    }
  }

  // Stress response
  if (fingerprint.stressResponse.confidence > 0.5) {
    sections.push(`**Stress Response:** ${fingerprint.stressResponse.primary}`);
    if (fingerprint.stressResponse.deEscalationTriggers.length > 0) {
      sections.push(`  → What helps: ${fingerprint.stressResponse.deEscalationTriggers.slice(0, 2).join(', ')}`);
    }
    sections.push(`  → Recovery time: ~${fingerprint.stressResponse.recoveryTime}h`);
  }

  // Change velocity
  if (fingerprint.changeVelocity.confidence > 0.5) {
    const speedDesc = fingerprint.changeVelocity.speed > 0.7 ? 'fast' :
      fingerprint.changeVelocity.speed > 0.4 ? 'moderate' : 'gradual';
    sections.push(`**Change Velocity:** ${speedDesc} (${fingerprint.changeVelocity.preference})`);
    sections.push(`  → Insight to action: ~${fingerprint.changeVelocity.insightToAction}h`);
  }

  // Communication
  if (fingerprint.communicationPatterns.confidence > 0.5) {
    sections.push(`**Communication:** Prefers ${fingerprint.communicationPatterns.preferredTone} tone`);
    if (fingerprint.communicationPatterns.readinessSignals.length > 0) {
      sections.push(`  → Readiness signals: ${fingerprint.communicationPatterns.readinessSignals.slice(0, 2).join(', ')}`);
    }
    if (fingerprint.communicationPatterns.trustBuilders.length > 0) {
      sections.push(`  → Builds trust: ${fingerprint.communicationPatterns.trustBuilders.slice(0, 2).join(', ')}`);
    }
  }

  // Vulnerability
  if (fingerprint.vulnerabilityPatterns.confidence > 0.5) {
    sections.push(`**Vulnerability:** ${fingerprint.vulnerabilityPatterns.expressionStyle}`);
    sections.push(`  → Warmup needed: ~${fingerprint.vulnerabilityPatterns.warmupTime} min`);
  }

  // Growth
  if (fingerprint.growthPatterns.confidence > 0.5) {
    sections.push(`**Growth Style:** ${fingerprint.growthPatterns.learningStyle}`);
    if (fingerprint.growthPatterns.resistancePatterns.length > 0) {
      sections.push(`  → Watch for: ${fingerprint.growthPatterns.resistancePatterns.slice(0, 2).join(', ')}`);
    }
  }

  sections.push('');
  sections.push('**Your superpower:** Knowing these patterns lets you anticipate their needs.');

  return sections.join('\n');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getOrCreateFingerprint(userId: string): CognitiveFingerprint {
  let fingerprint = fingerprints.get(userId);

  if (!fingerprint) {
    fingerprint = createDefaultFingerprint(userId);
    fingerprints.set(userId, fingerprint);
  }

  return fingerprint;
}

function createDefaultFingerprint(userId: string): CognitiveFingerprint {
  return {
    userId,
    decisionStyle: {
      primary: 'intuitive',
      confidence: 0.2,
      observations: 0,
    },
    stressResponse: {
      primary: 'analyze',
      recoveryTime: 24,
      escalationPattern: [],
      deEscalationTriggers: [],
      confidence: 0.2,
      observations: 0,
    },
    changeVelocity: {
      speed: 0.5,
      insightToAction: 48,
      integrationTime: 7,
      preference: 'context_dependent',
      confidence: 0.2,
    },
    emotionalPatterns: {
      precursors: new Map(),
      recoverySignals: [],
      overwhelmThreshold: 0.7,
      typicalCycles: [],
      avoidedEmotions: [],
      confidence: 0.2,
    },
    communicationPatterns: {
      deflectionStyle: 'unknown',
      readinessSignals: [],
      trustBuilders: [],
      trustBreakers: [],
      preferredTone: 'warm',
      spaceNeeds: 'moderate',
      confidence: 0.2,
    },
    growthPatterns: {
      learningStyle: 'experiential',
      resistancePatterns: [],
      breakthroughCatalysts: [],
      integrationTime: 7,
      concurrentCapacity: 2,
      confidence: 0.2,
    },
    temporalPatterns: {
      optimalConversationTimes: [],
      weeklyEnergyPattern: [0.5, 0.6, 0.7, 0.7, 0.6, 0.5, 0.4],  // Default curve
      seasonalPatterns: [],
      confidence: 0.2,
    },
    vulnerabilityPatterns: {
      expressionStyle: 'indirect',
      safetyFactors: [],
      warmupTime: 15,
      protectedTopics: [],
      confidence: 0.2,
    },
    lastUpdated: Date.now(),
    totalObservations: 0,
    fingerprintVersion: CONFIG.FINGERPRINT_VERSION,
  };
}

function updateFingerprintFromObservation(
  fingerprint: CognitiveFingerprint,
  observation: FingerprintObservation
): void {
  fingerprint.totalObservations++;
  fingerprint.lastUpdated = observation.timestamp;

  // Type-specific updates are handled by specialized functions
  // This is a catch-all for observations that don't have specific handlers
}

function updateDecisionStyle(
  fingerprint: CognitiveFingerprint,
  style: DecisionStyle,
  outcome?: 'satisfied' | 'regret' | 'neutral'
): void {
  const lr = CONFIG.LEARNING_RATE;
  const ds = fingerprint.decisionStyle;

  ds.observations++;

  // If same as current primary, increase confidence
  if (style === ds.primary) {
    ds.confidence = Math.min(0.95, ds.confidence + lr);
  } else if (style === ds.secondary) {
    // Might be primary now
    if (ds.observations > CONFIG.MIN_OBSERVATIONS) {
      // Check if secondary should become primary
      ds.confidence *= (1 - lr);
    }
  } else {
    // New style observed - might become secondary
    if (!ds.secondary) {
      ds.secondary = style;
    } else if (ds.confidence < 0.5) {
      // Primary confidence is low, maybe switch
      ds.secondary = ds.primary;
      ds.primary = style;
      ds.confidence = 0.4;
    }
  }
}

function updateStressPatterns(
  fingerprint: CognitiveFingerprint,
  response: {
    style: StressResponse;
    stressLevel: number;
    trigger?: string;
    recoveryTime?: number;
  }
): void {
  const sr = fingerprint.stressResponse;
  const lr = CONFIG.LEARNING_RATE;

  sr.observations++;

  // Update primary response
  if (response.style === sr.primary) {
    sr.confidence = Math.min(0.95, sr.confidence + lr);
  } else if (!sr.secondary || response.style === sr.secondary) {
    sr.secondary = response.style;
    // Might need to swap if secondary is more common
  } else {
    sr.confidence *= (1 - lr * 0.5);
  }

  // Update recovery time
  if (response.recoveryTime) {
    sr.recoveryTime = sr.recoveryTime * (1 - lr) + response.recoveryTime * lr;
  }

  // Track trigger
  if (response.trigger) {
    if (!sr.escalationPattern.includes(response.trigger)) {
      sr.escalationPattern.push(response.trigger);
    }
  }
}

function updateChangeVelocity(
  fingerprint: CognitiveFingerprint,
  event: {
    type: 'insight' | 'action' | 'integration';
    timeSincePrevious?: number;
    catalyst?: string;
    resistance?: string;
  }
): void {
  const cv = fingerprint.changeVelocity;
  const lr = CONFIG.LEARNING_RATE;

  if (event.timeSincePrevious !== undefined) {
    if (event.type === 'action') {
      cv.insightToAction = cv.insightToAction * (1 - lr) + event.timeSincePrevious * lr;
      // Update speed based on insight-to-action time
      const speedFromTime = Math.max(0.1, 1 - event.timeSincePrevious / 168);  // 168h = 1 week
      cv.speed = cv.speed * (1 - lr) + speedFromTime * lr;
    } else if (event.type === 'integration') {
      cv.integrationTime = cv.integrationTime * (1 - lr) + (event.timeSincePrevious / 24) * lr;
    }
  }

  cv.confidence = Math.min(0.9, cv.confidence + lr * 0.5);
}

function updateTemporalPatterns(
  fingerprint: CognitiveFingerprint,
  data: {
    dayOfWeek: number;
    hour: number;
    effectiveness: number;
    tone: string;
    depthReached: string;
  }
): void {
  const tp = fingerprint.temporalPatterns;
  const lr = CONFIG.LEARNING_RATE;

  // Update optimal conversation times
  const existingTime = tp.optimalConversationTimes.find(
    (t) => t.dayOfWeek === data.dayOfWeek && Math.abs(t.hour - data.hour) < 2
  );

  if (existingTime) {
    existingTime.effectiveness =
      existingTime.effectiveness * (1 - lr) + data.effectiveness * lr;
  } else if (data.effectiveness > 0.6) {
    tp.optimalConversationTimes.push({
      dayOfWeek: data.dayOfWeek,
      hour: data.hour,
      effectiveness: data.effectiveness,
    });
  }

  // Keep only top 10 times
  tp.optimalConversationTimes.sort((a, b) => b.effectiveness - a.effectiveness);
  tp.optimalConversationTimes = tp.optimalConversationTimes.slice(0, 10);

  // Update weekly energy pattern
  tp.weeklyEnergyPattern[data.dayOfWeek] =
    tp.weeklyEnergyPattern[data.dayOfWeek] * (1 - lr) + data.effectiveness * lr;

  tp.confidence = Math.min(0.9, tp.confidence + lr * 0.3);

  // Update preferred tone in communication patterns
  if (data.effectiveness > 0.7) {
    fingerprint.communicationPatterns.preferredTone =
      data.tone as typeof fingerprint.communicationPatterns.preferredTone;
    fingerprint.communicationPatterns.confidence =
      Math.min(0.9, fingerprint.communicationPatterns.confidence + lr * 0.3);
  }
}

function updateVulnerabilityPatterns(
  fingerprint: CognitiveFingerprint,
  data: {
    style: 'direct' | 'indirect' | 'physical' | 'deflected';
    topic: string;
    warmupMinutes: number;
    safetyFactor?: string;
  }
): void {
  const vp = fingerprint.vulnerabilityPatterns;
  const lr = CONFIG.LEARNING_RATE;

  // Update expression style
  if (vp.expressionStyle === data.style) {
    vp.confidence = Math.min(0.9, vp.confidence + lr);
  } else if (vp.confidence < 0.5) {
    vp.expressionStyle = data.style;
    vp.confidence = 0.4;
  }

  // Update warmup time
  vp.warmupTime = vp.warmupTime * (1 - lr) + data.warmupMinutes * lr;

  // Track protected topics (topics they're less vulnerable about)
  if (data.style === 'deflected' && !vp.protectedTopics.includes(data.topic)) {
    vp.protectedTopics.push(data.topic);
  }

  // Track safety factors
  if (data.safetyFactor && !vp.safetyFactors.includes(data.safetyFactor)) {
    vp.safetyFactors.push(data.safetyFactor);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const cognitiveFingerprint = {
  recordObservation,
  recordDecision,
  recordStressResponse,
  recordChangeEvent,
  recordConversationEffectiveness,
  recordVulnerabilityMoment,
  getFingerprint,
  getFingerprintAspect,
  getPredictionAdjustments,
  buildFingerprintContext,
};

export default cognitiveFingerprint;
