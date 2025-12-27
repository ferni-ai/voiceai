/**
 * Web Experiments Service
 *
 * A/B testing for web properties (landing pages, UI variants, CTAs).
 * Separate from persona experiments - these are simpler, web-focused tests.
 *
 * Features:
 * - Deterministic variant assignment (same user always sees same variant)
 * - Percentage-based traffic allocation
 * - Conversion tracking with funnels
 * - Statistical significance calculation
 * - Real-time metrics
 *
 * @module services/experiments/web-experiments
 */

import crypto from 'crypto';
import admin from 'firebase-admin';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getGCPProjectId } from '../../config/environment.js';
import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'WebExperiments' });

// ============================================================================
// FIREBASE INITIALIZATION
// ============================================================================

let db: Firestore | null = null;

function getDb(): Firestore {
  if (!db) {
    // Initialize Firebase if not already done
    if (admin.apps.length === 0) {
      const projectId = getGCPProjectId();
      if (projectId) {
        admin.initializeApp({ projectId });
      } else {
        admin.initializeApp();
      }
      log.info('Firebase initialized by WebExperiments');
    }
    db = getFirestore();
  }
  return db;
}

// ============================================================================
// TYPES
// ============================================================================

export interface WebExperimentVariant {
  id: string;
  name: string;
  weight: number; // 0-100, all variants should sum to 100
  description?: string;
}

export interface WebExperiment {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'running' | 'paused' | 'completed';

  // Variants
  variants: WebExperimentVariant[];

  // Targeting
  targetAudience?: {
    percentOfTraffic?: number; // 0-100, what % of users are in experiment
    newUsersOnly?: boolean;
    countries?: string[];
    devices?: ('mobile' | 'tablet' | 'desktop')[];
    sources?: string[]; // utm_source values
  };

  // Goals
  primaryGoal: string; // e.g., 'cta_click', 'signup', 'subscription'
  secondaryGoals?: string[];

  // Timing
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  scheduledStart?: Date;
  scheduledEnd?: Date;

  // Minimum sample before significance can be calculated
  minimumSamples: number;

  // Results
  winner?: string;
  winnerConfidence?: number;
}

export interface WebExperimentMetrics {
  experimentId: string;
  variantId: string;
  exposures: number;
  conversions: Record<string, number>; // goalId -> count
  conversionRates: Record<string, number>; // goalId -> rate
  updatedAt: Date;
}

export interface ExperimentEvent {
  experimentId: string;
  variantId: string;
  userId: string;
  sessionId?: string;
  eventType: 'exposure' | 'conversion';
  goalId?: string; // For conversions
  value?: number; // Optional value (e.g., revenue)
  metadata?: Record<string, unknown>;
  timestamp: Date;
  userAgent?: string;
  country?: string;
  device?: string;
  source?: string;
}

export interface VariantAssignment {
  experimentId: string;
  variantId: string;
  assignedAt: Date;
  isNewAssignment: boolean;
}

export interface ExperimentAnalysis {
  experimentId: string;
  variants: Array<{
    id: string;
    name: string;
    exposures: number;
    conversions: number;
    conversionRate: number;
    improvement?: number; // vs control
  }>;
  winner: string | null;
  confidence: number;
  isSignificant: boolean;
  recommendation: string;
  sampleSize: number;
  minimumSamples: number;
  progress: number; // 0-100
}

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const experimentsCache = new Map<string, WebExperiment>();
const metricsCache = new Map<string, Map<string, WebExperimentMetrics>>();
const assignmentsCache = new Map<string, Map<string, string>>(); // experimentId -> userId -> variantId

let cacheInitialized = false;
let cacheLastRefresh = 0;
const CACHE_TTL = 60000; // 1 minute

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the web experiments cache from Firestore
 */
