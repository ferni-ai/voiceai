/**
 * Journal Sync Service
 *
 * Real-time synchronization of journal entries across devices.
 * Uses WebSocket for real-time updates with polling fallback.
 *
 * @module JournalSyncService
 */

import { createLogger } from '../utils/logger.js';
import { getApiHeadersAsync } from '../utils/api-helpers.js';

const log = createLogger('JournalSync');

// ============================================================================
// TYPES
// ============================================================================

export interface JournalSyncEvent {
  type: 'entry_added' | 'entry_deleted' | 'entry_updated' | 'sync_complete';
  agentId: string;
  entryId?: string;
  entry?: JournalEntrySync;
  timestamp: Date;
}

export interface JournalEntrySync {
  id: string;
  content: string;
  mood?: string;
  audioUrl?: string;
  createdAt: string;
  source?: string;
  momentType?: string;
}

export type JournalSyncCallback = (event: JournalSyncEvent) => void;

// ============================================================================
// STATE
// ============================================================================

let wsConnection: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let currentUserId: string | null = null;
let currentAgentId: string | null = null;
let isEnabled = false;
const subscribers: JournalSyncCallback[] = [];
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let lastSyncTimestamp: number = 0;

// Reconnection configuration
const RECONNECT_CONFIG = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  multiplier: 2,
  maxAttempts: 8,
  jitterMs: 500,
};

// ============================================================================
// HELPERS
// ============================================================================

function getReconnectDelay(): number {
  const baseDelay = Math.min(
    RECONNECT_CONFIG.initialDelayMs * Math.pow(RECONNECT_CONFIG.multiplier, reconnectAttempts),
    RECONNECT_CONFIG.maxDelayMs
  );
  const jitter = Math.random() * RECONNECT_CONFIG.jitterMs;
  return baseDelay + jitter;
}

function isFirebaseHosting(): boolean {
  const host = window.location.hostname;
  return (
    host.endsWith('.web.app') ||
    host.endsWith('.firebaseapp.com') ||
    host === 'app.ferni.ai' ||
    host === 'ferni.ai'
  );
}

function notifySubscribers(event: JournalSyncEvent): void {
  subscribers.forEach((callback) => {
    try {
      callback(event);
    } catch (err) {
      log.warn('Subscriber callback error:', err);
    }
  });
}

// ============================================================================
// WEBSOCKET CONNECTION
// ============================================================================

function scheduleReconnect(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (reconnectAttempts >= RECONNECT_CONFIG.maxAttempts) {
    log.warn('Max reconnection attempts reached, falling back to polling');
    startPolling();
    return;
  }

  const delay = getReconnectDelay();
  reconnectAttempts++;

  log.info(`Scheduling reconnect attempt ${reconnectAttempts}/${RECONNECT_CONFIG.maxAttempts} in ${Math.round(delay)}ms`);

  reconnectTimeout = setTimeout(() => {
    if (isEnabled && currentUserId && currentAgentId) {
      connectWebSocket(currentUserId, currentAgentId);
    }
  }, delay);
}

function connectWebSocket(userId: string, agentId: string): void {
  currentUserId = userId;
  currentAgentId = agentId;

  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    log.debug('Already connected to journal sync WebSocket');
    return;
  }

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = import.meta.env.DEV ? 'localhost:3002' : window.location.host;
  const wsUrl = `${protocol}//${host}/ws/journal-sync?userId=${userId}&agentId=${agentId}`;

  try {
    wsConnection = new WebSocket(wsUrl);

    wsConnection.onopen = () => {
      log.info('Connected to journal sync WebSocket');
      reconnectAttempts = 0;
      stopPolling();
      
      // Request initial sync
      wsConnection?.send(JSON.stringify({ type: 'sync_request', since: lastSyncTimestamp }));
    };

    wsConnection.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'entry_added' || data.type === 'entry_deleted' || data.type === 'entry_updated') {
          const syncEvent: JournalSyncEvent = {
            type: data.type,
            agentId: data.agentId || currentAgentId || '',
            entryId: data.entryId,
            entry: data.entry,
            timestamp: new Date(data.timestamp || Date.now()),
          };
          
          lastSyncTimestamp = Date.now();
          notifySubscribers(syncEvent);
          log.debug('Received sync event:', data.type);
        } else if (data.type === 'sync_complete') {
          notifySubscribers({
            type: 'sync_complete',
            agentId: currentAgentId || '',
            timestamp: new Date(),
          });
        }
      } catch (err) {
        log.warn('Failed to parse WebSocket message:', err);
      }
    };

    wsConnection.onerror = (error) => {
      log.warn('WebSocket error:', error);
    };

    wsConnection.onclose = (event) => {
      log.info(`Disconnected from journal sync WebSocket (code: ${event.code})`);
      wsConnection = null;

      if (isEnabled && currentUserId && currentAgentId) {
        scheduleReconnect();
      }
    };
  } catch (err) {
    log.error('Failed to connect to journal sync WebSocket:', err);
    if (isEnabled) {
      scheduleReconnect();
    }
  }
}

