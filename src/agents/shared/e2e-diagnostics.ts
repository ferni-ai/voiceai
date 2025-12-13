/**
 * E2E Diagnostics System
 *
 * Comprehensive logging and monitoring for the entire voice agent pipeline.
 * Designed to rapidly isolate root causes across:
 * - Main process ↔ Child process IPC
 * - LiveKit job lifecycle (dispatch → accept → assign → entry)
 * - Resource loading (VAD, TTS, Personas)
 * - Session lifecycle (connect → greet → conversation → disconnect)
 *
 * Usage:
 *   import { e2e } from './shared/e2e-diagnostics.js';
 *   e2e.jobReceived(jobId, roomName);
 *   e2e.childSpawned(pid, jobId);
 *   e2e.sessionConnected(sessionId, participantId);
 */

// ============================================================================
// CORRELATION & TIMING
// ============================================================================

interface TimingEntry {
  label: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

interface JobTrace {
  jobId: string;
  roomName: string;
  receivedAt: number;
  acceptedAt?: number;
  assignedAt?: number;
  childPid?: number;
  childSpawnedAt?: number;
  entryStartedAt?: number;
  sessionConnectedAt?: number;
  completedAt?: number;
  status: 'received' | 'accepted' | 'assigned' | 'spawned' | 'entry' | 'connected' | 'completed' | 'failed';
  error?: string;
  timings: TimingEntry[];
}

// Active job traces (indexed by jobId)
const activeJobs = new Map<string, JobTrace>();

// Process-level metrics
const processMetrics = {
  startTime: Date.now(),
  totalJobsReceived: 0,
  totalJobsCompleted: 0,
  totalJobsFailed: 0,
  totalChildSpawns: 0,
  totalChildCrashes: 0,
  lastActivityTime: Date.now(),
};

// ============================================================================
// OUTPUT HELPERS
// ============================================================================

const isProduction = process.env.NODE_ENV === 'production' || process.env.K_SERVICE;
const isChild = !!process.send;
const processLabel = isChild ? `CHILD:${process.pid}` : `MAIN:${process.pid}`;

function formatTimestamp(): string {
  return new Date().toISOString();
}

function log(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG', category: string, message: string, data?: Record<string, unknown>): void {
  const timestamp = formatTimestamp();
  const prefix = `[${timestamp}] [${level}] [${processLabel}] [${category}]`;
  
  // Format data if present
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  
  // Use stderr for visibility in Cloud Run logs
  process.stderr.write(`${prefix} ${message}${dataStr}\n`);
}

function logSection(title: string): void {
  const line = '═'.repeat(60);
  process.stderr.write(`\n${line}\n  ${title}\n${line}\n`);
}

// ============================================================================
// MAIN PROCESS EVENTS
// ============================================================================

export const e2e = {
  // ---------------------------------------------------------------------------
  // STARTUP
  // ---------------------------------------------------------------------------
  
  workerStarting(): void {
    logSection('VOICE AGENT STARTING');
    log('INFO', 'STARTUP', 'Worker process initializing', {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      isProduction,
      env: {
        LIVEKIT_URL: process.env.LIVEKIT_URL ? '✓ set' : '✗ missing',
        AGENT_NAME: process.env.AGENT_NAME || 'voice-agent',
        NODE_ENV: process.env.NODE_ENV,
        K_SERVICE: process.env.K_SERVICE,
      },
    });
  },

  workerRegistered(workerId: string): void {
    log('INFO', 'STARTUP', 'Worker registered with LiveKit Cloud', { workerId });
  },

  workerReady(): void {
    const uptime = Date.now() - processMetrics.startTime;
    log('INFO', 'STARTUP', '✅ Worker ready to accept jobs', {
      uptimeMs: uptime,
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    });
  },

  // ---------------------------------------------------------------------------
  // JOB LIFECYCLE (Main Process)
  // ---------------------------------------------------------------------------

  jobReceived(jobId: string, roomName: string, agentName: string): void {
    processMetrics.totalJobsReceived++;
    processMetrics.lastActivityTime = Date.now();

    const trace: JobTrace = {
      jobId,
      roomName,
      receivedAt: Date.now(),
      status: 'received',
      timings: [{
        label: 'job_received',
        startTime: Date.now(),
      }],
    };
    activeJobs.set(jobId, trace);

    logSection(`JOB RECEIVED: ${jobId}`);
    log('INFO', 'JOB', 'Job request received from LiveKit', {
      jobId,
      roomName,
      agentName,
      totalJobsReceived: processMetrics.totalJobsReceived,
    });
  },

  jobAccepting(jobId: string): void {
    const trace = activeJobs.get(jobId);
    if (trace) {
      trace.timings.push({
        label: 'accept_start',
        startTime: Date.now(),
      });
    }
    log('INFO', 'JOB', 'Calling accept() to signal availability to LiveKit', { jobId });
  },

  jobAccepted(jobId: string, durationMs: number): void {
    const trace = activeJobs.get(jobId);
    if (trace) {
      trace.acceptedAt = Date.now();
      trace.status = 'accepted';
      const timing = trace.timings.find(t => t.label === 'accept_start');
      if (timing) {
        timing.endTime = Date.now();
        timing.durationMs = durationMs;
      }
    }
    log('INFO', 'JOB', '✅ accept() completed, waiting for assignment from LiveKit', {
      jobId,
      acceptDurationMs: durationMs,
    });
  },

  jobAcceptFailed(jobId: string, error: Error, durationMs: number): void {
    const trace = activeJobs.get(jobId);
    if (trace) {
      trace.status = 'failed';
      trace.error = error.message;
    }
    log('ERROR', 'JOB', '❌ accept() FAILED', {
      jobId,
      error: error.message,
      stack: error.stack,
      durationMs,
    });
  },

  jobAssignmentTimeout(jobId: string): void {
    const trace = activeJobs.get(jobId);
    if (trace) {
      trace.status = 'failed';
      trace.error = 'Assignment timeout - LiveKit did not respond';
      const totalTime = Date.now() - trace.receivedAt;
      log('ERROR', 'JOB', '❌ Assignment TIMED OUT - LiveKit did not send assignment response', {
        jobId,
        roomName: trace.roomName,
        totalTimeMs: totalTime,
        timings: trace.timings,
      });
    }
    processMetrics.totalJobsFailed++;
  },

  jobAssigned(jobId: string, token: string): void {
    const trace = activeJobs.get(jobId);
    if (trace) {
      trace.assignedAt = Date.now();
      trace.status = 'assigned';
      const assignTime = trace.assignedAt - (trace.acceptedAt || trace.receivedAt);
      log('INFO', 'JOB', '✅ Assignment received from LiveKit', {
        jobId,
        hasToken: !!token,
        assignmentDelayMs: assignTime,
      });
    }
  },

  // ---------------------------------------------------------------------------
  // CHILD PROCESS LIFECYCLE
  // ---------------------------------------------------------------------------

  childSpawning(jobId: string): void {
    log('INFO', 'CHILD', 'Spawning child process for job', { jobId });
  },

  childSpawned(pid: number, jobId: string): void {
    processMetrics.totalChildSpawns++;
    const trace = activeJobs.get(jobId);
    if (trace) {
      trace.childPid = pid;
      trace.childSpawnedAt = Date.now();
      trace.status = 'spawned';
    }
    log('INFO', 'CHILD', `✅ Child process spawned (pid=${pid})`, {
      jobId,
      pid,
      totalChildSpawns: processMetrics.totalChildSpawns,
    });
  },

  childInitialized(pid: number, jobId: string, durationMs: number): void {
    log('INFO', 'CHILD', `Child process initialized (pid=${pid})`, {
      jobId,
      pid,
      initDurationMs: durationMs,
    });
  },

  childInitFailed(pid: number, jobId: string, error: string): void {
    const trace = activeJobs.get(jobId);
    if (trace) {
      trace.status = 'failed';
      trace.error = `Child init failed: ${error}`;
    }
    log('ERROR', 'CHILD', `❌ Child initialization FAILED (pid=${pid})`, {
      jobId,
      pid,
      error,
    });
  },

  childExited(pid: number, code: number | null, signal: string | null): void {
    if (code !== 0) {
      processMetrics.totalChildCrashes++;
    }
    log(code === 0 ? 'INFO' : 'WARN', 'CHILD', `Child process exited (pid=${pid})`, {
      pid,
      exitCode: code,
      signal,
      totalCrashes: processMetrics.totalChildCrashes,
    });
  },

  // ---------------------------------------------------------------------------
  // CHILD PROCESS EVENTS (called from within child)
  // ---------------------------------------------------------------------------

  childEntry(jobId: string): void {
    logSection(`CHILD ENTRY: ${jobId}`);
    log('INFO', 'ENTRY', 'Entry function called in child process', {
      jobId,
      pid: process.pid,
    });
  },

  resourceLoading(resourceName: string): void {
    log('DEBUG', 'RESOURCE', `Loading ${resourceName}...`);
  },

  resourceLoaded(resourceName: string, durationMs: number): void {
    log('INFO', 'RESOURCE', `✅ ${resourceName} loaded`, {
      resource: resourceName,
      durationMs,
    });
  },

  resourceFailed(resourceName: string, error: Error): void {
    log('ERROR', 'RESOURCE', `❌ ${resourceName} FAILED to load`, {
      resource: resourceName,
      error: error.message,
      stack: error.stack,
    });
  },

  sessionConnecting(roomName: string, participantId: string): void {
    log('INFO', 'SESSION', 'Connecting to LiveKit room', {
      roomName,
      participantId,
    });
  },

  sessionConnected(sessionId: string, roomName: string, participantId: string, durationMs: number): void {
    log('INFO', 'SESSION', '✅ Connected to room', {
      sessionId,
      roomName,
      participantId,
      connectDurationMs: durationMs,
    });
  },

  sessionStarted(sessionId: string, persona: string): void {
    log('INFO', 'SESSION', '✅ Voice session started', {
      sessionId,
      persona,
    });
  },

  sessionEnded(sessionId: string, reason: string, durationMs: number): void {
    log('INFO', 'SESSION', 'Session ended', {
      sessionId,
      reason,
      durationMs,
    });
  },

  // ---------------------------------------------------------------------------
  // IPC EVENTS
  // ---------------------------------------------------------------------------

  ipcSending(type: string, data?: Record<string, unknown>): void {
    log('DEBUG', 'IPC', `Sending IPC message: ${type}`, data);
  },

  ipcReceived(type: string, data?: Record<string, unknown>): void {
    log('DEBUG', 'IPC', `Received IPC message: ${type}`, data);
  },

  ipcError(error: Error): void {
    log('ERROR', 'IPC', 'IPC error', {
      error: error.message,
      stack: error.stack,
    });
  },

  // ---------------------------------------------------------------------------
  // HEALTH & METRICS
  // ---------------------------------------------------------------------------

  healthCheck(): Record<string, unknown> {
    const now = Date.now();
    const metrics = {
      uptime: now - processMetrics.startTime,
      isMain: !isChild,
      pid: process.pid,
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      jobs: {
        received: processMetrics.totalJobsReceived,
        completed: processMetrics.totalJobsCompleted,
        failed: processMetrics.totalJobsFailed,
        active: activeJobs.size,
      },
      children: {
        spawned: processMetrics.totalChildSpawns,
        crashed: processMetrics.totalChildCrashes,
      },
      lastActivity: now - processMetrics.lastActivityTime,
    };

    log('INFO', 'HEALTH', 'Health check', metrics);
    return metrics;
  },

  // Log a periodic summary with self-healing status
  logSummary(): void {
    const now = Date.now();
    logSection('DIAGNOSTIC SUMMARY');

    // Core metrics
    log('INFO', 'SUMMARY', 'Current state', {
      uptimeMs: now - processMetrics.startTime,
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      totalJobs: processMetrics.totalJobsReceived,
      completedJobs: processMetrics.totalJobsCompleted,
      failedJobs: processMetrics.totalJobsFailed,
      activeJobs: activeJobs.size,
      childSpawns: processMetrics.totalChildSpawns,
      childCrashes: processMetrics.totalChildCrashes,
      idleMs: now - processMetrics.lastActivityTime,
    });

    // Log circuit breaker states (if available)
    // Uses fire-and-forget pattern to avoid blocking
    void (async () => {
      try {
        const { getAllCircuitStats } = await import('../../services/self-healing/circuit-breaker.js');
        const circuits = getAllCircuitStats();
        if (circuits.length > 0) {
          log('INFO', 'CIRCUITS', 'Circuit breaker states', {
            circuits: circuits.map((c) => ({
              name: c.name,
              state: c.state,
              failures: c.failures,
              totalRequests: c.totalRequests,
            })),
          });
        }
      } catch {
        /* self-healing not loaded yet */
      }
    })();

    // Log any active jobs
    if (activeJobs.size > 0) {
      log('INFO', 'SUMMARY', 'Active jobs:', {
        jobs: Array.from(activeJobs.values()).map((j) => ({
          jobId: j.jobId,
          status: j.status,
          ageMs: now - j.receivedAt,
        })),
      });
    }
  },

  // ---------------------------------------------------------------------------
  // ERROR CAPTURE
  // ---------------------------------------------------------------------------

  captureError(category: string, error: Error, context?: Record<string, unknown>): void {
    log('ERROR', category, `Captured error: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      ...context,
    });
  },

  // ---------------------------------------------------------------------------
  // CUSTOM EVENTS
  // ---------------------------------------------------------------------------

  custom(category: string, message: string, data?: Record<string, unknown>): void {
    log('INFO', category, message, data);
  },

  debug(category: string, message: string, data?: Record<string, unknown>): void {
    log('DEBUG', category, message, data);
  },

  warn(category: string, message: string, data?: Record<string, unknown>): void {
    log('WARN', category, message, data);
  },

  error(category: string, message: string, data?: Record<string, unknown>): void {
    log('ERROR', category, message, data);
  },
};

// ============================================================================
// AUTOMATIC PERIODIC HEALTH LOGGING
// ============================================================================

let healthInterval: NodeJS.Timeout | null = null;

export function startHealthLogging(intervalMs = 60_000): void {
  if (healthInterval) return;

  healthInterval = setInterval(() => {
    e2e.logSummary();
  }, intervalMs);

  // Don't prevent process exit
  healthInterval.unref();

  log('INFO', 'HEALTH', 'Started periodic health logging', { intervalMs });
}

export function stopHealthLogging(): void {
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default e2e;

