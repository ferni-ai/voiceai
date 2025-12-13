/**
 * Voice Worker - Lightweight Main Process Bootstrap
 *
 * This file is the MAIN ENTRY POINT for production deployments.
 * It handles ONLY main process concerns:
 * - Health server for Cloud Run
 * - IPC handler for child communication
 * - Resource warmup (cache file for children)
 * - CLI startup with child agent path
 * - Graceful shutdown
 *
 * ALL agent logic is in voice-agent-child.ts (loaded by child processes).
 * This separation ensures:
 * - Fast main process startup (~2s vs ~10s)
 * - Minimal memory footprint
 * - Clear separation of concerns
 *
 * Usage:
 *   node dist/agents/voice-worker.js start
 */

import 'dotenv/config';

// Centralized timeout configuration
import { APP_TIMEOUTS } from '../config/timeouts.js';

// ============================================================================
// STARTUP LOGGING (Immediate, before any async work)
// ============================================================================
const _startTime = Date.now();
const _logPrefix = () => `[${new Date().toISOString()}] [voice-worker]`;

const log = (msg: string, data?: Record<string, unknown>) => {
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  process.stderr.write(`${_logPrefix()} ${msg}${dataStr}\n`);
};

log('🚀 Voice Worker starting', {
  pid: process.pid,
  nodeVersion: process.version,
  env: process.env.NODE_ENV || 'development',
});

// ============================================================================
// IMPORTS (Minimal - only what main process needs)
// ============================================================================
import { WorkerOptions, cli } from '@livekit/agents';
import { fileURLToPath } from 'node:url';

// ============================================================================
// CONFIGURATION
// ============================================================================
const AGENT_NAME = process.env.AGENT_NAME || 'voice-agent';
const CHILD_AGENT_FILE = './voice-agent-child.js';

// Get absolute path to child agent
const childAgentPath = fileURLToPath(new URL(CHILD_AGENT_FILE, import.meta.url));
log('Child agent path', { path: childAgentPath });

// ============================================================================
// HEALTH SERVER
// ============================================================================
// Required for Cloud Run - must respond to health checks
import { startHealthCheckServer } from './shared/health-server.js';

log('Starting health server...');
startHealthCheckServer(AGENT_NAME);

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================
const setupShutdown = async () => {
  const { registerShutdownSignalHandlers } = await import('./shared/shutdown-handler.js');
  registerShutdownSignalHandlers();
  log('Shutdown handlers registered');
};

// ============================================================================
// E2E DIAGNOSTICS
// ============================================================================
let e2e: Awaited<typeof import('./shared/e2e-diagnostics.js')>['e2e'] | null = null;
let startHealthLogging: ((interval: number) => void) | null = null;

const setupDiagnostics = async () => {
  const diagnostics = await import('./shared/e2e-diagnostics.js');
  e2e = diagnostics.e2e;
  startHealthLogging = diagnostics.startHealthLogging;
  e2e.workerStarting();
  log('E2E diagnostics initialized');
};

// ============================================================================
// SELF-HEALING (Circuit breaker for job acceptance)
// ============================================================================
let createCircuitBreaker:
  | Awaited<typeof import('../services/self-healing/index.js')>['createCircuitBreaker']
  | null = null;
let withResilience:
  | Awaited<typeof import('../services/self-healing/index.js')>['withResilience']
  | null = null;
let analyzeFailure:
  | Awaited<typeof import('../services/self-healing/index.js')>['analyzeFailure']
  | null = null;
let humanizeError:
  | Awaited<typeof import('../services/self-healing/index.js')>['humanizeError']
  | null = null;

const setupSelfHealing = async () => {
  const selfHealing = await import('../services/self-healing/index.js');
  createCircuitBreaker = selfHealing.createCircuitBreaker;
  withResilience = selfHealing.withResilience;
  analyzeFailure = selfHealing.analyzeFailure;
  humanizeError = selfHealing.humanizeError;
  log('Self-healing initialized');
};

// ============================================================================
// RESOURCE WARMUP
// ============================================================================
// Write cache file for child processes BEFORE spawning them
const warmupResources = async () => {
  log('Warming up resources (cache file for children)...');
  const warmupStart = Date.now();

  try {
    const { warmupResources: doWarmup, setupIPCHandler } =
      await import('./shared/resource-server.js');

    // Setup IPC handler first
    setupIPCHandler();
    log('IPC handler ready');

    // Warmup with timeout (from centralized config)
    await Promise.race([
      doWarmup(),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          log('⚠️ Warmup timeout - proceeding anyway');
          resolve();
        }, APP_TIMEOUTS.WARMUP_TIMEOUT);
      }),
    ]);

    log('✅ Resource warmup complete', { durationMs: Date.now() - warmupStart });
  } catch (error) {
    log('⚠️ Resource warmup failed (children will use fallbacks)', {
      error: String(error),
      durationMs: Date.now() - warmupStart,
    });
  }
};

