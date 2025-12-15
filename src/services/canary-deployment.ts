/**
 * Canary Deployment Service
 *
 * Enables gradual traffic shifting for safer deployments:
 * 1. Deploy new version to canary slot
 * 2. Route 10% of traffic to canary
 * 3. Monitor quality metrics
 * 4. If healthy, gradually increase to 100%
 * 5. If unhealthy, auto-rollback to 0%
 *
 * Traffic stages: 0% → 10% → 25% → 50% → 100%
 *
 * "Release early, release often, but release safely" - DevOps Wisdom
 */

import { createLogger } from '../utils/safe-logger.js';
import { SlackNotificationService } from './slack-notifications.js';
import { getCallQualityMonitor } from './call-quality-monitor.js';

const log = createLogger({ module: 'CanaryDeployment' });

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface CanaryConfig {
  // Traffic stages (percentage)
  stages: number[];

  // Time to wait at each stage before progressing
  stageWaitMs: number;

  // Quality thresholds
  minSuccessRate: number;
  minQualityScore: number;
  maxErrorRate: number;

  // Minimum samples needed at each stage
  minSamplesPerStage: number;

  // Auto-promote or require manual approval
  autoPromote: boolean;

  // Slack notifications
  notifyOnProgress: boolean;
  notifyOnRollback: boolean;
}

const DEFAULT_CONFIG: CanaryConfig = {
  stages: [10, 25, 50, 100],
  stageWaitMs: 5 * 60 * 1000, // 5 minutes per stage
  minSuccessRate: 0.9,
  minQualityScore: 70,
  maxErrorRate: 0.1,
  minSamplesPerStage: 3,
  autoPromote: true,
  notifyOnProgress: true,
  notifyOnRollback: true,
};

// ============================================================================
// STATE
// ============================================================================

interface CanaryState {
  isActive: boolean;
  startedAt: number | null;
  currentStage: number; // Index into stages array
  currentPercentage: number;
  canaryImage: string | null;
  stableImage: string | null;
  stageMetrics: StageMetrics[];
  progressTimer: ReturnType<typeof setTimeout> | null;
}

interface StageMetrics {
  stage: number;
  percentage: number;
  startedAt: number;
  completedAt: number | null;
  successRate: number;
  qualityScore: number;
  sampleSize: number;
  promoted: boolean;
  rolledBack: boolean;
}

let state: CanaryState = {
  isActive: false,
  startedAt: null,
  currentStage: -1,
  currentPercentage: 0,
  canaryImage: null,
  stableImage: null,
  stageMetrics: [],
  progressTimer: null,
};

let config = { ...DEFAULT_CONFIG };
let slackService: SlackNotificationService | null = null;

// ============================================================================
// TRAFFIC ROUTING (Nginx/HAProxy config generation)
// ============================================================================

/**
 * Generate nginx upstream configuration for canary traffic split
 */
function generateNginxConfig(canaryPercent: number): string {
  const stablePercent = 100 - canaryPercent;

  return `
# Canary deployment config - Generated ${new Date().toISOString()}
# Canary: ${canaryPercent}%, Stable: ${stablePercent}%

upstream voice_backend {
    # Stable version (port 8080)
    server 127.0.0.1:8080 weight=${stablePercent};
    
    # Canary version (port 8081)
    server 127.0.0.1:8081 weight=${canaryPercent};
}

server {
    listen 80;
    
    location / {
        proxy_pass http://voice_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Canary-Version "${canaryPercent > 0 ? 'canary' : 'stable'}";
    }
    
    location /health {
        proxy_pass http://127.0.0.1:8080/health;
    }
}
`;
}

/**
 * Apply traffic split (would call nginx reload in production)
 * For now, this logs what would happen - real implementation
 * would update nginx config and reload
 */
async function applyTrafficSplit(canaryPercent: number): Promise<void> {
  log.info({ canaryPercent }, `Applying traffic split: ${canaryPercent}% to canary`);

  // Generate config (for logging/debugging)
  const nginxConfig = generateNginxConfig(canaryPercent);
  log.debug({ config: nginxConfig }, 'Generated nginx config');

  // In production, you would:
  // 1. Write config to /etc/nginx/conf.d/canary.conf
  // 2. Run: nginx -t && nginx -s reload
  // 3. Verify the reload succeeded

  // For GCE without nginx, we could use:
  // - iptables rules for port-based routing
  // - A custom load balancer in the application
  // - LiveKit room routing based on percentage

  state.currentPercentage = canaryPercent;
}