function disconnectWebSocket(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  reconnectAttempts = 0;

  if (wsConnection) {
    wsConnection.close();
    wsConnection = null;
    log.info('Disconnected from journal sync WebSocket');
  }
}

// ============================================================================
// POLLING FALLBACK
// ============================================================================

async function pollForUpdates(): Promise<void> {
  if (!currentUserId || !currentAgentId) return;

  try {
    const headers = await getApiHeadersAsync();
    const url = `/api/custom-agents/${currentAgentId}/memories?type=journalEntry&since=${lastSyncTimestamp}`;
    const response = await fetch(url, { headers });

    if (!response.ok) return;

    const data = await response.json();
    const entries = data.memories || [];

    if (entries.length > 0) {
      lastSyncTimestamp = Date.now();
      
      // Notify about new entries
      entries.forEach((entry: JournalEntrySync) => {
        notifySubscribers({
          type: 'entry_added',
          agentId: currentAgentId || '',
          entryId: entry.id,
          entry,
          timestamp: new Date(entry.createdAt),
        });
      });
    }
  } catch (err) {
    log.debug('Failed to poll for journal updates:', err);
  }
}

function startPolling(): void {
  if (pollingInterval) {
    log.debug('Polling already active');
    return;
  }

  // Poll every 30 seconds
  pollingInterval = setInterval(pollForUpdates, 30000);
  
  // Do initial poll
  void pollForUpdates();
  log.info('Started journal sync polling');
}

function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    log.info('Stopped journal sync polling');
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Subscribe to journal sync events
 */
export function subscribeToJournalSync(callback: JournalSyncCallback): () => void {
  subscribers.push(callback);
  log.debug('Added journal sync subscriber');

  // Return unsubscribe function
  return () => {
    const index = subscribers.indexOf(callback);
    if (index > -1) {
      subscribers.splice(index, 1);
      log.debug('Removed journal sync subscriber');
    }
  };
}

/**
 * Start journal synchronization for a specific agent
 */
export function startJournalSync(userId: string, agentId: string): void {
  if (!userId || !agentId) {
    log.warn('Cannot start journal sync without userId and agentId');
    return;
  }

  isEnabled = true;
  currentUserId = userId;
  currentAgentId = agentId;
  lastSyncTimestamp = Date.now();

  // Firebase Hosting doesn't support WebSocket proxying
  if (isFirebaseHosting()) {
    log.info('Firebase Hosting detected - using polling for journal sync');
    startPolling();
  } else {
    try {
      connectWebSocket(userId, agentId);
    } catch {
      log.info('WebSocket unavailable, using polling');
      startPolling();
    }
  }

  log.info('Journal sync started', { userId, agentId });
}

/**
 * Stop journal synchronization
 */
export function stopJournalSync(): void {
  isEnabled = false;
  disconnectWebSocket();
  stopPolling();
  currentUserId = null;
  currentAgentId = null;
  log.info('Journal sync stopped');
}

/**
 * Notify other clients about a new entry (local action)
 */
export function notifyEntryAdded(entry: JournalEntrySync): void {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify({
      type: 'entry_added',
      agentId: currentAgentId,
      entryId: entry.id,
      entry,
      timestamp: new Date().toISOString(),
    }));
  }
}

/**
 * Notify other clients about a deleted entry (local action)
 */
export function notifyEntryDeleted(entryId: string): void {
  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    wsConnection.send(JSON.stringify({
      type: 'entry_deleted',
      agentId: currentAgentId,
      entryId,
      timestamp: new Date().toISOString(),
    }));
  }
}

/**
 * Get current sync state
 */
export function getJournalSyncState(): {
  isEnabled: boolean;
  isConnected: boolean;
  agentId: string | null;
  lastSync: number;
  subscriberCount: number;
} {
  return {
    isEnabled,
    isConnected: wsConnection?.readyState === WebSocket.OPEN,
    agentId: currentAgentId,
    lastSync: lastSyncTimestamp,
    subscriberCount: subscribers.length,
  };
}




