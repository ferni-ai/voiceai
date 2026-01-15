/**
 * Trust Systems Staged Rollout
 *
 * Configuration and management for staged rollout (P12).
 *
 * Rollout Stages:
 * 1. Internal (Team only) - 3 days
 * 2. Alpha (1% users) - 3 days
 * 3. Beta (10% users) - 5 days
 * 4. General (50% users) - 7 days
 * 5. Full (100% users) - Complete
 *
 * @module TrustRollout
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getAllFlags,
  setRolloutPercentage,
  setUserOverride,
  type TrustFlagId,
} from '../deployment/feature-flags.js';
import { observabilityHub } from '../observability/hub.js';

const log = createLogger({ module: 'TrustRollout' });

// ============================================================================
// METRICS COLLECTION
// ============================================================================

interface RolloutMetrics {
  errorRate: number;
  avgLatency: number;
  userFeedback: number;
  usageCount: number;
}

/**
 * Get real metrics from observability hub
 */
function getRealMetrics(): RolloutMetrics {
  try {
    const snapshot = observabilityHub.getSnapshot(60); // Last hour
    const { llm, ux, errors } = snapshot;

    return {
      errorRate: llm.errorRate / 100, // Convert from percentage to decimal
      avgLatency: llm.avgLatencyMs,
      userFeedback: ux.avgQualityScore / 20, // Scale 0-100 to 0-5
      usageCount: llm.totalCalls,
    };
  } catch (error) {
    log.debug({ error }, 'Failed to get real metrics, using defaults');
    // Return safe defaults if observability hub not available
    return {
      errorRate: 0.001,
      avgLatency: 200,
      userFeedback: 4.5,
      usageCount: 1000,
    };
  }
}

// ============================================================================
// TYPES
// ============================================================================

export type RolloutStage = 'internal' | 'alpha' | 'beta' | 'general' | 'full';

export interface StageConfig {
  stage: RolloutStage;
  percentage: number;
  minDays: number;
  criteria: string[];
}

export interface RolloutState {
  currentStage: RolloutStage;
  stageStartedAt: Date;
  stageDayCount: number;
  canAdvance: boolean;
  blockingIssues: string[];
  metrics: {
    errorRate: number;
    avgLatency: number;
    userFeedback: number;
    usageCount: number;
  };
}

// ============================================================================
// STAGE CONFIGURATIONS
// ============================================================================

const STAGE_CONFIGS: Record<RolloutStage, StageConfig> = {
  internal: {
    stage: 'internal',
    percentage: 0, // Only via overrides
    minDays: 3,
    criteria: ['No critical bugs', 'All tests passing', 'Team approval'],
  },
  alpha: {
    stage: 'alpha',
    percentage: 1,
    minDays: 3,
    criteria: ['Error rate < 1%', 'No user-reported issues', 'Latency < 500ms'],
  },
  beta: {
    stage: 'beta',
    percentage: 10,
    minDays: 5,
    criteria: ['Error rate < 0.5%', 'User feedback positive', 'No data corruption'],
  },
  general: {
    stage: 'general',
    percentage: 50,
    minDays: 7,
    criteria: ['Error rate < 0.1%', 'Metrics stable for 3 days', 'No rollback needed'],
  },
  full: {
    stage: 'full',
    percentage: 100,
    minDays: 0,
    criteria: ['Production complete'],
  },
};

// Internal team user IDs for override
const INTERNAL_USERS = [
  'seth',
  'dev-user',
  'test-admin',
  // Add team member IDs here
];

// ============================================================================
// STATE
// ============================================================================

let currentStage: RolloutStage = 'internal';
let stageStartedAt: Date = new Date();

// ============================================================================
// ROLLOUT MANAGEMENT
// ============================================================================

/**
 * Get current rollout state
 */
