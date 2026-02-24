/**
 * GCE Job Executor
 *
 * Handles running voice agent jobs in-process on GCE.
 * Extracted from gce-voice-worker.ts for maintainability.
 *
 * @module agents/gce/job-executor
 */

import { JobContext, JobProcess, runWithJobContextAsync } from '@livekit/agents';
import type { Job } from '@livekit/protocol';
import { Room, RoomEvent, TrackKind } from '@livekit/rtc-node';
import { EventEmitter } from 'node:events';

import { InProcessInferenceExecutor } from '../core/inference-executor.js';
import { runFullVoiceAgentEntry } from '../voice-agent-entry/index.js';

// ============================================================================
// TYPES
// ============================================================================

export interface JobInfo {
  job: Job;
  url: string;
  token: string;
  acceptArgs: {
    name: string;
    identity: string;
    metadata: string;
  };
}

export interface JobMetrics {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  activeJobs: number;
}

export type LogFn = (msg: string, data?: Record<string, unknown>) => void;

// ============================================================================
// JOB METRICS
// ============================================================================

let totalJobs = 0;
let completedJobs = 0;
let failedJobs = 0;
let activeJobs = 0;
let _workerId = `worker-${process.pid}`;

/**
 * Get current job metrics
 */
export function getJobMetrics(): JobMetrics {
  return { totalJobs, completedJobs, failedJobs, activeJobs };
}

/**
 * Set the worker ID for job execution
 */
export function setWorkerId(id: string): void {
  _workerId = id;
}

/**
 * Get active job count
 */
export function getActiveJobs(): number {
  return activeJobs;
}

// ============================================================================
// JOB EXECUTION
// ============================================================================

/**
 * Run a voice agent job in-process.
 *
 * This is the main entry point for job execution on GCE.
 * Handles room connection, session lifecycle, and cleanup.
 */
export async function runJobInProcess(info: JobInfo, log: LogFn): Promise<void> {
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
  let reconnectCount = 0;
  let lastQuality: string | undefined;

  // === CONNECTION STABILITY MONITORING ===

  // Maximum session duration failsafe (2 hours) - prevents zombie sessions
  const MAX_SESSION_DURATION_MS = 2 * 60 * 60 * 1000;
  const sessionTimeout = setTimeout(() => {
    if (!shutdown) {
      log('⏰ Max session duration reached, forcing cleanup', {
        jobId,
        maxDurationMs: MAX_SESSION_DURATION_MS,
      });
      closeEvent.emit('close', false);
    }
  }, MAX_SESSION_DURATION_MS);
  sessionTimeout.unref();

  // Track disconnection
  room.on(RoomEvent.Disconnected, () => {
    if (!shutdown) {
      log('Room disconnected', { jobId, reconnectCount });
      clearTimeout(sessionTimeout);
      closeEvent.emit('close', false);
    }
  });

  // Detect when all remote participants leave — prevents zombie sessions
  // When the user disconnects, Room.Disconnected does NOT fire (the agent is still connected).
  // We give a 10s grace period for reconnects before closing the session.
  let emptyRoomTimer: ReturnType<typeof setTimeout> | null = null;
  const EMPTY_ROOM_GRACE_MS = 10_000;

  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    const remaining = room.remoteParticipants?.size ?? 0;
    log('👋 Participant left', {
      jobId,
      participant: participant?.identity,
      remainingParticipants: remaining,
    });

    if (remaining === 0 && !shutdown) {
      log('🕐 Room empty, starting grace period', { jobId, graceMs: EMPTY_ROOM_GRACE_MS });
      emptyRoomTimer = setTimeout(() => {
        const currentRemaining = room.remoteParticipants?.size ?? 0;
        if (currentRemaining === 0 && !shutdown) {
          log('🚪 Room still empty after grace period, closing session', { jobId });
          clearTimeout(sessionTimeout);
          closeEvent.emit('close', true, 'all_participants_left');
        }
      }, EMPTY_ROOM_GRACE_MS);
    }
  });

  // Cancel empty room timer if someone rejoins
  room.on(RoomEvent.ParticipantConnected, () => {
    if (emptyRoomTimer) {
      log('👤 Participant rejoined, cancelling empty room timer', { jobId });
      clearTimeout(emptyRoomTimer);
      emptyRoomTimer = null;
    }
  });

  // Track reconnection attempts - critical for debugging drops
  room.on(RoomEvent.Reconnecting, () => {
    reconnectCount++;
    log('🔄 Room reconnecting', { jobId, attempt: reconnectCount });
  });

  room.on(RoomEvent.Reconnected, () => {
    log('✅ Room reconnected', { jobId, totalReconnects: reconnectCount });
  });

  // Track connection quality changes - early warning for drops
  room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
    const qualityStr = String(quality);
    if (qualityStr !== lastQuality) {
      lastQuality = qualityStr;
      if (qualityStr === 'poor' || qualityStr === 'lost') {
        log('⚠️ Connection quality degraded', {
          jobId,
          quality: qualityStr,
          participant: participant?.identity,
        });
      }
    }
  });

  // Track audio subscription failures - can cause mic drops
  room.on(RoomEvent.TrackSubscriptionFailed, (trackSid, participant, reason) => {
    log('❌ Track subscription failed', {
      jobId,
      trackSid,
      participant: participant?.identity,
      reason,
    });
  });

  // Track mute state changes - helps debug audio issues
  room.on(RoomEvent.TrackMuted, (publication, participant) => {
    if (publication.kind === TrackKind.KIND_AUDIO) {
      log('🔇 Audio track muted', {
        jobId,
        participant: participant?.identity,
        trackSid: publication.sid,
      });
    }
  });

  room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
    if (publication.kind === TrackKind.KIND_AUDIO) {
      log('🔊 Audio track unmuted', {
        jobId,
        participant: participant?.identity,
        trackSid: publication.sid,
      });
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
    workerId: _workerId,
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
    clearTimeout(sessionTimeout);
    if (emptyRoomTimer) clearTimeout(emptyRoomTimer);
    try {
      if (ctx.room.isConnected) {
        await ctx.room.disconnect();
      }
    } catch {
      // Ignore disconnect errors
    }
  }
}