export async function initWebExperiments(): Promise<void> {
  if (cacheInitialized && Date.now() - cacheLastRefresh < CACHE_TTL) {
    return;
  }

  try {
    const db = getDb();

    // Load all experiments
    const experimentsSnap = await db.collection('web_experiments').get();
    experimentsCache.clear();

    for (const doc of experimentsSnap.docs) {
      const data = doc.data();
      const experiment: WebExperiment = {
        id: doc.id,
        name: data.name,
        description: data.description,
        status: data.status,
        variants: data.variants || [],
        targetAudience: data.targetAudience,
        primaryGoal: data.primaryGoal || 'conversion',
        secondaryGoals: data.secondaryGoals,
        createdAt: data.createdAt?.toDate() || new Date(),
        startedAt: data.startedAt?.toDate(),
        endedAt: data.endedAt?.toDate(),
        scheduledStart: data.scheduledStart?.toDate(),
        scheduledEnd: data.scheduledEnd?.toDate(),
        minimumSamples: data.minimumSamples || 1000,
        winner: data.winner,
        winnerConfidence: data.winnerConfidence,
      };
      experimentsCache.set(doc.id, experiment);
    }

    // Load metrics for running experiments
    const runningExperiments = Array.from(experimentsCache.values()).filter(
      (e) => e.status === 'running'
    );

    for (const exp of runningExperiments) {
      const metricsSnap = await db
        .collection('web_experiments')
        .doc(exp.id)
        .collection('metrics')
        .get();

      const expMetrics = new Map<string, WebExperimentMetrics>();
      for (const doc of metricsSnap.docs) {
        const data = doc.data();
        expMetrics.set(doc.id, {
          experimentId: exp.id,
          variantId: doc.id,
          exposures: data.exposures || 0,
          conversions: data.conversions || {},
          conversionRates: data.conversionRates || {},
          updatedAt: data.updatedAt?.toDate() || new Date(),
        });
      }
      metricsCache.set(exp.id, expMetrics);
    }

    cacheInitialized = true;
    cacheLastRefresh = Date.now();
    log.info({ experimentCount: experimentsCache.size }, 'Web experiments cache initialized');
  } catch (error) {
    log.error({ error }, 'Failed to initialize web experiments cache');
    throw error;
  }
}

// ============================================================================
// VARIANT ASSIGNMENT
// ============================================================================

/**
 * Deterministically assign a user to a variant
 * Same user always gets same variant for same experiment
 */
export async function assignVariant(
  experimentId: string,
  userId: string,
  context?: {
    isNewUser?: boolean;
    country?: string;
    device?: 'mobile' | 'tablet' | 'desktop';
    source?: string;
  }
): Promise<VariantAssignment | null> {
  await initWebExperiments();

  const experiment = experimentsCache.get(experimentId);
  if (!experiment) {
    log.warn({ experimentId }, 'Experiment not found');
    return null;
  }

  // Check if experiment is running
  if (experiment.status !== 'running') {
    log.debug({ experimentId, status: experiment.status }, 'Experiment not running');
    return null;
  }

  // Check targeting rules
  if (!passesTargeting(experiment, userId, context)) {
    log.debug({ experimentId, userId }, 'User does not pass targeting');
    return null;
  }

  // Check if user already has an assignment
  const existingAssignment = await getExistingAssignment(experimentId, userId);
  if (existingAssignment) {
    return {
      experimentId,
      variantId: existingAssignment,
      assignedAt: new Date(),
      isNewAssignment: false,
    };
  }

  // Generate deterministic assignment using hash
  const variantId = hashAssignment(experimentId, userId, experiment.variants);

  // Persist assignment
  await persistAssignment(experimentId, userId, variantId);

  log.debug({ experimentId, userId, variantId }, 'Assigned user to variant');

  return {
    experimentId,
    variantId,
    assignedAt: new Date(),
    isNewAssignment: true,
  };
}

/**
 * Check if user passes targeting rules
 */
function passesTargeting(
  experiment: WebExperiment,
  userId: string,
  context?: {
    isNewUser?: boolean;
    country?: string;
    device?: 'mobile' | 'tablet' | 'desktop';
    source?: string;
  }
): boolean {
  const targeting = experiment.targetAudience;
  if (!targeting) return true;

  // Check traffic allocation
  if (targeting.percentOfTraffic !== undefined && targeting.percentOfTraffic < 100) {
    const hash = crypto
      .createHash('md5')
      .update(`${userId}:${experiment.id}:traffic`)
      .digest('hex');
    const bucket = parseInt(hash.substring(0, 8), 16) % 100;
    if (bucket >= targeting.percentOfTraffic) {
      return false;
    }
  }

  // Check new users only
  if (targeting.newUsersOnly && !context?.isNewUser) {
    return false;
  }

  // Check country
  if (targeting.countries?.length && context?.country) {
    if (!targeting.countries.includes(context.country)) {
      return false;
    }
  }

  // Check device
  if (targeting.devices?.length && context?.device) {
    if (!targeting.devices.includes(context.device)) {
      return false;
    }
  }

  // Check source
  if (targeting.sources?.length && context?.source) {
    if (!targeting.sources.includes(context.source)) {
      return false;
    }
  }

  return true;
}