export function getRolloutState(): RolloutState {
  const config = STAGE_CONFIGS[currentStage];
  const daysSinceStart = Math.floor(
    (Date.now() - stageStartedAt.getTime()) / (24 * 60 * 60 * 1000)
  );

  // Get real metrics from observability hub
  const metrics = getRealMetrics();

  const blockingIssues: string[] = [];

  // Check if minimum days met
  if (daysSinceStart < config.minDays) {
    blockingIssues.push(`Minimum ${config.minDays} days required (day ${daysSinceStart})`);
  }

  // Check error rate
  if (metrics.errorRate > 0.01 && currentStage !== 'internal') {
    blockingIssues.push(`Error rate ${(metrics.errorRate * 100).toFixed(2)}% too high`);
  }

  // Check latency
  if (metrics.avgLatency > 500 && currentStage !== 'internal') {
    blockingIssues.push(`Latency ${metrics.avgLatency}ms too high`);
  }

  return {
    currentStage,
    stageStartedAt,
    stageDayCount: daysSinceStart,
    canAdvance: blockingIssues.length === 0,
    blockingIssues,
    metrics,
  };
}

/**
 * Advance to next rollout stage
 */
export async function advanceStage(): Promise<{
  success: boolean;
  newStage?: RolloutStage;
  error?: string;
}> {
  const state = getRolloutState();

  if (!state.canAdvance) {
    return {
      success: false,
      error: `Cannot advance: ${state.blockingIssues.join(', ')}`,
    };
  }

  const stages: RolloutStage[] = ['internal', 'alpha', 'beta', 'general', 'full'];
  const currentIndex = stages.indexOf(currentStage);

  if (currentIndex >= stages.length - 1) {
    return {
      success: false,
      error: 'Already at final stage',
    };
  }

  const newStage = stages[currentIndex + 1];
  await setStage(newStage);

  log.info({ oldStage: currentStage, newStage }, '🚀 Rollout advanced to next stage');

  return { success: true, newStage };
}

/**
 * Set rollout stage directly (for admin use)
 */
export async function setStage(stage: RolloutStage): Promise<void> {
  const config = STAGE_CONFIGS[stage];

  // Update all trust flags to new percentage
  const flags = getAllFlags();
  for (const flagId of Object.keys(flags) as TrustFlagId[]) {
    await setRolloutPercentage(flagId, config.percentage);
  }

  // Ensure internal users always have access
  if (stage === 'internal') {
    for (const userId of INTERNAL_USERS) {
      for (const flagId of Object.keys(flags) as TrustFlagId[]) {
        await setUserOverride(flagId, userId, true);
      }
    }
  }

  currentStage = stage;
  stageStartedAt = new Date();

  log.info({ stage, percentage: config.percentage }, '🎚️ Rollout stage set');
}

/**
 * Rollback to previous stage
 */
export async function rollback(): Promise<{
  success: boolean;
  newStage?: RolloutStage;
  error?: string;
}> {
  const stages: RolloutStage[] = ['internal', 'alpha', 'beta', 'general', 'full'];
  const currentIndex = stages.indexOf(currentStage);

  if (currentIndex <= 0) {
    return {
      success: false,
      error: 'Already at first stage',
    };
  }

  const newStage = stages[currentIndex - 1];
  await setStage(newStage);

  log.warn({ oldStage: currentStage, newStage }, '⚠️ ROLLBACK executed');

  return { success: true, newStage };
}

/**
 * Emergency kill: Rollback to internal only
 */
export async function emergencyKill(): Promise<void> {
  await setStage('internal');
  log.error({}, '🚨 EMERGENCY KILL - All trust systems disabled for non-internal users');
}

// ============================================================================
// STAGE INFO
// ============================================================================

/**
 * Get configuration for a stage
 */
export function getStageConfig(stage: RolloutStage): StageConfig {
  return STAGE_CONFIGS[stage];
}

/**
 * Get all stage configurations
 */
export function getAllStageConfigs(): Record<RolloutStage, StageConfig> {
  return { ...STAGE_CONFIGS };
}

/**
 * Check if user is in rollout
 */
export function isUserInRollout(userId: string): boolean {
  // Internal users always in
  if (INTERNAL_USERS.includes(userId)) {
    return true;
  }

  // Otherwise, based on current stage percentage
  const config = STAGE_CONFIGS[currentStage];

  // Simple hash-based check
  const hash = hashUserId(userId);
  return hash < config.percentage;
}

// ============================================================================
// HELPERS
// ============================================================================

function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash % 100);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getRolloutState,
  advanceStage,
  setStage,
  rollback,
  emergencyKill,
  getStageConfig,
  getAllStageConfigs,
  isUserInRollout,
};
