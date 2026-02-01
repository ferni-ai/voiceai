/**
 * Voice Events Service
 *
 * Receives real-time events from voice commands via WebSocket.
 * Enables voice-triggered UI changes like theme switching.
 *
 * Architecture:
 * - Voice tool calls broadcastUserEvent() on backend
 * - Event published to Redis pub/sub
 * - WebSocket server forwards to connected UI clients
 * - This service receives events and updates UI accordingly
 *
 * @module voice-events.service
 */

import { setTheme, type ThemeName } from '../theme/index.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('VoiceEvents');

// ============================================================================
// TYPES
// ============================================================================

type BackendTheme = 'light' | 'dark' | 'auto';

interface ThemeChangeData {
  theme: BackendTheme;
  source: 'voice' | 'system' | 'api';
}

interface ShowViewData {
  view: string;
  params?: Record<string, unknown>;
}

interface UserEvent<T = unknown> {
  type: string;
  data: T;
  timestamp: string;
}

// ============================================================================
// STATE
// ============================================================================

let wsConnection: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let currentUserId: string | null = null;
let isEnabled = true;

// Exponential backoff configuration
const RECONNECT_CONFIG = {
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  maxAttempts: 10,
  jitterMs: 500,
};

// ============================================================================
// THEME MAPPING
// ============================================================================

/**
 * Map backend theme names to frontend theme names
 * Backend: 'dark' | 'light' | 'auto'
 * Frontend: 'midnight' | 'zen'
 */
