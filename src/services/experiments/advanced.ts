/**
 * Advanced Experiment Features
 *
 * Sophisticated A/B testing capabilities:
 * 1. Slack/Email alerting when experiments conclude
 * 2. Bayesian analysis for more accurate statistics
 * 3. Multi-Armed Bandit for dynamic traffic allocation
 * 4. Experiment scheduling (start/stop on dates)
 * 5. Segment analysis by user type
 *
 * @module services/experiment-advanced
 */

import { getLogger } from '../../utils/safe-logger.js';
import { registerInterval, hasInterval } from '../../utils/interval-manager.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import {
  getAgentEvolution,
  saveAgentEvolutionToFirestore,
  type PersonaExperiment,
} from '../../intelligence/collective/agent-evolution.js';

const logger = getLogger().child({ module: 'ExperimentAdvanced' });

// ============================================================================
// 1. ALERTING SERVICE
// ============================================================================

export interface ExperimentAlertConfig {
  /** Slack webhook URL for experiment alerts */
  slackWebhookUrl?: string;
  /** Email recipients for experiment alerts */
  emailRecipients?: string[];
  /** Alert on experiment conclusion */
  alertOnConclusion: boolean;
  /** Alert on significant results (before conclusion) */
  alertOnSignificance: boolean;
  /** Alert on experiment errors */
  alertOnError: boolean;
  /** Minimum improvement to alert (e.g., 0.05 = 5%) */
  minImprovementToAlert: number;
}

const DEFAULT_ALERT_CONFIG: ExperimentAlertConfig = {
  slackWebhookUrl:
    process.env.SLACK_EXPERIMENTS_WEBHOOK_URL || process.env.SLACK_ALERTS_WEBHOOK_URL,
  emailRecipients: process.env.EXPERIMENT_ALERT_EMAILS?.split(',').filter(Boolean),
  alertOnConclusion: true,
  alertOnSignificance: true,
  alertOnError: true,
  minImprovementToAlert: 0.05, // 5%
};

let alertConfig = { ...DEFAULT_ALERT_CONFIG };

/**
 * Configure experiment alerting
 */
export function configureExperimentAlerts(config: Partial<ExperimentAlertConfig>): void {
  alertConfig = { ...alertConfig, ...config };
  logger.info({ config: alertConfig }, 'Experiment alerting configured');
}

/**
 * Send alert when experiment concludes
 */
export async function sendExperimentConclusionAlert(
  experiment: PersonaExperiment,
  personaId: string
): Promise<void> {
  if (!alertConfig.alertOnConclusion) return;

  const improvement =
    experiment.metrics.engagement.treatment - experiment.metrics.engagement.control;
  const improvementPct = (improvement * 100).toFixed(1);
  const confidencePct = ((experiment.winnerConfidence || 0) * 100).toFixed(0);

  const message = {
    title: `🧪 Experiment Concluded: ${experiment.name}`,
    winner: experiment.winner || 'inconclusive',
    improvement: `${improvement > 0 ? '+' : ''}${improvementPct}%`,
    confidence: `${confidencePct}%`,
    persona: personaId,
    samples: experiment.metrics.engagement.controlN + experiment.metrics.engagement.treatmentN,
    recommendation:
      experiment.winner === 'treatment' && experiment.treatment.promptModification
        ? `Consider adopting: "${experiment.treatment.promptModification}"`
        : experiment.winner === 'control'
          ? 'Keep current behavior'
          : 'Results inconclusive - consider running longer or with more traffic',
  };

  // Send to Slack
  if (alertConfig.slackWebhookUrl) {
    await sendSlackAlert(message);
  }

  // Send email
  if (alertConfig.emailRecipients?.length) {
    await sendEmailAlert(message);
  }

  logger.info(message, '📧 Experiment conclusion alert sent');
}

/**
 * Send Slack alert
 */
