/**
 * Scheduling's public entry for other contexts (architecture-layers.ts: a context
 * only via its index.ts). Export here what a caller outside services/scheduling needs.
 *
 * @module services/scheduling
 */

export { getPendingReminders } from './reminder-scheduler.js';
