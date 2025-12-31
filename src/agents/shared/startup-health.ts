/**
 * Voice Agent Startup Health Check
 *
 * This module provides health check endpoints and validation for the
 * voice agent startup process. It's designed to:
 *
 * 1. Validate prewarm completed successfully
 * 2. Check all dependencies are loaded
 * 3. Measure and report startup timing
 * 4. Provide Cloud Run readiness/liveness probes
 *
 * Usage:
 *   import { getStartupHealth, isHealthy, waitUntilHealthy } from './startup-health.js';
 *
 *   // Check health
 *   const health = getStartupHealth();
 *   if (!health.ready) {
 *     console.log('Not ready:', health.issues);
 *   }
 *
 *   // Wait for healthy state
 *   await waitUntilHealthy({ timeout: 30000 });
 */

// ============================================================================
// TYPES
// ============================================================================

export interface StartupHealth {
  /** Is the agent ready to handle jobs? */
  ready: boolean;

  /** Detailed status */
  status: 'starting' | 'prewarm_running' | 'ready' | 'degraded' | 'failed';

  /** Timestamp of health check */
  timestamp: string;

  /** How long since module loaded (ms) */
  uptimeMs: number;

  /** Prewarm state */
  prewarm: {
    state: 'pending' | 'running' | 'complete' | 'failed' | 'timeout';
    durationMs: number | null;
    phase: string | null;
  };

  /** Dependency status */
  dependencies: {
    total: number;
    loaded: number;
    missing: string[];
    critical: Array<{
      name: string;
      loaded: boolean;
      required: boolean;
    }>;
  };

  /** Timing metrics */
  timing: {
    moduleLoadMs: number | null;
    coreImportMs: number | null;
    prewarmMs: number | null;
    totalStartupMs: number | null;
  };

  /** Memory usage */
  memory: {
    heapUsedMB: number;
    heapTotalMB: number;
    externalMB: number;
  };

  /** Any issues that need attention */
  issues: string[];

  /** Process info */
  process: {
    pid: number;
    nodeVersion: string;
    platform: string;
  };
}

export interface HealthCheckOptions {
  /** Include detailed dependency info */
  detailed?: boolean;

  /** Include timing metrics */
  includeTiming?: boolean;

  /** Include memory info */
  includeMemory?: boolean;
}

// ============================================================================
// STATE TRACKING
// ============================================================================

const _moduleLoadTime = Date.now();
let _coreImportTime: number | null = null;
let _prewarmStartTime: number | null = null;
let _prewarmEndTime: number | null = null;
let _prewarmPhase: string | null = null;
let _prewarmState: 'pending' | 'running' | 'complete' | 'failed' | 'timeout' = 'pending';
const _issues: string[] = [];

// Critical dependencies that MUST be loaded for the agent to work
const CRITICAL_DEPS = ['voice', 'google', 'silero', 'voiceAgentSession'] as const;

// ============================================================================
// STATE SETTERS (Called by worker.ts or orchestrator)
// ============================================================================

export function recordCoreImportTime(): void {
  _coreImportTime = Date.now() - _moduleLoadTime;
}

export function recordPrewarmStart(): void {
  _prewarmStartTime = Date.now();
  _prewarmState = 'running';
}

export function recordPrewarmPhase(phase: string): void {
  _prewarmPhase = phase;
}

export function recordPrewarmEnd(success: boolean): void {
  _prewarmEndTime = Date.now();
  _prewarmState = success ? 'complete' : 'failed';
}

export function recordPrewarmTimeout(): void {
  _prewarmState = 'timeout';
  _issues.push('Prewarm timed out after 25 seconds');
}

export function recordIssue(issue: string): void {
  _issues.push(issue);
}

export function getPrewarmState(): typeof _prewarmState {
  return _prewarmState;
}

// ============================================================================
// HEALTH CHECK FUNCTIONS
// ============================================================================

/**
 * Get detailed startup health information
 */
