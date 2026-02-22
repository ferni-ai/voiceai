/**
 * Unified Outreach Delivery Service
 *
 * > "We reach out. Not because you asked. Because we noticed."
 *
 * Central delivery orchestrator that:
 * - Routes messages to the right channel (SMS, email, voice, push, in-app)
 * - Handles credential loading from GCP Secret Manager
 * - Tracks delivery status
 * - Falls back gracefully when channels unavailable
 *
 * @module UnifiedDelivery
 */

import { getDisplayName } from '../../personas/persona-ids.js';
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import type { GeneratedContent, OutreachType } from './llm-content-generator.js';

const log = createLogger({ module: 'UnifiedDelivery' });

// ============================================================================
// TYPES
// ============================================================================

export type DeliveryChannel = 'sms' | 'email' | 'voice_call' | 'push' | 'in_app';

export interface DeliveryRequest {
  userId: string;
  channel: DeliveryChannel;
  content: GeneratedContent;

  // Contact info (for external channels)
  phone?: string;
  email?: string;

  // Scheduling
  scheduledFor?: Date;

  // Metadata
  outreachType: OutreachType;
  triggerId?: string;
}

export interface DeliveryResult {
  success: boolean;
  channel: DeliveryChannel;
  messageId?: string;
  error?: string;
  fallbackUsed?: DeliveryChannel;
}

export interface ChannelStatus {
  sms: { available: boolean; reason?: string };
  email: { available: boolean; reason?: string };
  voice_call: { available: boolean; reason?: string };
  push: { available: boolean; reason?: string };
  in_app: { available: boolean; reason?: string };
}

// ============================================================================
// CREDENTIAL LOADING
// ============================================================================

interface Credentials {
  twilio?: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
  };
  sendgrid?: {
    apiKey: string;
    fromEmail: string;
    fromName: string;
  };
  fcm?: {
    projectId: string;
    privateKey: string;
    clientEmail: string;
  };
}

let cachedCredentials: Credentials | null = null;

async function loadCredentials(): Promise<Credentials> {
  if (cachedCredentials) return cachedCredentials;

  const credentials: Credentials = {};

  // Load from environment (set by Cloud Run secret mounts)
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    credentials.twilio = {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
    };
    log.info('Twilio credentials loaded');
  }

  if (process.env.SENDGRID_API_KEY) {
    credentials.sendgrid = {
      apiKey: process.env.SENDGRID_API_KEY,
      fromEmail: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM || 'hello@ferni.ai',
      fromName: process.env.SENDGRID_FROM_NAME || process.env.EMAIL_FROM_NAME || 'Ferni',
    };
    log.info('SendGrid credentials loaded');
  }

  // FCM can use explicit credentials OR application default credentials
  if (process.env.FCM_PROJECT_ID && process.env.FCM_PRIVATE_KEY) {
    credentials.fcm = {
      projectId: process.env.FCM_PROJECT_ID,
      privateKey: process.env.FCM_PRIVATE_KEY,
      clientEmail: process.env.FCM_CLIENT_EMAIL || '',
    };
    log.info('FCM credentials loaded from env vars');
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCP_PROJECT_ID) {
    // Use application default credentials
    credentials.fcm = {
      projectId: process.env.GCP_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'ferni-prod',
      privateKey: '', // Will use applicationDefault() instead
      clientEmail: '',
    };
    log.info('FCM will use application default credentials');
  }

  cachedCredentials = credentials;
  return credentials;
}

// ============================================================================
// CHANNEL STATUS
// ============================================================================

