/**
 * Trust Dashboard UI
 *
 * Consolidated dashboard for all trust system features.
 * Provides access to:
 * - Relationship health overview
 * - Sentiment timeline
 * - Life events calendar
 * - Journaling prompts
 * - Media suggestions
 * - Insights reports
 *
 * @module TrustDashboardUI
 */

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING } from '../config/animation-constants.js';
import { appState } from '../state/app.state.js';

const log = createLogger('TrustDashboardUI');

// ============================================================================
// TYPES
// ============================================================================

interface DashboardState {
  activeTab: 'health' | 'timeline' | 'events' | 'journal' | 'media' | 'insights';
  data: {
    health: HealthData | null;
    timeline: TimelineData | null;
    events: EventsData | null;
    journal: JournalData | null;
    media: MediaData | null;
    insights: InsightsData | null;
  };
  loading: boolean;
  error: string | null;
}

interface HealthData {
  score: number;
  stage: string;
  stageName: string;
  trend: string;
  factors: Array<{ name: string; score: number; trend: string }>;
  alerts: Array<{ message: string; severity: string }>;
}

interface TimelineData {
  currentMood: string | null;
  peaks: Array<{ type: string; date: string; valence: number }>;
  patterns: Array<{ description: string; confidence: number }>;
}

interface EventsData {
  today: Array<{ description: string; type: string }>;
  thisWeek: Array<{ description: string; date: string; daysUntil: number }>;
}

interface JournalData {
  prompts: Array<{ id: string; prompt: string; category: string; difficulty: string }>;
}

interface MediaData {
  suggestions: Array<{
    id: string;
    title: string;
    artist?: string;
    type: string;
    reason: string;
    intent: string;
  }>;
}

interface InsightsData {
  latest: {
    summary: { headline: string; emoji: string; overallMood: string };
    conversations: { totalSessions: number; totalMinutes: number };
    wins: { totalWins: number; biggestWin?: string };
  } | null;
  isDue: boolean;
}

// ============================================================================
// STATE
// ============================================================================

const state: DashboardState = {
  activeTab: 'health',
  data: {
    health: null,
    timeline: null,
    events: null,
    journal: null,
    media: null,
    insights: null,
  },
  loading: false,
  error: null,
};

let container: HTMLElement | null = null;
let isInitialized = false;

// ============================================================================
// ICONS (Lucide)
// ============================================================================

const ICONS = {
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  timeline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
  journal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
  // Event icons
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  party: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12v0c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11v0c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98v0C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/></svg>',
  mapPin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  plane: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>',
  hospital: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6v4"/><path d="M14 14h-4"/><path d="M14 18h-4"/><path d="M14 8h-4"/><path d="M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2"/><path d="M18 22V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v18"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  // Media icons
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
  lotus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22c1.25-.987 2.27-1.975 3.9-2.2a5.56 5.56 0 0 1 3.8 1.5 4 4 0 0 0 6.187-2.353 3.5 3.5 0 0 0 3.69-5.116A3.5 3.5 0 0 0 20.95 8 3.5 3.5 0 1 0 16 3.05a3.5 3.5 0 0 0-5.831 1.373 3.5 3.5 0 0 0-5.116 3.69 4 4 0 0 0-2.348 6.155C3.499 15.42 4.409 16.712 4.2 18.1 3.926 19.743 3.014 20.732 2 22"/><path d="M2 22 17 7"/></svg>',
  wind: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>',
};

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initTrustDashboardUI(): void {
  if (isInitialized) return;

  // Cleanup existing
  document.querySelectorAll('.trust-dashboard-overlay').forEach((el) => el.remove());

  isInitialized = true;
  log.debug('Trust Dashboard UI initialized');
}

// ============================================================================
// SHOW/HIDE
// ============================================================================

export async function showTrustDashboard(): Promise<void> {
  if (container) {
    container.remove();
  }

  container = document.createElement('div');
  container.className = 'trust-dashboard-overlay';
  container.innerHTML = createDashboardHTML();
  document.body.appendChild(container);

  // Add styles
  addStyles();

  // Add event listeners
  setupEventListeners();

  // Animate in
  requestAnimationFrame(() => {
    container?.classList.add('visible');
  });

  // Load initial data
  await loadTabData('health');
}

export function hideTrustDashboard(): void {
  if (!container) return;

  container.classList.remove('visible');
  setTimeout(() => {
    container?.remove();
    container = null;
  }, DURATION.SLOW);
}