export function getStartupHealth(options: HealthCheckOptions = {}): StartupHealth {
  const { detailed = true, includeTiming = true, includeMemory = true } = options;

  // In the new GCE architecture, dependencies are loaded by worker.ts directly
  // The old child process dependency tracking is no longer used
  const deps: Record<string, unknown> | null = null;

  // Calculate dependency status
  const depEntries = deps ? Object.entries(deps) : [];
  const loadedDeps = depEntries.filter(([k, v]) => v !== null && k !== 'personaBundlesReady');
  const missingDeps = depEntries
    .filter(([k, v]) => v === null && k !== 'personaBundlesReady')
    .map(([k]) => k);

  // Check critical dependencies
  const criticalStatus = CRITICAL_DEPS.map((name) => ({
    name,
    loaded: deps ? deps[name] !== null : false,
    required: true,
  }));

  const criticalMissing = criticalStatus.filter((c) => !c.loaded);

  // Determine overall status
  let status: StartupHealth['status'] = 'starting';
  let ready = false;

  if (_prewarmState === 'timeout') {
    status = 'failed';
  } else if (_prewarmState === 'failed') {
    status = 'failed';
  } else if (_prewarmState === 'complete') {
    if (criticalMissing.length === 0) {
      status = 'ready';
      ready = true;
    } else {
      status = 'degraded';
    }
  } else if (_prewarmState === 'running') {
    status = 'prewarm_running';
  }

  // Collect issues
  const issues = [..._issues];
  if (criticalMissing.length > 0) {
    issues.push(`Missing critical dependencies: ${criticalMissing.map((c) => c.name).join(', ')}`);
  }

  // Memory info
  const memUsage = process.memoryUsage();

  return {
    ready,
    status,
    timestamp: new Date().toISOString(),
    uptimeMs: Date.now() - _moduleLoadTime,

    prewarm: {
      state: _prewarmState,
      durationMs: _prewarmStartTime && _prewarmEndTime ? _prewarmEndTime - _prewarmStartTime : null,
      phase: _prewarmPhase,
    },

    dependencies: {
      total: depEntries.length,
      loaded: loadedDeps.length,
      missing: missingDeps,
      critical: criticalStatus,
    },

    timing: includeTiming
      ? {
          moduleLoadMs: _moduleLoadTime ? Date.now() - _moduleLoadTime : null,
          coreImportMs: _coreImportTime,
          prewarmMs:
            _prewarmStartTime && _prewarmEndTime ? _prewarmEndTime - _prewarmStartTime : null,
          totalStartupMs: _prewarmEndTime ? _prewarmEndTime - _moduleLoadTime : null,
        }
      : {
          moduleLoadMs: null,
          coreImportMs: null,
          prewarmMs: null,
          totalStartupMs: null,
        },

    memory: includeMemory
      ? {
          heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
          externalMB: Math.round(memUsage.external / 1024 / 1024),
        }
      : {
          heapUsedMB: 0,
          heapTotalMB: 0,
          externalMB: 0,
        },

    issues,

    process: {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
    },
  };
}

/**
 * Simple boolean health check
 */
export function isHealthy(): boolean {
  return getStartupHealth({ detailed: false }).ready;
}

/**
 * Wait until the agent is healthy (for Cloud Run startup probes)
 */
export async function waitUntilHealthy(
  options: {
    timeout?: number;
    pollInterval?: number;
  } = {}
): Promise<StartupHealth> {
  const { timeout = 30000, pollInterval = 500 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const health = getStartupHealth();

    if (health.ready) {
      return health;
    }

    if (health.status === 'failed') {
      throw new Error(`Agent startup failed: ${health.issues.join(', ')}`);
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, pollInterval);
    });
  }

  const finalHealth = getStartupHealth();
  throw new Error(`Health check timeout after ${timeout}ms. Status: ${finalHealth.status}`);
}

/**
 * Cloud Run readiness probe endpoint handler
 */
export function handleReadinessProbe(): {
  status: number;
  body: { ready: boolean; status: string; issues?: string[] };
} {
  const health = getStartupHealth({ detailed: false });

  if (health.ready) {
    return {
      status: 200,
      body: { ready: true, status: health.status },
    };
  }

  return {
    status: 503,
    body: {
      ready: false,
      status: health.status,
      issues: health.issues,
    },
  };
}

/**
 * Cloud Run liveness probe endpoint handler
 */
export function handleLivenessProbe(): {
  status: number;
  body: { alive: boolean; uptime: number };
} {
  // Liveness just checks if the process is running
  return {
    status: 200,
    body: {
      alive: true,
      uptime: Date.now() - _moduleLoadTime,
    },
  };
}

/**
 * Detailed health endpoint handler (for debugging)
 */
export function handleHealthEndpoint(): {
  status: number;
  body: StartupHealth;
} {
  const health = getStartupHealth();
  return {
    status: health.ready ? 200 : 503,
    body: health,
  };
}

// ============================================================================
// METRICS EXPORT
// ============================================================================

/**
 * Get metrics in Prometheus format
 */
export function getPrometheusMetrics(): string {
  const health = getStartupHealth();

  const lines = [
    '# HELP voice_agent_startup_ready Is the voice agent ready to handle jobs',
    '# TYPE voice_agent_startup_ready gauge',
    `voice_agent_startup_ready ${health.ready ? 1 : 0}`,
    '',
    '# HELP voice_agent_prewarm_duration_ms Time taken for prewarm in milliseconds',
    '# TYPE voice_agent_prewarm_duration_ms gauge',
    `voice_agent_prewarm_duration_ms ${health.timing.prewarmMs ?? -1}`,
    '',
    '# HELP voice_agent_deps_loaded Number of dependencies loaded',
    '# TYPE voice_agent_deps_loaded gauge',
    `voice_agent_deps_loaded ${health.dependencies.loaded}`,
    '',
    '# HELP voice_agent_deps_missing Number of dependencies missing',
    '# TYPE voice_agent_deps_missing gauge',
    `voice_agent_deps_missing ${health.dependencies.missing.length}`,
    '',
    '# HELP voice_agent_memory_heap_mb Heap memory used in MB',
    '# TYPE voice_agent_memory_heap_mb gauge',
    `voice_agent_memory_heap_mb ${health.memory.heapUsedMB}`,
    '',
    '# HELP voice_agent_uptime_ms Uptime in milliseconds',
    '# TYPE voice_agent_uptime_ms counter',
    `voice_agent_uptime_ms ${health.uptimeMs}`,
  ];

  return lines.join('\n');
}
