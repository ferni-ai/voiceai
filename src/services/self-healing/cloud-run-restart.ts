/**
 * Cloud Run Container Restart Service
 *
 * Provides automatic container restart capabilities via Cloud Run Admin API.
 * Used for self-healing when containers get into bad states.
 *
 * Features:
 * - Rolling restart (deploy same image with traffic migration)
 * - Single instance restart
 * - Health-based auto-restart
 * - Cooldown protection
 */

import { createLogger } from '../../utils/safe-logger.js';
import { handleCircuitStateChange } from './circuit-alerting.js';

const log = createLogger({ module: 'cloud-run-restart' });

// ============================================================================
// TYPES
// ============================================================================

export interface RestartOptions {
  /** Service name (e.g., 'voiceai-agent', 'bogle-ui') */
  serviceName: string;
  /** GCP region (default: 'us-central1') */
  region?: string;
  /** GCP project ID (default: from env) */
  projectId?: string;
  /** Reason for restart */
  reason: string;
  /** Whether to notify via alerting */
  notify?: boolean;
  /** Force restart even if in cooldown */
  force?: boolean;
}

export interface RestartResult {
  success: boolean;
  serviceName: string;
  previousRevision?: string;
  newRevision?: string;
  error?: string;
  durationMs: number;
}

interface ServiceRevision {
  name: string;
  generation: number;
  createTime: string;
  conditions: Array<{ type: string; status: string }>;
}

// ============================================================================
// STATE
// ============================================================================

// Cooldown tracking to prevent restart storms
const restartCooldowns = new Map<string, number>();
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes between restarts

// Track restart history
const restartHistory: Array<{
  serviceName: string;
  timestamp: Date;
  reason: string;
  success: boolean;
}> = [];
const MAX_HISTORY = 100;

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Get access token for Cloud Run API
 */
async function getAccessToken(): Promise<string> {
  // In Cloud Run, use the metadata server for identity
  if (process.env.K_SERVICE) {
    try {
      const response = await fetch(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
        {
          headers: { 'Metadata-Flavor': 'Google' },
        }
      );
      
      if (!response.ok) {
        throw new Error(`Metadata server error: ${response.status}`);
      }
      
      const data = await response.json() as { access_token: string };
      return data.access_token;
    } catch (error) {
      log.error({ error }, 'Failed to get token from metadata server');
      throw error;
    }
  }

  // For local development, try Application Default Credentials
  try {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    return tokenResponse.token || '';
  } catch (error) {
    log.error({ error }, 'Failed to get access token');
    throw new Error('Could not authenticate with GCP');
  }
}

// ============================================================================
// CLOUD RUN API
// ============================================================================

/**
 * Get current service information
 */
async function getServiceInfo(
  serviceName: string,
  region: string,
  projectId: string
): Promise<{ latestRevision: string; trafficTarget: string } | null> {
  const token = await getAccessToken();
  
  const url = `https://${region}-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/${projectId}/services/${serviceName}`;
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throw new Error(`Failed to get service info: ${response.status}`);
  }

  const service = await response.json() as {
    status?: {
      latestReadyRevisionName?: string;
      traffic?: Array<{ revisionName: string; percent: number }>;
    };
  };

  return {
    latestRevision: service.status?.latestReadyRevisionName || '',
    trafficTarget: service.status?.traffic?.[0]?.revisionName || '',
  };
}

/**
 * Trigger a new revision deployment (rolling restart)
 */
