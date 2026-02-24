/**
 * GCE LiveKit Connection
 *
 * Manages WebSocket connection to LiveKit server on GCE.
 * Handles registration, job availability, assignment, and keepalive.
 * Extracted from gce-voice-worker.ts for maintainability.
 *
 * @module agents/gce/livekit-connection
 */

import {
  JobType,
  ParticipantPermission,
  ServerMessage,
  WorkerMessage,
  WorkerStatus,
  type Job,
} from '@livekit/protocol';
import { AccessToken } from 'livekit-server-sdk';
import { WebSocket } from 'ws';

import {
  markLivekitConnected,
  markLivekitDisconnected,
  signalWorkerAcceptingJobs,
} from '../shared/worker-readiness.js';
import { runJobInProcess, getActiveJobs, setWorkerId, type JobInfo } from './job-executor.js';

// ============================================================================
// TYPES
// ============================================================================

export type LogFn = (msg: string, data?: Record<string, unknown>) => void;

export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
  agentName: string;
}

// ============================================================================
// STATE
// ============================================================================

let ws: WebSocket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let lastPongTime = Date.now();

/** Flag to prevent reconnect during shutdown */
let isShuttingDown = false;

const PING_INTERVAL_MS = 15_000;
const PONG_TIMEOUT_MS = 30_000;

/** Pending jobs waiting for assignment */
interface PendingJob {
  job: Job;
  acceptArgs: {
    name: string;
    identity: string;
    metadata: string;
  };
  timestamp: number;
}
const pendingJobs = new Map<string, PendingJob>();

/** TTL for pending jobs */
const PENDING_JOB_TTL_MS = 60_000;
let pendingJobsCleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * RACE CONDITION FIX: Track the status update interval so it can be cleaned up.
 * Previously this was created without storing the reference, causing memory leaks.
 */
let statusUpdateInterval: ReturnType<typeof setInterval> | null = null;

/**
 * RACE CONDITION FIX: Track WebSocket event handlers so they can be removed before reconnect.
 * This prevents duplicate handlers and stale closure access.
 */
interface WebSocketHandlers {
  onOpen: () => void;
  onPong: () => void;
  onMessage: (data: Buffer) => void;
  onClose: (code: number) => void;
  onError: (error: Error) => void;
}
let currentHandlers: WebSocketHandlers | null = null;

// Module-level config and log (set during init)
let _config: LiveKitConfig;
let _log: LogFn;

// ============================================================================
// WEBSOCKET HELPERS
// ============================================================================

/**
 * Safely send a message over the WebSocket.
 */
function safeSend(data: Uint8Array, context?: string): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    const state = ws ? ws.readyState : 'null';
    _log('WebSocket not ready for send', { readyState: state, context: context || 'unknown' });
    return false;
  }
  try {
    ws.send(data);
    return true;
  } catch (error) {
    _log('WebSocket send failed', { error: String(error), context: context || 'unknown' });
    return false;
  }
}

// ============================================================================
// KEEPALIVE
// ============================================================================

function startPingKeepalive(): void {
  if (pingInterval) clearInterval(pingInterval);
  lastPongTime = Date.now();

  pingInterval = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const timeSinceLastPong = Date.now() - lastPongTime;
    if (timeSinceLastPong > PONG_TIMEOUT_MS) {
      _log(`WebSocket appears dead, reconnecting...`);
      markLivekitDisconnected();
      ws.terminate();
      scheduleReconnect();
      return;
    }

    try {
      ws.ping();
    } catch (error) {
      _log('Ping failed', { error: String(error) });
    }
  }, PING_INTERVAL_MS);

  // FIX: Unref to prevent blocking process exit if closeConnection() isn't called
  pingInterval.unref();
}

export function stopPingKeepalive(): void {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

// ============================================================================
// PENDING JOBS CLEANUP
// ============================================================================

/**
 * RACE CONDITION FIX: Use a flag to prevent double initialization.
 * The interval check alone wasn't sufficient for concurrent calls.
 */
let pendingJobsCleanupStarting = false;

function startPendingJobsCleanup(): void {
  // Double-check both flag and interval to prevent race
  if (pendingJobsCleanupInterval || pendingJobsCleanupStarting) return;
  pendingJobsCleanupStarting = true;

  pendingJobsCleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [jobId, pending] of pendingJobs) {
      if (now - pending.timestamp > PENDING_JOB_TTL_MS) {
        pendingJobs.delete(jobId);
        cleaned++;
        _log('Cleaned up stale pending job', { jobId, ageMs: now - pending.timestamp });
      }
    }

    if (cleaned > 0) {
      _log('Pending jobs cleanup complete', { cleaned, remaining: pendingJobs.size });
    }
  }, 30_000);

  // FIX: Unref to prevent blocking process exit if closeConnection() isn't called
  pendingJobsCleanupInterval.unref();

  pendingJobsCleanupStarting = false;
}