/**
 * Generate deterministic variant assignment using MD5 hash
 */
function hashAssignment(
  experimentId: string,
  userId: string,
  variants: WebExperimentVariant[]
): string {
  const hash = crypto.createHash('md5').update(`${userId}:${experimentId}`).digest('hex');

  const bucket = parseInt(hash.substring(0, 8), 16) % 100;

  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.weight;
    if (bucket < cumulative) {
      return variant.id;
    }
  }

  // Fallback to first variant
  return variants[0]?.id || 'control';
}

/**
 * Get existing assignment from cache or Firestore
 */
async function getExistingAssignment(experimentId: string, userId: string): Promise<string | null> {
  // Check cache first
  const expAssignments = assignmentsCache.get(experimentId);
  if (expAssignments?.has(userId)) {
    return expAssignments.get(userId)!;
  }

  // Check Firestore
  try {
    const db = getDb();
    const doc = await db
      .collection('web_experiments')
      .doc(experimentId)
      .collection('assignments')
      .doc(userId)
      .get();

    if (doc.exists) {
      const variantId = doc.data()?.variantId;

      // Update cache
      if (!assignmentsCache.has(experimentId)) {
        assignmentsCache.set(experimentId, new Map());
      }
      assignmentsCache.get(experimentId)!.set(userId, variantId);

      return variantId;
    }
  } catch (error) {
    log.warn({ error, experimentId, userId }, 'Failed to check existing assignment');
  }

  return null;
}

/**
 * Persist assignment to Firestore
 */
async function persistAssignment(
  experimentId: string,
  userId: string,
  variantId: string
): Promise<void> {
  try {
    const db = getDb();
    await db
      .collection('web_experiments')
      .doc(experimentId)
      .collection('assignments')
      .doc(userId)
      .set(
        removeUndefined({
          variantId,
          assignedAt: FieldValue.serverTimestamp(),
        })
      );

    // Update cache
    if (!assignmentsCache.has(experimentId)) {
      assignmentsCache.set(experimentId, new Map());
    }
    assignmentsCache.get(experimentId)!.set(userId, variantId);
  } catch (error) {
    log.warn({ error, experimentId, userId, variantId }, 'Failed to persist assignment');
  }
}

// ============================================================================
// EVENT TRACKING
// ============================================================================

/**
 * Track an exposure event (user saw the variant)
 */
export async function trackExposure(
  experimentId: string,
  variantId: string,
  userId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await trackEvent({
    experimentId,
    variantId,
    userId,
    eventType: 'exposure',
    metadata,
    timestamp: new Date(),
  });
}

/**
 * Track a conversion event
 */
export async function trackConversion(
  experimentId: string,
  variantId: string,
  userId: string,
  goalId: string,
  value?: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  await trackEvent({
    experimentId,
    variantId,
    userId,
    eventType: 'conversion',
    goalId,
    value,
    metadata,
    timestamp: new Date(),
  });
}

/**
 * Track an event (internal)
 */
async function trackEvent(event: ExperimentEvent): Promise<void> {
  try {
    const db = getDb();

    // Write event to events collection
    await db
      .collection('web_experiments')
      .doc(event.experimentId)
      .collection('events')
      .add(
        removeUndefined({
          ...event,
          timestamp: FieldValue.serverTimestamp(),
        })
      );

    // Update metrics (increment counters)
    const metricsRef = db
      .collection('web_experiments')
      .doc(event.experimentId)
      .collection('metrics')
      .doc(event.variantId);

    if (event.eventType === 'exposure') {
      await metricsRef.set(
        cleanForFirestore({
          exposures: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        }),
        { merge: true }
      );
    } else if (event.eventType === 'conversion' && event.goalId) {
      await metricsRef.set(
        cleanForFirestore({
          [`conversions.${event.goalId}`]: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        }),
        { merge: true }
      );
    }

    log.debug(
      {
        experimentId: event.experimentId,
        variantId: event.variantId,
        eventType: event.eventType,
        goalId: event.goalId,
      },
      'Event tracked'
    );
  } catch (error) {
    log.warn({ error, event }, 'Failed to track event');
  }
}

// ============================================================================
// ANALYSIS
// ============================================================================

/**
 * Analyze experiment results
 */
