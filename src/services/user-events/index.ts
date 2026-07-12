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
import { getRedisPubSub, CHANNELS, type PubSubMessage } from '../redis-pubsub.js';

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

  // Buffer for HTTP poll/SSE clients (Firebase Hosting has no WebSocket proxy)
  bufferPendingEvent(event);

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

  // Notify SSE subscribers
  for (const listener of sseListeners) {
    try {
      listener(event);
    } catch (error) {
      log.warn({ error: String(error) }, 'SSE listener failed');
    }
  }

  log.debug({ userId, eventType }, '📡 User event broadcast');
}

// ============================================================================
// PENDING EVENT BUFFER (for poll / SSE on Firebase Hosting)
// ============================================================================

const MAX_PENDING_PER_USER = 30;
const PENDING_TTL_MS = 120_000;
const pendingByUser = new Map<string, UserEvent[]>();

type SSEListener = (event: UserEvent) => void;
const sseListeners = new Set<SSEListener>();

function bufferPendingEvent(event: UserEvent): void {
  const list = pendingByUser.get(event.userId) ?? [];
  list.push(event);
  while (list.length > MAX_PENDING_PER_USER) {
    list.shift();
  }
  pendingByUser.set(event.userId, list);
  pruneExpiredPending(event.userId);
}

function pruneExpiredPending(userId: string): void {
  const list = pendingByUser.get(userId);
  if (!list) return;
  const cutoff = Date.now() - PENDING_TTL_MS;
  const kept = list.filter((e) => Date.parse(e.timestamp) >= cutoff);
  if (kept.length === 0) {
    pendingByUser.delete(userId);
  } else {
    pendingByUser.set(userId, kept);
  }
}

/**
 * Get pending user events since a timestamp (ms or ISO).
 * Used by HTTP polling clients on Firebase Hosting.
 */
export function getPendingUserEvents(userId: string, sinceMs = 0): UserEvent[] {
  pruneExpiredPending(userId);
  const list = pendingByUser.get(userId) ?? [];
  return list.filter((e) => Date.parse(e.timestamp) > sinceMs);
}

/**
 * Subscribe to user events for SSE streams.
 */
export function subscribeUserEventsSSE(listener: SSEListener): () => void {
  sseListeners.add(listener);
  return () => {
    sseListeners.delete(listener);
  };
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

      // Buffer for HTTP poll clients on this instance (Firebase Hosting)
      bufferPendingEvent(event);

      // Forward to local WebSocket connections
      for (const broadcast of broadcastRegistry) {
        try {
          broadcast(event.userId, event.type, event.data);
        } catch (error) {
          log.warn({ error: String(error) }, 'WebSocket forward failed');
        }
      }

      // Notify local SSE subscribers
      for (const listener of sseListeners) {
        try {
          listener(event);
        } catch (error) {
          log.warn({ error: String(error) }, 'SSE forward failed');
        }
      }
    });
    log.info('User events Redis subscription initialized');
  } catch (error) {
    log.warn({ error: String(error) }, 'Redis subscription failed (running in standalone mode)');
  }
}
