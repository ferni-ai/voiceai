/**
 * Outlook Calendar Webhook Handler
 *
 * Handles push notifications from Microsoft Graph API for real-time sync.
 * Microsoft uses subscriptions with expiration, requiring renewal.
 *
 * Flow:
 * 1. User connects Outlook Calendar
 * 2. We create a subscription on their calendar
 * 3. Microsoft sends POST to /webhooks/calendar/outlook when events change
 * 4. We sync the changes to Ferni's unified calendar
 *
 * Note: Microsoft requires webhook URL validation on subscription creation.
 *
 * @module calendar/webhooks/outlook-webhook
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { outlookCalendarProvider } from '../providers/outlook-provider.js';
import { importEventsFromProvider } from '../unified-calendar-store.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = getLogger();

// ============================================================================
// CONSTANTS
// ============================================================================

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
// Subscriptions can last up to 3 days for calendar events
const SUBSCRIPTION_LIFETIME_MINUTES = 4230; // ~3 days

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

let db: FirestoreType | null = null;

async function getFirestore(): Promise<FirestoreType | null> {
  if (db) return db;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    db = new Firestore({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
      databaseId: process.env.FIRESTORE_DATABASE || '(default)',
    });
    return db;
  } catch (error) {
    log.warn({ error }, 'Firestore not available for Outlook webhook');
    return null;
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface OutlookSubscription {
  id: string;
  subscriptionId: string;
  userId: string;
  resource: string;
  changeType: string;
  expirationDateTime: string;
  clientState: string;
  createdAt: string;
}

export interface OutlookNotification {
  subscriptionId: string;
  subscriptionExpirationDateTime: string;
  changeType: 'created' | 'updated' | 'deleted';
  resource: string;
  resourceData?: {
    id: string;
    '@odata.type': string;
    '@odata.id': string;
    '@odata.etag'?: string;
  };
  clientState?: string;
  tenantId?: string;
}

export interface WebhookPayload {
  value: OutlookNotification[];
  validationToken?: string;
}

// ============================================================================
// WEBHOOK CONFIGURATION
// ============================================================================

/**
 * Get the webhook URL for Outlook Calendar
 */
export function getWebhookUrl(): string {
  const baseUrl = process.env.PUBLIC_URL || process.env.WEBHOOK_BASE_URL || 'https://app.ferni.ai';
  return `${baseUrl}/webhooks/calendar/outlook`;
}

/**
 * Check if webhooks are enabled
 */
export function isWebhookEnabled(): boolean {
  // Webhooks require HTTPS and public URL
  const url = getWebhookUrl();
  const hasConfig = !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
  return hasConfig && url.startsWith('https://') && !url.includes('localhost');
}

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

/**
 * Create a subscription for a user's Outlook Calendar
 */
