/**
 * Push Notifications Service
 *
 * Send push notifications via Firebase Cloud Messaging (FCM):
 * - Rich notifications with images and actions
 * - Persona-styled notifications
 * - Deep linking support
 * - Delivery tracking
 */

import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger().child({ module: 'push-notifications' });

// ============================================================================
// TYPES
// ============================================================================

export interface PushNotificationConfig {
  firebaseProjectId: string;
  firebasePrivateKey: string;
  firebaseClientEmail: string;
  defaultIcon?: string;
  defaultBadge?: string;
}

export interface PushNotification {
  userId: string;
  outreachId: string;
  personaId: string;

  // Content
  title: string;
  body: string;
  imageUrl?: string;
  icon?: string;
  badge?: string;

  // Actions
  actions?: PushAction[];
  clickAction?: string; // URL to open
  data?: Record<string, string>;

  // Options
  priority?: 'high' | 'normal';
  ttl?: number; // Time to live in seconds
  collapseKey?: string; // Group notifications
  silent?: boolean;
}

export interface PushAction {
  action: string;
  title: string;
  icon?: string;
}

export interface PushDeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
  failureReason?: 'invalid_token' | 'unregistered' | 'quota_exceeded' | 'unknown';
}

export interface UserPushToken {
  userId: string;
  token: string;
  platform: 'web' | 'ios' | 'android';
  createdAt: Date;
  lastUsedAt: Date;
  userAgent?: string;
}

export interface PushDeliveryRecord {
  messageId: string;
  userId: string;
  outreachId: string;
  personaId: string;
  title: string;
  status: 'sent' | 'delivered' | 'opened' | 'actioned' | 'failed';
  sentAt: Date;
  deliveredAt?: Date;
  openedAt?: Date;
  actionedAt?: Date;
  actionTaken?: string;
  errorReason?: string;
}

// ============================================================================
// STATE
// ============================================================================

let config: PushNotificationConfig | null = null;
let fcmAccessToken: string | null = null;
let tokenExpiry: Date | null = null;

const userTokens = new Map<string, UserPushToken[]>();
const deliveryRecords = new Map<string, PushDeliveryRecord>();

// ============================================================================
// PERSONA NOTIFICATION STYLES
// ============================================================================

interface PersonaNotificationStyle {
  icon: string;
  color: string;
  vibrationPattern?: number[];
}

