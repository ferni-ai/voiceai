/**
 * GCE Voice Agent Modules
 *
 * Extracted modules from gce-voice-worker.ts for maintainability.
 * Each module handles a specific concern:
 * - warmup.ts - Resource pre-warming
 * - job-executor.ts - Job execution logic
 * - livekit-connection.ts - WebSocket connection management
 *
 * @module agents/gce
 */

// Resource warmup
export { warmupResources, type WarmupResult, type LogFn as WarmupLogFn } from './warmup.js';

// Job execution
export {
  runJobInProcess,
  getJobMetrics,
  setWorkerId,
  getActiveJobs,
  type JobInfo,
  type JobMetrics,
  type LogFn as JobLogFn,
} from './job-executor.js';

// LiveKit connection
export {
  connectToLiveKit,
  cleanupStaleWorkers,
  initLiveKitConnection,
  closeConnection,
  prepareForShutdown,
  stopPingKeepalive,
  stopPendingJobsCleanup,
  type LiveKitConfig,
  type LogFn as ConnectionLogFn,
} from './livekit-connection.js';
