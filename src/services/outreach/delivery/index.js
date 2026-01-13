/**
 * Delivery Services Index
 *
 * Centralized exports for all delivery services
 */
// SMS Delivery
export { smsDelivery, initializeSMSDelivery, isSMSDeliveryAvailable, sendSMS, sendSMSWithRetry, sendBulkSMS, handleSMSStatus, formatSMSMessage, shortenLinks, } from './sms-delivery.js';
// Email Delivery
export { emailDelivery, initializeEmailDelivery, isEmailDeliveryAvailable, sendEmail, sendEmailWithRetry, handleEmailEvent, generatePersonaEmailHTML, generatePlainText, } from './email-delivery.js';
// Push Notifications
export { pushNotifications, initializePushNotifications, isPushNotificationsAvailable, registerPushToken, removePushToken, getUserTokens, hasPushEnabled, sendPushNotification, sendBulkPushNotifications, generatePersonaNotification, handlePushInteraction, } from './push-notifications.js';
// Delivery Tracker
export { deliveryTracker, queueDelivery, startQueueProcessor, stopQueueProcessor, updateDeliveryStatus, markResponded, getDeliveryRecord, getDeliveryByExternalId, getUserDeliveries, getOutreachDeliveries, getQueueItems, cancelQueuedDelivery, calculateDeliveryStats, shutdownDeliveryTracker, } from './delivery-tracker.js';
// ============================================================================
// UNIFIED INITIALIZATION
// ============================================================================
import { initializeSMSDelivery } from './sms-delivery.js';
import { initializeEmailDelivery } from './email-delivery.js';
import { initializePushNotifications } from './push-notifications.js';
import { startQueueProcessor, stopQueueProcessor } from './delivery-tracker.js';
import { getLogger } from '../../../utils/safe-logger.js';
const log = getLogger().child({ module: 'delivery' });
let initialized = false;
/**
 * Initialize all delivery services
 */
export function initializeDeliveryServices(config) {
    if (initialized) {
        log.warn('Delivery services already initialized');
        return;
    }
    log.info('🚀 Initializing delivery services');
    // Initialize SMS if configured
    if (config.sms) {
        try {
            initializeSMSDelivery(config.sms);
        }
        catch (error) {
            log.warn({ error }, 'SMS delivery initialization failed');
        }
    }
    // Initialize email if configured
    if (config.email) {
        try {
            initializeEmailDelivery(config.email);
        }
        catch (error) {
            log.warn({ error }, 'Email delivery initialization failed');
        }
    }
    // Initialize push notifications if configured
    if (config.push) {
        try {
            initializePushNotifications(config.push);
        }
        catch (error) {
            log.warn({ error }, 'Push notification initialization failed');
        }
    }
    // Start queue processor
    startQueueProcessor(config.queueProcessorIntervalMs || 5000);
    initialized = true;
    log.info('✅ Delivery services initialized');
}
// ============================================================================
// UNIFIED DELIVERY FUNCTION
// ============================================================================
import { sendSMS, isSMSDeliveryAvailable } from './sms-delivery.js';
import { sendEmail, isEmailDeliveryAvailable } from './email-delivery.js';
import { sendPushNotification, isPushNotificationsAvailable } from './push-notifications.js';
import { getFirestoreClient } from '../firestore-persistence.js';
/**
 * Deliver an outreach message via the specified channel
 */
