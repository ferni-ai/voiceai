/**
 * Life Context Service
 *
 * Bridges the life context synthesis system with frontend UI.
 * Provides real-time streaming of cross-domain life context updates.
 *
 * Phase 6: Cross-Domain Synthesis - Frontend Integration
 *
 * "Better than Human" - We understand your whole life context and bring
 * insights before you have to ask.
 *
 * @module LifeContextService
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('LifeContext');

// ============================================================================
// TYPES
// ============================================================================

export interface SynthesisTrigger {
  id: string;
  category: 'support' | 'celebration' | 'warning' | 'connection' | 'rest';
  suggestedResponse: string;
  reasoning: string;
  confidence: number;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  contributingDomains: string[];
  recommendedPersona: string;
}

export interface LifeContextSnapshot {
  overallLoadScore: number;
  wellbeingScore: number;
  stressIndicators: Array<{
    domain: string;
    stressLevel: number;
    reasons: string[];
  }>;
  patterns: string[];
  createdAt: string;
}

export interface LifeContextUpdate {
  type:
    | 'welcome'
    | 'initial_state'
    | 'update'
    | 'refresh_result'
    | 'heartbeat'
    | 'error'
    | 'unsubscribed';
  userId?: string;
  snapshot?: LifeContextSnapshot;
  triggers?: SynthesisTrigger[];
  trigger?: SynthesisTrigger;
  message?: string;
  timestamp: string;
}

export type LifeContextListener = (update: LifeContextUpdate) => void;

// ============================================================================
// STATE
// ============================================================================

let wsConnection: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let currentUserId: string | null = null;
let isEnabled = true;
let pollingInterval: ReturnType<typeof setInterval> | null = null;

// Listeners for life context updates
const listeners: Set<LifeContextListener> = new Set();

// Current state cache
let currentSnapshot: LifeContextSnapshot | null = null;
let currentTriggers: SynthesisTrigger[] = [];

// Exponential backoff configuration
const RECONNECT_CONFIG = {
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  maxAttempts: 10,
  jitterMs: 500,
};

// ============================================================================
// LISTENER MANAGEMENT
// ============================================================================

/**
 * Subscribe to life context updates
 */
export function subscribeToLifeContext(listener: LifeContextListener): () => void {
  listeners.add(listener);

  // Send current state immediately if available
  if (currentSnapshot) {
    listener({
      type: 'initial_state',
      userId: currentUserId ?? undefined,
      snapshot: currentSnapshot,
      triggers: currentTriggers,
      timestamp: new Date().toISOString(),
    });
  }

  // Return unsubscribe function
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Notify all listeners of an update
 */
function notifyListeners(update: LifeContextUpdate): void {
  listeners.forEach((listener) => {
    try {
      listener(update);
    } catch (err) {
      log.warn('Listener error:', err);
    }
  });
}

// ============================================================================
// WEBSOCKET CONNECTION
// ============================================================================

/**
 * Calculate reconnection delay with exponential backoff and jitter
 */
function getReconnectDelay(): number {
  const baseDelay = Math.min(
    RECONNECT_CONFIG.initialDelayMs * Math.pow(RECONNECT_CONFIG.multiplier, reconnectAttempts),
    RECONNECT_CONFIG.maxDelayMs
  );
  const jitter = Math.random() * RECONNECT_CONFIG.jitterMs;
  return baseDelay + jitter;
}

/**
 * Schedule a reconnection attempt
 */
function scheduleReconnect(userId: string): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (reconnectAttempts >= RECONNECT_CONFIG.maxAttempts) {
    log.warn('Max reconnection attempts reached, falling back to polling');
    startLifeContextPolling(userId);
    return;
  }

  const delay = getReconnectDelay();
  reconnectAttempts++;

  log.info(
    `Scheduling reconnect attempt ${reconnectAttempts}/${RECONNECT_CONFIG.maxAttempts} in ${Math.round(delay)}ms`
  );

  reconnectTimeout = setTimeout(() => {
    if (isEnabled && currentUserId) {
      connectToLifeContextStream(currentUserId);
    }
  }, delay);
}

/**
 * Connect to the life context WebSocket for real-time updates
 */