// ============================================================================
// CANARY LIFECYCLE
// ============================================================================

/**
 * Start a canary deployment
 */
export async function startCanaryDeployment(
  canaryImage: string,
  stableImage: string,
  userConfig?: Partial<CanaryConfig>
): Promise<void> {
  if (state.isActive) {
    throw new Error('Canary deployment already in progress');
  }

  config = { ...DEFAULT_CONFIG, ...userConfig };

  state = {
    isActive: true,
    startedAt: Date.now(),
    currentStage: 0,
    currentPercentage: 0,
    canaryImage,
    stableImage,
    stageMetrics: [],
    progressTimer: null,
  };

  if (!slackService) {
    slackService = new SlackNotificationService();
  }

  log.info({ canaryImage, stableImage, stages: config.stages }, '🐤 Starting canary deployment');

  void slackService.sendNotification({
    type: 'deployment',
    title: 'Canary Deployment Started',
    message: `Starting gradual rollout: ${config.stages.join('% → ')}%`,
    severity: 'info',
    details: { canaryImage, stableImage, stages: config.stages },
  });

  // Start first stage
  await progressToNextStage();
}

/**
 * Progress to the next traffic stage
 */
async function progressToNextStage(): Promise<void> {
  if (!state.isActive) return;

  const stage = state.currentStage;
  const percentage = config.stages[stage];

  log.info({ stage, percentage }, `📈 Progressing to stage ${stage + 1}: ${percentage}%`);

  // Record previous stage completion
  if (state.stageMetrics.length > 0) {
    const prevMetrics = state.stageMetrics[state.stageMetrics.length - 1];
    prevMetrics.completedAt = Date.now();
    prevMetrics.promoted = true;
  }

  // Start new stage metrics
  state.stageMetrics.push({
    stage,
    percentage,
    startedAt: Date.now(),
    completedAt: null,
    successRate: 0,
    qualityScore: 0,
    sampleSize: 0,
    promoted: false,
    rolledBack: false,
  });

  // Apply traffic split
  await applyTrafficSplit(percentage);

  if (config.notifyOnProgress) {
    void slackService?.sendNotification({
      type: 'deployment',
      title: `Canary Progress: ${percentage}%`,
      message: `Traffic shifted to ${percentage}% canary. Monitoring for ${config.stageWaitMs / 60000} minutes...`,
      severity: 'info',
    });
  }

  // Schedule evaluation
  state.progressTimer = setTimeout(() => {
    void evaluateAndProgress();
  }, config.stageWaitMs);
}

/**
 * Evaluate current stage metrics and decide next action
 */
async function evaluateAndProgress(): Promise<void> {
  if (!state.isActive) return;

  const metrics = await getCurrentMetrics();
  const currentStageMetrics = state.stageMetrics[state.stageMetrics.length - 1];

  // Update metrics
  currentStageMetrics.successRate = metrics.successRate;
  currentStageMetrics.qualityScore = metrics.qualityScore;
  currentStageMetrics.sampleSize = metrics.sampleSize;

  log.info(
    {
      stage: state.currentStage,
      percentage: state.currentPercentage,
      successRate: metrics.successRate.toFixed(2),
      qualityScore: metrics.qualityScore,
      sampleSize: metrics.sampleSize,
    },
    'Evaluating canary stage'
  );

  // Check if we have enough samples
  if (metrics.sampleSize < config.minSamplesPerStage) {
    log.info('Insufficient samples, extending evaluation period');
    state.progressTimer = setTimeout(() => {
      void evaluateAndProgress();
    }, config.stageWaitMs / 2);
    return;
  }

  // Check quality thresholds
  const passed =
    metrics.successRate >= config.minSuccessRate &&
    metrics.qualityScore >= config.minQualityScore &&
    metrics.errorRate <= config.maxErrorRate;

  if (!passed) {
    log.warn(
      {
        metrics,
        thresholds: {
          minSuccessRate: config.minSuccessRate,
          minQualityScore: config.minQualityScore,
        },
      },
      '❌ Canary failed quality check'
    );
    await rollbackCanary('Quality thresholds not met');
    return;
  }

  // Check if we're at the last stage
  if (state.currentStage >= config.stages.length - 1) {
    log.info('✅ Canary deployment complete - fully promoted!');
    await completeCanary();
    return;
  }

  // Progress to next stage
  if (config.autoPromote) {
    state.currentStage++;
    await progressToNextStage();
  } else {
    log.info('Waiting for manual promotion...');
    void slackService?.sendNotification({
      type: 'deployment',
      title: 'Canary Awaiting Approval',
      message: `Stage ${state.currentStage + 1} passed. Run \`/ferni canary promote\` to continue.`,
      severity: 'info',
    });
  }
}

