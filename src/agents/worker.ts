/**
 * GCE Voice Worker
 *
 * Unified worker for Google Compute Engine deployment.
 * Uses the single-process pattern for optimal GCE performance.
 *
 * Architecture:
 * - Single process handles multiple concurrent sessions
 * - Pre-warmed resources (VAD, TTS connections, persona configs)
 * - Clean orchestrator-based session management
 * - Horizontal scaling via GCE instance group
 *
 * Usage:
 *   node dist/agents/worker.js start
 *
 * @module agents/worker
 */

import 'dotenv/config';

// ============================================================================
// STARTUP LOGGING
// ============================================================================

const _startTime = Date.now();
const log = (msg: string, data?: Record<string, unknown>) => {
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  process.stderr.write(`[${new Date().toISOString()}] [worker] ${msg}${dataStr}\n`);
};

log('🚀 GCE Voice Worker starting', {
  pid: process.pid,
  nodeVersion: process.version,
  env: process.env.NODE_ENV || 'development',
});

// ============================================================================
// CONFIGURATION
// ============================================================================

const AGENT_NAME = process.env.AGENT_NAME || 'voice-agent';

// ============================================================================
// PHASE 1: HEALTH SERVER (Immediate)
// ============================================================================

log('Phase 1: Starting health server');

import { startHealthCheckServer } from './shared/health-server.js';
startHealthCheckServer(AGENT_NAME);

// ============================================================================
// PHASE 1.5: START CONTAINER WATCHDOG (Self-monitoring + Auto-cleanup)
// ============================================================================

log('Phase 1.5: Starting container watchdog');

import { startWatchdog, stopWatchdog } from '../services/container-watchdog.js';
startWatchdog({
  // Alert when disk reaches these thresholds
  diskWarningPercent: 70,
  diskCriticalPercent: 85,
  diskEmergencyPercent: 95,
  // Auto-cleanup when critical/emergency
  autoCleanupEnabled: true,
  // Check intervals
  diskCheckIntervalMs: 60_000, // Every minute
  memoryCheckIntervalMs: 30_000, // Every 30 seconds
  healthReportIntervalMs: 3600_000, // Hourly summary
});

log('✅ Container watchdog started');

// Start Ops Orchestrator (unified monitoring & alerting)
import { startOpsOrchestrator } from '../services/ops-orchestrator.js';
startOpsOrchestrator({
  // Cost thresholds (USD)
  costHourlyWarning: 5, // Alert if hourly > $5
  costDailyWarning: 50, // Alert if daily > $50
  costDailyCritical: 100, // Critical if daily > $100
  // Latency thresholds
  latencyP99Warning: 2000, // 2 seconds
  latencyP99Critical: 5000, // 5 seconds
  // Error rate thresholds
  errorRateWarning: 0.05, // 5%
  errorRateCritical: 0.1, // 10%
});

log('✅ Ops orchestrator started');

// ============================================================================
// PHASE 2: LOAD MODULES
// ============================================================================

log('Phase 2: Loading modules');
const moduleLoadStart = Date.now();

import { initializeLogger, JobContext, JobProcess, runWithJobContextAsync } from '@livekit/agents';
import {
  JobType,
  ParticipantPermission,
  ServerMessage,
  WorkerMessage,
  WorkerStatus,
  type Job,
} from '@livekit/protocol';
import { Room, RoomEvent } from '@livekit/rtc-node';
import { AccessToken } from 'livekit-server-sdk';
import { EventEmitter } from 'node:events';
import { WebSocket } from 'ws';

// Import voice agent entry point
import {
  markLivekitConnected,
  markLivekitDisconnected,
  signalWorkerAcceptingJobs,
} from './shared/worker-readiness.js';
import { runFullVoiceAgentEntry } from './voice-agent-entry.js';

const moduleLoadTime = Date.now() - moduleLoadStart;
log('Modules loaded', { moduleLoadTimeMs: moduleLoadTime });

// Initialize LiveKit SDK logger
initializeLogger({ pretty: true, level: 'info' });

// ============================================================================
// PHASE 3: WARMUP RESOURCES
// ============================================================================

log('Phase 3: Warming resources');

let preloadedVAD: unknown = null;

