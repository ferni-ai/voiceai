// TODO: Fix type errors - array indexing for insights
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
import { toast } from './whisper.ui.js';
import { t } from '../i18n/index.js';

const log = createLogger('TeamInsightsUI');

// Track timeouts for cleanup
const { clearAll: _clearAllTimeouts } = createTimeoutTracker();

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
const DEFAULT_STYLE = {
  color: 'var(--persona-ferni, #4a6741)',
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`,
};

const PERSONA_STYLES: Record<string, typeof DEFAULT_STYLE> = {
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
          <button class="team-insights-refresh" aria-label="${t('accessibility.refreshInsights')}">
            ${ICONS.refresh}
          </button>
          <button class="team-insights-close" aria-label="${t('accessibility.closePanel')}">
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
          <!-- Hero: Constellation Visualization -->
          <div class="team-insights-empty__constellation">
            <div class="team-insights-empty__constellation-glow"></div>
            
            <!-- Central Ferni -->
            <div class="team-insights-empty__central" style="--persona-color: var(--persona-ferni, #4a6741);">
              <div class="team-insights-empty__central-ring"></div>
              <div class="team-insights-empty__central-avatar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
              </div>
            </div>
            
            <!-- Orbiting Team Members -->
            <div class="team-insights-empty__orbit">
              <div class="team-insights-empty__orbiter" style="--angle: 0deg; --persona-color: var(--persona-peter, #3a6b73);">
                <div class="team-insights-empty__orbiter-inner">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
                </div>
                <span class="team-insights-empty__orbiter-name">Peter</span>
              </div>
              <div class="team-insights-empty__orbiter" style="--angle: 72deg; --persona-color: var(--persona-maya, #a67a6a);">
                <div class="team-insights-empty__orbiter-inner">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
                </div>
                <span class="team-insights-empty__orbiter-name">Maya</span>
              </div>
              <div class="team-insights-empty__orbiter" style="--angle: 144deg; --persona-color: var(--persona-jordan, #c4856a);">
                <div class="team-insights-empty__orbiter-inner">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
                </div>
                <span class="team-insights-empty__orbiter-name">Jordan</span>
              </div>
              <div class="team-insights-empty__orbiter" style="--angle: 216deg; --persona-color: var(--persona-alex, #5a6b8a);">
                <div class="team-insights-empty__orbiter-inner">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
                </div>
                <span class="team-insights-empty__orbiter-name">Alex</span>
              </div>
              <div class="team-insights-empty__orbiter" style="--angle: 288deg; --persona-color: var(--persona-nayan, #8a7a6a);">
                <div class="team-insights-empty__orbiter-inner">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2"/></svg>
                </div>
                <span class="team-insights-empty__orbiter-name">Nayan</span>
              </div>
            </div>
            
            <!-- Connection Lines -->
            <svg class="team-insights-empty__connections" viewBox="0 0 240 240">
              <defs>
                <linearGradient id="connectionGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" style="stop-color:var(--persona-ferni, #4a6741);stop-opacity:0.3"/>
                  <stop offset="50%" style="stop-color:var(--persona-ferni, #4a6741);stop-opacity:0.6"/>
                  <stop offset="100%" style="stop-color:var(--persona-ferni, #4a6741);stop-opacity:0.3"/>
                </linearGradient>
              </defs>
              <circle cx="120" cy="120" r="70" fill="none" stroke="url(#connectionGrad)" stroke-width="1" stroke-dasharray="4 4" class="team-insights-empty__orbit-path"/>
            </svg>
          </div>
          
          <!-- Title & Message -->
          <div class="team-insights-empty__hero">
            <h3 class="team-insights-empty__title">Six minds, thinking of you</h3>
            <p class="team-insights-empty__message">
              Your inner circle is always working behind the scenes—spotting patterns, tracking progress, finding wisdom. When something matters, they'll surface it here.
            </p>
          </div>
          
          <!-- Team Specialties - What They Watch For -->
          <div class="team-insights-empty__specialties">
            <div class="team-insights-empty__specialty" style="--delay: 0ms; --accent: var(--persona-peter, #3a6b73);">
              <div class="team-insights-empty__specialty-bar"></div>
              <div class="team-insights-empty__specialty-content">
                <span class="team-insights-empty__specialty-name">Peter</span>
                <span class="team-insights-empty__specialty-focus">watches your patterns</span>
              </div>
            </div>
            <div class="team-insights-empty__specialty" style="--delay: 60ms; --accent: var(--persona-maya, #a67a6a);">
              <div class="team-insights-empty__specialty-bar"></div>
              <div class="team-insights-empty__specialty-content">
                <span class="team-insights-empty__specialty-name">Maya</span>
                <span class="team-insights-empty__specialty-focus">tracks your habits</span>
              </div>
            </div>
            <div class="team-insights-empty__specialty" style="--delay: 120ms; --accent: var(--persona-jordan, #c4856a);">
              <div class="team-insights-empty__specialty-bar"></div>
              <div class="team-insights-empty__specialty-content">
                <span class="team-insights-empty__specialty-name">Jordan</span>
                <span class="team-insights-empty__specialty-focus">celebrates milestones</span>
              </div>
            </div>
            <div class="team-insights-empty__specialty" style="--delay: 180ms; --accent: var(--persona-alex, #5a6b8a);">
              <div class="team-insights-empty__specialty-bar"></div>
              <div class="team-insights-empty__specialty-content">
                <span class="team-insights-empty__specialty-name">Alex</span>
                <span class="team-insights-empty__specialty-focus">spots opportunities</span>
              </div>
            </div>
            <div class="team-insights-empty__specialty" style="--delay: 240ms; --accent: var(--persona-nayan, #8a7a6a);">
              <div class="team-insights-empty__specialty-bar"></div>
              <div class="team-insights-empty__specialty-content">
                <span class="team-insights-empty__specialty-name">Nayan</span>
                <span class="team-insights-empty__specialty-focus">finds deeper meaning</span>
              </div>
            </div>
          </div>
          
          <!-- Sample Insight Preview -->
          <div class="team-insights-empty__preview">
            <div class="team-insights-empty__preview-label">
              <span class="team-insights-empty__preview-pulse"></span>
              What team insights look like
            </div>
            <div class="team-insights-empty__preview-card">
              <div class="team-insights-empty__preview-source" style="color: var(--persona-peter, #3a6b73);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
                Peter noticed
              </div>
              <p class="team-insights-empty__preview-text">"Your energy dips every Sunday evening. This pattern appeared 6 times in the last 2 months."</p>
              <span class="team-insights-empty__preview-action">Suggested action: plan something you love for Sunday nights</span>
            </div>
          </div>
          
          <!-- Promise -->
          <div class="team-insights-empty__promise">
            <span class="team-insights-empty__promise-icon">${ICONS.sparkles}</span>
            <span>Better than human. Always watching out for you.</span>
          </div>
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
    emptyEl.style.display = 'block';
    return;
  }

  // Render insights
  listEl.style.display = 'flex';
  listEl.innerHTML = state.insights
    .map((insight) => {
      const style = PERSONA_STYLES[insight.source] ?? DEFAULT_STYLE;
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
  toast.success(t('toasts.insightsUpdated'));
}

// ============================================================================
// NOTIFICATION SYSTEM
// ============================================================================

/**
 * Show a notification for a high-priority insight
 */
export function showInsightNotification(insight: TeamInsight): void {
  const _style = PERSONA_STYLES[insight.source] || PERSONA_STYLES.system;

  // Add to state
  state.insights.unshift(insight);
  state.hasNewInsights = true;
  updateTriggerBadge();

  // Show toast notification
  toast.info(t('toasts.capitalizeinsightsourceInsightsummary'));

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
      if (mostImportant) {
        showInsightNotification(mostImportant);
      }
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
      background: rgba(44, 37, 32, 0.75);
    }
    
    .team-insights-content {
      position: relative;
      width: 90%;
      max-width: 460px;
      max-height: 85vh;
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
    .team-insights-error {
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
      border-top-color: var(--persona-text);
      border-radius: var(--radius-full);
      animation: spin 1s linear infinite;
      margin-bottom: var(--space-md);
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    /* ======================================
       EMPTY STATE - "Six Minds" Constellation Design
       ====================================== */
    
    .team-insights-empty {
      padding: 0;
    }
    
    /* Constellation Visualization */
    .team-insights-empty__constellation {
      position: relative;
      width: 240px;
      height: 200px;
      margin: 0 auto var(--space-md, 16px);
    }
    
    .team-insights-empty__constellation-glow {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 180px;
      height: 180px;
      background: radial-gradient(
        circle,
        var(--persona-ferni-tint, rgba(74, 103, 65, 0.12)) 0%,
        transparent 70%
      );
      border-radius: 50%;
      animation: teamConstellationGlow 4s ease-in-out infinite;
    }
    
    @keyframes teamConstellationGlow {
      0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
      50% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
    }
    
    /* Central Ferni */
    .team-insights-empty__central {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 3;
    }
    
    .team-insights-empty__central-ring {
      position: absolute;
      inset: -8px;
      border-radius: 50%;
      background: linear-gradient(
        135deg,
        var(--persona-color, var(--persona-ferni, #4a6741)) 0%,
        transparent 50%
      );
      opacity: 0.2;
      animation: teamCentralPulse 3s ease-in-out infinite;
    }
    
    @keyframes teamCentralPulse {
      0%, 100% { transform: scale(1); opacity: 0.2; }
      50% { transform: scale(1.2); opacity: 0.3; }
    }
    
    .team-insights-empty__central-avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(
        135deg,
        var(--persona-ferni, #4a6741),
        var(--persona-ferni-secondary, #3d5a35)
      );
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      box-shadow: 
        0 4px 20px rgba(74, 103, 65, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.15);
    }
    
    .team-insights-empty__central-avatar svg {
      width: 26px;
      height: 26px;
    }
    
    /* Connections SVG */
    .team-insights-empty__connections {
      position: absolute;
      inset: 0;
      z-index: 1;
    }
    
    .team-insights-empty__orbit-path {
      animation: teamOrbitRotate 20s linear infinite;
      transform-origin: center;
    }
    
    @keyframes teamOrbitRotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    
    /* Orbiting Team Members */
    .team-insights-empty__orbit {
      position: absolute;
      inset: 0;
      z-index: 2;
    }
    
    .team-insights-empty__orbiter {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(var(--angle, 0deg)) translateY(-70px) rotate(calc(-1 * var(--angle, 0deg)));
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    
    .team-insights-empty__orbiter-inner {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: linear-gradient(
        135deg,
        var(--persona-color),
        color-mix(in srgb, var(--persona-color) 80%, black)
      );
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
    }
    
    .team-insights-empty__orbiter:hover .team-insights-empty__orbiter-inner {
      transform: scale(1.15);
    }
    
    .team-insights-empty__orbiter-inner svg {
      width: 16px;
      height: 16px;
    }
    
    .team-insights-empty__orbiter-name {
      font-size: 10px;
      font-weight: 500;
      color: var(--color-text-muted);
      opacity: 0;
      transition: opacity ${DURATION.FAST}ms;
    }
    
    .team-insights-empty__orbiter:hover .team-insights-empty__orbiter-name {
      opacity: 1;
    }
    
    /* Hero Text */
    .team-insights-empty__hero {
      text-align: center;
      margin-bottom: var(--space-lg, 26px);
    }
    
    .team-insights-empty__title {
      font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
      font-size: 18px;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0 0 var(--space-sm, 8px) 0;
    }
    
    .team-insights-empty__message {
      font-size: 14px;
      color: var(--color-text-secondary);
      line-height: 1.5;
      margin: 0 auto;
      max-width: 320px;
    }
    
    /* Team Specialties */
    .team-insights-empty__specialties {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs, 6px);
      margin-bottom: var(--space-lg, 26px);
    }
    
    .team-insights-empty__specialty {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      padding: var(--space-sm, 8px) var(--space-md, 12px);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border-radius: var(--radius-md, 8px);
      opacity: 0;
      transform: translateX(-8px);
      animation: teamSpecialtyEnter ${DURATION.MODERATE}ms ${EASING.SPRING} forwards;
      animation-delay: var(--delay, 0ms);
    }
    
    @keyframes teamSpecialtyEnter {
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    
    .team-insights-empty__specialty-bar {
      width: 3px;
      height: 100%;
      min-height: 24px;
      background: var(--accent);
      border-radius: 2px;
      opacity: 0.7;
    }
    
    .team-insights-empty__specialty-content {
      display: flex;
      align-items: baseline;
      gap: var(--space-xs, 6px);
      flex: 1;
    }
    
    .team-insights-empty__specialty-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--accent);
    }
    
    .team-insights-empty__specialty-focus {
      font-size: 13px;
      color: var(--color-text-secondary);
    }
    
    /* Sample Preview */
    .team-insights-empty__preview {
      margin-bottom: var(--space-lg, 26px);
    }
    
    .team-insights-empty__preview-label {
      display: flex;
      align-items: center;
      gap: var(--space-sm, 8px);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-text-dimmed);
      margin-bottom: var(--space-sm, 8px);
    }
    
    .team-insights-empty__preview-pulse {
      width: 6px;
      height: 6px;
      background: var(--persona-peter, #3a6b73);
      border-radius: 50%;
      animation: teamPulseDot 2s ease-in-out infinite;
    }
    
    @keyframes teamPulseDot {
      0%, 100% { opacity: 0.4; transform: scale(1); }
      50% { opacity: 1; transform: scale(1.3); }
    }
    
    .team-insights-empty__preview-card {
      padding: var(--space-md, 16px);
      background: linear-gradient(
        135deg,
        rgba(58, 107, 115, 0.08),
        var(--color-bg-secondary, rgba(44, 37, 32, 0.02))
      );
      border-radius: var(--radius-lg, 12px);
      border: 1px solid rgba(58, 107, 115, 0.15);
      border-left: 3px solid var(--persona-peter, #3a6b73);
    }
    
    .team-insights-empty__preview-source {
      display: flex;
      align-items: center;
      gap: var(--space-xs, 4px);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: var(--space-sm, 8px);
    }
    
    .team-insights-empty__preview-text {
      font-size: 14px;
      color: var(--color-text-primary);
      line-height: 1.5;
      margin: 0 0 var(--space-sm, 8px) 0;
      opacity: 0.9;
    }
    
    .team-insights-empty__preview-action {
      display: block;
      font-size: 12px;
      color: var(--persona-peter, #3a6b73);
      font-style: italic;
    }
    
    /* Promise Footer */
    .team-insights-empty__promise {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-sm, 8px);
      padding: var(--space-md, 16px);
      background: var(--color-bg-secondary, rgba(44, 37, 32, 0.03));
      border-radius: var(--radius-lg, 12px);
      font-size: 13px;
      color: var(--color-text-secondary);
      font-style: italic;
    }
    
    .team-insights-empty__promise-icon {
      color: var(--persona-ferni, #4a6741);
    }
    
    .team-insights-empty__promise-icon svg {
      width: 18px;
      height: 18px;
    }
    
    /* Legacy fallback classes */
    .empty-icon {
      width: 48px;
      height: 48px;
      color: var(--persona-text);
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
    
    /* Responsive - Small Screens */
    @media (max-width: 400px) {
      .team-insights-empty__capabilities {
        grid-template-columns: 1fr;
      }
      
      .team-insights-empty__personas {
        gap: var(--space-xs, 4px);
      }
      
      .team-insights-empty__avatar {
        width: 38px;
        height: 38px;
        font-size: 11px;
      }
      
      .team-insights-empty__persona-name {
        font-size: 10px;
      }
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
    
    /* ======================================
       DARK THEME - Team Insights
       ====================================== */
    
    [data-theme="midnight"] .team-insights-content {
      background: var(--color-bg-elevated, #1a1a1e);
    }
    
    [data-theme="midnight"] .team-insights-empty__constellation-glow {
      background: radial-gradient(
        circle,
        rgba(74, 103, 65, 0.2) 0%,
        transparent 70%
      );
    }
    
    [data-theme="midnight"] .team-insights-empty__specialty {
      background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.04));
    }
    
    [data-theme="midnight"] .team-insights-empty__preview-card {
      background: linear-gradient(
        135deg,
        rgba(58, 107, 115, 0.12),
        rgba(255, 255, 255, 0.02)
      );
      border-color: rgba(58, 107, 115, 0.2);
    }
    
    [data-theme="midnight"] .team-insights-empty__promise {
      background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.04));
    }
    
    [data-theme="midnight"] .team-insights-backdrop {
      background: rgba(0, 0, 0, 0.75);
    }
    
    [data-theme="midnight"] .team-insight-card {
      background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.04));
    }
    
    [data-theme="midnight"] .team-insight-card:hover {
      background: var(--color-bg-secondary, rgba(255, 255, 255, 0.06));
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
  _clearAllTimeouts();

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

