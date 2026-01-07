/**
 * Superhuman Capabilities Persistence Layer - Better Than Human v4
 *
 * Persists the 8 superhuman predictive capabilities to Firestore.
 *
 * WHAT GETS PERSISTED:
 * 1. Avoidance Prediction - Topics they avoid, deflection patterns
 * 2. Breakthrough Proximity - Active breakthrough tracks, past breakthroughs
 * 3. Pre-Trajectory Detection - Precursor patterns, baselines, trajectory history
 * 4. Conversation Preparation - Topic history, needs patterns, temporal patterns
 * 5. Cognitive Fingerprint - Decision style, stress response, change velocity
 * 6. Ripple Effect Prediction - Domain states, influence patterns, event history
 * 7. Life Phase Prediction - Phase history, phase patterns, observations
 * 8. Intervention Timing - Timing patterns, intervention outcomes
 *
 * @module intelligence/predictive/superhuman-persistence
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../../services/superhuman/firestore-utils.js';
import { Timestamp } from '@google-cloud/firestore';

const log = createLogger({ module: 'SuperhumanPersistence' });

// ============================================================================
// TYPES - Match the capability interfaces
// ============================================================================

// Simplified persistence types that match capability data structures
export interface AvoidancePersistenceData {
  avoidedTopics: Array<{
    topic: string;
    firstDetected: number;
    lastDeflection: number;
    deflectionCount: number;
    primaryDeflectionStyle: string;
    triggerTopics: string[];
    emotionalStateOnDeflection: string[];
    lastMention?: number;
  }>;
  resolvedTopics: string[];
  avoidanceTendency: number;
  pressureBuildupRate: number;
  lastUpdated: number;
}

export interface BreakthroughPersistenceData {
  activeTracks: Array<{
    id: string;
    topic: string;
    indicators: Array<{
      type: string;
      strength: number;
      timestamp: number;
      content: string;
    }>;
    blockages: Array<{
      type: string;
      strength: number;
      description: string;
    }>;
    startedAt: number;
    lastActivity: number;
  }>;
  pastBreakthroughs: Array<{
    topic: string;
    type: string;
    timestamp: number;
    precursorIndicators: string[];
    catalystType: string;
    timeFromFirstIndicator: number;
    impact: number;
  }>;
  insightReadiness: number;
  lastUpdated: number;
}

export interface TrajectoryPersistenceData {
  patterns: Array<{
    trajectory: string;
    signals: Array<{
      signal: string;
      direction: string;
      typicalLeadTime: number;
      reliability: number;
      weight: number;
    }>;
    accuracy: number;
    observationCount: number;
  }>;
  baselines: Array<{
    signal: string;
    mean: number;
    stdDev: number;
    recentTrend: number;
    sampleCount: number;
  }>;
  trajectoryHistory: Array<{
    trajectory: string;
    startedAt: number;
    precursorsObserved: string[];
    leadTimeMs: number;
    severity: number;
    duration: number;
  }>;
  vulnerabilities: Array<{ trajectory: string; score: number }>;
  lastUpdated: number;
}

export interface ConversationPrepPersistenceData {
  topicHistory: Array<{
    topic: string;
    category: string;
    timestamp: number;
    emotionalIntensity: number;
    resolved: boolean;
    followUpNeeded: boolean;
    userInitiated: boolean;
  }>;
  needsHistory: Array<{
    timestamp: number;
    dayOfWeek: number;
    hourOfDay: number;
    primaryNeed: string;
  }>;
  recurringTopics: Array<{
    topic: string;
    frequency: number;
    avgIntensity: number;
    typicalDayOfWeek: number[];
    resolutionRate: number;
  }>;
  temporalPatterns: Array<{
    dayOfWeek?: number;
    timeOfDay?: string;
    likelyTopics: string[];
    likelyNeeds: string[];
    confidence: number;
  }>;
  lastUpdated: number;
}

export interface CognitiveFingerprintPersistenceData {
  decisionStyle: {
    primary: string;
    secondary?: string;
    confidence: number;
    observations: number;
  };
  stressResponse: {
    primary: string;
    secondary?: string;
    recoveryTime: number;
    escalationPattern: string[];
    deEscalationTriggers: string[];
    confidence: number;
    observations: number;
  };
  changeVelocity: {
    speed: number;
    insightToAction: number;
    integrationTime: number;
    preference: string;
    confidence: number;
  };
  communicationPatterns: {
    deflectionStyle: string;
    readinessSignals: string[];
    trustBuilders: string[];
    trustBreakers: string[];
    preferredTone: string;
    spaceNeeds: string;
    confidence: number;
  };
  growthPatterns: {
    learningStyle: string;
    resistancePatterns: string[];
    breakthroughCatalysts: string[];
    integrationTime: number;
    concurrentCapacity: number;
    confidence: number;
  };
  temporalPatterns: {
    optimalConversationTimes: Array<{
      dayOfWeek: number;
      hour: number;
      effectiveness: number;
    }>;
    weeklyEnergyPattern: number[];
    confidence: number;
  };
  vulnerabilityPatterns: {
    expressionStyle: string;
    safetyFactors: string[];
    warmupTime: number;
    protectedTopics: string[];
    confidence: number;
  };
  totalObservations: number;
  lastUpdated: number;
}

export interface RipplePersistenceData {
  domainStates: Array<{
    domain: string;
    health: number;
    stability: number;
    trend: string;
    lastUpdated: number;
  }>;
  influencePatterns: Array<{
    sourceDomain: string;
    targetDomain: string;
    eventType: string;
    typicalEffect: string;
    typicalMagnitude: number;
    typicalDelay: number;
    observationCount: number;
    reliability: number;
  }>;
  eventHistory: Array<{
    domain: string;
    eventType: string;
    magnitude: number;
    description: string;
    timestamp: number;
  }>;
  lastUpdated: number;
}

export interface LifePhasePersistenceData {
  currentPhase: string;
  phaseStarted: number;
  phaseHistory: Array<{
    fromPhase: string;
    toPhase: string;
    timestamp: number;
    duration: number;
    smoothness: string;
  }>;
  phasePatterns: {
    typicalDurations: Array<{ phase: string; duration: number }>;
    commonSequences: Array<{
      from: string;
      to: string;
      probability: number;
    }>;
  };
  phaseTendencies: Array<{ phase: string; score: number }>;
  lastUpdated: number;
}

export interface InterventionTimingPersistenceData {
  patterns: Array<{
    interventionType: string;
    optimalConditions: {
      emotionalStates: string[];
      timeOfDay: string[];
      dayOfWeek: number[];
      contraindications: string[];
    };
    successRate: number;
    observations: number;
    confidence: number;
    lastUpdated: number;
  }>;
  outcomes: Array<{
    interventionType: string;
    timestamp: number;
    conditions: {
      emotionalState?: string;
      topic?: string;
      timeOfDay: string;
      dayOfWeek: number;
    };
    outcome: string;
    responseType: string;
    effectivenessScore: number;
  }>;
  globalPreferences: {
    bestDaysForDeepWork: number[];
    bestTimeForChallenge: string;
    needsWarmupTime: boolean;
    sensitiveToTiming: boolean;
  };
  lastUpdated: number;
}

// ============================================================================
// SAVE FUNCTIONS
// ============================================================================

async function saveToFirestore(
  userId: string,
  docName: string,
  data: Record<string, unknown>
): Promise<void> {
  const firestore = getFirestoreDb();
  if (!firestore) {
    log.debug({ userId, docName }, 'Firestore not available, skipping save');
    return;
  }

  try {
    const docRef = firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('superhuman_predictive')
      .doc(docName);

    const cleanedData = cleanForFirestore({
      ...data,
      updatedAt: Timestamp.now(),
    });

    await docRef.set(cleanedData, { merge: true });
    log.debug({ userId, docName }, 'Superhuman data saved');
  } catch (error) {
    log.warn({ error: String(error), userId, docName }, 'Failed to save superhuman data');
  }
}

async function loadFromFirestore<T>(userId: string, docName: string): Promise<T | null> {
  const firestore = getFirestoreDb();
  if (!firestore) return null;

  try {
    const docRef = firestore
      .collection('bogle_users')
      .doc(userId)
      .collection('superhuman_predictive')
      .doc(docName);

    const doc = await docRef.get();
    if (!doc.exists) return null;

    log.debug({ userId, docName }, 'Superhuman data loaded');
    return doc.data() as T;
  } catch (error) {
    log.warn({ error: String(error), userId, docName }, 'Failed to load superhuman data');
    return null;
  }
}

// ============================================================================
// INDIVIDUAL CAPABILITY PERSISTENCE
// ============================================================================

export async function saveAvoidanceState(
  userId: string,
  data: AvoidancePersistenceData
): Promise<void> {
  await saveToFirestore(userId, 'avoidance', data);
}

export async function loadAvoidanceState(
  userId: string
): Promise<AvoidancePersistenceData | null> {
  return loadFromFirestore<AvoidancePersistenceData>(userId, 'avoidance');
}

export async function saveBreakthroughState(
  userId: string,
  data: BreakthroughPersistenceData
): Promise<void> {
  // Trim to last 50 active tracks
  const trimmedData = {
    ...data,
    activeTracks: data.activeTracks.slice(-50),
    pastBreakthroughs: data.pastBreakthroughs.slice(-100),
  };
  await saveToFirestore(userId, 'breakthrough', trimmedData);
}

export async function loadBreakthroughState(
  userId: string
): Promise<BreakthroughPersistenceData | null> {
  return loadFromFirestore<BreakthroughPersistenceData>(userId, 'breakthrough');
}

export async function saveTrajectoryState(
  userId: string,
  data: TrajectoryPersistenceData
): Promise<void> {
  // Trim history
  const trimmedData = {
    ...data,
    trajectoryHistory: data.trajectoryHistory.slice(-200),
  };
  await saveToFirestore(userId, 'trajectory', trimmedData);
}

export async function loadTrajectoryState(
  userId: string
): Promise<TrajectoryPersistenceData | null> {
  return loadFromFirestore<TrajectoryPersistenceData>(userId, 'trajectory');
}

export async function saveConversationPrepState(
  userId: string,
  data: ConversationPrepPersistenceData
): Promise<void> {
  // Trim history
  const trimmedData = {
    ...data,
    topicHistory: data.topicHistory.slice(-200),
    needsHistory: data.needsHistory.slice(-200),
  };
  await saveToFirestore(userId, 'conversation_prep', trimmedData);
}

export async function loadConversationPrepState(
  userId: string
): Promise<ConversationPrepPersistenceData | null> {
  return loadFromFirestore<ConversationPrepPersistenceData>(userId, 'conversation_prep');
}

export async function saveCognitiveFingerprintState(
  userId: string,
  data: CognitiveFingerprintPersistenceData
): Promise<void> {
  await saveToFirestore(userId, 'cognitive_fingerprint', data);
}

export async function loadCognitiveFingerprintState(
  userId: string
): Promise<CognitiveFingerprintPersistenceData | null> {
  return loadFromFirestore<CognitiveFingerprintPersistenceData>(userId, 'cognitive_fingerprint');
}

export async function saveRippleState(
  userId: string,
  data: RipplePersistenceData
): Promise<void> {
  // Trim event history
  const trimmedData = {
    ...data,
    eventHistory: data.eventHistory.slice(-200),
  };
  await saveToFirestore(userId, 'ripple', trimmedData);
}

export async function loadRippleState(
  userId: string
): Promise<RipplePersistenceData | null> {
  return loadFromFirestore<RipplePersistenceData>(userId, 'ripple');
}

export async function saveLifePhaseState(
  userId: string,
  data: LifePhasePersistenceData
): Promise<void> {
  await saveToFirestore(userId, 'life_phase', data);
}

export async function loadLifePhaseState(
  userId: string
): Promise<LifePhasePersistenceData | null> {
  return loadFromFirestore<LifePhasePersistenceData>(userId, 'life_phase');
}

export async function saveInterventionTimingState(
  userId: string,
  data: InterventionTimingPersistenceData
): Promise<void> {
  // Trim outcomes
  const trimmedData = {
    ...data,
    outcomes: data.outcomes.slice(-200),
  };
  await saveToFirestore(userId, 'intervention_timing', trimmedData);
}

export async function loadInterventionTimingState(
  userId: string
): Promise<InterventionTimingPersistenceData | null> {
  return loadFromFirestore<InterventionTimingPersistenceData>(userId, 'intervention_timing');
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

const dirtyUsers = new Set<string>();
const lastFlushTime = new Map<string, number>();
const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function markSuperhumanDirty(userId: string): void {
  dirtyUsers.add(userId);
}

export async function flushSuperhumanState(
  userId: string,
  getters: {
    getAvoidance: (userId: string) => AvoidancePersistenceData | null;
    getBreakthrough: (userId: string) => BreakthroughPersistenceData | null;
    getTrajectory: (userId: string) => TrajectoryPersistenceData | null;
    getConversationPrep: (userId: string) => ConversationPrepPersistenceData | null;
    getCognitiveFingerprint: (userId: string) => CognitiveFingerprintPersistenceData | null;
    getRipple: (userId: string) => RipplePersistenceData | null;
    getLifePhase: (userId: string) => LifePhasePersistenceData | null;
    getInterventionTiming: (userId: string) => InterventionTimingPersistenceData | null;
  }
): Promise<void> {
  const promises: Promise<void>[] = [];

  const avoidance = getters.getAvoidance(userId);
  if (avoidance) promises.push(saveAvoidanceState(userId, avoidance));

  const breakthrough = getters.getBreakthrough(userId);
  if (breakthrough) promises.push(saveBreakthroughState(userId, breakthrough));

  const trajectory = getters.getTrajectory(userId);
  if (trajectory) promises.push(saveTrajectoryState(userId, trajectory));

  const conversationPrep = getters.getConversationPrep(userId);
  if (conversationPrep) promises.push(saveConversationPrepState(userId, conversationPrep));

  const cognitiveFingerprint = getters.getCognitiveFingerprint(userId);
  if (cognitiveFingerprint) promises.push(saveCognitiveFingerprintState(userId, cognitiveFingerprint));

  const ripple = getters.getRipple(userId);
  if (ripple) promises.push(saveRippleState(userId, ripple));

  const lifePhase = getters.getLifePhase(userId);
  if (lifePhase) promises.push(saveLifePhaseState(userId, lifePhase));

  const interventionTiming = getters.getInterventionTiming(userId);
  if (interventionTiming) promises.push(saveInterventionTimingState(userId, interventionTiming));

  await Promise.all(promises);
  dirtyUsers.delete(userId);
  lastFlushTime.set(userId, Date.now());

  log.debug({ userId }, '🧠 Flushed superhuman predictive state');
}

export async function flushAllDirtySuperhumanUsers(
  getters: Parameters<typeof flushSuperhumanState>[1]
): Promise<{ flushed: number; errors: number }> {
  const now = Date.now();
  let flushed = 0;
  let errors = 0;

  for (const userId of Array.from(dirtyUsers)) {
    const lastFlush = lastFlushTime.get(userId) || 0;
    if (now - lastFlush < FLUSH_INTERVAL_MS) continue;

    try {
      await flushSuperhumanState(userId, getters);
      flushed++;
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to flush superhuman state');
      errors++;
    }
  }

  if (flushed > 0) {
    log.info({ flushed, errors }, 'Flushed dirty superhuman state');
  }

  return { flushed, errors };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const superhumanPersistence = {
  // Individual save/load
  saveAvoidance: saveAvoidanceState,
  loadAvoidance: loadAvoidanceState,
  saveBreakthrough: saveBreakthroughState,
  loadBreakthrough: loadBreakthroughState,
  saveTrajectory: saveTrajectoryState,
  loadTrajectory: loadTrajectoryState,
  saveConversationPrep: saveConversationPrepState,
  loadConversationPrep: loadConversationPrepState,
  saveCognitiveFingerprint: saveCognitiveFingerprintState,
  loadCognitiveFingerprint: loadCognitiveFingerprintState,
  saveRipple: saveRippleState,
  loadRipple: loadRippleState,
  saveLifePhase: saveLifePhaseState,
  loadLifePhase: loadLifePhaseState,
  saveInterventionTiming: saveInterventionTimingState,
  loadInterventionTiming: loadInterventionTimingState,
  // Batch
  markDirty: markSuperhumanDirty,
  flushUser: flushSuperhumanState,
  flushAllDirty: flushAllDirtySuperhumanUsers,
};

export default superhumanPersistence;