async function warmupResources(): Promise<void> {
  const warmupStart = Date.now();

  try {
    const tasks: Array<Promise<void>> = [];

    // 1. Load VAD model
    tasks.push(
      (async () => {
        try {
          const silero = await import('@livekit/agents-plugin-silero');
          preloadedVAD = await silero.VAD.load();
          log('✅ VAD model loaded');
        } catch (e) {
          log('⚠️ VAD preload failed', { error: String(e) });
        }
      })()
    );

    // 2. Warm persona cache
    tasks.push(
      (async () => {
        try {
          const { warmupResources: warmCache, setupIPCHandler } =
            await import('./shared/resource-server.js');
          setupIPCHandler();
          await warmCache();
          log('✅ Persona cache warmed');
        } catch (e) {
          log('⚠️ Persona cache warmup failed', { error: String(e) });
        }
      })()
    );

    // 3. Run startup initialization
    tasks.push(
      (async () => {
        try {
          const { startup } = await import('../startup.js');
          await startup();
          log('✅ Startup initialization complete');
        } catch (e) {
          log('⚠️ Startup initialization failed', { error: String(e) });
        }
      })()
    );

    // 4. Pre-warm critical session handlers (reduces cold-start latency by ~50-100ms)
    tasks.push(
      (async () => {
        try {
          const handlerWarmupStart = Date.now();
          await Promise.all([
            import('./voice-agent/session-init-handler.js'),
            import('./voice-agent/transcript-handler.js'),
            import('./voice-agent/music-handler.js'),
            import('./voice-agent/data-channel-handler.js'),
            import('./voice-agent/greeting-handler.js'),
            import('./voice-agent/cleanup-handler.js'),
            import('./shared/handoff-handler.js'),
            import('../tools/handoff/index.js'),
            import('../services/conversation-manager.js'),
          ]);
          log('✅ Critical handlers pre-loaded', { durationMs: Date.now() - handlerWarmupStart });
        } catch (e) {
          log('⚠️ Handler pre-load failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 5. Pre-warm TTS and voice dependencies
    tasks.push(
      (async () => {
        try {
          const voiceWarmupStart = Date.now();
          await Promise.all([
            import('../speech/voice-manager.js'),
            import('../config/cartesia-config.js'),
            import('@livekit/agents-plugin-google'),
            import('@google/genai'),
          ]);
          log('✅ Voice dependencies pre-loaded', { durationMs: Date.now() - voiceWarmupStart });
        } catch (e) {
          log('⚠️ Voice deps pre-load failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 5b. PERFORMANCE: Pre-warm Tool Orchestrator (saves 500-1000ms on first session)
    tasks.push(
      (async () => {
        try {
          const orchestratorWarmupStart = Date.now();
          const { initializeToolOrchestrator } = await import('../tools/orchestrator/index.js');
          await initializeToolOrchestrator();
          log('✅ Tool orchestrator pre-initialized', { durationMs: Date.now() - orchestratorWarmupStart });
        } catch (e) {
          log('⚠️ Tool orchestrator warmup failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 5c. PERFORMANCE: Pre-warm FerniAgent module (saves 100-200ms on first session)
    tasks.push(
      (async () => {
        try {
          const ferniWarmupStart = Date.now();
          await import('./personas/ferni-agent.js');
          log('✅ FerniAgent pre-loaded', { durationMs: Date.now() - ferniWarmupStart });
        } catch (e) {
          log('⚠️ FerniAgent warmup failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 6. PERFORMANCE CRITICAL: Pre-warm ALL context builders
    // These are the 70+ modules that run on every turn - loading them ahead of time
    // saves 100-200ms on the first user turn
    tasks.push(
      (async () => {
        try {
          const contextWarmupStart = Date.now();
          await Promise.all([
            // Core context builder orchestrator
            import('../intelligence/context-builders/index.js'),
            // Memory-related builders (heavy - database + embeddings)
            import('../intelligence/context-builders/memory.js'),
            import('../intelligence/context-builders/advanced-memory.js'),
            import('../intelligence/context-builders/unified-memory-orchestrator.js'),
            import('../intelligence/context-builders/persona-memory.js'),
            import('../intelligence/context-builders/proactive-memory.js'),
            import('../intelligence/context-builders/rag.js'),
            // Emotional/Humanization builders
            import('../intelligence/context-builders/emotional.js'),
            import('../intelligence/context-builders/human-personality.js'),
            import('../intelligence/context-builders/human-listening.js'),
            import('../intelligence/context-builders/lovable-presence.js'),
            import('../intelligence/context-builders/better-than-human-direct.js'),
            // Coaching builders
            import('../intelligence/context-builders/coaching-context.js'),
            import('../intelligence/context-builders/scientific-coaching.js'),
            import('../intelligence/context-builders/life-coaching-context.js'),
            // Other builders
            import('../intelligence/context-builders/cognitive.js'),
            import('../intelligence/context-builders/engagement-context.js'),
            import('../intelligence/context-builders/trust-context.js'),
            import('../intelligence/context-builders/anticipation.js'),
            import('../intelligence/context-builders/situational-awareness.js'),
            import('../intelligence/context-builders/alive-awareness.js'),
            import('../intelligence/context-builders/handoff.js'),
          ]);
          log('✅ Context builders pre-loaded', {
            durationMs: Date.now() - contextWarmupStart,
            buildersLoaded: 20,
          });
        } catch (e) {
          log('⚠️ Context builders pre-load failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 7. Pre-warm turn processor and intelligence modules
    tasks.push(
      (async () => {
        try {
          const turnProcessorStart = Date.now();
          await Promise.all([
            import('./processors/turn-processor.js'),
            import('./processors/index.js'),
            import('../intelligence/unified-analyzer.js'),
            import('../intelligence/superhuman-memory.js'),
            import('../memory/orchestrator.js'),
            import('../memory/embedding-cache.js'),
            import('../memory/semantic-rag.js'),
          ]);
          log('✅ Turn processor & memory pre-loaded', {
            durationMs: Date.now() - turnProcessorStart,
          });
        } catch (e) {
          log('⚠️ Turn processor pre-load failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 8. Pre-warm trust systems (Better Than Human capabilities)
    tasks.push(
      (async () => {
        try {
          const trustStart = Date.now();
          await Promise.all([
            import('../services/trust-systems/reading-between-lines.js'),
            import('../services/trust-systems/boundary-memory.js'),
            import('../services/trust-systems/growth-reflection.js'),
            import('../services/trust-systems/inside-jokes.js'),
            import('../services/trust-systems/small-wins.js'),
            import('../services/trust-systems/thinking-of-you.js'),
            import('../services/trust-systems/unified-persistence.js'),
          ]);
          log('✅ Trust systems pre-loaded', { durationMs: Date.now() - trustStart });
        } catch (e) {
          log('⚠️ Trust systems pre-load failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 9. PERFORMANCE CRITICAL: Initialize speculative embedding cache
    // Pre-compute embeddings for common phrases (greetings, emotions, topics)
    // This saves 50-200ms per turn by having common vectors ready
    tasks.push(
      (async () => {
        try {
          const embeddingStart = Date.now();
          const { initializeSpeculativeEmbeddings } =
            await import('../memory/speculative-embeddings.js');
          await initializeSpeculativeEmbeddings();
          log('✅ Speculative embeddings initialized', { durationMs: Date.now() - embeddingStart });
        } catch (e) {
          log('⚠️ Speculative embeddings init failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    // 10. PERFORMANCE CRITICAL: Pre-warm scaling systems (Pub/Sub, batched analysis, etc.)
    // Initialize performance optimization infrastructure for faster session starts
    tasks.push(
      (async () => {
        try {
          const perfStart = Date.now();
          // Pre-import performance modules (doesn't initialize yet - that happens per-session)
          await Promise.all([
            import('./shared/performance/index.js'),
            import('../services/pubsub/pubsub-client.js'),
            import('../intelligence/batched-llm-analysis.js'),
            import('../intelligence/context-service.js'),
            import('../memory/parallel-memory-search.js'),
          ]);
          log('✅ Performance optimization modules pre-loaded', {
            durationMs: Date.now() - perfStart,
          });
        } catch (e) {
          log('⚠️ Performance modules pre-load failed (non-fatal)', { error: String(e) });
        }
      })()
    );

    await Promise.all(tasks);
    log('✅ Resource warmup complete', { durationMs: Date.now() - warmupStart });
  } catch (e) {
    log('⚠️ Warmup failed (proceeding anyway)', { error: String(e) });
  }
}

// ============================================================================
// JOB METRICS
// ============================================================================

let totalJobs = 0;
let completedJobs = 0;
let failedJobs = 0;
let activeJobs = 0;
let workerId = `worker-${process.pid}`;

// ============================================================================
// IN-PROCESS JOB EXECUTOR
// ============================================================================

class InProcessInferenceExecutor {
  async doInference(method: string, _data: unknown): Promise<unknown> {
    throw new Error(`Inference not supported: ${method}`);
  }
}

interface JobInfo {
  job: Job;
  url: string;
  token: string;
  acceptArgs: {
    name: string;
    identity: string;
    metadata: string;
  };
}

async function runJobInProcess(info: JobInfo): Promise<void> {
  const jobId = info.job.id;
  const startTime = Date.now();

  activeJobs++;
  totalJobs++;

  log('Starting job', {
    jobId,
    roomName: info.job.room?.name,
    activeJobs,
    totalJobs,
  });

  const room = new Room();
  const closeEvent = new EventEmitter();
  let connected = false;
  let shutdown = false;

  room.on(RoomEvent.Disconnected, () => {
    if (!shutdown) {
      log('Room disconnected', { jobId });
      closeEvent.emit('close', false);
    }
  });

  const onConnect = () => {
    connected = true;
    log('Room connected', { jobId });
  };

  const onShutdown = (reason: string) => {
    shutdown = true;
    log('Shutdown requested', { jobId, reason });
    closeEvent.emit('close', true, reason);
  };

  const proc = new JobProcess();
  const runningJobInfo = {
    acceptArguments: info.acceptArgs,
    job: info.job,
    url: info.url,
    token: info.token,
    workerId,
  };

  const ctx = new JobContext(
    proc,
    runningJobInfo,
    room,
    onConnect,
    onShutdown,
    new InProcessInferenceExecutor()
  );

  try {
    const unconnectedTimeout = setTimeout(() => {
      if (!connected && !shutdown) {
        log('WARNING: Room not connected after 10s', { jobId });
      }
    }, 10000);

    await runWithJobContextAsync(ctx, async () => {
      try {
        // Use voice-agent-entry.ts (working code)
        // The orchestrator has integration issues - see ORCHESTRATOR-ARCHITECTURE-AUDIT.md
        await runFullVoiceAgentEntry(ctx);
      } catch (sessionError) {
        log('Session error', { jobId, error: String(sessionError) });
        throw sessionError;
      } finally {
        clearTimeout(unconnectedTimeout);
      }
    });

    // Wait for graceful close
    await new Promise<void>((resolve) => {
      if (!ctx.room.isConnected) {
        resolve();
        return;
      }
      const timeout = setTimeout(() => resolve(), 30000);
      closeEvent.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    completedJobs++;
    activeJobs--;
    log('Job completed', {
      jobId,
      durationMs: Date.now() - startTime,
      success: true,
    });
  } catch (error) {
    failedJobs++;
    activeJobs--;
    log('Job failed', {
      jobId,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    try {
      if (ctx.room.isConnected) {
        await ctx.room.disconnect();
      }
    } catch {
      // Ignore
    }
  }
}

// ============================================================================
// LIVEKIT CONNECTION
// ============================================================================

const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  log('ERROR: Missing LiveKit credentials');
  process.exit(1);
}

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let lastPongTime = Date.now();

const PING_INTERVAL_MS = 15_000;
const PONG_TIMEOUT_MS = 30_000;

/**
 * Safely send a message over the WebSocket.
 * Checks readyState before sending to prevent "WebSocket is not open" errors.
 * Returns true if message was sent, false if WebSocket wasn't ready.
 */
function safeSend(data: Uint8Array, context?: string): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    const state = ws ? ws.readyState : 'null';
    log('WebSocket not ready for send', { readyState: state, context: context || 'unknown' });
    return false;
  }
  try {
    ws.send(data);
    return true;
  } catch (error) {
    log('WebSocket send failed', { error: String(error), context: context || 'unknown' });
    return false;
  }
}

function startPingKeepalive(): void {
  if (pingInterval) clearInterval(pingInterval);
  lastPongTime = Date.now();

  pingInterval = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const timeSinceLastPong = Date.now() - lastPongTime;
    if (timeSinceLastPong > PONG_TIMEOUT_MS) {
      log(`WebSocket appears dead, reconnecting...`);
      markLivekitDisconnected();
      ws.terminate();
      scheduleReconnect();
      return;
    }

    try {
      ws.ping();
    } catch (error) {
      log('Ping failed', { error: String(error) });
    }
  }, PING_INTERVAL_MS);
}

function stopPingKeepalive(): void {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

async function connectToLiveKit(): Promise<void> {
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  token.addGrant({ agent: true });
  const jwt = await token.toJwt();

  const baseUrl = new URL(LIVEKIT_URL);
  baseUrl.protocol = baseUrl.protocol.replace('http', 'ws');
  const url = new URL(`${baseUrl.toString()}agent`);

  log('Connecting to LiveKit', { url: url.toString() });

  return new Promise((resolve, reject) => {
    ws = new WebSocket(url.toString(), {
      headers: { authorization: `Bearer ${jwt}` },
    });

    ws.on('open', () => {
      log('Connected to LiveKit server');
      reconnectAttempts = 0;
      markLivekitConnected();
      startPingKeepalive();

      const registerMsg = new WorkerMessage({
        message: {
          case: 'register',
          value: {
            type: JobType.JT_ROOM,
            version: '0.1.0',
            agentName: AGENT_NAME,
            allowedPermissions: new ParticipantPermission({
              canPublish: true,
              canSubscribe: true,
              canPublishData: true,
              canUpdateMetadata: true,
              hidden: false,
              agent: true,
            }),
          },
        },
      });
      safeSend(registerMsg.toBinary(), 'register');
      resolve();
    });

    ws.on('pong', () => {
      lastPongTime = Date.now();
    });

    ws.on('message', (data: Buffer) => {
      void (async () => {
        try {
          const msg = new ServerMessage();
          msg.fromBinary(new Uint8Array(data));
          await handleServerMessage(msg);
        } catch (error) {
          log('Error handling message', { error: String(error) });
        }
      })();
    });

    ws.on('close', (code) => {
      log('WebSocket closed', { code });
      markLivekitDisconnected();
      stopPingKeepalive();
      scheduleReconnect();
    });

    ws.on('error', (error) => {
      log('WebSocket error', { error: error.message });
      reject(error);
    });
  });
}

function scheduleReconnect(): void {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    log('Max reconnect attempts reached, exiting');
    process.exit(1);
  }

  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  reconnectAttempts++;

  log('Scheduling reconnect', { attempt: reconnectAttempts, delayMs: delay });
  setTimeout(() => {
    void connectToLiveKit().catch(log);
  }, delay);
}

interface PendingJob {
  job: Job;
  acceptArgs: {
    name: string;
    identity: string;
    metadata: string;
  };
  /** Timestamp when job was added to pending queue */
  timestamp: number;
}
const pendingJobs = new Map<string, PendingJob>();

/** TTL for pending jobs - if not assigned within 60s, clean up */
const PENDING_JOB_TTL_MS = 60_000;

/** Cleanup interval for stale pending jobs */
let pendingJobsCleanupInterval: ReturnType<typeof setInterval> | null = null;

function startPendingJobsCleanup(): void {
  if (pendingJobsCleanupInterval) return;

  pendingJobsCleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [jobId, pending] of pendingJobs) {
      if (now - pending.timestamp > PENDING_JOB_TTL_MS) {
        pendingJobs.delete(jobId);
        cleaned++;
        log('Cleaned up stale pending job', { jobId, ageMs: now - pending.timestamp });
      }
    }

    if (cleaned > 0) {
      log('Pending jobs cleanup complete', { cleaned, remaining: pendingJobs.size });
    }
  }, 30_000); // Run every 30 seconds
}

function stopPendingJobsCleanup(): void {
  if (pendingJobsCleanupInterval) {
    clearInterval(pendingJobsCleanupInterval);
    pendingJobsCleanupInterval = null;
  }
}

async function handleServerMessage(msg: ServerMessage): Promise<void> {
  const { message } = msg;
  if (!message) return;

  switch (message.case) {
    case 'register': {
      workerId = message.value.workerId || workerId;
      log('Worker registered', { workerId });

      const statusMsg = new WorkerMessage({
        message: {
          case: 'updateWorker',
          value: { load: 0, status: WorkerStatus.WS_AVAILABLE },
        },
      });
      safeSend(statusMsg.toBinary(), 'worker-status-available');

      signalWorkerAcceptingJobs();
      log('Worker ready to accept jobs');

      // Start pending jobs cleanup to prevent memory leaks
      startPendingJobsCleanup();

      // Periodic status updates
      setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          const currentLoad = activeJobs > 0 ? 0.5 : 0;
          const status = activeJobs >= 3 ? WorkerStatus.WS_FULL : WorkerStatus.WS_AVAILABLE;
          const updateMsg = new WorkerMessage({
            message: {
              case: 'updateWorker',
              value: { load: currentLoad, status },
            },
          });
          ws.send(updateMsg.toBinary());
        }
      }, 10000);
      break;
    }

    case 'availability': {
      const { job } = message.value;
      if (!job) return;

      log('Job availability request', { jobId: job.id, roomName: job.room?.name });

      const acceptArgs = {
        name: AGENT_NAME,
        identity: `${AGENT_NAME}-${process.pid}`,
        metadata: JSON.stringify({ singleProcess: true }),
      };
      pendingJobs.set(job.id, { job, acceptArgs, timestamp: Date.now() });

      const response = new WorkerMessage({
        message: {
          case: 'availability',
          value: {
            jobId: job.id,
            available: true,
            participantIdentity: acceptArgs.identity,
            participantName: acceptArgs.name,
            participantMetadata: acceptArgs.metadata,
          },
        },
      });
      safeSend(response.toBinary(), 'availability-response');
      break;
    }

    case 'assignment': {
      const assignment = message.value;
      const jobId = assignment.job?.id;

      log('Job assignment received', { jobId });

      if (!jobId || !assignment.job) {
        log('Invalid assignment - no job');
        return;
      }

      const pending = pendingJobs.get(jobId);
      pendingJobs.delete(jobId);

      runJobInProcess({
        job: assignment.job,
        url: assignment.url || LIVEKIT_URL,
        token: assignment.token || '',
        acceptArgs: pending?.acceptArgs || {
          name: AGENT_NAME,
          identity: `${AGENT_NAME}-${process.pid}`,
          metadata: '',
        },
      }).catch((error) => {
        log('Job execution failed', { jobId, error: String(error) });
      });
      break;
    }

    case 'termination': {
      log('Job termination received', { jobId: message.value.jobId });
      break;
    }

    default:
      log('Unknown message type', { case: message.case });
  }
}

// ============================================================================
// MAIN STARTUP
// ============================================================================

async function main(): Promise<void> {
  await warmupResources();

  log('Phase 4: Connecting to LiveKit');
  await connectToLiveKit();

  // Diagnostic summary
  setInterval(() => {
    log('Diagnostic summary', {
      uptimeMs: Date.now() - _startTime,
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      totalJobs,
      completedJobs,
      failedJobs,
      activeJobs,
      workerId,
    });
  }, 60000);

  const totalStartupTime = Date.now() - _startTime;
  log('✅ GCE Voice Worker ready', {
    totalStartupMs: totalStartupTime,
    moduleLoadMs: moduleLoadTime,
    workerId,
    mode: 'SINGLE_PROCESS',
  });
}

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

let isShuttingDown = false;

const shutdown = async (signal: string) => {
  // Prevent double-shutdown
  if (isShuttingDown) {
    log('Shutdown already in progress, ignoring duplicate signal');
    return;
  }
  isShuttingDown = true;
  
  log(`Received ${signal}, shutting down...`, { activeJobs });

  // 1. Stop watchdog first (prevents new resource monitoring)
  try {
    stopWatchdog();
    log('Container watchdog stopped');
  } catch {
    // Ignore - watchdog may not be initialized
  }

  // 2. Mark LiveKit as disconnected and stop keepalive
  markLivekitDisconnected();
  stopPingKeepalive();
  stopPendingJobsCleanup();
  
  // 3. Close WebSocket gracefully
  if (ws) {
    try {
      ws.close();
    } catch {
      // Ignore close errors
    }
  }

  // 4. Wait for active jobs to complete (max 30s)
  const shutdownStart = Date.now();
  while (activeJobs > 0 && Date.now() - shutdownStart < 30000) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 1000);
    });
    log('Waiting for active jobs...', { activeJobs });
  }

  log('Shutdown complete', { totalJobs, completedJobs, failedJobs });
  
  // 5. Give native modules time to cleanup before exit
  // This prevents the "mutex lock failed" error from C++ code
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  
  // 6. Exit cleanly
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// ============================================================================
// ENTRY POINT
// ============================================================================

main().catch((error) => {
  log('❌ Worker startup failed', { error: String(error) });
  process.exit(1);
});
