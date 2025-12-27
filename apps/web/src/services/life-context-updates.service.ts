/**
 * Life Context Updates Service
 *
 * Real-time life context updates for the Phase 6 dashboard.
 * Uses WebSocket with polling fallback for Firebase Hosting.
 *
 * @module LifeContextUpdatesService
 */

import { updateLifeContextDashboard, setLifeContextLoading, setLifeContextError } from '../ui/life-context-dashboard.ui.js';
import { getApiHeadersAsync } from '../utils/api-helpers.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('LifeContextUpdates');

// ============================================================================
// TYPES
// ============================================================================

export interface LifeContextSnapshot {
  overallLoadScore: number;
  wellbeingScore: number;
  stressIndicators: Array<{
    domain: string;
    stressLevel: number;
    reason: string;
    sourcePersona: string;
  }>;
  patterns: Array<{
    description: string;
    domains: string[];
    impact: 'positive' | 'negative' | 'neutral';
  }>;
  createdAt: string;
}

export interface SynthesisTrigger {
  id: string;
  category: string;
  suggestedResponse: string;
  reasoning: string;
  confidence: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  contributingDomains: string[];
  recommendedPersona: string;
}

// ============================================================================
// DATA MAPPING HELPERS
// ============================================================================

/**
 * Map backend pattern to frontend CrossDomainPattern type
 */
function mapPatternToFrontend(pattern: {
  description: string;
  domains: string[];
  impact: 'positive' | 'negative' | 'neutral';
}): { pattern: string; severity: 'low' | 'medium' | 'high'; domains: string[]; insight: string } {
  // Map impact to severity
  const severityMap: Record<string, 'low' | 'medium' | 'high'> = {
    positive: 'low',
    neutral: 'medium',
    negative: 'high',
  };

  return {
    pattern: pattern.description,
    severity: severityMap[pattern.impact] || 'medium',
    domains: pattern.domains,
    insight: pattern.description, // Use description as insight
  };
}

/**
 * Map backend trigger to frontend SynthesisTrigger type
 */
function mapTriggerToFrontend(trigger: SynthesisTrigger): {
  id: string;
  category: 'support' | 'celebration' | 'warning' | 'connection' | 'rest';
  priority: 'urgent' | 'high' | 'medium' | 'low';
  confidence: number;
  message: string;
  suggestedResponse: string;
  recommendedPersona?: string;
} {
  return {
    id: trigger.id,
    category: trigger.category as 'support' | 'celebration' | 'warning' | 'connection' | 'rest',
    priority: trigger.priority,
    confidence: trigger.confidence,
    message: trigger.suggestedResponse,
    suggestedResponse: trigger.suggestedResponse,
    recommendedPersona: trigger.recommendedPersona,
  };
}

/**
 * Map backend snapshot to frontend LifeContextSnapshot type
 */
function mapSnapshotToFrontend(
  userId: string,
  snapshot: LifeContextSnapshot,
  triggers: SynthesisTrigger[]
): {
  userId: string;
  timestamp: Date;
  stressIndicators: LifeContextSnapshot['stressIndicators'];
  patterns: Array<{ pattern: string; severity: 'low' | 'medium' | 'high'; domains: string[]; insight: string }>;
  overallLoadScore: number;
  wellbeingScore: number;
  triggers: Array<{
    id: string;
    category: 'support' | 'celebration' | 'warning' | 'connection' | 'rest';
    priority: 'urgent' | 'high' | 'medium' | 'low';
    confidence: number;
    message: string;
    suggestedResponse: string;
    recommendedPersona?: string;
  }>;
} {
  return {
    userId,
    timestamp: new Date(snapshot.createdAt),
    stressIndicators: snapshot.stressIndicators,
    patterns: snapshot.patterns.map(mapPatternToFrontend),
    overallLoadScore: snapshot.overallLoadScore,
    wellbeingScore: snapshot.wellbeingScore,
    triggers: triggers.map(mapTriggerToFrontend),
  };
}

interface LifeContextUpdateEvent {
  type: 'context_update' | 'trigger_alert' | 'scan_complete' | 'heartbeat';
  userId: string;
  snapshot?: LifeContextSnapshot;
  trigger?: SynthesisTrigger;
  triggers?: SynthesisTrigger[];
  timestamp: number;
  scanDuration?: number;
}

// ============================================================================
// STATE
// ============================================================================

let isEnabled = true;
let wsConnection: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let currentUserId: string | null = null;
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let lastSnapshot: LifeContextSnapshot | null = null;
let lastTriggers: SynthesisTrigger[] = [];

// Exponential backoff configuration
const RECONNECT_CONFIG = {
  initialDelayMs: 2000,     // 2 seconds
  maxDelayMs: 120000,       // 2 minutes max
  multiplier: 2,
  maxAttempts: 8,
  jitterMs: 1000,
};

// ============================================================================
// WEBSOCKET CONNECTION
// ============================================================================

function getReconnectDelay(): number {
  const baseDelay = Math.min(
    RECONNECT_CONFIG.initialDelayMs * Math.pow(RECONNECT_CONFIG.multiplier, reconnectAttempts),
    RECONNECT_CONFIG.maxDelayMs
  );
  const jitter = Math.random() * RECONNECT_CONFIG.jitterMs;
  return baseDelay + jitter;
}