const PERSONA_STYLES: Record<string, PersonaNotificationStyle> = {
  ferni: {
    icon: '/icons/ferni-notification.png',
    color: '#4a6741',
    vibrationPattern: [100, 50, 100],
  },
  maya: {
    icon: '/icons/maya-notification.png',
    color: '#a67a6a',
    vibrationPattern: [100, 50, 100],
  },
  peter: {
    icon: '/icons/peter-notification.png',
    color: '#3a6b73',
    vibrationPattern: [100, 50, 100],
  },
  alex: {
    icon: '/icons/alex-notification.png',
    color: '#5a6b8a',
    vibrationPattern: [100, 50, 100],
  },
  jordan: {
    icon: '/icons/jordan-notification.png',
    color: '#c4856a',
    vibrationPattern: [100, 100, 100, 100, 100],
  },
  nayan: {
    icon: '/icons/nayan-notification.png',
    color: '#8a7a6a',
    vibrationPattern: [200],
  },
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize push notification service
 */
export function initializePushNotifications(pushConfig: PushNotificationConfig): void {
  config = pushConfig;
  log.info('✅ Push notification service initialized');
}

/**
 * Check if push notifications are available
 */
export function isPushNotificationsAvailable(): boolean {
  return config !== null;
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

/**
 * Register a push token for a user
 */
export function registerPushToken(
  userId: string,
  token: string,
  platform: 'web' | 'ios' | 'android',
  userAgent?: string
): void {
  const tokens = userTokens.get(userId) || [];

  // Check if token already exists
  const existingIndex = tokens.findIndex((t) => t.token === token);
  if (existingIndex !== -1) {
    tokens[existingIndex].lastUsedAt = new Date();
    tokens[existingIndex].userAgent = userAgent;
  } else {
    tokens.push({
      userId,
      token,
      platform,
      createdAt: new Date(),
      lastUsedAt: new Date(),
      userAgent,
    });
  }

  userTokens.set(userId, tokens);
  log.info({ userId, platform }, '📱 Registered push token');
}

/**
 * Remove a push token
 */
export function removePushToken(userId: string, token: string): boolean {
  const tokens = userTokens.get(userId);
  if (!tokens) return false;

  const newTokens = tokens.filter((t) => t.token !== token);
  if (newTokens.length === tokens.length) return false;

  userTokens.set(userId, newTokens);
  log.info({ userId }, '📱 Removed push token');
  return true;
}

/**
 * Get all tokens for a user
 */
export function getUserTokens(userId: string): UserPushToken[] {
  return userTokens.get(userId) || [];
}

/**
 * Check if user has push enabled
 */
export function hasPushEnabled(userId: string): boolean {
  const tokens = userTokens.get(userId);
  return !!tokens && tokens.length > 0;
}

// ============================================================================
// FCM ACCESS TOKEN
// ============================================================================

/**
 * Get FCM access token using service account
 */
async function getFCMAccessToken(): Promise<string> {
  if (fcmAccessToken && tokenExpiry && tokenExpiry > new Date()) {
    return fcmAccessToken;
  }

  if (!config) {
    throw new Error('Push notifications not initialized');
  }

  // Create JWT for service account
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600;

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: config.firebaseClientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: expiry,
  };

  // Sign JWT (simplified - in production use proper JWT library)
  const jwt = await signJWT(header, payload, config.firebasePrivateKey);

  // Exchange JWT for access token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!response.ok) {
    throw new Error(`Failed to get FCM token: ${response.status}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  fcmAccessToken = data.access_token;
  tokenExpiry = new Date(Date.now() + (data.expires_in - 60) * 1000);

  return fcmAccessToken!;
}

/**
 * Sign JWT for service account authentication
 */
async function signJWT(
  header: object,
  payload: object,
  privateKey: string
): Promise<string> {
  const crypto = await import('crypto');

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(privateKey, 'base64url');

  return `${signingInput}.${signature}`;
}

// ============================================================================
// SENDING
// ============================================================================

/**
 * Send push notification to a user
 */
export async function sendPushNotification(
  notification: PushNotification
): Promise<PushDeliveryResult[]> {
  if (!isPushNotificationsAvailable()) {
    return [{ success: false, error: 'Push notifications not initialized' }];
  }

  const tokens = userTokens.get(notification.userId);
  if (!tokens || tokens.length === 0) {
    return [{ success: false, error: 'No push tokens registered for user' }];
  }

  const results: PushDeliveryResult[] = [];
  const style = PERSONA_STYLES[notification.personaId] || PERSONA_STYLES.ferni;

  for (const tokenInfo of tokens) {
    try {
      const result = await sendToToken(notification, tokenInfo.token, style);
      results.push(result);

      if (result.success && result.messageId) {
        // Record delivery
        const record: PushDeliveryRecord = {
          messageId: result.messageId,
          userId: notification.userId,
          outreachId: notification.outreachId,
          personaId: notification.personaId,
          title: notification.title,
          status: 'sent',
          sentAt: new Date(),
        };
        deliveryRecords.set(result.messageId, record);
      }

      // Handle invalid tokens
      if (result.failureReason === 'unregistered' || result.failureReason === 'invalid_token') {
        removePushToken(notification.userId, tokenInfo.token);
      }
    } catch (error) {
      log.error({ error, userId: notification.userId }, 'Push notification error');
      results.push({ success: false, error: String(error) });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  log.info(
    {
      userId: notification.userId,
      successCount,
      totalTokens: tokens.length,
    },
    '🔔 Push notification sent'
  );

  return results;
}

/**
 * Send to a specific FCM token
 */
async function sendToToken(
  notification: PushNotification,
  token: string,
  style: PersonaNotificationStyle
): Promise<PushDeliveryResult> {
  const accessToken = await getFCMAccessToken();

  const message: Record<string, unknown> = {
    message: {
      token,
      notification: {
        title: notification.title,
        body: notification.body,
        image: notification.imageUrl,
      },
      android: {
        priority: notification.priority === 'high' ? 'HIGH' : 'NORMAL',
        notification: {
          icon: notification.icon || style.icon,
          color: style.color,
          click_action: notification.clickAction,
          channel_id: 'ferni_outreach',
        },
        ttl: notification.ttl ? `${notification.ttl}s` : undefined,
        collapse_key: notification.collapseKey,
      },
      webpush: {
        notification: {
          icon: notification.icon || style.icon,
          badge: notification.badge || config!.defaultBadge,
          vibrate: style.vibrationPattern,
          actions: notification.actions,
          requireInteraction: notification.priority === 'high',
        },
        fcm_options: {
          link: notification.clickAction,
        },
      },
      apns: {
        headers: {
          'apns-priority': notification.priority === 'high' ? '10' : '5',
          'apns-collapse-id': notification.collapseKey,
        },
        payload: {
          aps: {
            alert: {
              title: notification.title,
              body: notification.body,
            },
            badge: 1,
            sound: notification.silent ? undefined : 'default',
            'mutable-content': 1,
          },
        },
      },
      data: {
        outreachId: notification.outreachId,
        personaId: notification.personaId,
        ...notification.data,
      },
    },
  };

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${config!.firebaseProjectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    }
  );

  if (!response.ok) {
    const errorBody = await response.json() as { error?: { message?: string; details?: Array<{ errorCode?: string }> } };
    const errorCode = errorBody.error?.details?.[0]?.errorCode;

    let failureReason: PushDeliveryResult['failureReason'] = 'unknown';
    if (errorCode === 'UNREGISTERED' || errorCode === 'INVALID_ARGUMENT') {
      failureReason = 'unregistered';
    } else if (errorCode === 'QUOTA_EXCEEDED') {
      failureReason = 'quota_exceeded';
    }

    return {
      success: false,
      error: errorBody.error?.message || `FCM error: ${response.status}`,
      failureReason,
    };
  }

  const data = await response.json() as { name: string };
  return {
    success: true,
    messageId: data.name,
  };
}

/**
 * Send to multiple users
 */
export async function sendBulkPushNotifications(
  notifications: PushNotification[]
): Promise<Map<string, PushDeliveryResult[]>> {
  const results = new Map<string, PushDeliveryResult[]>();

  // Process in parallel with concurrency limit
  const concurrencyLimit = 10;
  for (let i = 0; i < notifications.length; i += concurrencyLimit) {
    const batch = notifications.slice(i, i + concurrencyLimit);
    const batchResults = await Promise.all(
      batch.map((n) => sendPushNotification(n).then((r) => [n.userId, r] as const))
    );

    for (const [userId, result] of batchResults) {
      results.set(userId, result);
    }
  }

  return results;
}

// ============================================================================
// NOTIFICATION TEMPLATES
// ============================================================================

/**
 * Generate persona-styled notification content
 */
export function generatePersonaNotification(
  personaId: string,
  type: 'commitment' | 'celebration' | 'thinking_of_you' | 'reminder',
  context: {
    userName?: string;
    topic?: string;
    details?: string;
  }
): { title: string; body: string } {
  const templates: Record<string, Record<string, { title: string; body: string }>> = {
    ferni: {
      commitment: {
        title: "Hey! How'd it go? 🌱",
        body: context.topic
          ? `Checking in on ${context.topic}. Would love to hear how it went!`
          : "Just wanted to check in on that thing you were working on!",
      },
      celebration: {
        title: 'Amazing! 🎉',
        body: context.topic
          ? `So proud of you for ${context.topic}!`
          : "You're doing great things! Let's celebrate!",
      },
      thinking_of_you: {
        title: 'Hey! 💚',
        body: context.userName
          ? `Just thinking about you, ${context.userName}. Hope you're doing well!`
          : "Just thinking about you. Hope you're having a good day!",
      },
      reminder: {
        title: 'Quick reminder',
        body: context.topic || 'You wanted me to remind you about something!',
      },
    },
    maya: {
      commitment: {
        title: 'Routine check! ✨',
        body: context.topic
          ? `How did ${context.topic} go?`
          : 'Checking in on your habits today!',
      },
      celebration: {
        title: "You're crushing it! 💪",
        body: context.topic
          ? `${context.topic} - another win for you!`
          : "Look at you go! Small wins add up!",
      },
      thinking_of_you: {
        title: 'Good morning! ☀️',
        body: 'Hope you have an amazing day. Remember your goals!',
      },
      reminder: {
        title: 'Time for your routine!',
        body: context.topic || "It's time for that thing you planned!",
      },
    },
    jordan: {
      commitment: {
        title: "Event check-in! 📅",
        body: context.topic
          ? `How's the planning for ${context.topic} going?`
          : 'Checking in on your upcoming event!',
      },
      celebration: {
        title: 'Event success! 🎉',
        body: context.topic
          ? `${context.topic} was a hit!`
          : 'Another successful event in the books!',
      },
      thinking_of_you: {
        title: 'Big day coming up! 🌟',
        body: context.topic
          ? `Getting excited for ${context.topic}!`
          : 'Something exciting is on the horizon!',
      },
      reminder: {
        title: 'Event reminder! 📆',
        body: context.topic || 'Your event is coming up soon!',
      },
    },
  };

  // Default to ferni template
  const personaTemplates = templates[personaId] || templates.ferni;
  return personaTemplates[type] || personaTemplates.thinking_of_you;
}