export async function analyzeExperiment(experimentId: string): Promise<ExperimentAnalysis | null> {
  await initWebExperiments();

  const experiment = experimentsCache.get(experimentId);
  if (!experiment) {
    return null;
  }

  // Get metrics from Firestore for fresh data
  const db = getDb();
  const metricsSnap = await db
    .collection('web_experiments')
    .doc(experimentId)
    .collection('metrics')
    .get();

  const variantStats: ExperimentAnalysis['variants'] = [];
  let totalExposures = 0;

  // Find control variant
  const controlVariant =
    experiment.variants.find((v) => v.id === 'control') || experiment.variants[0];
  let controlRate = 0;

  for (const doc of metricsSnap.docs) {
    const data = doc.data();
    const variantId = doc.id;
    const variantConfig = experiment.variants.find((v) => v.id === variantId);

    const exposures = data.exposures || 0;
    const conversions = data.conversions?.[experiment.primaryGoal] || 0;
    const conversionRate = exposures > 0 ? conversions / exposures : 0;

    totalExposures += exposures;

    if (variantId === controlVariant?.id) {
      controlRate = conversionRate;
    }

    variantStats.push({
      id: variantId,
      name: variantConfig?.name || variantId,
      exposures,
      conversions,
      conversionRate,
    });
  }

  // Calculate improvement for non-control variants
  for (const variant of variantStats) {
    if (variant.id !== controlVariant?.id && controlRate > 0) {
      variant.improvement = ((variant.conversionRate - controlRate) / controlRate) * 100;
    }
  }

  // Calculate statistical significance (chi-squared test)
  const { winner, confidence, isSignificant } = calculateSignificance(
    variantStats,
    experiment.minimumSamples
  );

  const progress = Math.min(100, Math.round((totalExposures / experiment.minimumSamples) * 100));

  let recommendation: string;
  if (totalExposures < experiment.minimumSamples) {
    recommendation = `Need more data. ${totalExposures.toLocaleString()} / ${experiment.minimumSamples.toLocaleString()} minimum samples.`;
  } else if (!isSignificant) {
    recommendation =
      'No statistically significant difference detected. Consider running longer or testing bigger changes.';
  } else {
    const winnerStats = variantStats.find((v) => v.id === winner);
    recommendation = `${winner} wins with ${confidence}% confidence! (${winnerStats?.improvement?.toFixed(1)}% lift). Ready to ship.`;
  }

  return {
    experimentId,
    variants: variantStats,
    winner: isSignificant ? winner : null,
    confidence,
    isSignificant,
    recommendation,
    sampleSize: totalExposures,
    minimumSamples: experiment.minimumSamples,
    progress,
  };
}

/**
 * Calculate statistical significance using chi-squared test
 */
function calculateSignificance(
  variants: ExperimentAnalysis['variants'],
  minimumSamples: number
): { winner: string | null; confidence: number; isSignificant: boolean } {
  if (variants.length < 2) {
    return { winner: null, confidence: 0, isSignificant: false };
  }

  const totalExposures = variants.reduce((sum, v) => sum + v.exposures, 0);
  if (totalExposures < minimumSamples) {
    return { winner: null, confidence: 0, isSignificant: false };
  }

  // For 2 variants, use z-test
  const [a, b] = variants;
  if (variants.length === 2 && a.exposures > 0 && b.exposures > 0) {
    const pooledRate = (a.conversions + b.conversions) / (a.exposures + b.exposures);
    const se = Math.sqrt(pooledRate * (1 - pooledRate) * (1 / a.exposures + 1 / b.exposures));

    if (se > 0) {
      const zScore = (b.conversionRate - a.conversionRate) / se;
      const confidence = Math.min(99, Math.round(zScoreToConfidence(Math.abs(zScore)) * 100));
      const isSignificant = confidence >= 95;
      const winner = isSignificant ? (b.conversionRate > a.conversionRate ? b.id : a.id) : null;

      return { winner, confidence, isSignificant };
    }
  }

  // For more variants, find best performer
  const sorted = [...variants].sort((a, b) => b.conversionRate - a.conversionRate);
  const best = sorted[0];
  const secondBest = sorted[1];

  if (best && secondBest && best.exposures > 0 && secondBest.exposures > 0) {
    const pooledRate =
      (best.conversions + secondBest.conversions) / (best.exposures + secondBest.exposures);
    const se = Math.sqrt(
      pooledRate * (1 - pooledRate) * (1 / best.exposures + 1 / secondBest.exposures)
    );

    if (se > 0) {
      const zScore = (best.conversionRate - secondBest.conversionRate) / se;
      const confidence = Math.min(99, Math.round(zScoreToConfidence(Math.abs(zScore)) * 100));
      const isSignificant = confidence >= 95;

      return {
        winner: isSignificant ? best.id : null,
        confidence,
        isSignificant,
      };
    }
  }

  return { winner: null, confidence: 0, isSignificant: false };
}

