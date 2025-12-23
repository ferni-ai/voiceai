/**
 * Team Insights UI
 *
 * "Six brilliant minds. One conversation."
 *
 * This component surfaces cross-persona insights from the Ferni team:
 * - Peter's pattern discoveries
 * - Maya's habit health observations
 * - Jordan's milestone updates
 * - Nayan's wisdom nuggets
 * - Alex's communication opportunities
 *
 * The team is always working together behind the scenes. This UI
 * makes that collaboration visible.
 *
 * @module TeamInsightsUI
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { getApiHeadersAsync } from '../utils/api-helpers.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import { toast } from './toast.ui.js';

const log = createLogger('TeamInsightsUI');

// Track timeouts for cleanup
const { clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface TeamInsight {
  id: string;
  source: 'peter' | 'maya' | 'jordan' | 'nayan' | 'alex' | 'ferni' | 'system';
  category:
    | 'financial_pattern'
    | 'habit_pattern'
    | 'goal_progress'
    | 'emotional_state'
    | 'proactive_opportunity'
    | 'wisdom_nugget'
    | 'communication_opportunity';
  summary: string;
  content: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  createdAt: number;
  isNew?: boolean;
}

export interface TeamStatus {
  financialHealth: { budgetOnTrack: boolean; savingsProgress: number };
  habitHealth: { activeHabits: number; totalStreakDays: number; keystoneActive: boolean };
  goalHealth: { activeGoals: number; nearingCompletion: number };
  emotionalContext: string;
  topConcern: string | null;
}

interface TeamInsightsPanelState {
  isOpen: boolean;
  insights: TeamInsight[];
  teamStatus: TeamStatus | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: number | null;
  hasNewInsights: boolean;
}

// ============================================================================
// ICONS (Lucide SVG - 2px stroke, rounded corners)
// ============================================================================

const ICONS = {
  lightbulb: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
    <path d="M9 18h6"/><path d="M10 22h4"/>
  </svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
  </svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
    <path d="M21 3v5h-5"/>
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
    <path d="M8 16H3v5"/>
  </svg>`,
  sparkles: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
  </svg>`,
};

// Persona-specific icons/colors
const PERSONA_STYLES: Record<string, { color: string; icon: string }> = {
  peter: {
    color: 'var(--persona-peter, #3a6b73)',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>`,
  },
  maya: {
    color: 'var(--persona-maya, #a67a6a)',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>`,
  },
  jordan: {
    color: 'var(--persona-jordan, #c4856a)',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  },
  nayan: {
    color: 'var(--persona-nayan, #8a7a6a)',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2"/></svg>`,
  },
  alex: {
    color: 'var(--persona-alex, #5a6b8a)',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
  },
  ferni: {
    color: 'var(--persona-ferni, #4a6741)',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`,
  },
  system: {
    color: 'var(--color-text-secondary)',
    icon: ICONS.lightbulb,
  },
};

// ============================================================================
// STATE
// ============================================================================

const state: TeamInsightsPanelState = {
  isOpen: false,
  insights: [],
  teamStatus: null,
  isLoading: false,
  error: null,
  lastUpdated: null,
  hasNewInsights: false,
};

let panelElement: HTMLElement | null = null;
let isInitialized = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// WEBSOCKET CLIENT
// ============================================================================

let websocket: WebSocket | null = null;
let wsReconnectAttempts = 0;
const WS_MAX_RECONNECT_ATTEMPTS = 5;
const WS_RECONNECT_DELAY_MS = 3000;
let wsReconnectTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Check if WebSocket connections are supported for our backend.
 * Firebase Hosting can't proxy WebSocket connections to Cloud Run,
 * so we skip WebSocket entirely in production and use polling.
 */
function isWebSocketSupported(): boolean {
  // WebSocket isn't supported in browser
  if (!('WebSocket' in window)) return false;

  // In development (localhost), WebSocket works via Vite proxy
  if (window.location.hostname === 'localhost') return true;

  // Firebase Hosting can't proxy WebSockets - use polling instead
  // This includes: app.ferni.ai, ferni-prod.web.app, etc.
  return false;
}

