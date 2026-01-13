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
export async function initializeBackgroundDelivery() {
    if (deliveryInitialized) {
        return;
    }
    log.info('🚀 Initializing background agents delivery services...');
    try {
        // Initialize email delivery if SendGrid configured
        if (process.env.SENDGRID_API_KEY) {
            const { initializeEmailDelivery } = await import('../outreach/delivery/email-delivery.js');
            initializeEmailDelivery({
                provider: 'sendgrid',
                apiKey: process.env.SENDGRID_API_KEY,
                fromEmail: process.env.EMAIL_FROM || process.env.SENDGRID_FROM_EMAIL || 'hello@ferni.ai',
                fromName: process.env.EMAIL_FROM_NAME || process.env.SENDGRID_FROM_NAME || 'Ferni',
                replyToEmail: process.env.EMAIL_REPLY_TO,
                trackOpens: true,
                trackClicks: true,
            });
            log.info('✅ Email delivery initialized (SendGrid)');
        }
        else if (process.env.RESEND_API_KEY) {
            const { initializeEmailDelivery } = await import('../outreach/delivery/email-delivery.js');
            initializeEmailDelivery({
                provider: 'resend',
                apiKey: process.env.RESEND_API_KEY,
                fromEmail: process.env.EMAIL_FROM || 'hello@ferni.ai',
                fromName: process.env.EMAIL_FROM_NAME || 'Ferni',
            });
            log.info('✅ Email delivery initialized (Resend)');
        }
        // Initialize push notifications if Firebase configured
        // Note: We use Firebase Admin SDK which auto-initializes with ADC
        const firebaseProjectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.FCM_PROJECT_ID;
        if (firebaseProjectId) {
            try {
                // Try to use Firebase Admin messaging (auto-initialized with ADC)
                const admin = await import('firebase-admin');
                if (admin.apps.length > 0 || process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                    const { initializePushNotifications } = await import('../outreach/delivery/push-notifications.js');
                    // Firebase Admin with ADC doesn't need explicit credentials
                    initializePushNotifications({
                        firebaseProjectId,
                        firebasePrivateKey: process.env.FCM_PRIVATE_KEY || '',
                        firebaseClientEmail: process.env.FCM_CLIENT_EMAIL || '',
                    });
                    log.info('✅ Push notifications initialized (Firebase)');
                }
            }
            catch (pushError) {
                log.debug({ error: String(pushError) }, 'Push notifications not available');
            }
        }
        deliveryInitialized = true;
        log.info('✅ Background agents delivery services ready');
    }
    catch (error) {
        log.warn({ error: String(error) }, 'Some delivery services failed to initialize');
    }
}
// Result types
export { BackgroundResultTypeSchema, ResultPrioritySchema, OutcomeStatusSchema, BackgroundResultSchema, createBackgroundResult, getResultTypeDescription, sortResultsForDisplay, } from './result-types.js';
// Unified capture
export { captureBackgroundResult, getPendingResults, markResultsDelivered, buildPendingResultsContext, } from './unified-result-capture.js';
// Task executors
export { 
// Research (Peter's domain)
executeResearchTask, queueResearchTask, 
// Reservations (Jordan's domain)
executeReservationTask, queueReservationTask, } from './executors/index.js';
//# sourceMappingURL=index.js.map