export function stopPendingJobsCleanup(): void {
  if (pendingJobsCleanupInterval) {
    clearInterval(pendingJobsCleanupInterval);
    pendingJobsCleanupInterval = null;
  }
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

async function handleServerMessage(msg: ServerMessage): Promise<void> {
  const { message } = msg;
  if (!message) return;

  switch (message.case) {
    case 'register': {
      const workerId = message.value.workerId || `worker-${process.pid}`;
      setWorkerId(workerId);
      _log('Worker registered', { workerId });

      const statusMsg = new WorkerMessage({
        message: {
          case: 'updateWorker',
          value: { load: 0, status: WorkerStatus.WS_AVAILABLE },
        },
      });
      safeSend(statusMsg.toBinary(), 'worker-status-available');

      signalWorkerAcceptingJobs();
      _log('Worker ready to accept jobs');

      startPendingJobsCleanup();

      // RACE CONDITION FIX: Clear any existing status update interval before creating new one
      if (statusUpdateInterval) {
        clearInterval(statusUpdateInterval);
      }

      // Periodic status updates - NOW stored for cleanup
      statusUpdateInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          const activeJobs = getActiveJobs();
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

      // FIX: Unref to prevent blocking process exit if closeConnection() isn't called
      statusUpdateInterval.unref();
      break;
    }

    case 'availability': {
      const { job } = message.value;
      if (!job) return;

      // Enhanced logging with instance identification for multi-instance debugging
      const roomName = job.room?.name || 'unknown';
      _log('Job availability request', {
        jobId: job.id,
        roomName,
        instanceId: `${_config.agentName}-${process.pid}`,
        hostname: process.env.HOSTNAME || 'local',
      });

      const acceptArgs = {
        name: _config.agentName,
        identity: `${_config.agentName}-${process.pid}`,
        metadata: JSON.stringify({
          singleProcess: true,
          hostname: process.env.HOSTNAME || 'local',
          pid: process.pid,
        }),
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
      const responseBinary = response.toBinary();
      const sent = safeSend(responseBinary, 'availability-response');
      _log('Availability response sent', {
        jobId: job.id,
        sent,
        binaryLength: responseBinary.length,
        wsState: ws?.readyState,
        responseJson: JSON.stringify(response.toJson()),
      });
      break;
    }

    case 'assignment': {
      const assignment = message.value;
      const jobId = assignment.job?.id;
      const roomName = assignment.job?.room?.name || 'unknown';

      // Enhanced logging with instance identification
      _log('Job assignment received', {
        jobId,
        roomName,
        instanceId: `${_config.agentName}-${process.pid}`,
        hostname: process.env.HOSTNAME || 'local',
      });

      if (!jobId || !assignment.job) {
        _log('Invalid assignment - no job');
        return;
      }

      const pending = pendingJobs.get(jobId);
      pendingJobs.delete(jobId);

      const jobInfo: JobInfo = {
        job: assignment.job,
        url: assignment.url || _config.url,
        token: assignment.token || '',
        acceptArgs: pending?.acceptArgs || {
          name: _config.agentName,
          identity: `${_config.agentName}-${process.pid}`,
          metadata: '',
        },
      };

      runJobInProcess(jobInfo, _log).catch((error) => {
        _log('Job execution failed', { jobId, error: String(error) });
      });
      break;
    }

    case 'termination': {
      // Enhanced termination logging - this is critical for debugging conflicts
      const { jobId } = message.value;
      _log('Job termination received', {
        jobId,
        instanceId: `${_config.agentName}-${process.pid}`,
        hostname: process.env.HOSTNAME || 'local',
        timestamp: new Date().toISOString(),
      });

      // Write to stderr for immediate visibility
      process.stderr.write(
        `[livekit-connection] 🛑 JOB TERMINATED: ${jobId} ` +
          `(instance: ${_config.agentName}-${process.pid}, ` +
          `host: ${process.env.HOSTNAME || 'local'})\n`
      );
      break;
    }

    default:
      _log('Unknown message type', { case: message.case });
  }
}

// ============================================================================
// CONNECTION MANAGEMENT
// ============================================================================

function scheduleReconnect(): void {
  // CRITICAL: Don't reconnect during shutdown - causes native mutex crash
  if (isShuttingDown) {
    _log('Skipping reconnect - shutdown in progress');
    return;
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    _log('Max reconnect attempts reached, exiting');
    process.exit(1);
  }

  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  reconnectAttempts++;

  _log('Scheduling reconnect', { attempt: reconnectAttempts, delayMs: delay });
  setTimeout(() => {
    // Double-check shutdown flag before actually reconnecting
    if (isShuttingDown) {
      _log('Aborting scheduled reconnect - shutdown in progress');
      return;
    }
    void connectToLiveKit().catch(_log);
  }, delay);
}

/**
 * Remove WebSocket event handlers to prevent memory leaks and stale closures.
 * RACE CONDITION FIX: Must be called before creating new WebSocket.
 */
function removeWebSocketHandlers(): void {
  if (ws && currentHandlers) {
    ws.off('open', currentHandlers.onOpen);
    ws.off('pong', currentHandlers.onPong);
    ws.off('message', currentHandlers.onMessage);
    ws.off('close', currentHandlers.onClose);
    ws.off('error', currentHandlers.onError);
    currentHandlers = null;
  }
}

/**
 * Connect to LiveKit server via WebSocket.
 */
export async function connectToLiveKit(): Promise<void> {
  // RACE CONDITION FIX: Remove old handlers before creating new connection
  removeWebSocketHandlers();

  const token = new AccessToken(_config.apiKey, _config.apiSecret);
  token.addGrant({ agent: true });
  const jwt = await token.toJwt();

  const baseUrl = new URL(_config.url);
  baseUrl.protocol = baseUrl.protocol.replace('http', 'ws');
  const url = new URL(`${baseUrl.toString()}agent`);

  _log('Connecting to LiveKit', { url: url.toString() });

  return new Promise((resolve, reject) => {
    ws = new WebSocket(url.toString(), {
      headers: { authorization: `Bearer ${jwt}` },
    });

    // RACE CONDITION FIX: Store handler references for cleanup
    currentHandlers = {
      onOpen: () => {
        _log('Connected to LiveKit server');
        reconnectAttempts = 0;
        markLivekitConnected();
        startPingKeepalive();

        const registerMsg = new WorkerMessage({
          message: {
            case: 'register',
            value: {
              type: JobType.JT_ROOM,
              version: '0.1.0',
              agentName: _config.agentName,
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
      },

      onPong: () => {
        lastPongTime = Date.now();
      },

      onMessage: (data: Buffer) => {
        void (async () => {
          try {
            const msg = new ServerMessage();
            msg.fromBinary(new Uint8Array(data));
            await handleServerMessage(msg);
          } catch (error) {
            _log('Error handling message', { error: String(error) });
          }
        })();
      },

      onClose: (code: number) => {
        _log('WebSocket closed', { code });
        markLivekitDisconnected();
        stopPingKeepalive();
        scheduleReconnect();
      },

      onError: (error: Error) => {
        _log('WebSocket error', { error: error.message });
        reject(error);
      },
    };

    ws.on('open', currentHandlers.onOpen);
    ws.on('pong', currentHandlers.onPong);
    ws.on('message', currentHandlers.onMessage);
    ws.on('close', currentHandlers.onClose);
    ws.on('error', currentHandlers.onError);
  });
}

/**
 * Prepare for shutdown - prevents reconnect attempts.
 * MUST be called BEFORE closeConnection() to prevent native mutex crash.
 */
export function prepareForShutdown(): void {
  isShuttingDown = true;
  _log('LiveKit connection prepared for shutdown - reconnect disabled');
}

/**
 * Close the WebSocket connection gracefully.
 */
export function closeConnection(): void {
  // Ensure shutdown flag is set to prevent reconnect race
  isShuttingDown = true;

  // RACE CONDITION FIX: Clean up all intervals
  if (statusUpdateInterval) {
    clearInterval(statusUpdateInterval);
    statusUpdateInterval = null;
  }
  stopPendingJobsCleanup();
  stopPingKeepalive();

  // Remove handlers before closing
  removeWebSocketHandlers();

  if (ws) {
    try {
      ws.close();
    } catch {
      // Ignore close errors
    }
  }
}

/**
 * Initialize the LiveKit connection module.
 * Must be called before connectToLiveKit().
 */
export function initLiveKitConnection(config: LiveKitConfig, log: LogFn): void {
  _config = config;
  _log = log;
}
