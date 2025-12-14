/**
 * Single-Process Voice Worker
 *
 * A custom LiveKit agents worker that runs ALL jobs in the main process.
 * This bypasses the SDK's child process model entirely.
 *
 * HOW IT WORKS:
 * ------------
 * 1. Connect to LiveKit server via WebSocket (same as SDK)
 * 2. Receive job dispatch messages
 * 3. Accept jobs and run entry() directly in main process
 * 4. No forking, no child processes, instant job startup
 *
 * WHY:
 * ----
 * LiveKit's default SDK forks child processes for each job.
 * On Cloud Run, this causes 30-120 second cold starts per job.
 * This worker eliminates that overhead entirely.
 */

import 'dotenv/config';

// ============================================================================
// STARTUP LOGGING
// ============================================================================
const _startTime = Date.now();
const _logPrefix = () => `[${new Date().toISOString()}] [single-process-worker]`;

const log = (msg: string, data?: Record<string, unknown>) => {
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  process.stderr.write(`${_logPrefix()} ${msg}${dataStr}\n`);
};

log('🚀 Single-Process Voice Worker starting', {
  pid: process.pid,
  nodeVersion: process.version,
  env: process.env.NODE_ENV || 'development',
});

// ============================================================================
// PHASE 1: LOAD ALL MODULES UPFRONT
// ============================================================================
log('Phase 1: Loading voice agent modules...');
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

// Load voice agent session runner
import { startup } from '../startup.js';
import {
  markLivekitConnected,
  markLivekitDisconnected,
  signalWorkerAcceptingJobs,
} from './shared/worker-readiness.js';
import { runVoiceAgentSession } from './voice-agent-session.js';

const moduleLoadTime = Date.now() - moduleLoadStart;
log('Modules loaded', { moduleLoadTimeMs: moduleLoadTime });

// Initialize LiveKit SDK logger (required for runWithJobContextAsync)
initializeLogger({ pretty: true, level: 'info' });

// ============================================================================
// CONFIGURATION
// ============================================================================
const AGENT_NAME = process.env.AGENT_NAME || 'voice-agent';
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  log('ERROR: Missing LiveKit credentials');
  process.exit(1);
}

// ============================================================================
// PHASE 2: HEALTH SERVER
// ============================================================================
import { startHealthCheckServer } from './shared/health-server.js';
log('Phase 2: Starting health server...');
startHealthCheckServer(AGENT_NAME);

// ============================================================================
// PHASE 3: INITIALIZE STARTUP
// ============================================================================
log('Phase 3: Running startup initialization...');
const startupStart = Date.now();
await startup();
const startupTime = Date.now() - startupStart;
log('Startup complete', { startupTimeMs: startupTime });

// ============================================================================
// PHASE 4: RESOURCE WARMUP
// ============================================================================
import { setupIPCHandler, warmupResources } from './shared/resource-server.js';
log('Phase 4: Warming up resources...');
const warmupStart = Date.now();
setupIPCHandler();
await warmupResources();
const warmupTime = Date.now() - warmupStart;
log('Resources warmed', { warmupTimeMs: warmupTime });

// ============================================================================
// JOB METRICS
// ============================================================================
let totalJobs = 0;
let completedJobs = 0;
let failedJobs = 0;
let activeJobs = 0;
let workerId = `worker-${process.pid}`;