function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // In development, connect directly to UI server (port 3002) to bypass Vite proxy issues
  const isDev = import.meta.env.DEV;
  const host = isDev ? 'localhost:3002' : window.location.host;
  return `${protocol}//${host}/ws/insights`;
}

function connectWebSocket(): void {
  if (websocket?.readyState === WebSocket.OPEN) {
    log.debug('WebSocket already connected');
    return;
  }

  try {
    const url = getWebSocketUrl();
    log.debug({ url }, 'Connecting to insights WebSocket...');
    websocket = new WebSocket(url);

    websocket.onopen = () => {
      log.info('Insights WebSocket connected');
      wsReconnectAttempts = 0;

      // Subscribe to insights for current user
      const userId = getUserIdFromPage();
      if (userId && websocket?.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({ type: 'subscribe', userId }));
      }
    };

    websocket.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as WebSocketMessage;
        handleWebSocketMessage(data);
      } catch (err) {
        log.debug({ error: String(err) }, 'Failed to parse WebSocket message');
      }
    };

    websocket.onclose = (event) => {
      log.debug({ code: event.code, reason: event.reason }, 'WebSocket closed');
      websocket = null;
      scheduleReconnect();
    };

    websocket.onerror = () => {
      log.warn('WebSocket error');
    };
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to create WebSocket connection');
  }
}

function scheduleReconnect(): void {
  if (wsReconnectAttempts >= WS_MAX_RECONNECT_ATTEMPTS) {
    log.warn('Max WebSocket reconnect attempts reached, falling back to polling');
    startPolling();
    return;
  }

  if (wsReconnectTimeout) {
    clearTimeout(wsReconnectTimeout);
  }

  const delay = WS_RECONNECT_DELAY_MS * Math.pow(2, wsReconnectAttempts);
  log.debug({ attempt: wsReconnectAttempts, delay }, 'Scheduling WebSocket reconnect');

  wsReconnectTimeout = setTimeout(() => {
    wsReconnectAttempts++;
    connectWebSocket();
  }, delay);
}

function disconnectWebSocket(): void {
  if (wsReconnectTimeout) {
    clearTimeout(wsReconnectTimeout);
    wsReconnectTimeout = null;
  }

  if (websocket) {
    websocket.onclose = null; // Prevent reconnect on intentional close
    websocket.close();
    websocket = null;
  }
}

interface WebSocketMessage {
  type: 'event' | 'state' | 'heartbeat' | 'pong';
  event?: {
    type: 'new_insight' | 'insight_updated' | 'insight_removed';
    insight: TeamInsight;
  };
  insights?: TeamInsight[];
  teamStatus?: TeamStatus;
  timestamp?: string;
}

function handleWebSocketMessage(message: WebSocketMessage): void {
  switch (message.type) {
    case 'event':
      if (message.event) {
        handleInsightEvent(message.event);
      }
      break;

    case 'state':
      if (message.insights) {
        state.insights = message.insights;
        state.teamStatus = message.teamStatus || null;
        state.lastUpdated = Date.now();
        if (state.isOpen) {
          renderInsightsList();
        }
        updateTriggerBadge();
      }
      break;

    case 'heartbeat':
      // Send pong to keep connection alive
      if (websocket?.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({ type: 'ping' }));
      }
      break;

    case 'pong':
      // Response to our ping, connection is healthy
      break;
  }
}

function handleInsightEvent(event: NonNullable<WebSocketMessage['event']>): void {
  const { type, insight } = event;

  switch (type) {
    case 'new_insight':
      // Add to beginning of list
      state.insights = [{ ...insight, isNew: true }, ...state.insights];
      state.hasNewInsights = true;

      // Show notification for high-priority insights
      if (insight.priority === 'high' || insight.priority === 'critical') {
        showInsightNotification(insight);
      }
      break;

    case 'insight_updated':
      state.insights = state.insights.map((i) => (i.id === insight.id ? insight : i));
      break;

    case 'insight_removed':
      state.insights = state.insights.filter((i) => i.id !== insight.id);
      break;
  }

  if (state.isOpen) {
    renderInsightsList();
  }
  updateTriggerBadge();
}