export async function createSubscription(userId: string): Promise<OutlookSubscription | null> {
  if (!isWebhookEnabled()) {
    log.warn('Outlook webhooks not enabled (requires HTTPS public URL and MS config)');
    return null;
  }

  try {
    // Get access token
    const accessToken = await getAccessToken(userId);
    if (!accessToken) {
      log.warn({ userId }, 'No Outlook tokens for webhook setup');
      return null;
    }

    // Generate client state for validation
    const clientState = `ferni_${userId}_${Date.now()}`;

    // Calculate expiration
    const expirationDateTime = new Date(
      Date.now() + SUBSCRIPTION_LIFETIME_MINUTES * 60 * 1000
    ).toISOString();

    // Create subscription
    const response = await fetch(`${GRAPH_BASE_URL}/subscriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        changeType: 'created,updated,deleted',
        notificationUrl: getWebhookUrl(),
        resource: '/me/events',
        expirationDateTime,
        clientState,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      log.error(
        { error, userId, status: response.status },
        'Failed to create Outlook subscription'
      );
      return null;
    }

    const data = (await response.json()) as {
      id: string;
      resource: string;
      changeTypes: string[];
      expirationDateTime: string;
    };

    const subscription: OutlookSubscription = {
      id: `outlook_${userId}_${Date.now()}`,
      subscriptionId: data.id,
      userId,
      resource: data.resource,
      changeType: data.changeTypes.join(','),
      expirationDateTime: data.expirationDateTime,
      clientState,
      createdAt: new Date().toISOString(),
    };

    // Store subscription
    await storeSubscription(subscription);

    log.info(
      { userId, subscriptionId: subscription.subscriptionId, expires: data.expirationDateTime },
      '📧 Created Outlook Calendar subscription'
    );

    return subscription;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error creating Outlook subscription');
    return null;
  }
}

/**
 * Renew an existing subscription
 */
export async function renewSubscription(subscriptionId: string): Promise<boolean> {
  const subscription = await getSubscriptionById(subscriptionId);
  if (!subscription) {
    log.warn({ subscriptionId }, 'Subscription not found for renewal');
    return false;
  }

  try {
    const accessToken = await getAccessToken(subscription.userId);
    if (!accessToken) {
      return false;
    }

    const newExpiration = new Date(
      Date.now() + SUBSCRIPTION_LIFETIME_MINUTES * 60 * 1000
    ).toISOString();

    const response = await fetch(`${GRAPH_BASE_URL}/subscriptions/${subscriptionId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expirationDateTime: newExpiration,
      }),
    });

    if (!response.ok) {
      log.error({ subscriptionId, status: response.status }, 'Failed to renew subscription');
      return false;
    }

    // Update stored subscription
    subscription.expirationDateTime = newExpiration;
    await storeSubscription(subscription);

    log.info({ subscriptionId, newExpiration }, '📧 Renewed Outlook subscription');
    return true;
  } catch (error) {
    log.error({ error: String(error), subscriptionId }, 'Error renewing subscription');
    return false;
  }
}

/**
 * Delete a subscription
 */