function scheduleReconnect(userId: string): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (reconnectAttempts >= RECONNECT_CONFIG.maxAttempts) {
    log.warn('Max reconnection attempts reached, falling back to polling');
    startPolling(userId);
    return;
  }

  const delay = getReconnectDelay();
  reconnectAttempts++;

  log.info(`Scheduling reconnect attempt ${reconnectAttempts}/${RECONNECT_CONFIG.maxAttempts} in ${Math.round(delay)}ms`);

  reconnectTimeout = setTimeout(() => {
    if (isEnabled && currentUserId) {
      connectToLifeContextStream(currentUserId);
    }
  }, delay);
}

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
  const wsUrl = `${protocol}//${window.location.host}/ws/life-context?userId=${userId}`;

  try {
    wsConnection = new WebSocket(wsUrl);

    wsConnection.onopen = () => {
      log.info('Connected to life context WebSocket');
      reconnectAttempts = 0;
      stopPolling();
    };

    wsConnection.onmessage = (event) => {
      try {
        const data: LifeContextUpdateEvent = JSON.parse(event.data);
        handleLifeContextEvent(data);
      } catch (err) {
        log.warn('Failed to parse WebSocket message:', err);
      }
    };

    wsConnection.onerror = (error) => {
      log.warn('WebSocket error:', error);
    };

    wsConnection.onclose = (event) => {
      log.info(`Disconnected from life context WebSocket (code: ${event.code})`);
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

export function disconnectFromLifeContextStream(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  reconnectAttempts = 0;
  currentUserId = null;

  if (wsConnection) {
    wsConnection.close();
    wsConnection = null;
    log.info('Disconnected from life context stream');
  }
}

// ============================================================================
// POLLING FALLBACK
// ============================================================================

async function fetchLifeContext(userId: string): Promise<void> {
  try {
    setLifeContextLoading(true);

    const headers = await getApiHeadersAsync();
    const response = await fetch(`/api/life-context?userId=${userId}`, { headers });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as { snapshot?: LifeContextSnapshot; triggers?: SynthesisTrigger[] };

    if (data.snapshot) {
      lastSnapshot = data.snapshot;
      lastTriggers = data.triggers ?? [];

      // Map backend data to frontend types
      const mappedData = mapSnapshotToFrontend(userId, data.snapshot, lastTriggers);
      updateLifeContextDashboard(mappedData as Parameters<typeof updateLifeContextDashboard>[0]);
    }

    setLifeContextLoading(false);
  } catch (err) {
    log.debug('Failed to fetch life context:', err);
    setLifeContextError('Could not load life context');
    setLifeContextLoading(false);
  }
}

export async function startPolling(userId: string): Promise<void> {
  if (pollingInterval) {
    log.debug('Polling already active');
    return;
  }

  // Initial fetch
  await fetchLifeContext(userId);

  // Poll every 2 minutes
  pollingInterval = setInterval(() => {
    void fetchLifeContext(userId);
  }, 120000);

  log.info('Started life context polling');
}

export function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    log.info('Stopped life context polling');
  }
}

// ============================================================================
// EVENT HANDLING
// ============================================================================

function handleLifeContextEvent(event: LifeContextUpdateEvent): void {
  log.debug({ type: event.type }, 'Received life context event');

  switch (event.type) {
    case 'context_update':
    case 'scan_complete':
      if (event.snapshot) {
        lastSnapshot = event.snapshot;
        lastTriggers = event.triggers || [];

        // Map backend data to frontend types
        const mappedData = mapSnapshotToFrontend(event.userId, event.snapshot, lastTriggers);
        updateLifeContextDashboard(mappedData as Parameters<typeof updateLifeContextDashboard>[0]);
      }
      break;

    case 'trigger_alert':
      if (event.trigger) {
        // Add new trigger to the list and update dashboard
        lastTriggers = [event.trigger, ...lastTriggers].slice(0, 10);

        if (lastSnapshot) {
          // Map backend data to frontend types
          const mappedData = mapSnapshotToFrontend(event.userId, lastSnapshot, lastTriggers);
          updateLifeContextDashboard(mappedData as Parameters<typeof updateLifeContextDashboard>[0]);
        }

        // Log high-priority triggers
        if (event.trigger.priority === 'urgent' || event.trigger.priority === 'high') {
          log.info({ trigger: event.trigger.category, priority: event.trigger.priority }, 'High-priority trigger received');
        }
      }
      break;

    case 'heartbeat':
      // Connection is alive, nothing to do
      break;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

function isFirebaseHosting(): boolean {
  const host = window.location.hostname;
  return (
    host.endsWith('.web.app') ||
    host.endsWith('.firebaseapp.com') ||
    host === 'app.ferni.ai' ||
    host === 'ferni.ai'
  );
}

export function initLifeContextUpdates(userId: string): void {
  if (!userId) {
    log.warn('No userId provided, life context updates disabled');
    return;
  }

  currentUserId = userId;

  // Firebase Hosting doesn't support WebSocket proxying
  if (isFirebaseHosting()) {
    log.info('Firebase Hosting detected - using polling for life context');
    void startPolling(userId);
  } else {
    try {
      connectToLifeContextStream(userId);
    } catch {
      log.info('WebSocket unavailable, using polling');
      void startPolling(userId);
    }
  }

  log.info('Life context updates initialized');
}

export function disposeLifeContextUpdates(): void {
  disconnectFromLifeContextStream();
  stopPolling();
  lastSnapshot = null;
  lastTriggers = [];
  log.info('Life context updates disposed');
}

export function setLifeContextUpdatesEnabled(enabled: boolean): void {
  isEnabled = enabled;
  log.info('Life context updates:', enabled ? 'enabled' : 'disabled');

  if (!enabled) {
    disconnectFromLifeContextStream();
    stopPolling();
  }
}

export function getLastSnapshot(): LifeContextSnapshot | null {
  return lastSnapshot;
}

export function getLastTriggers(): SynthesisTrigger[] {
  return lastTriggers;
}

export async function refreshLifeContext(): Promise<void> {
  if (currentUserId) {
    await fetchLifeContext(currentUserId);
  }
}
