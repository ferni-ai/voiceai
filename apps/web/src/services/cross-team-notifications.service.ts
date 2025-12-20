/**
 * Cross-Team Notifications Service
 *
 * Bridges the cross-persona insights system with frontend notifications.
 * Surfaces team intelligence as proactive outreach notifications.
 *
 * "Better than Human" - We notice things across the team and bring them to you
 * before you have to ask.
 *
 * @module CrossTeamNotificationsService
 */

import { showOutreach, type ProactiveOutreachData } from '../ui/proactive-outreach.ui.js';
import { getApiHeadersAsync } from '../utils/api-helpers.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CrossTeamNotifications');

// ============================================================================
// TYPES
// ============================================================================

export interface CrossTeamInsight {
  id: string;
  type: 'celebration' | 'support' | 'coordination' | 'insight' | 'handoff_suggestion';
  sourcePersona: string;
  targetPersona: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  timestamp: Date;
  acknowledged?: boolean;
}

interface NotificationThresholds {
  /** Minimum time between notifications (ms) */
  cooldownMs: number;
  /** Maximum notifications per session */
  maxPerSession: number;
  /** Priority levels to show */
  showPriorities: ('high' | 'medium' | 'low')[];
}

// ============================================================================
// STATE
// ============================================================================

let lastNotificationTime: number = 0;
let notificationCount: number = 0;
let sessionStartTime: number = Date.now();
let isEnabled: boolean = true;
let wsConnection: WebSocket | null = null;
let reconnectAttempts: number = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let currentUserId: string | null = null;

// Exponential backoff configuration
const RECONNECT_CONFIG = {
  initialDelayMs: 1000,     // 1 second
  maxDelayMs: 60000,        // 1 minute max
  multiplier: 2,            // Double each time
  maxAttempts: 10,          // Give up after 10 attempts
  jitterMs: 500,            // Random jitter to prevent thundering herd
};

const DEFAULT_THRESHOLDS: NotificationThresholds = {
  cooldownMs: 60000, // 1 minute between notifications
  maxPerSession: 5,
  showPriorities: ['high', 'medium'],
};

let thresholds = { ...DEFAULT_THRESHOLDS };

// ============================================================================
// PERSONA DISPLAY NAMES
// ============================================================================

const PERSONA_NAMES: Record<string, string> = {
  'ferni': 'Ferni',
  'peter': 'Peter',
  'peter-john': 'Peter',
  'maya': 'Maya',
  'maya-santos': 'Maya',
  'jordan': 'Jordan',
  'jordan-taylor': 'Jordan',
  'alex': 'Alex',
  'alex-chen': 'Alex',
  'nayan': 'Nayan',
  'nayan-patel': 'Nayan',
};

function getPersonaDisplayName(personaId: string): string {
  return PERSONA_NAMES[personaId.toLowerCase()] || personaId;
}

// ============================================================================
// INSIGHT → NOTIFICATION MAPPING
// ============================================================================

function mapInsightToOutreach(insight: CrossTeamInsight): ProactiveOutreachData | null {
  // Check cooldown
  const now = Date.now();
  if (now - lastNotificationTime < thresholds.cooldownMs) {
    log.debug('Notification cooldown active, skipping');
    return null;
  }

  // Check session limit
  if (notificationCount >= thresholds.maxPerSession) {
    log.debug('Session notification limit reached');
    return null;
  }

  // Check priority threshold
  if (!thresholds.showPriorities.includes(insight.priority)) {
    log.debug('Priority below threshold:', insight.priority);
    return null;
  }

  // Map insight type to outreach type
  const outreachType = mapInsightTypeToOutreachType(insight.type);
  
  // Humanize the message
  const humanizedMessage = humanizeInsightMessage(insight);

  return {
    id: insight.id,
    type: outreachType,
    message: humanizedMessage,
    personaId: insight.sourcePersona,
    personaName: getPersonaDisplayName(insight.sourcePersona),
    priority: insight.priority,
    context: `Team insight from ${getPersonaDisplayName(insight.sourcePersona)}`,
  };
}

function mapInsightTypeToOutreachType(
  insightType: CrossTeamInsight['type']
): ProactiveOutreachData['type'] {
  switch (insightType) {
    case 'celebration':
      return 'celebration';
    case 'support':
      return 'thinking_of_you';
    case 'coordination':
      return 'life_event';
    case 'insight':
      return 'growth_reflection';
    case 'handoff_suggestion':
      return 'thinking_of_you';
    default:
      return 'random_warmth';
  }
}