export async function deleteSubscription(subscriptionId: string): Promise<boolean> {
  const subscription = await getSubscriptionById(subscriptionId);
  if (!subscription) {
    return false;
  }

  try {
    const accessToken = await getAccessToken(subscription.userId);
    if (accessToken) {
      await fetch(`${GRAPH_BASE_URL}/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    }

    await deleteStoredSubscription(subscription.id);

    log.info({ subscriptionId }, '📧 Deleted Outlook subscription');
    return true;
  } catch (error) {
    log.error({ error: String(error), subscriptionId }, 'Error deleting subscription');
    return false;
  }
}

/**
 * Renew all expiring subscriptions
 */
export async function renewExpiringSubscriptions(): Promise<number> {
  const firestore = await getFirestore();
  if (!firestore) return 0;

  try {
    // Find subscriptions expiring within 1 hour
    const cutoff = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const snapshot = await firestore
      .collectionGroup('outlook_subscriptions')
      .where('expirationDateTime', '<', cutoff)
      .get();

    let renewed = 0;

    for (const doc of snapshot.docs) {
      const subscription = doc.data() as OutlookSubscription;
      const success = await renewSubscription(subscription.subscriptionId);
      if (success) {
        renewed++;
      }
    }

    if (renewed > 0) {
      log.info({ renewed }, '📧 Renewed expiring Outlook subscriptions');
    }

    return renewed;
  } catch (error) {
    log.error({ error: String(error) }, 'Error renewing subscriptions');
    return 0;
  }
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

/**
 * Handle incoming webhook notification from Microsoft
 */
export async function handleWebhookNotification(
  payload: WebhookPayload
): Promise<{ success: boolean; synced?: number }> {
  // Handle validation request (Microsoft sends this when creating subscription)
  if (payload.validationToken) {
    log.debug('Outlook webhook validation request received');
    return { success: true };
  }

  if (!payload.value || !Array.isArray(payload.value)) {
    log.warn('Invalid Outlook webhook payload');
    return { success: false };
  }

  let totalSynced = 0;

  for (const notification of payload.value) {
    log.debug({ notification }, 'Processing Outlook notification');

    // Find the subscription
    const subscription = await getSubscriptionById(notification.subscriptionId);
    if (!subscription) {
      log.warn({ subscriptionId: notification.subscriptionId }, 'Unknown Outlook subscription');
      continue;
    }

    // Validate client state
    if (notification.clientState && notification.clientState !== subscription.clientState) {
      log.warn({ subscriptionId: notification.subscriptionId }, 'Client state mismatch');
      continue;
    }

    try {
      // Fetch updated events and import to unified calendar
      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(now.getDate() + 30);

      const events = await outlookCalendarProvider.fetchEvents(subscription.userId, now, endDate);

      // Import to unified store
      await importEventsFromProvider(subscription.userId, 'outlook', events);

      log.info(
        {
          userId: subscription.userId,
          eventCount: events.length,
          changeType: notification.changeType,
        },
        '📧 Synced events from Outlook webhook'
      );

      totalSynced += events.length;
    } catch (error) {
      log.error(
        { error: String(error), userId: subscription.userId },
        'Error processing Outlook webhook'
      );
    }
  }

  return { success: true, synced: totalSynced };
}

/**
 * Get validation token response for Microsoft webhook validation
 */
export function getValidationResponse(token: string): string {
  return token;
}

// ============================================================================
// STORAGE HELPERS
// ============================================================================

async function storeSubscription(subscription: OutlookSubscription): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    await firestore
      .collection(`users/${subscription.userId}/outlook_subscriptions`)
      .doc(subscription.id)
      .set(cleanForFirestore(subscription));
  } catch (error) {
    log.error({ error: String(error) }, 'Error storing Outlook subscription');
  }
}

async function getSubscriptionById(subscriptionId: string): Promise<OutlookSubscription | null> {
  const firestore = await getFirestore();
  if (!firestore) return null;

  try {
    const snapshot = await firestore
      .collectionGroup('outlook_subscriptions')
      .where('subscriptionId', '==', subscriptionId)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as OutlookSubscription;
  } catch (error) {
    log.error({ error: String(error), subscriptionId }, 'Error getting subscription');
    return null;
  }
}

async function deleteStoredSubscription(id: string): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  // Need to find the user first
  const snapshot = await firestore
    .collectionGroup('outlook_subscriptions')
    .where('id', '==', id)
    .limit(1)
    .get();

  if (!snapshot.empty) {
    await snapshot.docs[0].ref.delete();
  }
}

/**
 * Get all subscriptions for a user
 */
export async function getUserSubscriptions(userId: string): Promise<OutlookSubscription[]> {
  const firestore = await getFirestore();
  if (!firestore) return [];

  try {
    const snapshot = await firestore.collection(`users/${userId}/outlook_subscriptions`).get();

    return snapshot.docs.map((doc) => doc.data() as OutlookSubscription);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error getting user subscriptions');
    return [];
  }
}

/**
 * Stop all subscriptions for a user (on disconnect)
 */
export async function stopAllUserSubscriptions(userId: string): Promise<void> {
  const subscriptions = await getUserSubscriptions(userId);

  for (const subscription of subscriptions) {
    await deleteSubscription(subscription.subscriptionId);
  }

  log.info({ userId, count: subscriptions.length }, '📧 Stopped all user Outlook subscriptions');
}

// ============================================================================
// TOKEN HELPER
// ============================================================================

async function getAccessToken(userId: string): Promise<string | null> {
  try {
    const connected = await outlookCalendarProvider.isConnected(userId);
    if (!connected) {
      return null;
    }

    // Use provider to get token (will refresh if needed)
    const firestore = await getFirestore();
    if (!firestore) return null;

    const doc = await firestore
      .collection(`users/${userId}/calendar_providers`)
      .doc('outlook')
      .get();

    if (!doc.exists) return null;

    const data = doc.data();
    return data?.accessToken || null;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error getting Outlook access token');
    return null;
  }
}

export default {
  getWebhookUrl,
  isWebhookEnabled,
  createSubscription,
  renewSubscription,
  deleteSubscription,
  renewExpiringSubscriptions,
  handleWebhookNotification,
  getValidationResponse,
  getUserSubscriptions,
  stopAllUserSubscriptions,
};