// ============================================================================
// REQUEST HANDLER WITH SELF-HEALING
// ============================================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createRequestHandler = (acceptCircuit: any) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (req: any) => {
    const jobId = req.id;
    const roomName = req.room?.name || 'unknown';
    const reqAgentName = req.agentName || 'unknown';
    const acceptStart = Date.now();

    e2e?.jobReceived(jobId, roomName, reqAgentName);

    try {
      await acceptCircuit.execute(async () => {
        await withResilience!(
          async () => {
            e2e?.jobAccepting(jobId);
            await req.accept();
          },
          {
            maxRetries: 2,
            baseDelay: 500,
            maxDelay: 2000,
            operationName: `job-accept:${jobId}`,
            onRetry: (attempt: number, error: Error, delay: number) => {
              e2e?.warn('JOB', `Retrying accept (attempt ${attempt})`, {
                jobId,
                error: error.message,
                nextDelayMs: delay,
              });
            },
          }
        );
      });

      const acceptDuration = Date.now() - acceptStart;
      e2e?.jobAccepted(jobId, acceptDuration);
    } catch (error) {
      const acceptDuration = Date.now() - acceptStart;
      const err = error instanceof Error ? error : new Error(String(error));
      e2e?.jobAcceptFailed(jobId, err, acceptDuration);

      // AI diagnosis in background
      analyzeFailure!([err.message, err.stack || ''], {
        jobId,
        stage: 'accept',
        timing: { acceptDuration },
        errorType: err.name,
        errorMessage: err.message,
      })
        .then((diagnosis) => {
          e2e?.custom('DIAGNOSIS', `AI analysis for job ${jobId}`, {
            rootCause: diagnosis.rootCause,
            confidence: diagnosis.confidence,
            autoFixable: diagnosis.autoFixable,
          });

          const humanized = humanizeError!(err);
          e2e?.custom('HUMANIZED', humanized.userMessage, {
            severity: humanized.severity,
            shouldNotify: humanized.shouldNotifyUser,
          });
        })
        .catch(() => {});

      throw error;
    }
  };
};

// ============================================================================
// MAIN STARTUP
// ============================================================================
const main = async () => {
  try {
    // Phase 1: Setup (parallel for speed)
    log('Phase 1: Initializing services...');
    await Promise.all([setupShutdown(), setupDiagnostics(), setupSelfHealing()]);

    // Phase 2: Resource warmup (must complete before spawning children)
    log('Phase 2: Warming resources...');
    await warmupResources();

    // Phase 3: Create circuit breaker for job acceptance
    log('Phase 3: Setting up circuit breaker...');
    const acceptCircuit = createCircuitBreaker!('job-accept', {
      failureThreshold: 5,
      recoveryTimeout: APP_TIMEOUTS.CIRCUIT_BREAKER_RECOVERY,
      successThreshold: 2,
      failureWindow: 60_000,
      onStateChange: (name: string, oldState: string, newState: string) => {
        e2e?.custom('CIRCUIT', `Circuit "${name}": ${oldState} → ${newState}`, {
          name,
          oldState,
          newState,
        });
      },
    });

    // Phase 4: Start CLI worker
    log('Phase 4: Starting CLI worker...');
    cli.runApp(
      new WorkerOptions({
        agent: childAgentPath,
        agentName: AGENT_NAME,
        production: true,
        numIdleProcesses: 1,
        initializeProcessTimeout: 300 * 1000,
        requestFunc: createRequestHandler(acceptCircuit),
      })
    );

    // Phase 5: Post-startup tasks
    log('Phase 5: Post-startup tasks...');

    // Signal readiness
    try {
      const { signalWorkerAcceptingJobs } = await import('./shared/worker-readiness.js');
      signalWorkerAcceptingJobs();
      e2e?.workerReady();
    } catch {
      // Non-fatal
    }

    // Start health logging
    startHealthLogging?.(60_000);

    // Start keep-alive
    try {
      const { startKeepalive } = await import('./shared/livekit-keepalive.js');
      startKeepalive();
    } catch {
      // Non-fatal
    }

    const totalStartupMs = Date.now() - _startTime;
    log('✅ Voice Worker ready', {
      startupMs: totalStartupMs,
      agentName: AGENT_NAME,
      childPath: childAgentPath,
    });
  } catch (error) {
    log('❌ Voice Worker startup failed', {
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
};

// ============================================================================
// ENTRY POINT
// ============================================================================
// Only run main process logic if we're the main process
// Child processes have process.send defined (IPC channel to parent)
if (!process.send) {
  main().catch((error) => {
    log('❌ Fatal error', { error: String(error) });
    process.exit(1);
  });
} else {
  log('Child process detected - this file should not be loaded by children');
}