/**
 * Convert z-score to confidence level
 */
function zScoreToConfidence(zScore: number): number {
  const absZ = Math.abs(zScore);
  const t = 1 / (1 + 0.2316419 * absZ);
  const d = 0.3989423 * Math.exp((-absZ * absZ) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return 1 - p;
}

// ============================================================================
// EXPERIMENT MANAGEMENT
// ============================================================================

/**
 * Create a new web experiment
 */
export async function createWebExperiment(config: {
  name: string;
  description?: string;
  variants: WebExperimentVariant[];
  primaryGoal: string;
  secondaryGoals?: string[];
  targetAudience?: WebExperiment['targetAudience'];
  minimumSamples?: number;
}): Promise<WebExperiment> {
  const db = getDb();

  const experiment: Omit<WebExperiment, 'id'> = {
    name: config.name,
    description: config.description,
    status: 'draft',
    variants: config.variants,
    primaryGoal: config.primaryGoal,
    secondaryGoals: config.secondaryGoals,
    targetAudience: config.targetAudience,
    minimumSamples: config.minimumSamples || 1000,
    createdAt: new Date(),
  };

  const docRef = await db.collection('web_experiments').add(
    removeUndefined({
      ...experiment,
      createdAt: FieldValue.serverTimestamp(),
    })
  );

  const created: WebExperiment = {
    ...experiment,
    id: docRef.id,
  };

  experimentsCache.set(docRef.id, created);

  log.info({ experimentId: docRef.id, name: config.name }, 'Web experiment created');

  return created;
}

/**
 * Start an experiment
 */
export async function startWebExperiment(experimentId: string): Promise<void> {
  const db = getDb();

  await db.collection('web_experiments').doc(experimentId).update(cleanForFirestore({
    status: 'running',
    startedAt: FieldValue.serverTimestamp(),
  }));

  const experiment = experimentsCache.get(experimentId);
  if (experiment) {
    experiment.status = 'running';
    experiment.startedAt = new Date();
  }

  log.info({ experimentId }, 'Web experiment started');
}

/**
 * Pause an experiment
 */
export async function pauseWebExperiment(experimentId: string): Promise<void> {
  const db = getDb();

  await db.collection('web_experiments').doc(experimentId).update(cleanForFirestore({
    status: 'paused',
  }));

  const experiment = experimentsCache.get(experimentId);
  if (experiment) {
    experiment.status = 'paused';
  }

  log.info({ experimentId }, 'Web experiment paused');
}

/**
 * Complete an experiment with a winner
 */
export async function completeWebExperiment(
  experimentId: string,
  winner: string,
  confidence: number
): Promise<void> {
  const db = getDb();

  await db.collection('web_experiments').doc(experimentId).update(cleanForFirestore({
    status: 'completed',
    endedAt: FieldValue.serverTimestamp(),
    winner,
    winnerConfidence: confidence,
  }));

  const experiment = experimentsCache.get(experimentId);
  if (experiment) {
    experiment.status = 'completed';
    experiment.endedAt = new Date();
    experiment.winner = winner;
    experiment.winnerConfidence = confidence;
  }

  log.info({ experimentId, winner, confidence }, 'Web experiment completed');
}

/**
 * Get all web experiments
 */
export async function getWebExperiments(): Promise<WebExperiment[]> {
  await initWebExperiments();
  return Array.from(experimentsCache.values());
}

/**
 * Get a single experiment
 */
export async function getWebExperiment(experimentId: string): Promise<WebExperiment | null> {
  await initWebExperiments();
  return experimentsCache.get(experimentId) || null;
}

/**
 * Get running experiments only
 */
export async function getRunningWebExperiments(): Promise<WebExperiment[]> {
  await initWebExperiments();
  return Array.from(experimentsCache.values()).filter((e) => e.status === 'running');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initWebExperiments,
  assignVariant,
  trackExposure,
  trackConversion,
  analyzeExperiment,
  createWebExperiment,
  startWebExperiment,
  pauseWebExperiment,
  completeWebExperiment,
  getWebExperiments,
  getWebExperiment,
  getRunningWebExperiments,
};