function getUserIdFromPage(): string | null {
  // Try to get userId from various sources
  const appState = (window as unknown as { appState?: { userId?: string } }).appState;
  if (appState?.userId) return appState.userId;

  // Check localStorage
  const storedUser = localStorage.getItem('ferni_user');
  if (storedUser) {
    try {
      const userData = JSON.parse(storedUser) as { id?: string };
      if (userData.id) return userData.id;
    } catch {
      // Ignore parse errors
    }
  }

  return null;
}

// ============================================================================
// API
// ============================================================================

async function fetchTeamInsights(): Promise<{ insights: TeamInsight[]; teamStatus: TeamStatus }> {
  try {
    // Get authenticated headers (includes X-User-Id and Firebase token)
    const headers = await getApiHeadersAsync();
    
    const response = await fetch('/api/team-insights', {
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch insights: ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to fetch team insights');
    // Return empty data on error
    return {
      insights: [],
      teamStatus: {
        financialHealth: { budgetOnTrack: true, savingsProgress: 0 },
        habitHealth: { activeHabits: 0, totalStreakDays: 0, keystoneActive: false },
        goalHealth: { activeGoals: 0, nearingCompletion: 0 },
        emotionalContext: 'unknown',
        topConcern: null,
      },
    };
  }
}

// ============================================================================
// PANEL CREATION
// ============================================================================

function createPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'team-insights-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'team-insights-title');
  panel.setAttribute('aria-hidden', 'true');

  panel.innerHTML = `
    <div class="team-insights-backdrop"></div>
    <div class="team-insights-content">
      <header class="team-insights-header">
        <div class="team-insights-header-left">
          <span class="team-insights-icon">${ICONS.users}</span>
          <div>
            <p class="team-insights-eyebrow">TEAM INTELLIGENCE</p>
            <h2 id="team-insights-title" class="team-insights-title">What We Notice</h2>
          </div>
        </div>
        <div class="team-insights-header-actions" role="button" tabindex="0">
          <button class="team-insights-refresh" aria-label="Refresh insights">
            ${ICONS.refresh}
          </button>
          <button class="team-insights-close" aria-label="Close panel">
            ${ICONS.close}
          </button>
        </div>
      </header>
      
      <div class="team-insights-body">
        <div class="team-insights-loading">
          <div class="team-insights-spinner"></div>
          <p>Gathering insights from the team...</p>
        </div>
        
        <div class="team-insights-error" style="display: none;">
          <p>Couldn't load insights right now. The team is still here.</p>
        </div>
        
        <div class="team-insights-list" style="display: none;"></div>
        
        <div class="team-insights-empty" style="display: none;">
          <span class="empty-icon">${ICONS.sparkles}</span>
          <p>No new insights right now.</p>
          <p class="team-insights-subtext">The team is always watching out for you.</p>
        </div>
      </div>
      
      <footer class="team-insights-footer">
        <p class="team-insights-footer-text">Six minds, one purpose: helping you grow.</p>
      </footer>
    </div>
  `;

  // Event listeners
  const backdrop = panel.querySelector('.team-insights-backdrop') as HTMLElement;
  const closeBtn = panel.querySelector('.team-insights-close') as HTMLButtonElement;
  const refreshBtn = panel.querySelector('.team-insights-refresh') as HTMLButtonElement;

  backdrop?.addEventListener('click', () => closePanel());
  closeBtn?.addEventListener('click', () => closePanel());
  refreshBtn?.addEventListener('click', () => void refreshInsights());

  return panel;
}

// Trigger button removed - now integrated into engagement-trigger.ui.ts

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

function renderInsightsList(): void {
  if (!panelElement) return;

  const listEl = panelElement.querySelector('.team-insights-list') as HTMLElement;
  const loadingEl = panelElement.querySelector('.team-insights-loading') as HTMLElement;
  const errorEl = panelElement.querySelector('.team-insights-error') as HTMLElement;
  const emptyEl = panelElement.querySelector('.team-insights-empty') as HTMLElement;

  // Hide all states first
  loadingEl.style.display = 'none';
  errorEl.style.display = 'none';
  emptyEl.style.display = 'none';
  listEl.style.display = 'none';

  if (state.isLoading) {
    loadingEl.style.display = 'flex';
    return;
  }

  if (state.error) {
    errorEl.style.display = 'flex';
    return;
  }

  if (state.insights.length === 0) {
    emptyEl.style.display = 'flex';
    return;
  }

  // Render insights
  listEl.style.display = 'flex';
  listEl.innerHTML = state.insights
    .map((insight) => {
      const style = PERSONA_STYLES[insight.source] || PERSONA_STYLES.system;
      const priorityClass = insight.priority === 'high' || insight.priority === 'critical' 
        ? 'insight-high-priority' 
        : '';
      const newClass = insight.isNew ? 'insight-new' : '';

      return `
        <article class="team-insight-card ${priorityClass} ${newClass}" data-insight-id="${insight.id}">
          <div class="insight-source" style="color: ${style.color}">
            <span class="insight-source-icon">${style.icon}</span>
            <span class="insight-source-name">${capitalize(insight.source)}</span>
          </div>
          <h3 class="insight-summary">${escapeHtml(insight.summary)}</h3>
          <p class="insight-content">${escapeHtml(insight.content)}</p>
          <time class="insight-time">${formatRelativeTime(insight.createdAt)}</time>
        </article>
      `;
    })
    .join('');
}

function updateTriggerBadge(): void {
  // Trigger badge is now managed by engagement-trigger.ui.ts
  // This function updates the badge via custom event
  if (state.hasNewInsights) {
    document.dispatchEvent(new CustomEvent('ferni:team-insights-badge', {
      detail: { count: state.insights.filter(i => i.isNew).length || 1 }
    }));
  } else {
    document.dispatchEvent(new CustomEvent('ferni:team-insights-badge', {
      detail: { count: 0 }
    }));
  }
}

// ============================================================================
// PANEL CONTROLS
// ============================================================================

function openPanel(): void {
  if (!panelElement) return;

  state.isOpen = true;
  state.hasNewInsights = false;
  updateTriggerBadge();

  panelElement.setAttribute('aria-hidden', 'false');
  panelElement.classList.add('is-open');

  // Load data if stale
  const isStale = !state.lastUpdated || Date.now() - state.lastUpdated > 60000;
  if (isStale) {
    void loadInsights();
  }

  // Focus management
  const closeBtn = panelElement.querySelector('.team-insights-close') as HTMLElement;
  closeBtn?.focus();

  log.debug('Team insights panel opened');
}

function closePanel(): void {
  if (!panelElement) return;

  state.isOpen = false;
  panelElement.setAttribute('aria-hidden', 'true');
  panelElement.classList.remove('is-open');

  // Return focus to the insights trigger button in the engagement triggers
  const insightsBtn = document.getElementById('insightsTriggerBtn');
  insightsBtn?.focus();

  log.debug('Team insights panel closed');
}

function togglePanel(): void {
  if (state.isOpen) {
    closePanel();
  } else {
    openPanel();
  }
}

async function loadInsights(): Promise<void> {
  state.isLoading = true;
  state.error = null;
  renderInsightsList();

  try {
    const data = await fetchTeamInsights();
    state.insights = data.insights;
    state.teamStatus = data.teamStatus;
    state.lastUpdated = Date.now();
    state.isLoading = false;
    renderInsightsList();
  } catch (err) {
    state.error = String(err);
    state.isLoading = false;
    renderInsightsList();
  }
}

async function refreshInsights(): Promise<void> {
  await loadInsights();
  toast.success('Insights updated!');
}

// ============================================================================
// NOTIFICATION SYSTEM
// ============================================================================

/**
 * Show a notification for a high-priority insight
 */
export function showInsightNotification(insight: TeamInsight): void {
  const style = PERSONA_STYLES[insight.source] || PERSONA_STYLES.system;

  // Add to state
  state.insights.unshift(insight);
  state.hasNewInsights = true;
  updateTriggerBadge();

  // Show toast notification
  toast.info(`${capitalize(insight.source)}: ${insight.summary}`);

  log.info({ insightId: insight.id, source: insight.source }, 'Insight notification shown');
}

/**
 * Check for new insights and notify if high priority
 */
export async function checkForNewInsights(): Promise<void> {
  try {
    const data = await fetchTeamInsights();
    const newHighPriority = data.insights.filter(
      (i) =>
        (i.priority === 'high' || i.priority === 'critical') &&
        !state.insights.some((existing) => existing.id === i.id)
    );

    if (newHighPriority.length > 0) {
      state.hasNewInsights = true;
      updateTriggerBadge();

      // Show notification for the most important one
      const mostImportant = newHighPriority[0];
      showInsightNotification(mostImportant);
    }

    state.insights = data.insights;
    state.teamStatus = data.teamStatus;
    state.lastUpdated = Date.now();

    if (state.isOpen) {
      renderInsightsList();
    }
  } catch (err) {
    log.warn({ error: String(err) }, 'Failed to check for new insights');
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function injectStyles(): void {
  if (document.getElementById('team-insights-styles')) return;

  const styleEl = document.createElement('style');
  styleEl.id = 'team-insights-styles';
  styleEl.textContent = `
    /* Trigger button styles removed - now in engagement-trigger.ui.ts */
    
    /* Panel */
    .team-insights-panel {
      position: fixed;
      inset: 0;
      z-index: var(--z-modal, 2100);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      visibility: hidden;
      transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD},
                  visibility ${DURATION.NORMAL}ms ${EASING.STANDARD};
    }
    
    .team-insights-panel.is-open {
      opacity: 1;
      visibility: visible;
    }
    
    .team-insights-backdrop {
      position: absolute;
      inset: 0;
      background: var(--backdrop-medium, rgba(44, 37, 32, 0.4));
      backdrop-filter: blur(20px);
    }
    
    .team-insights-content {
      position: relative;
      width: 90%;
      max-width: clamp(350px, 90vw, 500px);
      max-height: 80vh;
      background: var(--color-bg-elevated, #faf6f0);
      border-radius: var(--radius-2xl, 24px);
      box-shadow: var(--shadow-2xl);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.95);
      transition: transform ${DURATION.NORMAL}ms ${EASING.SPRING};
    }
    
    .team-insights-panel.is-open .team-insights-content {
      transform: scale(1);
    }
    
    /* Header */
    .team-insights-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-lg, 26px);
      border-bottom: 1px solid var(--color-border-subtle);
    }
    
    .team-insights-header-left {
      display: flex;
      align-items: center;
      gap: var(--space-md, 16px);
    }
    
    .team-insights-icon {
      width: 32px;
      height: 32px;
      color: var(--persona-primary, #4a6741);
    }
    
    .team-insights-eyebrow {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--persona-primary, #4a6741);
      margin: 0 0 2px 0;
    }
    
    .team-insights-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }
    
    .team-insights-header-actions {
      display: flex;
      gap: var(--space-sm, 8px);
    }
    
    .team-insights-refresh,
    .team-insights-close {
      width: 36px;
      height: 36px;
      border-radius: var(--radius-full);
      border: none;
      background: transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-text-secondary);
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .team-insights-refresh:hover,
    .team-insights-close:hover {
      background: var(--color-bg-secondary);
      color: var(--color-text-primary);
    }
    
    .team-insights-refresh:focus-visible,
    .team-insights-close:focus-visible {
      outline: 2px solid var(--color-accent-primary);
      outline-offset: 2px;
    }
    
    .team-insights-refresh svg,
    .team-insights-close svg {
      width: 20px;
      height: 20px;
    }
    
    /* Body */
    .team-insights-body {
      flex: 1;
      overflow-y: auto;
      padding: var(--space-lg, 26px);
    }
    
    .team-insights-loading,
    .team-insights-error,
    .team-insights-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: var(--space-xl, 42px);
      color: var(--color-text-secondary);
    }
    
    .team-insights-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--color-border-subtle);
      border-top-color: var(--persona-primary);
      border-radius: var(--radius-full);
      animation: spin 1s linear infinite;
      margin-bottom: var(--space-md);
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .empty-icon {
      width: 48px;
      height: 48px;
      color: var(--persona-primary);
      margin-bottom: var(--space-md);
    }
    
    .team-insights-subtext {
      font-size: 13px;
      color: var(--color-text-muted);
      margin-top: var(--space-xs);
    }
    
    /* Insights List */
    .team-insights-list {
      display: flex;
      flex-direction: column;
      gap: var(--space-md, 16px);
    }
    
    .team-insight-card {
      background: var(--color-bg-secondary);
      border-radius: var(--radius-lg, 16px);
      padding: var(--space-md, 16px);
      transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
    }
    
    .team-insight-card:hover {
      background: var(--color-bg-tertiary);
    }
    
    .team-insight-card.insight-high-priority {
      border-left: 3px solid var(--color-warning, #b8956a);
    }
    
    .team-insight-card.insight-new {
      animation: pulse-glow 2s ease-out;
    }
    
    @keyframes pulse-glow {
      0% { box-shadow: 0 0 0 0 var(--persona-tint, rgba(74, 103, 65, 0.3)); }
      70% { box-shadow: 0 0 0 8px transparent; }
      100% { box-shadow: 0 0 0 0 transparent; }
    }
    
    .insight-source {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      margin-bottom: var(--space-sm, 8px);
    }
    
    .insight-source-icon {
      width: 16px;
      height: 16px;
    }
    
    .insight-source-name {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .insight-summary {
      font-size: 15px;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-xs) 0;
    }
    
    .insight-content {
      font-size: 14px;
      color: var(--color-text-secondary);
      margin: 0 0 var(--space-sm) 0;
      line-height: 1.5;
    }
    
    .insight-time {
      font-size: 12px;
      color: var(--color-text-muted);
    }
    
    /* Footer */
    .team-insights-footer {
      padding: var(--space-md, 16px) var(--space-lg, 26px);
      border-top: 1px solid var(--color-border-subtle);
      text-align: center;
    }
    
    .team-insights-footer-text {
      font-size: 13px;
      color: var(--color-text-muted);
      margin: 0;
      font-style: italic;
    }
    
    @media (prefers-reduced-motion: reduce) {
      .team-insights-panel,
      .team-insights-content,
      .team-insight-card,
      .team-insights-trigger {
        transition: none;
      }
      .team-insights-spinner {
        animation: none;
      }
      .team-insight-card.insight-new {
        animation: none;
      }
    }
  `;
  document.head.appendChild(styleEl);
}

function cleanupOrphanedElements(): void {
  document.querySelectorAll('.team-insights-panel').forEach((el) => el.remove());
  // Note: Trigger button is now part of engagement-trigger.ui.ts, but clean up any legacy ones
  document.querySelectorAll('.team-insights-trigger').forEach((el) => el.remove());
}

function startPolling(): void {
  if (pollInterval) return;

  // Poll every 5 minutes as fallback when WebSocket unavailable
  pollInterval = setInterval(() => {
    void checkForNewInsights();
  }, 5 * 60 * 1000);

  log.debug('Started polling for insights (WebSocket fallback)');
}

function stopPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

export function initTeamInsightsUI(): void {
  if (isInitialized) return;

  cleanupOrphanedElements();
  injectStyles();

  // Create and inject panel element (trigger button is now in engagement-trigger.ui.ts)
  panelElement = createPanel();
  document.body.appendChild(panelElement);

  // Keyboard handler
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.isOpen) {
      closePanel();
    }
  });

  // Try WebSocket first for real-time updates, fall back to polling
  // Note: WebSocket only works in development (via Vite proxy)
  // Firebase Hosting can't proxy WebSockets, so production uses polling
  if (isWebSocketSupported()) {
    connectWebSocket();
  } else {
    log.debug('WebSocket not supported in this environment, using polling');
    startPolling();
  }

  isInitialized = true;
  log.info('TeamInsightsUI initialized');
}

export function disposeTeamInsightsUI(): void {
  // Disconnect WebSocket
  disconnectWebSocket();

  // Stop polling
  stopPolling();

  // Clear any pending timeouts
  clearAllTimeouts();

  // Remove panel
  panelElement?.remove();
  panelElement = null;
  isInitialized = false;
  log.debug('TeamInsightsUI disposed');
}

// ============================================================================
// UTILITIES
// ============================================================================

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const teamInsightsUI = {
  init: initTeamInsightsUI,
  dispose: disposeTeamInsightsUI,
  open: openPanel,
  close: closePanel,
  toggle: togglePanel,
  refresh: refreshInsights,
  showNotification: showInsightNotification,
  checkForNew: checkForNewInsights,
};

