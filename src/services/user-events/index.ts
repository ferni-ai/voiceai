/**
 * User Events Service
 *
 * Broadcasts real-time events to connected UI clients.
 * Used for voice-to-UI communication like theme changes, navigation, etc.
 *
 * Architecture:
 * - Voice tool calls broadcastUserEvent()
 * - Event published to Redis pub/sub (for multi-instance)
 * - WebSocket servers receive and forward to connected clients
 * - UI clients receive events and update accordingly
 *
 * @module services/user-events
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import { getRedisPubSub, CHANNELS, type PubSubMessage } from '../pubsub/redis-pubsub.js';

const log = createLogger({ module: 'UserEvents' });

// ============================================================================
// TYPES
// ============================================================================

export type Theme = 'light' | 'dark' | 'auto';

export type UserEventType =
  | 'theme_change'
  | 'show_view'
  | 'notification'
  | 'game_state'
  | 'persona_change'
  | 'subscription_update';

export interface UserEvent<T = unknown> {
  type: UserEventType;
  userId: string;
  data: T;
  timestamp: string;
  source: 'voice' | 'system' | 'api';
}

export interface ThemeChangeData {
  theme: Theme;
  source: 'voice' | 'system' | 'api';
}

export interface ShowViewData {
  view: string;
  params?: Record<string, unknown>;
}

// ============================================================================
// WEBSOCKET BROADCAST REGISTRY
// ============================================================================

/**
 * Registry of WebSocket broadcast functions.
 * WebSocket servers register their broadcast functions here.
 */
type BroadcastFn = (userId: string, eventType: string, data: unknown) => void;
const broadcastRegistry = new Set<BroadcastFn>();

/**
 * Register a WebSocket broadcast function.
 * Called by WebSocket servers on startup.
 */
export function registerUserEventBroadcast(fn: BroadcastFn): () => void {
  broadcastRegistry.add(fn);
  log.info({ registrySize: broadcastRegistry.size }, 'User event broadcast registered');
  return () => {
    broadcastRegistry.delete(fn);
    log.info({ registrySize: broadcastRegistry.size }, 'User event broadcast unregistered');
  };
}

// ============================================================================
// EVENT BROADCASTING
// ============================================================================

/**
 * Broadcast a user event to all connected clients for that user.
 * Events are published to Redis for multi-instance support.
 */
export async function broadcastUserEvent<T>(
  userId: string,
  eventType: UserEventType,
  data: T
): Promise<void> {
  const event: UserEvent<T> = {
    type: eventType,
    userId,
    data,
    timestamp: new Date().toISOString(),
    source: 'voice',
  };

  // Broadcast via Redis pub/sub for multi-instance
  try {
    const pubsub = getRedisPubSub();
    await pubsub.publish(CHANNELS.USER_EVENTS, event);
  } catch (error) {
    // Redis might not be available in development
    log.debug({ error: String(error) }, 'Redis broadcast skipped (not available)');
  }

  // Also broadcast directly to local WebSocket connections
  for (const broadcast of broadcastRegistry) {
    try {
      broadcast(userId, eventType, data);
    } catch (error) {
      log.warn({ error: String(error) }, 'WebSocket broadcast failed');
    }
  }

  log.debug({ userId, eventType }, '📡 User event broadcast');
}

// ============================================================================
// THEME PREFERENCES
// ============================================================================

/**
 * Persist theme preference to Firestore.
 */
export async function persistThemePreference(userId: string, theme: Theme): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    log.debug({ userId }, 'Firestore not available, skipping theme persistence');
    return;
  }

  try {
    await db.collection('bogle_users').doc(userId).set(
      {
        preferences: { theme },
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    log.debug({ userId, theme }, '💾 Theme preference persisted');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to persist theme preference');
  }
}

/**
 * Get user's theme preference from Firestore.
 */
export async function getThemePreference(userId: string): Promise<Theme> {
  const db = getFirestoreDb();
  if (!db) {
    return 'auto';
  }

  try {
    const doc = await db.collection('bogle_users').doc(userId).get();
    const data = doc.data();
    return (data?.preferences?.theme as Theme) || 'auto';
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get theme preference');
    return 'auto';
  }
}

// ============================================================================
// REDIS SUBSCRIPTION (for multi-instance)
// ============================================================================

/**
 * Initialize Redis subscription for user events.
 * Call this on server startup.
 */
export async function initUserEventsSubscription(): Promise<void> {
  try {
    const pubsub = getRedisPubSub();
    await pubsub.subscribe(CHANNELS.USER_EVENTS, (message: PubSubMessage<UserEvent>) => {
      const event = message.data;

      // Forward to local WebSocket connections
      for (const broadcast of broadcastRegistry) {
        try {
          broadcast(event.userId, event.type, event.data);
        } catch (error) {
          log.warn({ error: String(error) }, 'WebSocket forward failed');
        }
      }
    });
    log.info('User events Redis subscription initialized');
  } catch (error) {
    log.warn({ error: String(error) }, 'Redis subscription failed (running in standalone mode)');
  }
}
