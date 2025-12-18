/**
 * @ferni/async
 *
 * Async worker platform for Ferni - outreach, scheduled jobs, background processing.
 *
 * Architecture:
 * ```
 * Voice Agent → Pub/Sub → Async Workers → Cloud Tasks → Delivery
 *               (async)   (process)       (schedule)   (sms/push/email)
 * ```
 *
 * This package runs as a separate Cloud Run service, processing outreach
 * triggers that were previously embedded in the voice agent (causing memory issues).
 */

export * from './types.js';
export * from './logger.js';
export * from './outreach/processor.js';
export * from './outreach/decision-engine.js';
export * from './pubsub/publisher.js';

