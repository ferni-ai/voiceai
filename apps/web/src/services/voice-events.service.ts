/**
 * Voice Events Service
 *
 * Receives real-time events from voice commands via WebSocket.
 * Enables voice-triggered UI changes like theme switching and panel navigation.
 *
 * On Firebase Hosting (no WebSocket proxy), uses SSE/polling over HTTP rewrites
 * and also accepts LiveKit data-channel events when a session is active.
 *
 * @module voice-events.service
 */

import { setTheme, type ThemeName } from '../theme/index.js';
import { apiGet } from '../utils/api.js';
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
let eventSource: EventSource | null = null;
let reconnectAttempts = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let currentUserId: string | null = null;
let isEnabled = true;
let lastPollTimestamp = 0;
const processedEventKeys = new Set<string>();

const RECONNECT_CONFIG = {
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  multiplier: 2,
  maxAttempts: 10,
  jitterMs: 500,
};

const POLL_INTERVAL_MS = 2000;

// ============================================================================
// THEME MAPPING
// ============================================================================

function mapBackendThemeToFrontend(backendTheme: BackendTheme): ThemeName {
  switch (backendTheme) {
    case 'dark':
      return 'midnight';
    case 'light':
      return 'zen';
    case 'auto': {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      return prefersDark ? 'midnight' : 'zen';
    }
    default:
      return 'zen';
  }
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

function handleThemeChange(data: ThemeChangeData): void {
  const frontendTheme = mapBackendThemeToFrontend(data.theme);
  log.info(
    { backendTheme: data.theme, frontendTheme, source: data.source },
    'Voice-triggered theme change'
  );
  setTheme(frontendTheme, true);
}

function handleShowView(data: ShowViewData): void {
  const { view, params } = data;
  log.info({ view, params }, 'Voice-triggered panel navigation');

  const panelEventMap: Record<string, string> = {
    'your-story': 'ferni:open-your-story',
    'memory-lane': 'ferni:open-memory-lane',
    history: 'ferni:open-history',
    patterns: 'ferni:open-patterns',
    quiz: 'ferni:open-quiz',
    music: 'ferni:open-music',
    calendar: 'ferni:open-calendar',
    contacts: 'ferni:open-contacts',
    journal: 'ferni:open-journal',
    'year-with-ferni': 'ferni:open-year-with-ferni',
    settings: 'ferni:open-settings',
    'guided-practices': 'ferni:open-practices',
    'household-members': 'ferni:open-household',
    'voice-id': 'ferni:open-voice-id',
    notifications: 'ferni:open-notifications',
    close: 'ferni:close-panel',
  };

  const eventName = panelEventMap[view];

  if (eventName) {
    window.dispatchEvent(new CustomEvent(eventName, { detail: params }));
    log.debug({ view, eventName }, 'Dispatched panel open event');
  } else {
    log.warn({ view }, 'Unknown panel requested via voice');
  }
}

function eventDedupeKey(event: UserEvent): string {
  return `${event.type}:${event.timestamp}:${JSON.stringify(event.data)}`;
}

/**
 * Process a voice user event from any transport (WS, SSE, poll, data channel).
 */
export function processVoiceUserEvent(event: UserEvent): void {
  const key = eventDedupeKey(event);
  if (processedEventKeys.has(key)) {
    return;
  }
  processedEventKeys.add(key);
  if (processedEventKeys.size > 200) {
    const first = processedEventKeys.values().next().value;
    if (first) processedEventKeys.delete(first);
  }

  switch (event.type) {
    case 'welcome':
    case 'subscribed':
      log.debug('Connected to voice events stream');
      break;
    case 'theme_change':
      handleThemeChange(event.data as ThemeChangeData);
      break;
    case 'show_view':
      handleShowView(event.data as ShowViewData);
      break;
    case 'pong':
    case 'heartbeat':
      break;
    default:
      log.debug({ type: event.type }, 'Unknown voice event type');
  }
}

/**
 * Handle LiveKit data-channel messages that carry voice→UI events.
 */
export function handleVoiceEventDataMessage(message: {
  type?: string;
  data?: unknown;
  timestamp?: string;
}): boolean {
  if (!message.type) return false;
  if (message.type !== 'show_view' && message.type !== 'theme_change') {
    return false;
  }

  processVoiceUserEvent({
    type: message.type,
    data: message.data ?? message,
    timestamp: message.timestamp || new Date().toISOString(),
  });
  return true;
}

function handleMessage(event: MessageEvent): void {
  try {
    const message = JSON.parse(event.data) as UserEvent;
    processVoiceUserEvent(message);
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to parse voice event message');
  }
}

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

function scheduleReconnect(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  if (reconnectAttempts >= RECONNECT_CONFIG.maxAttempts) {
    log.warn('Max reconnection attempts reached — falling back to polling');
    startPolling();
    return;
  }

  const delay = getReconnectDelay();
  reconnectAttempts++;

  log.debug(
    `Scheduling voice events reconnect attempt ${reconnectAttempts}/${RECONNECT_CONFIG.maxAttempts} in ${Math.round(delay)}ms`
  );

  reconnectTimeout = setTimeout(() => {
    if (isEnabled && currentUserId) {
      connectToVoiceEvents(currentUserId);
    }
  }, delay);
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

export function connectToVoiceEvents(userId: string): void {
  currentUserId = userId;

  if (isFirebaseHosting()) {
    log.debug('Firebase Hosting — using SSE/polling instead of WebSocket');
    startHttpFallback(userId);
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
  const host = import.meta.env.DEV ? 'localhost:3002' : window.location.host;
  const wsUrl = `${protocol}//${host}/ws/user-events?userId=${encodeURIComponent(userId)}`;

  try {
    wsConnection = new WebSocket(wsUrl);

    wsConnection.onopen = () => {
      log.info('Connected to voice events WebSocket');
      reconnectAttempts = 0;
      stopPolling();
      stopSSE();
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

export function disconnectFromVoiceEvents(): void {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  reconnectAttempts = 0;
  currentUserId = null;
  stopPolling();
  stopSSE();

  if (wsConnection) {
    wsConnection.close();
    wsConnection = null;
    log.debug('Disconnected from voice events stream');
  }
}

// ============================================================================
// SSE + POLLING (Firebase Hosting fallback)
// ============================================================================

function startSSE(userId: string): boolean {
  if (typeof EventSource === 'undefined') {
    return false;
  }

  stopSSE();

  try {
    const url = `/api/user-events/stream?userId=${encodeURIComponent(userId)}`;
    eventSource = new EventSource(url);

    eventSource.onopen = () => {
      log.info('Connected to voice events SSE');
      reconnectAttempts = 0;
      stopPolling();
    };

    eventSource.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as UserEvent;
        processVoiceUserEvent(message);
        if (message.timestamp) {
          lastPollTimestamp = Math.max(lastPollTimestamp, Date.parse(message.timestamp) || 0);
        }
      } catch (err) {
        log.warn({ error: String(err) }, 'Failed to parse SSE voice event');
      }
    };

    eventSource.addEventListener('user_event', (event) => {
      try {
        const message = JSON.parse((event as MessageEvent).data) as UserEvent;
        processVoiceUserEvent(message);
      } catch (err) {
        log.warn({ error: String(err) }, 'Failed to parse SSE user_event');
      }
    });

    eventSource.onerror = () => {
      log.warn('Voice events SSE error — falling back to polling');
      stopSSE();
      startPolling();
    };

    return true;
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to start voice events SSE');
    return false;
  }
}

function stopSSE(): void {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

async function pollForEvents(): Promise<void> {
  if (!currentUserId) return;

  try {
    const since = lastPollTimestamp || Date.now() - 30_000;
    const response = await apiGet<{ events?: UserEvent[] }>(
      `/api/user-events/pending?userId=${encodeURIComponent(currentUserId)}&since=${since}`
    );

    if (!response.ok || !response.data) return;

    const events = response.data.events || [];
    for (const event of events) {
      processVoiceUserEvent(event);
      const ts = Date.parse(event.timestamp);
      if (!Number.isNaN(ts)) {
        lastPollTimestamp = Math.max(lastPollTimestamp, ts);
      }
    }

    if (events.length === 0 && lastPollTimestamp === 0) {
      lastPollTimestamp = Date.now();
    }
  } catch (err) {
    log.debug({ error: String(err) }, 'Failed to poll voice events');
  }
}

function startPolling(): void {
  if (pollingInterval) {
    log.debug('Voice events polling already active');
    return;
  }

  pollingInterval = setInterval(() => {
    void pollForEvents();
  }, POLL_INTERVAL_MS);

  void pollForEvents();
  log.info('Started voice events polling');
}

function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    log.info('Stopped voice events polling');
  }
}

function startHttpFallback(userId: string): void {
  currentUserId = userId;
  lastPollTimestamp = Date.now();
  // EventSource cannot send Authorization headers; use authenticated polling
  // (same pattern as journal-sync / cross-team notifications on Firebase Hosting)
  startPolling();
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function setVoiceEventsEnabled(enabled: boolean): void {
  isEnabled = enabled;

  if (!enabled) {
    disconnectFromVoiceEvents();
  }
}

export function initVoiceEvents(userId: string): void {
  if (!userId) {
    log.warn('No userId provided, voice events disabled');
    return;
  }

  if (isFirebaseHosting()) {
    log.info('Firebase Hosting detected — using SSE/polling for voice events');
    startHttpFallback(userId);
  } else {
    connectToVoiceEvents(userId);
  }

  log.info('Voice events initialized');
}

export function disposeVoiceEvents(): void {
  disconnectFromVoiceEvents();
  setVoiceEventsEnabled(false);
  processedEventKeys.clear();
  log.debug('Voice events disposed');
}

export function getVoiceEventsState(): {
  isEnabled: boolean;
  isConnected: boolean;
  userId: string | null;
  reconnectAttempts: number;
  reconnectPending: boolean;
  usingPolling: boolean;
  usingSSE: boolean;
} {
  const sseOpen =
    typeof EventSource !== 'undefined' &&
    eventSource !== null &&
    eventSource.readyState === EventSource.OPEN;

  return {
    isEnabled,
    isConnected: wsConnection?.readyState === WebSocket.OPEN || sseOpen,
    userId: currentUserId,
    reconnectAttempts,
    reconnectPending: reconnectTimeout !== null,
    usingPolling: pollingInterval !== null,
    usingSSE: eventSource !== null,
  };
}