// ============================================================================
// HTML GENERATION
// ============================================================================

function createDashboardHTML(): string {
  return `
    <div class="trust-dashboard-backdrop"></div>
    <div class="trust-dashboard-modal">
      <header class="trust-dashboard-header">
        <div class="header-left">
          <span class="eyebrow">YOUR JOURNEY</span>
          <h2>Trust & Growth</h2>
        </div>
        <button class="close-btn" aria-label="Close">
          ${ICONS.close}
        </button>
      </header>
      
      <nav class="trust-dashboard-tabs">
        <button class="tab-btn active" data-tab="health">
          ${ICONS.heart}
          <span>Health</span>
        </button>
        <button class="tab-btn" data-tab="timeline">
          ${ICONS.timeline}
          <span>Timeline</span>
        </button>
        <button class="tab-btn" data-tab="events">
          ${ICONS.calendar}
          <span>Events</span>
        </button>
        <button class="tab-btn" data-tab="journal">
          ${ICONS.journal}
          <span>Journal</span>
        </button>
        <button class="tab-btn" data-tab="media">
          ${ICONS.music}
          <span>Media</span>
        </button>
        <button class="tab-btn" data-tab="insights">
          ${ICONS.chart}
          <span>Insights</span>
        </button>
      </nav>
      
      <main class="trust-dashboard-content">
        <div class="content-loading">
          <div class="spinner"></div>
          <p>Loading...</p>
        </div>
      </main>
      
      <footer class="trust-dashboard-footer">
        <button class="refresh-btn">
          ${ICONS.refresh}
          <span>Refresh</span>
        </button>
      </footer>
    </div>
  `;
}

// ============================================================================
// TAB CONTENT RENDERERS
// ============================================================================