export async function getChannelStatus(): Promise<ChannelStatus> {
  const creds = await loadCredentials();

  return {
    sms: {
      available: !!creds.twilio?.accountSid && !!creds.twilio?.authToken,
      reason: creds.twilio?.accountSid ? undefined : 'Twilio credentials not configured',
    },
    email: {
      available: !!creds.sendgrid?.apiKey,
      reason: creds.sendgrid?.apiKey ? undefined : 'SendGrid API key not configured',
    },
    voice_call: {
      available: !!creds.twilio?.accountSid && !!creds.twilio?.authToken,
      reason: creds.twilio?.accountSid ? undefined : 'Twilio credentials not configured',
    },
    push: {
      available: !!creds.fcm?.projectId,
      reason: creds.fcm?.projectId ? undefined : 'FCM credentials not configured',
    },
    in_app: {
      available: true, // Always available via Firestore
    },
  };
}

// ============================================================================
// DELIVERY FUNCTIONS
// ============================================================================

/**
 * Deliver outreach through the specified channel
 */
export async function deliver(request: DeliveryRequest): Promise<DeliveryResult> {
  const { userId, channel, content, phone, email, outreachType, triggerId } = request;

  log.info({ userId, channel, outreachType }, 'Delivering outreach');

  try {
    switch (channel) {
      case 'sms':
        return await deliverSMS(userId, phone, content, outreachType, triggerId);

      case 'email':
        return await deliverEmail(userId, email, content, outreachType, triggerId);

      case 'voice_call':
        return await deliverVoiceCall(userId, phone, content, outreachType, triggerId);

      case 'push':
        return await deliverPush(userId, content, outreachType, triggerId);

      case 'in_app':
        return await deliverInApp(userId, content, outreachType, triggerId);

      default:
        return { success: false, channel, error: `Unknown channel: ${channel}` };
    }
  } catch (error) {
    log.error({ error: String(error), userId, channel }, 'Delivery failed');

    // Try fallback to in-app
    if (channel !== 'in_app') {
      log.info({ userId }, 'Falling back to in-app delivery');
      const fallbackResult = await deliverInApp(userId, content, outreachType, triggerId);
      return {
        ...fallbackResult,
        fallbackUsed: 'in_app',
        error: `Primary channel (${channel}) failed: ${error}`,
      };
    }

    return { success: false, channel, error: String(error) };
  }
}

// ============================================================================
// CHANNEL IMPLEMENTATIONS
// ============================================================================

/**
 * Deliver via SMS using Twilio
 */
async function deliverSMS(
  userId: string,
  phone: string | undefined,
  content: GeneratedContent,
  outreachType: OutreachType,
  triggerId?: string
): Promise<DeliveryResult> {
  if (!phone) {
    return { success: false, channel: 'sms', error: 'No phone number provided' };
  }

  const creds = await loadCredentials();
  if (!creds.twilio) {
    return { success: false, channel: 'sms', error: 'Twilio not configured' };
  }

  try {
    const twilio = await import('twilio');
    const client = twilio.default(creds.twilio.accountSid, creds.twilio.authToken);

    const message = await client.messages.create({
      body: content.text,
      from: creds.twilio.phoneNumber,
      to: phone,
    });

    // Record delivery
    await recordDelivery(userId, 'sms', message.sid, outreachType, triggerId);

    log.info({ userId, messageSid: message.sid }, 'SMS delivered');
    return { success: true, channel: 'sms', messageId: message.sid };
  } catch (error) {
    log.error({ error: String(error), userId }, 'SMS delivery failed');
    return { success: false, channel: 'sms', error: String(error) };
  }
}

/**
 * Deliver via Email using SendGrid
 */
