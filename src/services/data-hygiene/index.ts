/**
 * Data Hygiene Services
 *
 * Services for maintaining healthy Firestore data:
 * - TTL cleanup for expired documents
 * - Document size monitoring
 * - Data archival (future)
 *
 * @module services/data-hygiene
 */

export {
  runTTLCleanup,
  calculateExpiresAt,
  addTTLFields,
  TTL_DAYS,
} from './ttl-cleanup.js';

export {
  runDocumentSizeMonitor,
  getDocumentSizeMetrics,
  THRESHOLDS as SIZE_THRESHOLDS,
  MONITORED_COLLECTIONS,
} from './document-size-monitor.js';

export { runDataHealthJob, handleDataHealthRequest } from './scheduled-jobs.js';

export {
  runTTLBackfill,
  TTL_DAYS as BACKFILL_TTL_DAYS,
  BACKFILL_CONFIGS,
} from './ttl-backfill.js';