// ============================================================================
// IN-PROCESS JOB RUNNER
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

  // DEBUG: Log job metadata to verify persona_id is passed correctly
  log('Starting job in-process', {
    jobId,
    roomName: info.job.room?.name,
    jobMetadata: info.job.metadata, // Should contain persona_id from dispatch
    roomMetadata: info.job.room?.metadata, // Room metadata
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

  // Create RunningJobInfo structure that JobContext expects
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

    log('Starting runWithJobContextAsync', { jobId });
    await runWithJobContextAsync(ctx, async () => {
      log('Inside job context, calling runVoiceAgentSession', { jobId });
      try {
        await runVoiceAgentSession(ctx);
        log('runVoiceAgentSession completed', { jobId });
      } catch (sessionError) {
        log('runVoiceAgentSession error', { jobId, error: String(sessionError) });
        throw sessionError;
      } finally {
        clearTimeout(unconnectedTimeout);
      }
    });
    log('runWithJobContextAsync completed', { jobId });

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
// PHASE 5: CONNECT TO LIVEKIT SERVER
// ============================================================================
log('Phase 5: Connecting to LiveKit server...');

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let lastPongTime = Date.now();

// WebSocket keepalive - detect silent disconnections
const PING_INTERVAL_MS = 15_000; // Ping every 15 seconds
const PONG_TIMEOUT_MS = 30_000; // Consider dead if no pong in 30 seconds

function startPingKeepalive(): void {
  // Clear any existing interval
  if (pingInterval) {
    clearInterval(pingInterval);
  }

  lastPongTime = Date.now();

  pingInterval = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Check if we've received a pong recently
    const timeSinceLastPong = Date.now() - lastPongTime;
    if (timeSinceLastPong > PONG_TIMEOUT_MS) {
      log(`WebSocket appears dead (no pong in ${timeSinceLastPong}ms), reconnecting...`);
      markLivekitDisconnected();
      ws.terminate(); // Force close
      scheduleReconnect();
      return;
    }

    // Send ping
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
  // Create worker JWT token
  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  token.addGrant({ agent: true });
  const jwt = await token.toJwt();

  // Build WebSocket URL (matching SDK exactly: url + "agent")
  const baseUrl = new URL(LIVEKIT_URL);
  baseUrl.protocol = baseUrl.protocol.replace('http', 'ws');
  const url = new URL(`${baseUrl.toString()}agent`);

  log('Connecting to LiveKit', {
    url: url.toString(),
    apiKey: `${LIVEKIT_API_KEY.slice(0, 10)}...`,
    hasSecret: !!LIVEKIT_API_SECRET,
    jwtLength: jwt.length,
  });

  return new Promise((resolve, reject) => {
    // SDK uses Authorization header (line 281 in worker.js)
    ws = new WebSocket(url.toString(), {
      headers: { authorization: `Bearer ${jwt}` },
    });

    ws.on('open', () => {
      log('Connected to LiveKit server');
      reconnectAttempts = 0;
      markLivekitConnected();
      startPingKeepalive();

      // Register worker with full permissions (matching SDK behavior)
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
      log('Sending register message', { agentName: AGENT_NAME, type: JobType.JT_ROOM });
      ws!.send(registerMsg.toBinary());

      resolve();
    });

    // Handle pong responses for keepalive
    ws.on('pong', () => {
      lastPongTime = Date.now();
    });

    ws.on('message', (data: Buffer) => {
      void (async () => {
        try {
          const msg = new ServerMessage();
          msg.fromBinary(new Uint8Array(data));
          log('Server message received', { case: msg.message?.case });
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
    void connectToLiveKit().catch(console.error);
  }, delay);
}

// Track pending jobs - we store the accept args we send in availability response
// so we can use them when we get the assignment
interface PendingJob {
  job: Job;
  acceptArgs: {
    name: string;
    identity: string;
    metadata: string;
  };
}
const pendingJobs = new Map<string, PendingJob>();

async function handleServerMessage(msg: ServerMessage): Promise<void> {
  const { message } = msg;
  if (!message) return;

  switch (message.case) {
    case 'register': {
      workerId = message.value.workerId || workerId;
      log('Worker registered', {
        workerId,
        serverVersion: message.value.serverInfo?.version,
      });

      // CRITICAL: Send initial status update (SDK does this periodically)
      // This tells LiveKit we're available to receive jobs
      const statusMsg = new WorkerMessage({
        message: {
          case: 'updateWorker',
          value: {
            load: 0,
            status: WorkerStatus.WS_AVAILABLE,
          },
        },
      });
      ws?.send(statusMsg.toBinary());
      log('Sent WS_AVAILABLE status');

      // Signal that worker is ready to accept jobs (for /health/ready endpoint)
      signalWorkerAcceptingJobs();
      log('Worker ready to accept jobs');

      // Start periodic status updates (SDK does this every 10 seconds)
      setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          const currentLoad = activeJobs > 0 ? 0.5 : 0;
          const status = activeJobs >= 3 ? WorkerStatus.WS_FULL : WorkerStatus.WS_AVAILABLE;
          const updateMsg = new WorkerMessage({
            message: {
              case: 'updateWorker',
              value: {
                load: currentLoad,
                status,
              },
            },
          });
          ws.send(updateMsg.toBinary());
        }
      }, 10000);
      break;
    }

    case 'availability': {
      // Server is asking if we can handle a job
      const { job } = message.value;
      if (!job) return;

      log('Job availability request', { jobId: job.id, roomName: job.room?.name });

      // Store the accept args for when we get the assignment
      const acceptArgs = {
        name: AGENT_NAME,
        identity: `${AGENT_NAME}-${process.pid}`,
        metadata: JSON.stringify({ singleProcess: true }),
      };
      pendingJobs.set(job.id, { job, acceptArgs });

      // Always accept for now (single instance)
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
      ws?.send(response.toBinary());
      break;
    }

    case 'assignment': {
      // Server assigned us a job
      const assignment = message.value;
      const jobId = assignment.job?.id;

      log('Job assignment received', { jobId });

      if (!jobId || !assignment.job) {
        log('Invalid assignment - no job');
        return;
      }

      // Get the pending job info (we stored it when we responded to availability)
      const pending = pendingJobs.get(jobId);
      pendingJobs.delete(jobId);

      // Run the job in-process
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
      // TODO: Implement job cancellation
      break;
    }

    default:
      log('Unknown message type', { case: message.case });
  }
}

// Connect to LiveKit
await connectToLiveKit();

// ============================================================================
// DIAGNOSTIC SUMMARY
// ============================================================================
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
log('✅ Single-process worker ready', {
  totalStartupMs: totalStartupTime,
  moduleLoadMs: moduleLoadTime,
  startupMs: startupTime,
  warmupMs: warmupTime,
  workerId,
  mode: 'SINGLE_PROCESS',
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================
const shutdown = async (signal: string) => {
  log(`Received ${signal}, shutting down...`, { activeJobs });

  // Clean up WebSocket and readiness state
  markLivekitDisconnected();
  stopPingKeepalive();
  ws?.close();

  const shutdownStart = Date.now();
  while (activeJobs > 0 && Date.now() - shutdownStart < 30000) {
    await new Promise<void>((r) => {
      setTimeout(r, 1000);
    });
    log('Waiting for active jobs...', { activeJobs });
  }

  log('Shutdown complete', { totalJobs, completedJobs, failedJobs });
  process.exit(0);
};

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