function mapBackendThemeToFrontend(backendTheme: BackendTheme): ThemeName {
  switch (backendTheme) {
    case 'dark':
      return 'midnight';
    case 'light':
      return 'zen';
    case 'auto':
      // For auto, check system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'midnight' : 'zen';
    default:
      return 'zen';
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle theme change event from voice
 */
function handleThemeChange(data: ThemeChangeData): void {
  const frontendTheme = mapBackendThemeToFrontend(data.theme);
  log.info({ backendTheme: data.theme, frontendTheme, source: data.source }, 'Voice-triggered theme change');

  // Apply the theme with animation
  setTheme(frontendTheme, true);
}

/**
 * Handle show_view event from voice - opens UI panels/dashboards
 * 
 * Maps panel IDs to custom events that app.ts listens for.
 * This enables voice-activated navigation: "Show me my story", "Open memory lane", etc.
 */
function handleShowView(data: ShowViewData): void {
  const { view, params } = data;
  log.info({ view, params }, 'Voice-triggered panel navigation');

  // Map panel IDs to custom event names
  const panelEventMap: Record<string, string> = {
    'your-story': 'ferni:open-your-story',
    'memory-lane': 'ferni:open-memory-lane',
    'history': 'ferni:open-history',
    'patterns': 'ferni:open-patterns',
    'quiz': 'ferni:open-quiz',
    'music': 'ferni:open-music',
    'calendar': 'ferni:open-calendar',
    'contacts': 'ferni:open-contacts',
    'journal': 'ferni:open-journal',
    'year-with-ferni': 'ferni:open-year-with-ferni',
    'settings': 'ferni:open-settings',
    'guided-practices': 'ferni:open-practices',
    'household-members': 'ferni:open-household',
    'voice-id': 'ferni:open-voice-id',
    'notifications': 'ferni:open-notifications',
    'close': 'ferni:close-panel',
  };

  const eventName = panelEventMap[view];
  
  if (eventName) {
    // Dispatch custom event that app.ts will handle
    window.dispatchEvent(new CustomEvent(eventName, { detail: params }));
    log.debug({ view, eventName }, 'Dispatched panel open event');
  } else {
    log.warn({ view }, 'Unknown panel requested via voice');
  }
}

/**
 * Handle incoming WebSocket message
 */
function handleMessage(event: MessageEvent): void {
  try {
    const message = JSON.parse(event.data) as UserEvent;

    switch (message.type) {
      case 'welcome':
        log.debug('Connected to voice events stream');
        break;

      case 'subscribed':
        log.debug('Subscribed to voice events');
        break;

      case 'theme_change':
        handleThemeChange(message.data as ThemeChangeData);
        break;

      case 'show_view':
        handleShowView(message.data as ShowViewData);
        break;

      case 'pong':
      case 'heartbeat':
        // Ignore heartbeat responses
        break;

      default:
        log.debug({ type: message.type }, 'Unknown voice event type');
    }
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to parse voice event message');
  }
}

// ============================================================================
// WEBSOCKET CONNECTION
// ============================================================================

/**
 * Calculate reconnection delay with exponential backoff
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
function scheduleReconnect(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (reconnectAttempts >= RECONNECT_CONFIG.maxAttempts) {
    log.warn('Max reconnection attempts reached for voice events');
    return;
  }

  const delay = getReconnectDelay();
  reconnectAttempts++;

  log.debug(`Scheduling voice events reconnect attempt ${reconnectAttempts}/${RECONNECT_CONFIG.maxAttempts} in ${Math.round(delay)}ms`);

  reconnectTimeout = setTimeout(() => {
    if (isEnabled && currentUserId) {
      connectToVoiceEvents(currentUserId);
    }
  }, delay);
}

/**
 * Check if we're running on Firebase Hosting (production)
 * Firebase Hosting doesn't support WebSocket proxying
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
 * Connect to the voice events WebSocket
 */
export function connectToVoiceEvents(userId: string): void {
  currentUserId = userId;

  // Firebase Hosting doesn't support WebSocket - skip connection
  if (isFirebaseHosting()) {
    log.debug('Firebase Hosting detected - voice events WebSocket not available');
    return;
  }

  if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
    log.debug('Already connected to voice events stream');
    return;
  }

  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // In development, connect directly to UI server (port 3002) to bypass Vite proxy
  const host = import.meta.env.DEV ? 'localhost:3002' : window.location.host;
  const wsUrl = `${protocol}//${host}/ws/user-events?userId=${encodeURIComponent(userId)}`;

  try {
    wsConnection = new WebSocket(wsUrl);

    wsConnection.onopen = () => {
      log.info('Connected to voice events WebSocket');
      reconnectAttempts = 0;
    };

    wsConnection.onmessage = handleMessage;

    wsConnection.onerror = (error) => {
      log.warn({ error: String(error) }, 'Voice events WebSocket error');
    };

    wsConnection.onclose = (event) => {
      log.debug(`Disconnected from voice events (code: ${event.code})`);
      wsConnection = null;

      if (isEnabled && currentUserId) {
        scheduleReconnect();
      }
    };
  } catch (err) {
    log.error({ error: String(err) }, 'Failed to connect to voice events WebSocket');
    if (isEnabled && userId) {
      scheduleReconnect();
    }
  }
}

/**
 * Disconnect from voice events WebSocket
 */
export function disconnectFromVoiceEvents(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  reconnectAttempts = 0;
  currentUserId = null;

  if (wsConnection) {
    wsConnection.close();
    wsConnection = null;
    log.debug('Disconnected from voice events stream');
  }
}

/**
 * Enable/disable voice events
 */
export function setVoiceEventsEnabled(enabled: boolean): void {
  isEnabled = enabled;

  if (!enabled) {
    disconnectFromVoiceEvents();
  }
}

/**
 * Initialize voice events for a user
 */
export function initVoiceEvents(userId: string): void {
  if (!userId) {
    log.warn('No userId provided, voice events disabled');
    return;
  }

  // Don't connect on Firebase Hosting (no WebSocket support)
  if (isFirebaseHosting()) {
    log.info('Firebase Hosting detected - voice events will not be available');
    return;
  }

  connectToVoiceEvents(userId);
  log.info('Voice events initialized');
}

/**
 * Cleanup voice events
 */
export function disposeVoiceEvents(): void {
  disconnectFromVoiceEvents();
  setVoiceEventsEnabled(false);
  log.debug('Voice events disposed');
}

/**
 * Get current connection state (for debugging)
 */
export function getVoiceEventsState(): {
  isEnabled: boolean;
  isConnected: boolean;
  userId: string | null;
  reconnectAttempts: number;
  reconnectPending: boolean;
} {
  return {
    isEnabled,
    isConnected: wsConnection?.readyState === WebSocket.OPEN,
    userId: currentUserId,
    reconnectAttempts,
    reconnectPending: reconnectTimeout !== null,
  };
}