export function connectToLifeContextStream(userId: string): void {
  currentUserId = userId;

  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    log.debug('Already connected to life context stream');
    return;
  }

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/life-context`;

  try {
    wsConnection = new WebSocket(wsUrl);

    wsConnection.onopen = () => {
      log.info('Connected to life context WebSocket');
      reconnectAttempts = 0;
      stopLifeContextPolling();

      // Subscribe to updates for this user
      wsConnection?.send(JSON.stringify({ type: 'subscribe', userId }));
    };

    wsConnection.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as LifeContextUpdate;

        // Update cached state
        if (data.snapshot) {
          currentSnapshot = data.snapshot;
        }
        if (data.triggers) {
          currentTriggers = data.triggers;
        }

        // Notify listeners
        notifyListeners(data);

        // Log significant updates
        if (data.type === 'update' || data.type === 'initial_state') {
          log.debug('Life context update received', {
            loadScore: data.snapshot?.overallLoadScore,
            wellbeing: data.snapshot?.wellbeingScore,
            triggers: data.triggers?.length ?? 0,
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
      log.info(
        `Disconnected from life context WebSocket (code: ${event.code}, reason: ${event.reason ?? 'none'})`
      );
      wsConnection = null;

      if (isEnabled && currentUserId) {
        scheduleReconnect(currentUserId);
      }
    };
  } catch (err) {
    log.error('Failed to connect to life context WebSocket:', err);
    if (isEnabled && userId) {
      scheduleReconnect(userId);
    }
  }
}

/**
 * Disconnect from the life context WebSocket
 */
export function disconnectFromLifeContextStream(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  reconnectAttempts = 0;
  currentUserId = null;

  if (wsConnection) {
    // Unsubscribe before closing
    try {
      wsConnection.send(JSON.stringify({ type: 'unsubscribe' }));
    } catch {
      // Ignore errors on unsubscribe
    }
    wsConnection.close();
    wsConnection = null;
    log.info('Disconnected from life context stream');
  }
}

/**
 * Request a fresh life context scan
 */
export function requestLifeContextRefresh(): void {
  if (wsConnection?.readyState === WebSocket.OPEN && currentUserId) {
    wsConnection.send(JSON.stringify({ type: 'refresh', userId: currentUserId }));
    log.debug('Requested life context refresh');
  } else {
    log.warn('Cannot refresh - not connected');
  }
}

// ============================================================================
// POLLING FALLBACK
// ============================================================================

/**
 * Start polling for life context (fallback if WebSocket unavailable)
 */
export async function startLifeContextPolling(userId: string): Promise<void> {
  if (pollingInterval) {
    log.debug('Polling already active');
    return;
  }

  const pollForContext = async () => {
    try {
      const response = await fetch(`/api/life-context?userId=${userId}`);
      if (!response.ok) return;

      const data = (await response.json()) as { snapshot?: LifeContextSnapshot; triggers?: SynthesisTrigger[] };

      if (data.snapshot) {
        currentSnapshot = data.snapshot;
        currentTriggers = data.triggers ?? [];

        notifyListeners({
          type: 'update',
          userId,
          snapshot: data.snapshot,
          triggers: data.triggers ?? [],
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      log.debug('Failed to poll life context:', err);
    }
  };

  // Poll every 2 minutes
  pollingInterval = setInterval(pollForContext, 120000);

  // Do initial poll
  await pollForContext();
  log.info('Started life context polling');
}

/**
 * Stop polling for life context
 */
export function stopLifeContextPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    log.info('Stopped life context polling');
  }
}

// ============================================================================
// STATE ACCESSORS
// ============================================================================

/**
 * Get current life context snapshot (cached)
 */
export function getCurrentSnapshot(): LifeContextSnapshot | null {
  return currentSnapshot;
}

/**
 * Get current synthesis triggers (cached)
 */
export function getCurrentTriggers(): SynthesisTrigger[] {
  return currentTriggers;
}

/**
 * Get the highest priority trigger
 */
export function getTopTrigger(): SynthesisTrigger | null {
  if (currentTriggers.length === 0) return null;

  const priorityOrder: Record<string, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return [...currentTriggers].sort((a, b) => {
    const pDiff = (priorityOrder[a.priority] ?? 99) - (priorityOrder[b.priority] ?? 99);
    if (pDiff !== 0) return pDiff;
    return b.confidence - a.confidence;
  })[0] ?? null;
}

/**
 * Get connection state
 */
export function getLifeContextState(): {
  isConnected: boolean;
  isEnabled: boolean;
  userId: string | null;
  hasSnapshot: boolean;
  triggerCount: number;
  reconnectAttempts: number;
} {
  return {
    isConnected: wsConnection?.readyState === WebSocket.OPEN,
    isEnabled,
    userId: currentUserId,
    hasSnapshot: currentSnapshot !== null,
    triggerCount: currentTriggers.length,
    reconnectAttempts,
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Enable/disable life context service
 */
export function setLifeContextEnabled(enabled: boolean): void {
  isEnabled = enabled;
  log.info('Life context service:', enabled ? 'enabled' : 'disabled');

  if (!enabled) {
    disconnectFromLifeContextStream();
    stopLifeContextPolling();
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Check if we're running on Firebase Hosting
 */
function isFirebaseHosting(): boolean {
  const host = window.location.hostname;
  return (
    host.endsWith('.web.app') ||
    host.endsWith('.firebaseapp.com') ||
    host === 'app.ferni.ai' ||
    host === 'ferni.ai'
  );
}

/**
 * Initialize life context service
 */
export function initLifeContext(userId: string): void {
  if (!userId) {
    log.warn('No userId provided, life context service disabled');
    return;
  }

  currentUserId = userId;

  // Firebase Hosting doesn't support WebSocket proxying
  if (isFirebaseHosting()) {
    log.info('Firebase Hosting detected - using polling for life context');
    startLifeContextPolling(userId);
  } else {
    try {
      connectToLifeContextStream(userId);
    } catch {
      log.info('WebSocket unavailable, using polling');
      startLifeContextPolling(userId);
    }
  }

  log.info('Life context service initialized');
}

/**
 * Cleanup life context service
 */
export function disposeLifeContext(): void {
  disconnectFromLifeContextStream();
  stopLifeContextPolling();
  listeners.clear();
  currentSnapshot = null;
  currentTriggers = [];
  log.info('Life context service disposed');
}