async function triggerNewRevision(
  serviceName: string,
  region: string,
  projectId: string,
  reason: string
): Promise<string> {
  const token = await getAccessToken();
  
  // Get current service
  const getUrl = `https://${region}-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/${projectId}/services/${serviceName}`;
  
  const getResponse = await fetch(getUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!getResponse.ok) {
    throw new Error(`Failed to get service: ${getResponse.status}`);
  }

  const service = await getResponse.json() as {
    metadata: { 
      name: string;
      resourceVersion: string;
      annotations?: Record<string, string>;
    };
    spec: {
      template: {
        metadata?: { annotations?: Record<string, string> };
        spec: unknown;
      };
    };
  };

  // Add annotation to force new revision
  const timestamp = Date.now().toString();
  if (!service.spec.template.metadata) {
    service.spec.template.metadata = { annotations: {} };
  }
  if (!service.spec.template.metadata.annotations) {
    service.spec.template.metadata.annotations = {};
  }
  
  service.spec.template.metadata.annotations['client.knative.dev/user-image'] = timestamp;
  service.spec.template.metadata.annotations['run.googleapis.com/restart-timestamp'] = timestamp;
  service.spec.template.metadata.annotations['run.googleapis.com/restart-reason'] = reason;

  // Update service to trigger new revision
  const updateResponse = await fetch(getUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(service),
  });

  if (!updateResponse.ok) {
    const errorText = await updateResponse.text();
    throw new Error(`Failed to update service: ${updateResponse.status} - ${errorText}`);
  }

  const updated = await updateResponse.json() as {
    status?: { latestCreatedRevisionName?: string };
  };
  
  return updated.status?.latestCreatedRevisionName || 'unknown';
}

/**
 * Wait for revision to become ready
 */