export async function deliverOutreach(options) {
    const { userId, channel, message, personaId, subject, outreachId } = options;
    const persona = personaId || 'ferni';
    const outreach = outreachId || `outreach-${Date.now()}`;
    try {
        switch (channel) {
            case 'sms':
                if (!isSMSDeliveryAvailable()) {
                    return { success: false, channel, error: 'SMS delivery not available' };
                }
                // Get user phone number from profile
                const phoneResult = await getUserPhoneNumber(userId);
                if (!phoneResult) {
                    return { success: false, channel, error: 'User phone number not found' };
                }
                const smsMessage = {
                    to: phoneResult,
                    body: message,
                    personaId: persona,
                    userId,
                    outreachId: outreach,
                };
                const smsResult = await sendSMS(smsMessage);
                return {
                    success: smsResult.success,
                    channel,
                    messageId: smsResult.messageSid,
                    error: smsResult.error,
                };
            case 'email':
                if (!isEmailDeliveryAvailable()) {
                    return { success: false, channel, error: 'Email delivery not available' };
                }
                const emailAddr = await getUserEmail(userId);
                if (!emailAddr) {
                    return { success: false, channel, error: 'User email not found' };
                }
                const sendResult = await sendEmail({
                    to: emailAddr,
                    subject: subject || 'A message from Ferni',
                    body: message,
                    personaId: persona,
                    userId,
                    outreachId: outreach,
                });
                return {
                    success: sendResult.success,
                    channel,
                    messageId: sendResult.messageId,
                    error: sendResult.error,
                };
            case 'push':
                if (!isPushNotificationsAvailable()) {
                    return { success: false, channel, error: 'Push notifications not available' };
                }
                const pushResults = await sendPushNotification({
                    userId,
                    title: personaId ? `From ${personaId}` : 'Ferni',
                    body: message,
                    personaId: persona,
                    outreachId: outreach,
                });
                // sendPushNotification returns an array of results (one per token)
                const firstSuccess = pushResults.find((r) => r.success);
                return {
                    success: pushResults.some((r) => r.success),
                    channel,
                    messageId: firstSuccess?.messageId,
                    error: pushResults.every((r) => !r.success) ? 'All push notifications failed' : undefined,
                };
            case 'call':
                // Initiate proactive voice call via conversational call service
                log.info({ userId, personaId: persona }, 'Initiating proactive voice call');
                try {
                    const { makeConversationalCall, isConversationalCallingConfigured } = await import('../../voice/conversational-call.service.js');
                    const callConfig = isConversationalCallingConfigured();
                    if (!callConfig.configured) {
                        log.warn({ missing: callConfig.missing }, 'Conversational calling not configured');
                        return {
                            success: false,
                            channel,
                            error: `Missing config: ${callConfig.missing.join(', ')}`,
                        };
                    }
                    // Get user's phone and name for the call
                    const userPhone = await getUserPhoneNumber(userId);
                    const userName = await getUserName(userId);
                    if (!userPhone) {
                        return { success: false, channel, error: 'User phone number not found' };
                    }
                    const callResult = await makeConversationalCall({
                        phone: userPhone,
                        recipientName: userName || 'there',
                        userId,
                        personaId: persona,
                        purpose: `Proactive check-in: ${message.slice(0, 100)}`,
                        objective: 'Check in with the user based on ML prediction',
                        greeting: message,
                        callType: 'personal_call',
                        context: { outreachId: outreach, mlDriven: true },
                    });
                    return {
                        success: callResult.success,
                        channel,
                        messageId: callResult.callSid,
                        error: callResult.error,
                    };
                }
                catch (err) {
                    log.error({ userId, error: String(err) }, 'Failed to initiate proactive call');
                    return { success: false, channel, error: String(err) };
                }
            default:
                return { success: false, channel, error: `Unknown channel: ${channel}` };
        }
    }
    catch (error) {
        log.error({ userId, channel, error: String(error) }, 'Delivery failed');
        return { success: false, channel, error: String(error) };
    }
}
/**
 * Get user phone number from profile
 */
async function getUserPhoneNumber(userId) {
    try {
        const db = getFirestoreClient();
        if (!db)
            return null;
        const doc = await db.collection('profiles').doc(userId).get();
        return doc.data()?.phoneNumber || null;
    }
    catch {
        return null;
    }
}
/**
 * Get user email from profile
 */
async function getUserEmail(userId) {
    try {
        const db = getFirestoreClient();
        if (!db)
            return null;
        const doc = await db.collection('profiles').doc(userId).get();
        return doc.data()?.email || null;
    }
    catch {
        return null;
    }
}
/**
 * Get user name from profile
 */
async function getUserName(userId) {
    try {
        const db = getFirestoreClient();
        if (!db)
            return null;
        const doc = await db.collection('profiles').doc(userId).get();
        const data = doc.data();
        return data?.displayName || data?.firstName || data?.name || null;
    }
    catch {
        return null;
    }
}
/**
 * Shutdown all delivery services
 */
export function shutdownDeliveryServices() {
    stopQueueProcessor();
    initialized = false;
    log.info('Delivery services shut down');
}
//# sourceMappingURL=index.js.map