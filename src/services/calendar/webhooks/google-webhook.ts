/**
 * Google Calendar Webhook Handler
 *
 * Handles push notifications from Google Calendar API for real-time sync.
 * When events change in Google Calendar, Google sends a notification to our webhook.
 *
 * Flow:
 * 1. User connects Google Calendar
 * 2. We create a watch channel on their calendar
 * 3. Google sends POST to /webhooks/calendar/google when events change
 * 4. We sync the changes to Ferni's unified calendar
 *
 * Note: Webhooks require HTTPS and a publicly accessible endpoint.
 * Use ngrok for local development.
 *
 * @module calendar/webhooks/google-webhook
 */

import { getLogger } from '../../../utils/safe-logger.js';
import type { Firestore as FirestoreType } from '@google-cloud/firestore';
import { googleCalendarProvider } from '../providers/google-provider.js';
import { importEventsFromProvider } from '../unified-calendar-store.js';

const log = getLogger();

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
    log.warn({ error }, 'Firestore not available for Google webhook');
    return null;
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface WatchChannel {
  id: string;
  resourceId: string;
  resourceUri: string;
  expiration: number;
  userId: string;
  calendarId: string;
  createdAt: string;
}

export interface WebhookNotification {
  /** Channel ID we created */
  channelId: string;
  /** Resource ID from Google */
  resourceId: string;
  /** State of the resource (sync or exists) */
  resourceState: 'sync' | 'exists' | 'not_exists';
  /** Token from initial watch request */
  channelToken?: string;
  /** Expiration timestamp */
  channelExpiration?: string;
  /** Message number (for ordering) */
  messageNumber?: string;
}

// ============================================================================
// WEBHOOK CONFIGURATION
// ============================================================================

/**
 * Get the webhook URL for Google Calendar
 */
export function getWebhookUrl(): string {
  const baseUrl = process.env.PUBLIC_URL || process.env.WEBHOOK_BASE_URL || 'https://app.ferni.ai';
  return `${baseUrl}/webhooks/calendar/google`;
}

/**
 * Check if webhooks are enabled
 */
export function isWebhookEnabled(): boolean {
  // Webhooks require HTTPS and public URL
  const url = getWebhookUrl();
  return url.startsWith('https://') && !url.includes('localhost');
}

// ============================================================================
// CHANNEL MANAGEMENT
// ============================================================================

/**
 * Create a watch channel for a user's Google Calendar
 */
export async function createWatchChannel(
  userId: string,
  calendarId: string = 'primary'
): Promise<WatchChannel | null> {
  if (!isWebhookEnabled()) {
    log.warn('Webhooks not enabled (requires HTTPS public URL)');
    return null;
  }

  try {
    // Get OAuth tokens
    const { getUserTokens } = await import('../../google-calendar-oauth.js');
    const tokens = await getUserTokens(userId);

    if (!tokens?.access_token) {
      log.warn({ userId }, 'No Google tokens for webhook setup');
      return null;
    }

    // Generate unique channel ID
    const channelId = `ferni_${userId}_${Date.now()}`;

    // Create watch request
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: channelId,
          type: 'web_hook',
          address: getWebhookUrl(),
          token: userId, // We use userId as token for identification
          params: {
            ttl: '2592000', // 30 days in seconds
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      log.error({ error, userId, status: response.status }, 'Failed to create watch channel');
      return null;
    }

    const data = (await response.json()) as {
      id: string;
      resourceId: string;
      resourceUri?: string;
      expiration: string;
    };

    const channel: WatchChannel = {
      id: data.id,
      resourceId: data.resourceId,
      resourceUri: data.resourceUri || '',
      expiration: parseInt(data.expiration, 10),
      userId,
      calendarId,
      createdAt: new Date().toISOString(),
    };

    // Store channel info
    await storeWatchChannel(channel);

    log.info(
      { userId, channelId: channel.id, expiration: new Date(channel.expiration) },
      '📡 Created Google Calendar watch channel'
    );

    return channel;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error creating watch channel');
    return null;
  }
}

/**
 * Stop a watch channel
 */
export async function stopWatchChannel(channelId: string, resourceId: string): Promise<boolean> {
  try {
    // Get any valid token (we need auth to stop)
    const channel = await getWatchChannel(channelId);
    if (!channel) {
      log.warn({ channelId }, 'Channel not found for stopping');
      return false;
    }

    const { getUserTokens } = await import('../../google-calendar-oauth.js');
    const tokens = await getUserTokens(channel.userId);

    if (!tokens?.access_token) {
      log.warn({ channelId }, 'No tokens for stopping channel');
      return false;
    }

    const response = await fetch('https://www.googleapis.com/calendar/v3/channels/stop', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: channelId,
        resourceId,
      }),
    });

    if (!response.ok && response.status !== 404) {
      log.error({ channelId, status: response.status }, 'Failed to stop watch channel');
      return false;
    }

    // Remove from storage
    await deleteWatchChannel(channelId);

    log.info({ channelId }, '📡 Stopped Google Calendar watch channel');
    return true;
  } catch (error) {
    log.error({ error: String(error), channelId }, 'Error stopping watch channel');
    return false;
  }
}