function renderHealthTab(data: HealthData | null): string {
  if (!data) {
    return '<p class="empty-state">Start conversations to build your relationship health score.</p>';
  }

  const scoreColor = data.score >= 70 ? 'var(--color-success)' : 
    data.score >= 40 ? 'var(--color-warning)' : 'var(--color-error)';

  return `
    <div class="health-content">
      <div class="health-score-ring">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="var(--color-border)" stroke-width="8"/>
          <circle cx="50" cy="50" r="45" fill="none" stroke="${scoreColor}" stroke-width="8"
            stroke-dasharray="${data.score * 2.83} 283"
            stroke-linecap="round" transform="rotate(-90 50 50)"/>
        </svg>
        <div class="score-text">
          <span class="score-number">${data.score}</span>
          <span class="score-label">Health</span>
        </div>
      </div>
      
      <div class="health-stage">
        <h3>${data.stageName}</h3>
        <p class="trend ${data.trend}">${data.trend}</p>
      </div>
      
      <div class="health-factors">
        <h4>Factors</h4>
        ${data.factors.map(f => `
          <div class="factor-row">
            <span class="factor-name">${formatFactorName(f.name)}</span>
            <div class="factor-bar">
              <div class="factor-fill" style="width: ${f.score}%"></div>
            </div>
            <span class="factor-trend ${f.trend}">${f.trend === 'improving' ? '↑' : f.trend === 'declining' ? '↓' : '→'}</span>
          </div>
        `).join('')}
      </div>
      
      ${data.alerts.length > 0 ? `
        <div class="health-alerts">
          <h4>Attention Needed</h4>
          ${data.alerts.map(a => `
            <div class="alert-item ${a.severity}">
              <span>${a.message}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderTimelineTab(data: TimelineData | null): string {
  if (!data) {
    return '<p class="empty-state">Your emotional timeline will appear here as we have more conversations.</p>';
  }

  return `
    <div class="timeline-content">
      <div class="current-mood">
        <h4>Current Mood</h4>
        <p>${data.currentMood || 'Not detected yet'}</p>
      </div>
      
      ${data.peaks.length > 0 ? `
        <div class="peaks-valleys">
          <h4>Recent Peaks & Valleys</h4>
          ${data.peaks.map(p => `
            <div class="peak-item ${p.type}">
              <span class="peak-type">${p.type === 'peak' ? '📈' : '📉'}</span>
              <span class="peak-date">${new Date(p.date).toLocaleDateString()}</span>
              <span class="peak-valence">${(p.valence * 100).toFixed(0)}%</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      ${data.patterns.length > 0 ? `
        <div class="patterns">
          <h4>Patterns Noticed</h4>
          ${data.patterns.map(p => `
            <div class="pattern-item">
              <p>${p.description}</p>
              <span class="confidence">${(p.confidence * 100).toFixed(0)}% confident</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderEventsTab(data: EventsData | null): string {
  if (!data || (data.today.length === 0 && data.thisWeek.length === 0)) {
    return '<p class="empty-state">No upcoming events detected. Mention important dates in our conversations!</p>';
  }

  return `
    <div class="events-content">
      ${data.today.length > 0 ? `
        <div class="events-section">
          <h4>Today</h4>
          ${data.today.map(e => `
            <div class="event-item today">
              <span class="event-type">${getEventIcon(e.type)}</span>
              <span class="event-desc">${e.description}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      ${data.thisWeek.length > 0 ? `
        <div class="events-section">
          <h4>This Week</h4>
          ${data.thisWeek.map(e => `
            <div class="event-item">
              <span class="event-days">in ${e.daysUntil}d</span>
              <span class="event-desc">${e.description}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderJournalTab(data: JournalData | null): string {
  if (!data || data.prompts.length === 0) {
    return '<p class="empty-state">Journaling prompts will appear here based on your conversations.</p>';
  }

  return `
    <div class="journal-content">
      <p class="journal-intro">Here are some prompts based on what you've been thinking about:</p>
      
      ${data.prompts.map(p => `
        <div class="prompt-card" data-id="${p.id}">
          <span class="prompt-category">${p.category}</span>
          <p class="prompt-text">${p.prompt}</p>
          <span class="prompt-difficulty">${p.difficulty}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderMediaTab(data: MediaData | null): string {
  if (!data || data.suggestions.length === 0) {
    return '<p class="empty-state">Media suggestions based on your mood will appear here.</p>';
  }

  return `
    <div class="media-content">
      <p class="media-intro">Based on how you're feeling, you might enjoy:</p>
      
      ${data.suggestions.map(s => `
        <div class="media-card" data-id="${s.id}">
          <div class="media-icon">${getMediaIcon(s.type)}</div>
          <div class="media-info">
            <h5>${s.title}</h5>
            ${s.artist ? `<span class="media-artist">${s.artist}</span>` : ''}
            <p class="media-reason">${s.reason}</p>
          </div>
          <span class="media-intent">${s.intent}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderInsightsTab(data: InsightsData | null): string {
  if (!data?.latest) {
    return `
      <div class="insights-content">
        <p class="empty-state">Your first insights report will be ready after more conversations.</p>
        ${data?.isDue ? `
          <button class="generate-report-btn">Generate Report Now</button>
        ` : ''}
      </div>
    `;
  }

  const { latest } = data;

  return `
    <div class="insights-content">
      <div class="insights-summary">
        <span class="insights-emoji">${latest.summary.emoji}</span>
        <h3>${latest.summary.headline}</h3>
        <span class="insights-mood">${latest.summary.overallMood}</span>
      </div>
      
      <div class="insights-stats">
        <div class="stat-item">
          <span class="stat-number">${latest.conversations.totalSessions}</span>
          <span class="stat-label">Conversations</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">${latest.conversations.totalMinutes}</span>
          <span class="stat-label">Minutes</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">${latest.wins.totalWins}</span>
          <span class="stat-label">Wins</span>
        </div>
      </div>
      
      ${latest.wins.biggestWin ? `
        <div class="biggest-win">
          <h4>🏆 Biggest Win</h4>
          <p>${latest.wins.biggestWin}</p>
        </div>
      ` : ''}
      
      ${data.isDue ? `
        <button class="generate-report-btn">Generate New Report</button>
      ` : ''}
    </div>
  `;
}

// ============================================================================
// DATA LOADING
// ============================================================================

async function loadTabData(tab: DashboardState['activeTab']): Promise<void> {
  state.activeTab = tab;
  state.loading = true;
  state.error = null;
  renderContent();

  const userId = (appState as { userId?: string }).userId || 'anonymous';

  try {
    const baseUrl = '/api/trust';

    switch (tab) {
      case 'health':
        const healthRes = await fetch(`${baseUrl}/health?userId=${userId}`);
        state.data.health = await healthRes.json();
        break;

      case 'timeline':
        const timelineRes = await fetch(`${baseUrl}/sentiment?userId=${userId}`);
        state.data.timeline = await timelineRes.json();
        break;

      case 'events':
        const eventsRes = await fetch(`${baseUrl}/life-events?userId=${userId}`);
        state.data.events = await eventsRes.json();
        break;

      case 'journal':
        const journalRes = await fetch(`${baseUrl}/journaling/prompts?userId=${userId}`);
        state.data.journal = await journalRes.json();
        break;

      case 'media':
        const mediaRes = await fetch(`${baseUrl}/media/suggestions?userId=${userId}`);
        state.data.media = await mediaRes.json();
        break;

      case 'insights':
        const insightsRes = await fetch(`${baseUrl}/insights?userId=${userId}`);
        state.data.insights = await insightsRes.json();
        break;
    }

    state.loading = false;
    renderContent();
  } catch (error) {
    log.error({ error }, 'Failed to load tab data');
    state.loading = false;
    state.error = 'Failed to load data';
    renderContent();
  }
}

function renderContent(): void {
  const content = container?.querySelector('.trust-dashboard-content');
  if (!content) return;

  if (state.loading) {
    content.innerHTML = `
      <div class="content-loading">
        <div class="spinner"></div>
        <p>Loading...</p>
      </div>
    `;
    return;
  }

  if (state.error) {
    content.innerHTML = `<p class="error-state">${state.error}</p>`;
    return;
  }

  switch (state.activeTab) {
    case 'health':
      content.innerHTML = renderHealthTab(state.data.health);
      break;
    case 'timeline':
      content.innerHTML = renderTimelineTab(state.data.timeline);
      break;
    case 'events':
      content.innerHTML = renderEventsTab(state.data.events);
      break;
    case 'journal':
      content.innerHTML = renderJournalTab(state.data.journal);
      break;
    case 'media':
      content.innerHTML = renderMediaTab(state.data.media);
      break;
    case 'insights':
      content.innerHTML = renderInsightsTab(state.data.insights);
      break;
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

function setupEventListeners(): void {
  if (!container) return;

  // Close button
  container.querySelector('.close-btn')?.addEventListener('click', hideTrustDashboard);

  // Backdrop click
  container.querySelector('.trust-dashboard-backdrop')?.addEventListener('click', hideTrustDashboard);

  // Tab buttons
  container.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const tab = (e.currentTarget as HTMLElement).dataset.tab as DashboardState['activeTab'];
      if (tab) {
        // Update active state
        container?.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        (e.currentTarget as HTMLElement).classList.add('active');
        // Load data
        loadTabData(tab);
      }
    });
  });

  // Refresh button
  container.querySelector('.refresh-btn')?.addEventListener('click', () => {
    loadTabData(state.activeTab);
  });

  // Escape key
  document.addEventListener('keydown', handleKeyDown);
}

function handleKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    hideTrustDashboard();
    document.removeEventListener('keydown', handleKeyDown);
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function formatFactorName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function getEventIcon(type: string): string {
  const iconMap: Record<string, string> = {
    deadline: ICONS.clock,
    appointment: ICONS.calendar,
    milestone: ICONS.party,
    event: ICONS.mapPin,
    travel: ICONS.plane,
    health: ICONS.hospital,
    work: ICONS.briefcase,
    personal: ICONS.home,
  };
  return `<span class="trust-icon">${iconMap[type] || ICONS.mapPin}</span>`;
}

function getMediaIcon(type: string): string {
  const iconMap: Record<string, string> = {
    music: ICONS.music,
    podcast: ICONS.mic,
    meditation: ICONS.lotus,
    breathwork: ICONS.wind,
    ambient: ICONS.leaf,
    audiobook: ICONS.book,
  };
  return `<span class="trust-icon">${iconMap[type] || ICONS.music}</span>`;
}

// ============================================================================
// STYLES
// ============================================================================

function addStyles(): void {
  if (document.getElementById('trust-dashboard-styles')) return;

  const style = document.createElement('style');
  style.id = 'trust-dashboard-styles';
  style.textContent = `
    .trust-dashboard-overlay {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD};
    }
    
    .trust-dashboard-overlay.visible {
      opacity: 1;
    }
    
    .trust-dashboard-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(44, 37, 32, 0.6);
      backdrop-filter: blur(20px);
    }
    
    .trust-dashboard-modal {
      position: relative;
      width: 90%;
      max-width: 600px;
      max-height: 85vh;
      background: var(--color-background-elevated);
      border-radius: var(--radius-2xl);
      box-shadow: var(--shadow-2xl);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.95);
      transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
    }
    
    .trust-dashboard-overlay.visible .trust-dashboard-modal {
      transform: scale(1);
    }
    
    .trust-dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: var(--space-6);
      border-bottom: 1px solid var(--color-border);
    }
    
    .trust-dashboard-header .eyebrow {
      font-size: 0.7rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      color: var(--color-text-muted);
      margin-bottom: var(--space-1);
    }
    
    .trust-dashboard-header h2 {
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--color-text-primary);
      margin: 0;
    }
    
    .close-btn {
      background: none;
      border: none;
      padding: var(--space-2);
      cursor: pointer;
      color: var(--color-text-muted);
      border-radius: var(--radius-md);
      transition: background ${DURATION.FAST}ms;
    }
    
    .close-btn:hover {
      background: var(--color-background-hover);
    }
    
    .close-btn svg {
      width: 20px;
      height: 20px;
    }
    
    .trust-dashboard-tabs {
      display: flex;
      gap: var(--space-1);
      padding: var(--space-4) var(--space-6);
      border-bottom: 1px solid var(--color-border);
      overflow-x: auto;
    }
    
    .tab-btn {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      background: none;
      border: none;
      border-radius: var(--radius-md);
      cursor: pointer;
      color: var(--color-text-muted);
      font-size: 0.85rem;
      white-space: nowrap;
      transition: all ${DURATION.FAST}ms;
    }
    
    .tab-btn svg {
      width: 16px;
      height: 16px;
    }
    
    .tab-btn:hover {
      background: var(--color-background-hover);
      color: var(--color-text-secondary);
    }
    
    .tab-btn.active {
      background: var(--persona-primary);
      color: white;
    }
    
    .trust-dashboard-content {
      flex: 1;
      padding: var(--space-6);
      overflow-y: auto;
    }
    
    .content-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-12);
      color: var(--color-text-muted);
    }
    
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--color-border);
      border-top-color: var(--color-text-secondary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .empty-state, .error-state {
      text-align: center;
      color: var(--color-text-muted);
      padding: var(--space-12);
    }
    
    .error-state {
      color: var(--color-error);
    }
    
    /* Health Tab */
    .health-content {
      display: flex;
      flex-direction: column;
      gap: var(--space-6);
    }
    
    .health-score-ring {
      position: relative;
      width: 150px;
      height: 150px;
      margin: 0 auto;
    }
    
    .health-score-ring svg {
      width: 100%;
      height: 100%;
    }
    
    .score-text {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    
    .score-number {
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--color-text-primary);
    }
    
    .score-label {
      font-size: 0.8rem;
      color: var(--color-text-muted);
    }
    
    .health-stage {
      text-align: center;
    }
    
    .health-stage h3 {
      margin: 0 0 var(--space-2);
      color: var(--color-text-primary);
    }
    
    .trend {
      font-size: 0.85rem;
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-sm);
    }
    
    .trend.improving { background: var(--color-success-bg); color: var(--color-success); }
    .trend.stable { background: var(--color-background-hover); color: var(--color-text-muted); }
    .trend.declining { background: var(--color-error-bg); color: var(--color-error); }
    
    .health-factors h4, .health-alerts h4 {
      font-size: 0.9rem;
      color: var(--color-text-muted);
      margin-bottom: var(--space-3);
    }
    
    .factor-row {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-bottom: var(--space-2);
    }
    
    .factor-name {
      flex: 0 0 120px;
      font-size: 0.85rem;
      color: var(--color-text-secondary);
    }
    
    .factor-bar {
      flex: 1;
      height: 6px;
      background: var(--color-border);
      border-radius: var(--radius-full);
      overflow: hidden;
    }
    
    .factor-fill {
      height: 100%;
      background: var(--persona-primary);
      border-radius: var(--radius-full);
      transition: width ${DURATION.SLOW}ms;
    }
    
    .factor-trend {
      width: 20px;
      text-align: center;
    }
    
    .factor-trend.improving { color: var(--color-success); }
    .factor-trend.declining { color: var(--color-error); }
    
    .alert-item {
      padding: var(--space-3);
      border-radius: var(--radius-md);
      margin-bottom: var(--space-2);
      font-size: 0.9rem;
    }
    
    .alert-item.warning { background: var(--color-warning-bg); color: var(--color-warning); }
    .alert-item.concern { background: var(--color-error-bg); color: var(--color-error); }
    
    /* Events Tab */
    .events-section {
      margin-bottom: var(--space-6);
    }
    
    .events-section h4 {
      font-size: 0.9rem;
      color: var(--color-text-muted);
      margin-bottom: var(--space-3);
    }
    
    .event-item {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3);
      background: var(--color-background-hover);
      border-radius: var(--radius-md);
      margin-bottom: var(--space-2);
    }
    
    .event-item.today {
      background: var(--persona-tint);
    }
    
    .event-days {
      font-size: 0.8rem;
      color: var(--color-text-muted);
      min-width: 50px;
    }
    
    /* Journal Tab */
    .journal-intro, .media-intro {
      color: var(--color-text-muted);
      margin-bottom: var(--space-4);
    }
    
    .prompt-card, .media-card {
      padding: var(--space-4);
      background: var(--color-background-hover);
      border-radius: var(--radius-lg);
      margin-bottom: var(--space-3);
    }
    
    .prompt-category, .media-intent {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--color-text-secondary);
      font-weight: 600;
    }
    
    .prompt-text {
      margin: var(--space-2) 0;
      color: var(--color-text-primary);
      font-size: 1.1rem;
      line-height: 1.5;
    }
    
    .prompt-difficulty {
      font-size: 0.8rem;
      color: var(--color-text-muted);
    }
    
    /* Media Tab */
    .media-card {
      display: flex;
      gap: var(--space-4);
      align-items: flex-start;
    }
    
    .media-icon {
      font-size: 2rem;
    }
    
    .media-info {
      flex: 1;
    }
    
    .media-info h5 {
      margin: 0 0 var(--space-1);
      color: var(--color-text-primary);
    }
    
    .media-artist {
      font-size: 0.85rem;
      color: var(--color-text-muted);
    }
    
    .media-reason {
      font-size: 0.9rem;
      color: var(--color-text-secondary);
      margin-top: var(--space-2);
    }
    
    /* Insights Tab */
    .insights-summary {
      text-align: center;
      padding: var(--space-6);
    }
    
    .insights-emoji {
      font-size: 3rem;
    }
    
    .insights-summary h3 {
      margin: var(--space-3) 0;
      color: var(--color-text-primary);
    }
    
    .insights-mood {
      padding: var(--space-1) var(--space-3);
      background: var(--persona-tint);
      border-radius: var(--radius-full);
      color: var(--color-text-secondary);
      font-size: 0.85rem;
    }
    
    .insights-stats {
      display: flex;
      justify-content: center;
      gap: var(--space-8);
      padding: var(--space-6);
    }
    
    .stat-item {
      text-align: center;
    }
    
    .stat-number {
      display: block;
      font-size: 2rem;
      font-weight: 700;
      color: var(--color-text-primary);
    }
    
    .stat-label {
      font-size: 0.8rem;
      color: var(--color-text-muted);
    }
    
    .biggest-win {
      padding: var(--space-4);
      background: var(--color-background-hover);
      border-radius: var(--radius-lg);
      margin-top: var(--space-4);
    }
    
    .biggest-win h4 {
      margin: 0 0 var(--space-2);
    }
    
    .biggest-win p {
      margin: 0;
      color: var(--color-text-secondary);
    }
    
    .generate-report-btn {
      width: 100%;
      padding: var(--space-3);
      background: var(--persona-primary);
      color: white;
      border: none;
      border-radius: var(--radius-md);
      font-weight: 600;
      cursor: pointer;
      margin-top: var(--space-4);
      transition: background ${DURATION.FAST}ms;
    }
    
    .generate-report-btn:hover {
      background: var(--persona-secondary);
    }
    
    /* Footer */
    .trust-dashboard-footer {
      padding: var(--space-4) var(--space-6);
      border-top: 1px solid var(--color-border);
    }
    
    .refresh-btn {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-4);
      background: var(--color-background-hover);
      border: none;
      border-radius: var(--radius-md);
      cursor: pointer;
      color: var(--color-text-secondary);
      font-size: 0.85rem;
      transition: background ${DURATION.FAST}ms;
    }
    
    .refresh-btn:hover {
      background: var(--color-border);
    }
    
    .refresh-btn svg {
      width: 16px;
      height: 16px;
    }
  `;
  document.head.appendChild(style);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initTrustDashboardUI,
  showTrustDashboard,
  hideTrustDashboard,
};