// ============================================================================
// STATUS TRACKING
// ============================================================================

/**
 * Handle push notification interaction (opened, actioned)
 */
export function handlePushInteraction(
  messageId: string,
  interaction: 'opened' | 'actioned',
  actionId?: string
): void {
  const record = deliveryRecords.get(messageId);
  if (!record) {
    log.warn({ messageId }, 'Interaction for unknown push notification');
    return;
  }

  if (interaction === 'opened') {
    record.status = 'opened';
    record.openedAt = new Date();
  } else if (interaction === 'actioned') {
    record.status = 'actioned';
    record.actionedAt = new Date();
    record.actionTaken = actionId;
  }

  deliveryRecords.set(messageId, record);

  log.info({ messageId, interaction, actionId }, '📱 Push interaction recorded');
}

/**
 * Get delivery record
 */
export function getDeliveryRecord(messageId: string): PushDeliveryRecord | undefined {
  return deliveryRecords.get(messageId);
}

/**
 * Get user's push delivery history
 */
export function getUserDeliveryRecords(userId: string, limit = 50): PushDeliveryRecord[] {
  return Array.from(deliveryRecords.values())
    .filter((r) => r.userId === userId)
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
    .slice(0, limit);
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clear old delivery records
 */
export function clearOldRecords(maxAgeDays = 30): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  let cleared = 0;
  for (const [id, record] of deliveryRecords) {
    if (record.sentAt < cutoff) {
      deliveryRecords.delete(id);
      cleared++;
    }
  }

  return cleared;
}

/**
 * Clear inactive tokens
 */
export function clearInactiveTokens(maxAgeDays = 90): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  let cleared = 0;
  for (const [userId, tokens] of userTokens) {
    const activeTokens = tokens.filter((t) => t.lastUsedAt >= cutoff);
    if (activeTokens.length < tokens.length) {
      cleared += tokens.length - activeTokens.length;
      userTokens.set(userId, activeTokens);
    }
  }

  return cleared;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const pushNotifications = {
  initialize: initializePushNotifications,
  isAvailable: isPushNotificationsAvailable,
  registerToken: registerPushToken,
  removeToken: removePushToken,
  getUserTokens,
  hasPushEnabled,
  send: sendPushNotification,
  sendBulk: sendBulkPushNotifications,
  generateNotification: generatePersonaNotification,
  handleInteraction: handlePushInteraction,
  getRecord: getDeliveryRecord,
  getUserRecords: getUserDeliveryRecords,
  clearOldRecords,
  clearInactiveTokens,
};