/**
 * Renew expiring watch channels
 */
export async function renewExpiringChannels(): Promise<number> {
  const firestore = await getFirestore();
  if (!firestore) return 0;

  try {
    // Find channels expiring within 24 hours
    const cutoff = Date.now() + 24 * 60 * 60 * 1000;

    const snapshot = await firestore
      .collectionGroup('google_watch_channels')
      .where('expiration', '<', cutoff)
      .get();

    let renewed = 0;

    for (const doc of snapshot.docs) {
      const channel = doc.data() as WatchChannel;

      // Stop old channel and create new one
      await stopWatchChannel(channel.id, channel.resourceId);
      const newChannel = await createWatchChannel(channel.userId, channel.calendarId);

      if (newChannel) {
        renewed++;
      }
    }

    if (renewed > 0) {
      log.info({ renewed }, '📡 Renewed expiring watch channels');
    }

    return renewed;
  } catch (error) {
    log.error({ error: String(error) }, 'Error renewing watch channels');
    return 0;
  }
}

// ============================================================================
// WEBHOOK HANDLER
// ============================================================================

/**
 * Handle incoming webhook notification from Google
 */
export async function handleWebhookNotification(
  notification: WebhookNotification
): Promise<{ success: boolean; synced?: number }> {
  log.debug({ notification }, 'Received Google Calendar webhook');

  // Verify we have a valid channel
  const channel = await getWatchChannel(notification.channelId);

  if (!channel) {
    log.warn({ channelId: notification.channelId }, 'Unknown webhook channel');
    return { success: false };
  }

  // Handle sync state (initial notification)
  if (notification.resourceState === 'sync') {
    log.info({ userId: channel.userId }, '📡 Google webhook sync confirmed');
    return { success: true };
  }

  // Handle exists state (actual change notification)
  if (notification.resourceState === 'exists') {
    try {
      // Fetch updated events and import to unified calendar
      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(now.getDate() + 30);

      const events = await googleCalendarProvider.fetchEvents(
        channel.userId,
        now,
        endDate,
        channel.calendarId
      );

      // Import to unified store
      await importEventsFromProvider(channel.userId, 'google', events);

      log.info(
        { userId: channel.userId, eventCount: events.length },
        '📡 Synced events from Google webhook'
      );

      return { success: true, synced: events.length };
    } catch (error) {
      log.error({ error: String(error), userId: channel.userId }, 'Error processing webhook');
      return { success: false };
    }
  }

  // Handle not_exists (resource deleted)
  if (notification.resourceState === 'not_exists') {
    log.info({ userId: channel.userId }, '📡 Google calendar resource deleted');
    await deleteWatchChannel(notification.channelId);
    return { success: true };
  }

  return { success: true };
}

// ============================================================================
// STORAGE HELPERS
// ============================================================================

async function storeWatchChannel(channel: WatchChannel): Promise<void> {
  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    await firestore
      .collection(`users/${channel.userId}/google_watch_channels`)
      .doc(channel.id)
      .set(channel);
  } catch (error) {
    log.error({ error: String(error) }, 'Error storing watch channel');
  }
}

async function getWatchChannel(channelId: string): Promise<WatchChannel | null> {
  const firestore = await getFirestore();
  if (!firestore) return null;

  try {
    // Search across all users (channelId is globally unique)
    const snapshot = await firestore
      .collectionGroup('google_watch_channels')
      .where('id', '==', channelId)
      .limit(1)
      .get();

    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as WatchChannel;
  } catch (error) {
    log.error({ error: String(error), channelId }, 'Error getting watch channel');
    return null;
  }
}

async function deleteWatchChannel(channelId: string): Promise<void> {
  const channel = await getWatchChannel(channelId);
  if (!channel) return;

  const firestore = await getFirestore();
  if (!firestore) return;

  try {
    await firestore
      .collection(`users/${channel.userId}/google_watch_channels`)
      .doc(channelId)
      .delete();
  } catch (error) {
    log.error({ error: String(error), channelId }, 'Error deleting watch channel');
  }
}

/**
 * Get all watch channels for a user
 */
export async function getUserWatchChannels(userId: string): Promise<WatchChannel[]> {
  const firestore = await getFirestore();
  if (!firestore) return [];

  try {
    const snapshot = await firestore
      .collection(`users/${userId}/google_watch_channels`)
      .get();

    return snapshot.docs.map((doc) => doc.data() as WatchChannel);
  } catch (error) {
    log.error({ error: String(error), userId }, 'Error getting user watch channels');
    return [];
  }
}

/**
 * Stop all watch channels for a user (on disconnect)
 */
export async function stopAllUserChannels(userId: string): Promise<void> {
  const channels = await getUserWatchChannels(userId);

  for (const channel of channels) {
    await stopWatchChannel(channel.id, channel.resourceId);
  }

  log.info({ userId, count: channels.length }, '📡 Stopped all user watch channels');
}

export default {
  getWebhookUrl,
  isWebhookEnabled,
  createWatchChannel,
  stopWatchChannel,
  renewExpiringChannels,
  handleWebhookNotification,
  getUserWatchChannels,
  stopAllUserChannels,
};