/**
 * Get current quality metrics
 */
async function getCurrentMetrics(): Promise<{
  successRate: number;
  qualityScore: number;
  errorRate: number;
  sampleSize: number;
}> {
  const monitor = getCallQualityMonitor();
  const stats = monitor.getStats();
  const recentCalls = monitor.getRecentCalls(20);

  // Filter for canary calls (would need header/tag in real impl)
  const canaryCalls = recentCalls; // For now, use all calls

  const successfulCalls = canaryCalls.filter((c) => c.endReason === 'natural');

  return {
    successRate: canaryCalls.length > 0 ? successfulCalls.length / canaryCalls.length : 1,
    qualityScore: stats.qualityScore,
    errorRate: canaryCalls.length > 0 ? 1 - successfulCalls.length / canaryCalls.length : 0,
    sampleSize: canaryCalls.length,
  };
}

/**
 * Rollback canary deployment
 */
async function rollbackCanary(reason: string): Promise<void> {
  log.warn({ reason }, '🔄 Rolling back canary deployment');

  if (state.progressTimer) {
    clearTimeout(state.progressTimer);
    state.progressTimer = null;
  }

  // Mark current stage as rolled back
  if (state.stageMetrics.length > 0) {
    const currentStageMetrics = state.stageMetrics[state.stageMetrics.length - 1];
    currentStageMetrics.rolledBack = true;
    currentStageMetrics.completedAt = Date.now();
  }

  // Route all traffic back to stable
  await applyTrafficSplit(0);

  if (config.notifyOnRollback) {
    void slackService?.sendNotification({
      type: 'incident',
      title: 'Canary Rollback',
      message: `Canary deployment rolled back: ${reason}`,
      severity: 'warning',
      details: {
        stageMetrics: state.stageMetrics,
        reason,
      },
    });
  }

  state.isActive = false;
}

/**
 * Complete canary deployment (100% traffic to canary)
 */
async function completeCanary(): Promise<void> {
  if (state.progressTimer) {
    clearTimeout(state.progressTimer);
    state.progressTimer = null;
  }

  // Mark final stage complete
  if (state.stageMetrics.length > 0) {
    const finalMetrics = state.stageMetrics[state.stageMetrics.length - 1];
    finalMetrics.completedAt = Date.now();
    finalMetrics.promoted = true;
  }

  void slackService?.sendNotification({
    type: 'deployment',
    title: 'Canary Deployment Complete',
    message: `Successfully rolled out to 100%. Canary is now stable.`,
    severity: 'info',
    details: {
      duration: state.startedAt ? Date.now() - state.startedAt : 0,
      stages: state.stageMetrics,
    },
  });

  // The canary becomes the new stable
  state.isActive = false;
  log.info('🎉 Canary deployment completed successfully');
}

// ============================================================================
// API
// ============================================================================

/**
 * Get canary deployment status
 */
export function getCanaryStatus(): {
  isActive: boolean;
  currentPercentage: number;
  currentStage: number;
  totalStages: number;
  stageMetrics: StageMetrics[];
  duration: number;
} {
  return {
    isActive: state.isActive,
    currentPercentage: state.currentPercentage,
    currentStage: state.currentStage,
    totalStages: config.stages.length,
    stageMetrics: state.stageMetrics,
    duration: state.startedAt ? Date.now() - state.startedAt : 0,
  };
}

/**
 * Manually promote to next stage
 */
export async function promoteCanary(): Promise<void> {
  if (!state.isActive) {
    throw new Error('No active canary deployment');
  }

  if (state.currentStage >= config.stages.length - 1) {
    await completeCanary();
  } else {
    state.currentStage++;
    await progressToNextStage();
  }
}

/**
 * Manually rollback canary
 */
export async function abortCanary(reason = 'Manual abort'): Promise<void> {
  if (!state.isActive) {
    throw new Error('No active canary deployment');
  }
  await rollbackCanary(reason);
}

/**
 * Update canary config
 */
export function updateCanaryConfig(updates: Partial<CanaryConfig>): void {
  config = { ...config, ...updates };
  log.info({ updates }, 'Canary config updated');
}