function humanizeInsightMessage(insight: CrossTeamInsight): string {
  const source = getPersonaDisplayName(insight.sourcePersona);
  const target = getPersonaDisplayName(insight.targetPersona);

  // Make the message more conversational
  let message = insight.message;

  // Replace technical terms with human ones
  message = message
    .replace(/detected/gi, 'noticed')
    .replace(/flagged/gi, 'spotted')
    .replace(/triggered/gi, 'came up')
    .replace(/pattern/gi, 'something')
    .replace(/metric/gi, 'thing');

  // Add persona context if not already present
  if (!message.toLowerCase().includes(source.toLowerCase())) {
    if (insight.type === 'celebration') {
      message = `${source} wants to celebrate: ${message}`;
    } else if (insight.type === 'support') {
      message = `${source} noticed something: ${message}`;
    } else if (insight.type === 'handoff_suggestion') {
      message = `${source} thinks ${target} might be able to help: ${message}`;
    }
  }

  return message;
}

// ============================================================================
// NOTIFICATION DISPLAY
// ============================================================================

/**
 * Show a cross-team insight as a notification
 */
export function showCrossTeamNotification(insight: CrossTeamInsight): boolean {
  if (!isEnabled) {
    log.debug('Cross-team notifications disabled');
    return false;
  }

  const outreach = mapInsightToOutreach(insight);
  if (!outreach) {
    return false;
  }

  // Update state
  lastNotificationTime = Date.now();
  notificationCount++;

  // Show the notification
  showOutreach(outreach);
  log.info({ type: insight.type, source: insight.sourcePersona }, '🔔 Showed cross-team notification');

  return true;
}

/**
 * Show multiple insights (will pick the highest priority one)
 */
export function showBestInsight(insights: CrossTeamInsight[]): boolean {
  if (insights.length === 0) return false;

  // Sort by priority and recency
  const sorted = [...insights].sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return showCrossTeamNotification(sorted[0]);
}

// ============================================================================
// WEBSOCKET CONNECTION WITH EXPONENTIAL BACKOFF
// ============================================================================

/**
 * Calculate reconnection delay with exponential backoff and jitter
 */
function getReconnectDelay(): number {
  const baseDelay = Math.min(
    RECONNECT_CONFIG.initialDelayMs * Math.pow(RECONNECT_CONFIG.multiplier, reconnectAttempts),
    RECONNECT_CONFIG.maxDelayMs
  );
  
  // Add random jitter to prevent thundering herd
  const jitter = Math.random() * RECONNECT_CONFIG.jitterMs;
  return baseDelay + jitter;
}

/**
 * Schedule a reconnection attempt
 */
function scheduleReconnect(userId: string): void {
  // Clear any existing timeout
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  // Check if we should give up
  if (reconnectAttempts >= RECONNECT_CONFIG.maxAttempts) {
    log.warn('Max reconnection attempts reached, falling back to polling');
    startInsightsPolling(userId);
    return;
  }

  const delay = getReconnectDelay();
  reconnectAttempts++;
  
  log.info(`Scheduling reconnect attempt ${reconnectAttempts}/${RECONNECT_CONFIG.maxAttempts} in ${Math.round(delay)}ms`);
  
  reconnectTimeout = setTimeout(() => {
    if (isEnabled && currentUserId) {
      connectToInsightsStream(currentUserId);
    }
  }, delay);
}

/**
 * Connect to the insights WebSocket for real-time updates
 */