async function waitForRevisionReady(
  serviceName: string,
  revisionName: string,
  region: string,
  projectId: string,
  timeoutMs: number = 120000
): Promise<boolean> {
  const token = await getAccessToken();
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const url = `https://${region}-run.googleapis.com/apis/serving.knative.dev/v1/namespaces/${projectId}/revisions/${revisionName}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const revision = await response.json() as ServiceRevision;
        const readyCondition = revision.conditions?.find((c) => c.type === 'Ready');
        
        if (readyCondition?.status === 'True') {
          return true;
        }
        
        if (readyCondition?.status === 'False') {
          log.error({ revisionName, readyCondition }, 'Revision failed to become ready');
          return false;
        }
      }
    } catch {
      // Retry on transient errors
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return false;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Restart a Cloud Run service
 * 
 * This triggers a rolling restart by deploying a new revision
 * with the same container image.
 */
export async function restartService(options: RestartOptions): Promise<RestartResult> {
  const {
    serviceName,
    region = 'us-central1',
    projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || '',
    reason,
    notify = true,
    force = false,
  } = options;

  const startTime = Date.now();

  // Check cooldown
  const lastRestart = restartCooldowns.get(serviceName);
  if (!force && lastRestart && Date.now() - lastRestart < COOLDOWN_MS) {
    const waitTime = Math.ceil((COOLDOWN_MS - (Date.now() - lastRestart)) / 1000);
    log.warn({ serviceName, waitTime }, 'Service restart in cooldown');
    
    return {
      success: false,
      serviceName,
      error: `Restart cooldown active. Wait ${waitTime}s or use force=true`,
      durationMs: Date.now() - startTime,
    };
  }

  log.info({ serviceName, region, projectId, reason }, 'Initiating service restart');

  try {
    // Get current service info
    const serviceInfo = await getServiceInfo(serviceName, region, projectId);
    if (!serviceInfo) {
      throw new Error(`Service ${serviceName} not found in ${region}`);
    }

    const previousRevision = serviceInfo.latestRevision;
    log.info({ serviceName, previousRevision }, 'Current revision identified');

    // Trigger new revision
    const newRevision = await triggerNewRevision(serviceName, region, projectId, reason);
    log.info({ serviceName, newRevision }, 'New revision triggered');

    // Wait for new revision to be ready
    const isReady = await waitForRevisionReady(serviceName, newRevision, region, projectId);
    
    if (!isReady) {
      throw new Error(`New revision ${newRevision} failed to become ready`);
    }

    // Update cooldown
    restartCooldowns.set(serviceName, Date.now());

    // Record in history
    restartHistory.unshift({
      serviceName,
      timestamp: new Date(),
      reason,
      success: true,
    });
    if (restartHistory.length > MAX_HISTORY) {
      restartHistory.pop();
    }

    const result: RestartResult = {
      success: true,
      serviceName,
      previousRevision,
      newRevision,
      durationMs: Date.now() - startTime,
    };

    log.info(result, 'Service restart completed successfully');

    // Send notification
    if (notify) {
      handleCircuitStateChange(
        `service:${serviceName}`,
        'open',
        'closed',
        { successRate: `Restarted: ${reason} (new revision: ${newRevision})` }
      );
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    log.error({ serviceName, error: errorMessage }, 'Service restart failed');

    // Record in history
    restartHistory.unshift({
      serviceName,
      timestamp: new Date(),
      reason,
      success: false,
    });
    if (restartHistory.length > MAX_HISTORY) {
      restartHistory.pop();
    }

    // Send failure notification
    if (notify) {
      handleCircuitStateChange(
        `restart:${serviceName}`,
        'closed',
        'open',
        { lastError: `Restart failed (${reason}): ${errorMessage}` }
      );
    }

    return {
      success: false,
      serviceName,
      error: errorMessage,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Check if a service can be restarted (not in cooldown)
 */
export function canRestart(serviceName: string): boolean {
  const lastRestart = restartCooldowns.get(serviceName);
  return !lastRestart || Date.now() - lastRestart >= COOLDOWN_MS;
}

/**
 * Get cooldown remaining time in seconds
 */
export function getCooldownRemaining(serviceName: string): number {
  const lastRestart = restartCooldowns.get(serviceName);
  if (!lastRestart) return 0;
  
  const remaining = COOLDOWN_MS - (Date.now() - lastRestart);
  return Math.max(0, Math.ceil(remaining / 1000));
}

/**
 * Get restart history
 */
export function getRestartHistory(): typeof restartHistory {
  return [...restartHistory];
}

/**
 * Clear cooldown for a service (admin use)
 */
export function clearCooldown(serviceName: string): void {
  restartCooldowns.delete(serviceName);
  log.info({ serviceName }, 'Cooldown cleared');
}

// ============================================================================
// AUTO-RESTART ON CRITICAL FAILURES
// ============================================================================

/**
 * Handle critical failure that may require restart
 */
export async function handleCriticalFailure(
  serviceName: string,
  error: Error,
  context: Record<string, unknown> = {}
): Promise<RestartResult | null> {
  // Patterns that indicate container should be restarted
  const restartPatterns = [
    /out of memory/i,
    /heap out of bounds/i,
    /FATAL ERROR/i,
    /SIGKILL/i,
    /memory allocation failed/i,
    /too many open files/i,
    /EMFILE/i,
    /container terminated/i,
  ];

  const errorStr = `${error.name} ${error.message}`;
  const shouldRestart = restartPatterns.some((p) => p.test(errorStr));

  if (!shouldRestart) {
    log.debug({ serviceName, error: errorStr }, 'Error does not warrant restart');
    return null;
  }

  log.warn({ serviceName, error: errorStr, context }, 'Critical error detected, initiating restart');

  return restartService({
    serviceName,
    reason: `Auto-restart due to: ${error.message}`,
    notify: true,
  });
}

/**
 * Setup auto-restart handler for uncaught exceptions
 */
export function setupAutoRestart(serviceName: string): void {
  // Only in Cloud Run
  if (!process.env.K_SERVICE) {
    log.info('Not in Cloud Run, skipping auto-restart setup');
    return;
  }

  process.on('uncaughtException', async (error) => {
    log.error({ error: error.message, stack: error.stack }, 'Uncaught exception');
    
    // Try to restart (this process will be replaced)
    await handleCriticalFailure(serviceName, error);
    
    // Exit after restart triggered
    process.exit(1);
  });

  log.info({ serviceName }, 'Auto-restart handler configured');
}