async function sendSlackAlert(message: Record<string, unknown>): Promise<void> {
  if (!alertConfig.slackWebhookUrl) return;

  try {
    const slackPayload = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: message.title as string, emoji: true },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Winner:*\n${message.winner}` },
            { type: 'mrkdwn', text: `*Improvement:*\n${message.improvement}` },
            { type: 'mrkdwn', text: `*Confidence:*\n${message.confidence}` },
            { type: 'mrkdwn', text: `*Samples:*\n${message.samples}` },
          ],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Recommendation:*\n${message.recommendation}` },
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `Persona: ${message.persona}` }],
        },
      ],
    };

    const response = await fetch(alertConfig.slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Slack alert failed');
    }
  } catch (error) {
    logger.warn({ error: String(error) }, 'Failed to send Slack alert');
  }
}

/**
 * Send email alert via communication service
 */
async function sendEmailAlert(message: Record<string, unknown>): Promise<void> {
  if (!alertConfig.emailRecipients?.length) return;

  try {
    const { sendEmail } = await import('../communication/communication-service.js');

    const subject = `🧪 ${message.title}`;
    const body = `
Experiment Results
==================

Winner: ${message.winner}
Improvement: ${message.improvement}
Confidence: ${message.confidence}
Total Samples: ${message.samples}
Persona: ${message.persona}

Recommendation
--------------
${message.recommendation}

---
This is an automated alert from Ferni's A/B testing system.
    `.trim();

    for (const recipient of alertConfig.emailRecipients) {
      await sendEmail(recipient, subject, body, false);
    }

    logger.info(
      { recipients: alertConfig.emailRecipients },
      '📧 Email alerts sent for experiment conclusion'
    );
  } catch (error) {
    logger.warn({ error: String(error) }, 'Failed to send email alert');
  }
}

// ============================================================================
// 2. BAYESIAN ANALYSIS
// ============================================================================