async function deliverEmail(
  userId: string,
  email: string | undefined,
  content: GeneratedContent,
  outreachType: OutreachType,
  triggerId?: string
): Promise<DeliveryResult> {
  if (!email) {
    return { success: false, channel: 'email', error: 'No email address provided' };
  }

  const creds = await loadCredentials();
  if (!creds.sendgrid) {
    return { success: false, channel: 'email', error: 'SendGrid not configured' };
  }

  try {
    const sgMail = await import('@sendgrid/mail');
    sgMail.default.setApiKey(creds.sendgrid.apiKey);

    // Build preferences URL for unsubscribe
    const preferencesUrl = `https://app.ferni.ai/preferences?user=${userId}`;

    const msg = {
      to: email,
      from: {
        email: creds.sendgrid.fromEmail,
        name: creds.sendgrid.fromName,
      },
      replyTo: {
        email: 'hello@ferni.ai',
        name: 'Ferni',
      },
      subject: content.subject || 'A message from Ferni',
      text: content.text,
      html: content.htmlBody || `<p>${content.text}</p>`,
      // Headers for deliverability (CAN-SPAM compliance)
      headers: {
        'List-Unsubscribe': `<${preferencesUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'X-Priority': '3', // Normal priority
        'X-Mailer': 'Ferni AI',
      },
      // SendGrid tracking settings
      trackingSettings: {
        clickTracking: { enable: false }, // Don't modify links (better deliverability)
        openTracking: { enable: true },
      },
      // Category for SendGrid analytics
      categories: [outreachType, 'ferni-outreach'],
    };

    const [response] = await sgMail.default.send(msg);
    const messageId = response.headers['x-message-id'] || `email-${Date.now()}`;

    // Record delivery
    await recordDelivery(userId, 'email', messageId, outreachType, triggerId);

    log.info({ userId, messageId }, 'Email delivered');
    return { success: true, channel: 'email', messageId };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Email delivery failed');
    return { success: false, channel: 'email', error: String(error) };
  }
}

/**
 * Deliver via Voice Call using LiveKit + Twilio
 *
 * This creates an outbound call where Ferni speaks the message using SSML.
 */
async function deliverVoiceCall(
  userId: string,
  phone: string | undefined,
  content: GeneratedContent,
  outreachType: OutreachType,
  triggerId?: string
): Promise<DeliveryResult> {
  if (!phone) {
    return { success: false, channel: 'voice_call', error: 'No phone number provided' };
  }

  const creds = await loadCredentials();
  if (!creds.twilio) {
    return { success: false, channel: 'voice_call', error: 'Twilio not configured' };
  }

  try {
    // Use the proactive call scheduler for outbound calls
    const { scheduleProactiveCall } = await import('./proactive-call-scheduler.js');

    // Build minimal user context for the call
    const userContext = {
      userId,
      name: undefined, // Will be fetched from profile in the scheduler
      daysSinceSignup: 0, // Not critical for immediate calls
      conversationCount: 0,
      engagementLevel: 'medium' as const,
    };

    const result = await scheduleProactiveCall({
      userId,
      phoneNumber: phone,
      userContext,
      outreachType,
      personaId: content.personaId,
      reason: content.reason,
      scheduledFor: new Date(), // Immediate
    });

    if (result.success) {
      // Record delivery
      await recordDelivery(
        userId,
        'voice_call',
        result.callId || `call-${Date.now()}`,
        outreachType,
        triggerId
      );
      log.info({ userId, callId: result.callId }, 'Voice call scheduled');
      return { success: true, channel: 'voice_call', messageId: result.callId };
    }

    return { success: false, channel: 'voice_call', error: result.error };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Voice call delivery failed');
    return { success: false, channel: 'voice_call', error: String(error) };
  }
}

/**
 * Deliver via Push Notification using FCM
 */
async function deliverPush(
  userId: string,
  content: GeneratedContent,
  outreachType: OutreachType,
  triggerId?: string
): Promise<DeliveryResult> {
  const creds = await loadCredentials();
  if (!creds.fcm) {
    // Fall back to in-app
    log.debug({ userId }, 'FCM not configured, using in-app delivery');
    return deliverInApp(userId, content, outreachType, triggerId);
  }

  try {
    // Get user's FCM tokens from Firestore
    const tokens = await getUserFCMTokens(userId);
    if (tokens.length === 0) {
      log.debug({ userId }, 'No FCM tokens found, using in-app delivery');
      return deliverInApp(userId, content, outreachType, triggerId);
    }

    const admin = await import('firebase-admin');

    // Initialize if needed
    if (admin.apps.length === 0) {
      if (creds.fcm.privateKey) {
        // Use explicit service account credentials
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: creds.fcm.projectId,
            privateKey: creds.fcm.privateKey.replace(/\\n/g, '\n'),
            clientEmail: creds.fcm.clientEmail,
          }),
        });
      } else {
        // Use application default credentials
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId: creds.fcm.projectId,
        });
      }
    }

    const messaging = admin.messaging();
    const message = {
      notification: {
        title: `From ${getDisplayName(content.personaId)}`,
        body: content.text.slice(0, 200),
      },
      data: {
        type: outreachType,
        personaId: content.personaId,
        triggerId: triggerId || '',
      },
      tokens,
    };

    const response = await messaging.sendEachForMulticast(message);
    const messageId = `push-${Date.now()}`;

    // Record delivery
    await recordDelivery(userId, 'push', messageId, outreachType, triggerId);

    log.info({ userId, successCount: response.successCount }, 'Push notification delivered');
    return {
      success: response.successCount > 0,
      channel: 'push',
      messageId,
      error: response.failureCount > 0 ? `${response.failureCount} tokens failed` : undefined,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Push delivery failed');
    return { success: false, channel: 'push', error: String(error) };
  }
}

/**
 * Deliver via In-App Message (Firestore)
 *
 * This is the fallback for all channels and always works.
 */
async function deliverInApp(
  userId: string,
  content: GeneratedContent,
  outreachType: OutreachType,
  triggerId?: string
): Promise<DeliveryResult> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      return { success: false, channel: 'in_app', error: 'Firestore not available' };
    }

    const messageId = `inapp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();

    const message = {
      id: messageId,
      userId,
      type: outreachType,
      personaId: content.personaId,
      text: content.text,
      ssml: content.ssml,
      reason: content.reason,
      triggerId,
      read: false,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    };

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('pending_messages')
      .doc(messageId)
      .set(cleanForFirestore(message));

    log.info({ userId, messageId, type: outreachType }, 'In-app message saved');
    return { success: true, channel: 'in_app', messageId };
  } catch (error) {
    log.error({ error: String(error), userId }, 'In-app delivery failed');
    return { success: false, channel: 'in_app', error: String(error) };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getUserFCMTokens(userId: string): Promise<string[]> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return [];

    const doc = await db.collection('bogle_users').doc(userId).get();
    if (!doc.exists) return [];

    const data = doc.data();
    return (data?.fcmTokens as string[]) || [];
  } catch {
    return [];
  }
}

async function recordDelivery(
  userId: string,
  channel: string,
  messageId: string,
  outreachType: OutreachType,
  triggerId?: string
): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return;

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('outreach_history')
      .doc(messageId)
      .set(
        cleanForFirestore({
          channel,
          type: outreachType,
          triggerId,
          deliveredAt: new Date().toISOString(),
          status: 'delivered',
        })
      );
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to record delivery');
  }
}

// ============================================================================
// IN-APP MESSAGE RETRIEVAL (for frontend)
// ============================================================================

export interface PendingMessage {
  id: string;
  type: string;
  personaId: string;
  text: string;
  ssml: string;
  reason: string;
  read: boolean;
  createdAt: string;
}

/**
 * Get pending in-app messages for a user
 */
export async function getPendingMessages(userId: string): Promise<PendingMessage[]> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return [];

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('pending_messages')
      .where('read', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(10)
      .get();

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as PendingMessage[];
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get pending messages');
    return [];
  }
}

/**
 * Mark a message as read
 */
export async function markMessageRead(userId: string, messageId: string): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return;

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('pending_messages')
      .doc(messageId)
      .update({ read: true, readAt: new Date().toISOString() });
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to mark message read');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const unifiedDelivery = {
  deliver,
  getChannelStatus,
  getPendingMessages,
  markMessageRead,
};

export default unifiedDelivery;
