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
  JobStatus,
  JobType,
  ParticipantPermission,
  ServerMessage,
  WorkerMessage,
  WorkerStatus,
  type Job,
} from '@livekit/protocol';
import os from 'node:os';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { WebSocket } from 'ws';

import {
  markLivekitConnected,
  markLivekitDisconnected,
  signalWorkerAcceptingJobs,
} from '../shared/worker-readiness.js';
import { runJobInProcess, getActiveJobs, getActiveJobIds, setWorkerId, setOnJobLifecycle, type JobInfo } from './job-executor.js';

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

/** Guard against double-reconnect (keepalive + onClose both call scheduleReconnect) */
let reconnectScheduled = false;

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
// CPU LOAD (matches official LiveKit SDK: os.getloadavg / os.cpu_count)
// ============================================================================

/**
 * Get normalized CPU load (0.0 - 1.0).
 * Matches the Python SDK: os.getloadavg()[0] / os.cpu_count()
 */
function getCpuLoad(): number {
  const loadAvg = os.loadavg()[0]; // 1-minute load average
  const cpuCount = os.cpus().length;
  if (cpuCount === 0) return 0;
  return Math.min(loadAvg / cpuCount, 1.0);
}

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
          value: { load: 0, status: WorkerStatus.WS_AVAILABLE, jobCount: getActiveJobs() },
        },
      });
      safeSend(statusMsg.toBinary(), 'worker-status-available');

      signalWorkerAcceptingJobs();
      _log('Worker ready to accept jobs');

      // migrateJob: report any active jobs from before reconnect (matches Python SDK behavior)
      const activeIds = getActiveJobIds();
      if (activeIds.length > 0) {
        const migrateMsg = new WorkerMessage({
          message: {
            case: 'migrateJob',
            value: { jobIds: activeIds },
          },
        });
        safeSend(migrateMsg.toBinary(), 'migrate-jobs');
        _log('Migrated active jobs after reconnect', { jobIds: activeIds });
      }

      // Job lifecycle callback: send UpdateJobStatus + UpdateWorkerStatus on every event
      setOnJobLifecycle((jobId, event) => {
        if (ws?.readyState !== WebSocket.OPEN) return;

        // Map lifecycle event to LiveKit JobStatus
        const statusMap: Record<string, JobStatus> = {
          started: JobStatus.JS_RUNNING,
          completed: JobStatus.JS_SUCCESS,
          failed: JobStatus.JS_FAILED,
        };
        const jobStatus = statusMap[event];

        // Send UpdateJobStatus (matches Python SDK: _update_job_status)
        if (jobStatus !== undefined) {
          const jobStatusMsg = new WorkerMessage({
            message: {
              case: 'updateJob',
              value: { jobId, status: jobStatus },
            },
          });
          safeSend(jobStatusMsg.toBinary(), `job-status-${event}`);
        }

        // Send UpdateWorkerStatus with current load + jobCount
        const jobs = getActiveJobs();
        const load = getCpuLoad();
        const workerStatus = jobs >= 3 ? WorkerStatus.WS_FULL : WorkerStatus.WS_AVAILABLE;
        const updateMsg = new WorkerMessage({
          message: {
            case: 'updateWorker',
            value: { load, status: workerStatus, jobCount: jobs },
          },
        });
        safeSend(updateMsg.toBinary(), `worker-status-after-${event}`);
        _log(`Job lifecycle: ${event}`, { jobId, activeJobs: jobs, load, status: workerStatus });
      });

      startPendingJobsCleanup();

      // RACE CONDITION FIX: Clear any existing status update interval before creating new one
      if (statusUpdateInterval) {
        clearInterval(statusUpdateInterval);
      }

      // Periodic status updates — 2.5s interval matches official LiveKit SDK
      statusUpdateInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          const jobs = getActiveJobs();
          const load = getCpuLoad();
          const status = jobs >= 3 ? WorkerStatus.WS_FULL : WorkerStatus.WS_AVAILABLE;
          const updateMsg = new WorkerMessage({
            message: {
              case: 'updateWorker',
              value: { load, status, jobCount: jobs },
            },
          });
          ws.send(updateMsg.toBinary());
        }
      }, 2500);

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
        activeJobs: getActiveJobs(),
        instanceId: `${_config.agentName}-${process.pid}`,
        hostname: process.env.HOSTNAME || 'local',
      });

      // Load-aware: reject if at max capacity to prevent wasted dispatch cycles
      if (getActiveJobs() >= 3) {
        const rejectResponse = new WorkerMessage({
          message: {
            case: 'availability',
            value: {
              jobId: job.id,
              available: false,
            },
          },
        });
        safeSend(rejectResponse.toBinary(), 'availability-reject-full');
        _log('Rejected availability — at max capacity', { jobId: job.id, activeJobs: getActiveJobs() });
        return;
      }

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

  // RACE CONDITION FIX: Prevent double-reconnect from keepalive + onClose firing together.
  // Without this guard, ws.terminate() triggers onClose which calls scheduleReconnect(),
  // AND the keepalive also calls scheduleReconnect(), creating TWO WebSocket connections
  // and TWO worker registrations on LiveKit — causing dispatch failures.
  if (reconnectScheduled) {
    _log('Reconnect already scheduled, skipping duplicate');
    return;
  }
  reconnectScheduled = true;

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    _log('Max reconnect attempts reached, exiting');
    process.exit(1);
  }

  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  reconnectAttempts++;

  _log('Scheduling reconnect', { attempt: reconnectAttempts, delayMs: delay });
  setTimeout(() => {
    reconnectScheduled = false;
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
 * Remove stale agent participants from previous worker runs.
 *
 * When a worker is killed with SIGKILL (or crashes), its LiveKit WebSocket
 * dies but the server-side participant registration may persist briefly.
 * If a new worker starts before LiveKit detects the stale connection,
 * the zombie worker steals job assignments from the new one.
 *
 * This uses the LiveKit Server SDK to find and remove any participants
 * matching our agent name pattern from all active rooms.
 */
export async function cleanupStaleWorkers(): Promise<void> {
  const livekitHttpUrl = _config.url.replace('wss://', 'https://').replace('ws://', 'http://');
  const roomService = new RoomServiceClient(livekitHttpUrl, _config.apiKey, _config.apiSecret);

  try {
    const rooms = await roomService.listRooms();

    for (const room of rooms) {
      if (!room.name) continue;

      const participants = await roomService.listParticipants(room.name);

      for (const participant of participants) {
        const identity = participant.identity || '';
        const isOurAgent =
          identity.startsWith(`${_config.agentName}-`) && identity !== `${_config.agentName}-${process.pid}`;

        if (isOurAgent) {
          _log('Removing stale agent participant from previous run', {
            room: room.name,
            identity,
            currentPid: process.pid,
          });

          try {
            await roomService.removeParticipant(room.name, identity);
            _log('Stale participant removed', { room: room.name, identity });
          } catch (removeErr) {
            _log('Could not remove stale participant (may have already left)', {
              room: room.name,
              identity,
              error: String(removeErr),
            });
          }
        }
      }
    }
  } catch (error) {
    _log('Stale worker cleanup failed (non-blocking)', { error: String(error) });
  }
}

/**
 * Connect to LiveKit server via WebSocket.
 */
export async function connectToLiveKit(): Promise<void> {
  // RACE CONDITION FIX: Close old WebSocket AND remove handlers before creating new connection.
  // Just removing handlers leaves the old WebSocket open → orphaned connection → duplicate worker.
  if (ws) {
    try {
      ws.terminate();
    } catch {
      // ignore — may already be closed
    }
  }
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
