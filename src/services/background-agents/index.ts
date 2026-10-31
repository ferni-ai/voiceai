/**
 * Background Agents Module
 *
 * Central module for all background agent functionality.
 * "BETTER THAN HUMAN" - We work for you even when you're not watching.
 *
 * Features:
 * - Unified result capture and notification
 * - Background task executors (calls, research, reservations, etc.)
 * - "While you were away" context injection
 * - Cross-channel notification delivery
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'BackgroundAgents' });

let deliveryInitialized = false;

/**
 * Initialize delivery services for background agents.
 * This is a lightweight init that only enables push/email delivery,
 * NOT the full outreach decision engine.
 */
export async function initializeBackgroundDelivery(): Promise<void> {
  if (deliveryInitialized) {
    return;
  }

  log.info('🚀 Initializing background agents delivery services...');

  try {
    // Email needs no init: email-delivery sends through the Workspace transport.

    // Initialize push notifications if Firebase configured
    // Note: We use Firebase Admin SDK which auto-initializes with ADC
    const firebaseProjectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.FCM_PROJECT_ID;
    if (firebaseProjectId) {
      try {
        // Try to use Firebase Admin messaging (auto-initialized with ADC)
        const admin = (await import('firebase-admin')).default;
        if (admin.apps.length > 0 || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
          const { initializePushNotifications } =
            await import('../outreach/delivery/push-notifications.js');
          // Firebase Admin with ADC doesn't need explicit credentials
          initializePushNotifications({
            firebaseProjectId,
            firebasePrivateKey: process.env.FCM_PRIVATE_KEY || '',
            firebaseClientEmail: process.env.FCM_CLIENT_EMAIL || '',
          });
          log.info('✅ Push notifications initialized (Firebase)');
        }
      } catch (pushError) {
        log.debug({ error: String(pushError) }, 'Push notifications not available');
      }
    }

    deliveryInitialized = true;
    log.info('✅ Background agents delivery services ready');
  } catch (error) {
    log.warn({ error: String(error) }, 'Some delivery services failed to initialize');
  }
}

// Result types
export {
  BackgroundResultTypeSchema,
  ResultPrioritySchema,
  OutcomeStatusSchema,
  BackgroundResultSchema,
  createBackgroundResult,
  getResultTypeDescription,
  sortResultsForDisplay,
  type BackgroundResult,
  type BackgroundResultType,
  type ResultPriority,
  type OutcomeStatus,
  type CallResult,
  type ResearchResult as BackgroundResearchResult,
  type ReservationResult as BackgroundReservationResult,
  type FollowUpResult,
  type CommitmentCheckResult,
  type AnyBackgroundResult,
} from './result-types.js';

// Unified capture
export {
  captureBackgroundResult,
  getPendingResults,
  markResultsDelivered,
  buildPendingResultsContext,
} from './unified-result-capture.js';

// Task executors
export {
  // Research (Peter's domain)
  executeResearchTask,
  type ResearchRequest,
  type ResearchResult as ExecutorResearchResult,
  type ResearchFinding,
} from './executors/index.js';