export interface BayesianResult {
  /** Probability that treatment is better than control */
  probabilityTreatmentWins: number;
  /** Expected improvement (mean of posterior) */
  expectedImprovement: number;
  /** 95% credible interval for improvement */
  credibleInterval: [number, number];
  /** Expected loss if choosing treatment when control is actually better */
  expectedLoss: number;
  /** Recommendation based on Bayesian analysis */
  recommendation: 'adopt_treatment' | 'keep_control' | 'continue_testing';
  /** Confidence in the recommendation */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Perform Bayesian analysis on experiment results
 *
 * Uses Beta-Binomial conjugate prior for conversion/engagement rates
 */
export function performBayesianAnalysis(experiment: PersonaExperiment): BayesianResult {
  const { engagement } = experiment.metrics;

  // Beta prior parameters (weakly informative)
  const priorAlpha = 1;
  const priorBeta = 1;

  // Posterior parameters for control
  const controlSuccesses = Math.round(engagement.control * engagement.controlN);
  const controlFailures = engagement.controlN - controlSuccesses;
  const controlAlpha = priorAlpha + controlSuccesses;
  const controlBeta = priorBeta + controlFailures;

  // Posterior parameters for treatment
  const treatmentSuccesses = Math.round(engagement.treatment * engagement.treatmentN);
  const treatmentFailures = engagement.treatmentN - treatmentSuccesses;
  const treatmentAlpha = priorAlpha + treatmentSuccesses;
  const treatmentBeta = priorBeta + treatmentFailures;

  // Monte Carlo simulation for P(treatment > control)
  const simulations = 10000;
  let treatmentWins = 0;
  const improvements: number[] = [];

  for (let i = 0; i < simulations; i++) {
    const controlSample = betaSample(controlAlpha, controlBeta);
    const treatmentSample = betaSample(treatmentAlpha, treatmentBeta);
    const improvement = treatmentSample - controlSample;

    improvements.push(improvement);
    if (treatmentSample > controlSample) {
      treatmentWins++;
    }
  }

  const probabilityTreatmentWins = treatmentWins / simulations;

  // Sort improvements for credible interval
  improvements.sort((a, b) => a - b);
  const lowerIdx = Math.floor(simulations * 0.025);
  const upperIdx = Math.floor(simulations * 0.975);
  const credibleInterval: [number, number] = [improvements[lowerIdx], improvements[upperIdx]];

  // Expected improvement
  const expectedImprovement = improvements.reduce((a, b) => a + b, 0) / simulations;

  // Expected loss (cost of making wrong decision)
  // If we adopt treatment but control is better, what do we lose?
  const expectedLoss =
    improvements.filter((i) => i < 0).reduce((sum, i) => sum + Math.abs(i), 0) / simulations;

  // Generate recommendation
  let recommendation: BayesianResult['recommendation'];
  let confidence: BayesianResult['confidence'];

  if (probabilityTreatmentWins >= 0.95 && expectedLoss < 0.01) {
    recommendation = 'adopt_treatment';
    confidence = 'high';
  } else if (probabilityTreatmentWins >= 0.85 && expectedLoss < 0.02) {
    recommendation = 'adopt_treatment';
    confidence = 'medium';
  } else if (probabilityTreatmentWins <= 0.15 && expectedLoss < 0.01) {
    recommendation = 'keep_control';
    confidence = 'high';
  } else if (probabilityTreatmentWins <= 0.25) {
    recommendation = 'keep_control';
    confidence = 'medium';
  } else {
    recommendation = 'continue_testing';
    confidence = 'low';
  }

  return {
    probabilityTreatmentWins,
    expectedImprovement,
    credibleInterval,
    expectedLoss,
    recommendation,
    confidence,
  };
}

/**
 * Sample from Beta distribution using the Gamma distribution trick
 */
function betaSample(alpha: number, beta: number): number {
  const x = gammaSample(alpha);
  const y = gammaSample(beta);
  return x / (x + y);
}

/**
 * Sample from Gamma distribution using Marsaglia and Tsang's method
 */
function gammaSample(shape: number): number {
  if (shape < 1) {
    return gammaSample(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number;
    let v: number;

    do {
      x = normalSample();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();

    if (u < 1 - 0.0331 * x * x * x * x) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}

/**
 * Sample from standard normal distribution using Box-Muller transform
 */
function normalSample(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ============================================================================
// 3. MULTI-ARMED BANDIT
// ============================================================================

export interface BanditConfig {
  /** Enable MAB mode */
  enabled: boolean;
  /** Algorithm: 'thompson' (Thompson Sampling) or 'ucb' (Upper Confidence Bound) */
  algorithm: 'thompson' | 'ucb';
  /** Minimum exploration rate (ensures we keep testing) */
  minExplorationRate: number;
  /** Update interval in sessions */
  updateIntervalSessions: number;
}

const DEFAULT_BANDIT_CONFIG: BanditConfig = {
  enabled: false,
  algorithm: 'thompson',
  minExplorationRate: 0.1, // Always explore 10%
  updateIntervalSessions: 10,
};

let banditConfig = { ...DEFAULT_BANDIT_CONFIG };

/**
 * Configure Multi-Armed Bandit
 */
export function configureBandit(config: Partial<BanditConfig>): void {
  banditConfig = { ...banditConfig, ...config };
  logger.info({ config: banditConfig }, 'MAB configured');
}

/**
 * Get variant assignment using Multi-Armed Bandit
 *
 * This replaces the fixed traffic allocation with dynamic allocation
 * that shifts traffic toward the better-performing variant.
 */
export function getBanditVariant(
  experiment: PersonaExperiment,
  userId: string
): 'control' | 'treatment' {
  if (!banditConfig.enabled) {
    // Fall back to fixed allocation
    return hashToVariant(userId, experiment.id, experiment.trafficAllocation);
  }

  const { engagement } = experiment.metrics;

  // Ensure minimum exploration
  if (Math.random() < banditConfig.minExplorationRate) {
    return Math.random() < 0.5 ? 'control' : 'treatment';
  }

  if (banditConfig.algorithm === 'thompson') {
    return thompsonSampling(engagement);
  } else {
    return upperConfidenceBound(engagement);
  }
}

/**
 * Thompson Sampling: Sample from posterior and pick the higher one
 */
function thompsonSampling(
  engagement: PersonaExperiment['metrics']['engagement']
): 'control' | 'treatment' {
  const priorAlpha = 1;
  const priorBeta = 1;

  const controlAlpha = priorAlpha + Math.round(engagement.control * engagement.controlN);
  const controlBeta =
    priorBeta + engagement.controlN - Math.round(engagement.control * engagement.controlN);

  const treatmentAlpha = priorAlpha + Math.round(engagement.treatment * engagement.treatmentN);
  const treatmentBeta =
    priorBeta + engagement.treatmentN - Math.round(engagement.treatment * engagement.treatmentN);

  const controlSample = betaSample(controlAlpha, controlBeta);
  const treatmentSample = betaSample(treatmentAlpha, treatmentBeta);

  return treatmentSample > controlSample ? 'treatment' : 'control';
}

/**
 * Upper Confidence Bound: Pick arm with highest optimistic estimate
 */
function upperConfidenceBound(
  engagement: PersonaExperiment['metrics']['engagement']
): 'control' | 'treatment' {
  const totalN = engagement.controlN + engagement.treatmentN;
  if (totalN === 0) return Math.random() < 0.5 ? 'control' : 'treatment';

  // UCB1 formula: mean + sqrt(2 * ln(total) / arm_pulls)
  const controlUCB =
    engagement.control + Math.sqrt((2 * Math.log(totalN + 1)) / Math.max(1, engagement.controlN));

  const treatmentUCB =
    engagement.treatment +
    Math.sqrt((2 * Math.log(totalN + 1)) / Math.max(1, engagement.treatmentN));

  return treatmentUCB > controlUCB ? 'treatment' : 'control';
}

/**
 * Hash-based deterministic variant assignment (fallback)
 */
function hashToVariant(
  userId: string,
  experimentId: string,
  trafficAllocation: number
): 'control' | 'treatment' {
  const hash = simpleHash(`${userId}-${experimentId}`);
  const normalized = (hash % 1000) / 1000;
  return normalized < trafficAllocation ? 'treatment' : 'control';
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ============================================================================
// 4. EXPERIMENT SCHEDULING
// ============================================================================

export interface ExperimentSchedule {
  /** When to start the experiment (null = immediately) */
  startAt?: Date;
  /** When to end the experiment (null = manual or auto-conclude) */
  endAt?: Date;
  /** Days of week to run (0=Sunday, 6=Saturday) */
  daysOfWeek?: number[];
  /** Hours of day to run (0-23) */
  hoursOfDay?: number[];
  /** Timezone for schedule */
  timezone: string;
}

/** Scheduled experiments awaiting start */
const scheduledExperiments = new Map<
  string,
  { experimentId: string; personaId: string; schedule: ExperimentSchedule }
>();

const EXPERIMENT_SCHEDULE_CHECKER_INTERVAL = 'experiment-schedule-checker';

/**
 * Schedule an experiment to start/stop at specific times
 */
export function scheduleExperiment(
  experimentId: string,
  personaId: string,
  schedule: ExperimentSchedule
): void {
  scheduledExperiments.set(cleanForFirestore(experimentId), { experimentId, personaId, schedule });

  // Ensure schedule checker is running using managed interval
  if (!hasInterval(EXPERIMENT_SCHEDULE_CHECKER_INTERVAL)) {
    registerInterval(
      EXPERIMENT_SCHEDULE_CHECKER_INTERVAL,
      () => void checkSchedules(),
      60000 // Check every minute
    );
    logger.info('Experiment schedule checker started');
  }

  logger.info({ experimentId, schedule }, '📅 Experiment scheduled');
}

/**
 * Cancel a scheduled experiment
 */
export function cancelScheduledExperiment(experimentId: string): boolean {
  const removed = scheduledExperiments.delete(experimentId);
  if (removed) {
    logger.info({ experimentId }, 'Scheduled experiment cancelled');
  }
  return removed;
}

/**
 * Get all scheduled experiments
 */
export function getScheduledExperiments(): Array<{
  experimentId: string;
  personaId: string;
  schedule: ExperimentSchedule;
}> {
  return Array.from(scheduledExperiments.values());
}

/**
 * Check schedules and start/stop experiments as needed
 */
async function checkSchedules(): Promise<void> {
  const now = new Date();

  for (const [expId, scheduled] of scheduledExperiments) {
    const { experimentId, personaId, schedule } = scheduled;

    // Check if should start
    if (schedule.startAt && schedule.startAt <= now) {
      const evolution = getAgentEvolution();
      const state = evolution.exportState().get(personaId);
      const experiment = state?.experiments.find((e) => e.id === experimentId);

      if (experiment && experiment.status === 'draft') {
        experiment.status = 'running';
        experiment.startedAt = new Date();

        logger.info({ experimentId, personaId }, '📅 Scheduled experiment started');

        // Send alert
        if (alertConfig.slackWebhookUrl) {
          await sendSlackAlert({
            title: `📅 Scheduled Experiment Started: ${experiment.name}`,
            persona: personaId,
            status: 'running',
          });
        }

        // Remove start schedule (keep end schedule)
        schedule.startAt = undefined;
      }
    }

    // Check if should end
    if (schedule.endAt && schedule.endAt <= now) {
      const evolution = getAgentEvolution();
      const state = evolution.exportState().get(personaId);
      const experiment = state?.experiments.find((e) => e.id === experimentId);

      if (experiment && experiment.status === 'running') {
        experiment.status = 'concluded';
        experiment.endedAt = new Date();

        // Determine winner
        const diff =
          experiment.metrics.engagement.treatment - experiment.metrics.engagement.control;
        experiment.winner =
          Math.abs(diff) > 0.02 ? (diff > 0 ? 'treatment' : 'control') : 'inconclusive';

        logger.info(
          { experimentId, personaId, winner: experiment.winner },
          '📅 Scheduled experiment ended'
        );

        await sendExperimentConclusionAlert(experiment, personaId);

        // Remove from scheduled
        scheduledExperiments.delete(expId);
      }
    }

    // Check day/hour constraints
    if (schedule.daysOfWeek || schedule.hoursOfDay) {
      const evolution = getAgentEvolution();
      const state = evolution.exportState().get(personaId);
      const experiment = state?.experiments.find((e) => e.id === experimentId);

      if (experiment) {
        const currentDay = now.getDay();
        const currentHour = now.getHours();

        const dayAllowed = !schedule.daysOfWeek || schedule.daysOfWeek.includes(currentDay);
        const hourAllowed = !schedule.hoursOfDay || schedule.hoursOfDay.includes(currentHour);

        const shouldRun = dayAllowed && hourAllowed;
        const isRunning = experiment.status === 'running';

        if (shouldRun && !isRunning && experiment.status !== 'concluded') {
          experiment.status = 'running';
          logger.debug({ experimentId }, 'Experiment resumed per schedule');
        } else if (!shouldRun && isRunning) {
          experiment.status = 'draft'; // Pause
          logger.debug({ experimentId }, 'Experiment paused per schedule');
        }
      }
    }
  }

  // Persist changes
  await saveAgentEvolutionToFirestore();
}

// ============================================================================
// 5. SEGMENT ANALYSIS
// ============================================================================

export interface UserSegment {
  id: string;
  name: string;
  description: string;
  /** Filter function to determine if user belongs to segment */
  filter: (userProfile: UserProfileForSegment) => boolean;
}

export interface UserProfileForSegment {
  userId: string;
  totalConversations: number;
  firstSeenAt?: Date;
  lastSeenAt?: Date;
  subscriptionTier?: string;
  platform?: 'web' | 'mobile' | 'voice';
  source?: string;
  customAttributes?: Record<string, unknown>;
}

export interface SegmentResult {
  segmentId: string;
  segmentName: string;
  controlN: number;
  treatmentN: number;
  controlEngagement: number;
  treatmentEngagement: number;
  improvement: number;
  isSignificant: boolean;
  pValue: number;
}

/** Default segments */
const DEFAULT_SEGMENTS: UserSegment[] = [
  {
    id: 'new_users',
    name: 'New Users',
    description: 'Users with fewer than 5 conversations',
    filter: (u) => u.totalConversations < 5,
  },
  {
    id: 'returning_users',
    name: 'Returning Users',
    description: 'Users with 5+ conversations',
    filter: (u) => u.totalConversations >= 5,
  },
  {
    id: 'power_users',
    name: 'Power Users',
    description: 'Users with 20+ conversations',
    filter: (u) => u.totalConversations >= 20,
  },
  {
    id: 'web_users',
    name: 'Web Users',
    description: 'Users on web platform',
    filter: (u) => u.platform === 'web',
  },
  {
    id: 'mobile_users',
    name: 'Mobile Users',
    description: 'Users on mobile platform',
    filter: (u) => u.platform === 'mobile',
  },
  {
    id: 'free_users',
    name: 'Free Users',
    description: 'Users on free tier',
    filter: (u) => !u.subscriptionTier || u.subscriptionTier === 'free',
  },
  {
    id: 'premium_users',
    name: 'Premium Users',
    description: 'Users on paid tiers',
    filter: (u) => Boolean(u.subscriptionTier && u.subscriptionTier !== 'free'),
  },
];

/** Custom segments */
const customSegments: UserSegment[] = [];

/** Segment-level metrics storage */
const segmentMetrics = new Map<
  string, // experimentId
  Map<
    string, // segmentId
    {
      control: { scores: number[]; n: number };
      treatment: { scores: number[]; n: number };
    }
  >
>();

/**
 * Register a custom segment
 */
export function registerSegment(segment: UserSegment): void {
  customSegments.push(segment);
  logger.info({ segmentId: segment.id, name: segment.name }, 'Custom segment registered');
}

/**
 * Get all segments
 */
export function getAllSegments(): UserSegment[] {
  return [...DEFAULT_SEGMENTS, ...customSegments];
}

/**
 * Record metric for a user in their segments
 */
export function recordSegmentMetric(
  experimentId: string,
  variant: 'control' | 'treatment',
  engagementScore: number,
  userProfile: UserProfileForSegment
): void {
  if (!segmentMetrics.has(experimentId)) {
    segmentMetrics.set(experimentId, new Map());
  }

  const expMetrics = segmentMetrics.get(experimentId)!;
  const allSegments = getAllSegments();

  for (const segment of allSegments) {
    if (segment.filter(userProfile)) {
      if (!expMetrics.has(segment.id)) {
        expMetrics.set(segment.id, {
          control: { scores: [], n: 0 },
          treatment: { scores: [], n: 0 },
        });
      }

      const segmentData = expMetrics.get(segment.id)!;
      segmentData[variant].scores.push(engagementScore);
      segmentData[variant].n++;
    }
  }
}

/**
 * Get segment analysis for an experiment
 */
export function getSegmentAnalysis(experimentId: string): SegmentResult[] {
  const expMetrics = segmentMetrics.get(experimentId);
  if (!expMetrics) return [];

  const results: SegmentResult[] = [];
  const allSegments = getAllSegments();

  for (const segment of allSegments) {
    const data = expMetrics.get(segment.id);
    if (!data || data.control.n < 5 || data.treatment.n < 5) {
      continue; // Need minimum samples
    }

    const controlMean = data.control.scores.reduce((a, b) => a + b, 0) / data.control.n;
    const treatmentMean = data.treatment.scores.reduce((a, b) => a + b, 0) / data.treatment.n;
    const improvement = treatmentMean - controlMean;

    // Calculate p-value using two-sample z-test
    const pooledStdErr = Math.sqrt(
      variance(data.control.scores) / data.control.n +
        variance(data.treatment.scores) / data.treatment.n
    );
    const zScore = pooledStdErr > 0 ? improvement / pooledStdErr : 0;
    const pValue = 2 * (1 - normalCDF(Math.abs(zScore))); // Two-tailed

    results.push({
      segmentId: segment.id,
      segmentName: segment.name,
      controlN: data.control.n,
      treatmentN: data.treatment.n,
      controlEngagement: controlMean,
      treatmentEngagement: treatmentMean,
      improvement,
      isSignificant: pValue < 0.05,
      pValue,
    });
  }

  // Sort by significance then improvement
  return results.sort((a, b) => {
    if (a.isSignificant !== b.isSignificant) {
      return a.isSignificant ? -1 : 1;
    }
    return Math.abs(b.improvement) - Math.abs(a.improvement);
  });
}

/**
 * Calculate variance of an array
 */
function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (arr.length - 1);
}

/**
 * Normal CDF approximation
 */
function normalCDF(z: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = z < 0 ? -1 : 1;
  z = Math.abs(z) / Math.sqrt(2);

  const t = 1 / (1 + p * z);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

  return 0.5 * (1 + sign * y);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Alerting
  configureExperimentAlerts,
  sendExperimentConclusionAlert,
  // Bayesian
  performBayesianAnalysis,
  // MAB
  configureBandit,
  getBanditVariant,
  // Scheduling
  scheduleExperiment,
  cancelScheduledExperiment,
  getScheduledExperiments,
  // Segments
  registerSegment,
  getAllSegments,
  recordSegmentMetric,
  getSegmentAnalysis,
};