export function connectToInsightsStream(userId: string): void {
  // Store userId for reconnection
  currentUserId = userId;

  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    log.debug('Already connected to insights stream');
    return;
  }

  // Clear any pending reconnect
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/insights?userId=${userId}`;

  try {
    wsConnection = new WebSocket(wsUrl);

    wsConnection.onopen = () => {
      log.info('Connected to insights WebSocket');
      // Reset reconnection state on successful connection
      reconnectAttempts = 0;
      
      // Stop polling if it was active (we have WebSocket now)
      stopInsightsPolling();
    };

    wsConnection.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'insight' && data.insight) {
          const insight: CrossTeamInsight = {
            id: data.insight.id || `ws-${Date.now()}`,
            type: data.insight.type || 'insight',
            sourcePersona: data.insight.sourcePersona || 'ferni',
            targetPersona: data.insight.targetPersona || 'user',
            message: data.insight.message || '',
            priority: data.insight.priority || 'medium',
            timestamp: new Date(data.insight.timestamp || Date.now()),
            acknowledged: false,
          };

          // Only show if it's new and high priority
          if (insight.priority === 'high' && !insight.acknowledged) {
            showCrossTeamNotification(insight);
          }
        }
      } catch (err) {
        log.warn('Failed to parse WebSocket message:', err);
      }
    };

    wsConnection.onerror = (error) => {
      log.warn('WebSocket error:', error);
    };

    wsConnection.onclose = (event) => {
      log.info(`Disconnected from insights WebSocket (code: ${event.code}, reason: ${event.reason || 'none'})`);
      wsConnection = null;
      
      // Schedule reconnection with exponential backoff
      if (isEnabled && currentUserId) {
        scheduleReconnect(currentUserId);
      }
    };
  } catch (err) {
    log.error('Failed to connect to insights WebSocket:', err);
    // Schedule reconnection even on initial failure
    if (isEnabled && userId) {
      scheduleReconnect(userId);
    }
  }
}

/**
 * Disconnect from the insights WebSocket
 */
export function disconnectFromInsightsStream(): void {
  // Clear any pending reconnect
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  
  // Reset reconnection state
  reconnectAttempts = 0;
  currentUserId = null;
  
  if (wsConnection) {
    wsConnection.close();
    wsConnection = null;
    log.info('Disconnected from insights stream');
  }
}

// ============================================================================
// POLLING FALLBACK
// ============================================================================

let pollingInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start polling for insights (fallback if WebSocket unavailable)
 */
export async function startInsightsPolling(userId: string): Promise<void> {
  if (pollingInterval) {
    log.debug('Polling already active');
    return;
  }

  const pollForInsights = async () => {
    try {
      // Get authenticated headers (includes X-User-Id and Firebase token)
      const headers = await getApiHeadersAsync();
      const response = await fetch(`/api/team-insights?userId=${userId}&limit=5`, { headers });
      if (!response.ok) return;

      const data = await response.json();
      const insights: CrossTeamInsight[] = data.insights || [];

      // Show the best unacknowledged insight
      const unacknowledged = insights.filter(i => !i.acknowledged);
      if (unacknowledged.length > 0) {
        showBestInsight(unacknowledged);
      }
    } catch (err) {
      log.debug('Failed to poll insights:', err);
    }
  };

  // Poll every 2 minutes
  pollingInterval = setInterval(pollForInsights, 120000);
  
  // Do initial poll
  await pollForInsights();
  log.info('Started insights polling');
}

/**
 * Stop polling for insights
 */
export function stopInsightsPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    log.info('Stopped insights polling');
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Enable/disable cross-team notifications
 */
export function setEnabled(enabled: boolean): void {
  isEnabled = enabled;
  log.info('Cross-team notifications:', enabled ? 'enabled' : 'disabled');
  
  if (!enabled) {
    disconnectFromInsightsStream();
    stopInsightsPolling();
  }
}

/**
 * Update notification thresholds
 */
export function setThresholds(newThresholds: Partial<NotificationThresholds>): void {
  thresholds = { ...thresholds, ...newThresholds };
  log.debug('Updated thresholds:', thresholds);
}

/**
 * Reset session counters (call on new session)
 */
export function resetSession(): void {
  notificationCount = 0;
  sessionStartTime = Date.now();
  lastNotificationTime = 0;
  log.debug('Reset session counters');
}

/**
 * Get current state (for debugging)
 */
export function getState(): {
  isEnabled: boolean;
  notificationCount: number;
  sessionDurationMs: number;
  lastNotificationAgo: number;
  wsConnected: boolean;
  reconnectAttempts: number;
  reconnectPending: boolean;
} {
  return {
    isEnabled,
    notificationCount,
    sessionDurationMs: Date.now() - sessionStartTime,
    lastNotificationAgo: lastNotificationTime ? Date.now() - lastNotificationTime : -1,
    wsConnected: wsConnection?.readyState === WebSocket.OPEN,
    reconnectAttempts,
    reconnectPending: reconnectTimeout !== null,
  };
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize cross-team notifications
 */
export function initCrossTeamNotifications(userId: string): void {
  if (!userId) {
    log.warn('No userId provided, cross-team notifications disabled');
    return;
  }

  resetSession();
  
  // Try WebSocket first, fall back to polling
  try {
    connectToInsightsStream(userId);
  } catch {
    log.info('WebSocket unavailable, using polling');
    startInsightsPolling(userId);
  }

  log.info('Cross-team notifications initialized');
}

/**
 * Cleanup cross-team notifications
 */
export function disposeCrossTeamNotifications(): void {
  disconnectFromInsightsStream();
  stopInsightsPolling();
  setEnabled(false);
  log.info('Cross-team notifications disposed');
}

