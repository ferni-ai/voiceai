/**
 * @deprecated This file is deprecated and will be removed in a future version.
 *
 * Use `your-story-dashboard.ui.ts` instead, which provides:
 * - Unified narrative-focused dashboard (no tabs)
 * - All 9 cross-platform visualizations
 * - Consolidated analytics, stage, and milestones in header
 * - Demo data for new users
 *
 * Migration: The "Your Journey" menu item has been replaced with "Your Story"
 * which uses the new dashboard. This file is kept for reference only.
 *
 * @see your-story-dashboard.ui.ts
 * @see panel-methods.ts#showYourStoryDashboard
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ORIGINAL DOCSTRING (for reference):
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Insights Hub
 *
 * Unified dashboard that consolidates all insight views into one tabbed interface.
 * Combines: Analytics, Predictions, Wellbeing, Team Insights, Life Context, What I've Learned
 *
 * Design: Centered floating modal with tabs
 *
 * FULLY WIRED UP - Each tab loads real data from backend APIs:
 * - Journey: /api/insights/:userId
 * - Progress: /api/analytics/user
 * - Predictions: /api/insights/predictions
 * - Wellbeing: /api/wellbeing/dashboard
 * - Team: /api/team-insights
 * - World: /api/engagement/profile + context
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { t } from '../i18n/index.js';
import { apiGet, getUserId } from '../utils/api.js';
import {
  createLifeSeasonsElement,
  createConversationRiverElement,
  createMirrorElement,
  createEnergyFlowElement,
  createGrowthRingsElement,
  createValuesAlignmentElement,
  createUnfinishedStoriesElement,
  createRippleEffectsElement,
  injectStorytellingVisualizationStyles,
  type SeasonData,
  type ConversationTopic,
  type MirrorInsight,
  type EnergyNode,
  type EnergyFlow,
  type GrowthRing,
  type ValueAlignment,
  type UnfinishedStory,
  type RippleEffect,
} from './storytelling-visualizations.js';

const log = createLogger('InsightsHub');

// ============================================================================
// TYPES
// ============================================================================

type InsightTab = 'journey' | 'analytics' | 'predictions' | 'wellbeing' | 'team' | 'context' | 'stories';

interface InsightsHubCallbacks {
  onClose?: () => void;
}

// Journey API response
interface JourneyData {
  presence?: {
    weather: string;
    energy: 'high' | 'medium' | 'low';
    note?: string;
  };
  noticing?: Array<{
    type: 'pattern' | 'growth' | 'concern' | 'celebration' | 'memory';
    insight: string;
    evidence?: string;
  }>;
  chapter?: {
    title: string;
    type: string;
    duration?: string;
  };
  holding?: {
    commitments?: Array<{ text: string; daysAgo: number }>;
    dreams?: Array<{ dream: string; status: string }>;
    upcomingDates?: Array<{ name: string; daysUntil: number }>;
  };
  growth?: {
    message: string;
    details?: string;
  };
  relationship?: {
    daysTogether: number;
    conversations: number;
    milestone?: string;
  };
}

// Analytics API response
interface AnalyticsData {
  totalDays: number;
  totalRituals: number;
  currentLongestStreak: number;
  averageMood: number;
  predictionAccuracy: number | null;
  moodTrends: Array<{ date: string; mood: string; energy: string }>;
  bestDay: string | null;
  mostConsistentRitual: string | null;
  improvementAreas: string[];
}

// Predictions API response
interface PredictionsData {
  insights: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    suggestion?: string;
    priority: string;
    confidence?: number;
  }>;
  count: number;
}

// Wellbeing API response
interface WellbeingData {
  currentState: {
    mood: number;
    energy: number;
    anxiety: number;
    connection: number;
    purpose: number;
    sleep: number;
    lastUpdated: string;
  };
  trends: {
    direction: 'improving' | 'stable' | 'declining';
    changedDimensions: string[];
  };
  insights: Array<{
    type: string;
    message: string;
    dimension?: string;
  }>;
  streaks: {
    currentDays: number;
    bestDays: number;
  };
}

// Team Insights API response
interface TeamInsightsData {
  insights: Array<{
    id: string;
    source: string;
    category: string;
    summary: string;
    content: string;
    priority: string;
    isNew?: boolean;
  }>;
  teamStatus: {
    financialHealth?: { budgetOnTrack: boolean; savingsProgress: number };
    habitHealth?: { activeHabits: number; totalStreakDays: number };
    goalHealth?: { activeGoals: number; nearingCompletion: number };
  };
}

// Stories tab data - aggregates data for storytelling visualizations
// Note: These interfaces match the visualization component expectations
interface StoriesData {
  lifeSeasons: SeasonData[] | null;
  conversationRiver: ConversationTopic[] | null;
  mirror: MirrorInsight[] | null;
  energyFlow: { nodes: EnergyNode[]; flows: EnergyFlow[] } | null;
  growthRings: GrowthRing[] | null;
  valuesAlignment: ValueAlignment[] | null;
  unfinishedStories: UnfinishedStory[] | null;
  rippleEffects: RippleEffect | null;
}


// Tab data cache
interface TabDataCache {
  journey?: JourneyData;
  analytics?: AnalyticsData;
  predictions?: PredictionsData;
  wellbeing?: WellbeingData;
  team?: TeamInsightsData;
  context?: Record<string, unknown>;
  stories?: StoriesData;
}

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  journey: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  analytics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M7 16c0-4 1-8 4-10s5 2 6 6c1 4 2 4 4 4"/></svg>',
  predictions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  wellbeing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
  context: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 12-8.58 3.91a2 2 0 0 1-1.66 0L2.18 12"/><path d="m22 17-8.58 3.91a2 2 0 0 1-1.66 0L2.18 17"/></svg>',
  // Stories icon - represents narrative/book for storytelling visualizations
  stories: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8"/><path d="M8 11h6"/></svg>',
};

// ============================================================================
// INSIGHTS HUB UI CLASS
// ============================================================================

class InsightsHubUI {
  private container: HTMLElement | null = null;
  private callbacks: InsightsHubCallbacks = {};
  private activeTab: InsightTab = 'journey';
  private isVisible = false;
  private dataCache: TabDataCache = {};
  private loadingTabs: Set<InsightTab> = new Set();

  constructor() {
    this.cleanupOrphanedElements();
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  show(callbacks?: InsightsHubCallbacks): void {
    if (this.isVisible) return;
    
    this.callbacks = callbacks || {};
    this.cleanupOrphanedElements();
    this.dataCache = {}; // Clear cache on new open
    this.createModal();
    this.isVisible = true;
    
    // Load initial tab data
    void this.loadTabData(this.activeTab);
    
    log.debug('Insights Hub opened');
  }

  hide(): void {
    if (!this.isVisible || !this.container) return;
    
    this.container.classList.remove('visible');
    setTimeout(() => {
      this.container?.remove();
      this.container = null;
      this.isVisible = false;
    }, DURATION.SLOW);
    
    this.callbacks.onClose?.();
    log.debug('Insights Hub closed');
  }

  setTab(tab: InsightTab): void {
    this.activeTab = tab;
    void this.loadTabData(tab);
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private createModal(): void {
    const modal = document.createElement('div');
    modal.className = 'insights-hub-overlay';
    modal.innerHTML = `
      <div class="insights-hub-backdrop"></div>
      <div class="insights-hub-modal">
        <header class="insights-hub-header">
          <div class="insights-hub-header-content">
            <span class="insights-hub-eyebrow">UNDERSTANDING YOU</span>
            <h2>${t('menu.items.insights')}</h2>
          </div>
          <button class="insights-hub-close" aria-label="${t('common.close')}">${ICONS.close}</button>
        </header>
        
        <nav class="insights-hub-tabs" role="tablist">
          ${this.renderTabs()}
        </nav>
        
        <main class="insights-hub-content" id="insights-hub-content">
          ${this.renderLoadingState(this.activeTab)}
        </main>
      </div>
    `;

    document.body.appendChild(modal);
    this.container = modal;

    // Bind events
    this.bindEvents();

    // Animate in
    requestAnimationFrame(() => {
      modal.classList.add('visible');
    });
  }

  private renderTabs(): string {
    const tabs: { id: InsightTab; icon: string; label: string }[] = [
      { id: 'journey', icon: ICONS.journey, label: 'Journey' },
      { id: 'analytics', icon: ICONS.analytics, label: 'Progress' },
      { id: 'predictions', icon: ICONS.predictions, label: 'Predictions' },
      { id: 'wellbeing', icon: ICONS.wellbeing, label: 'Wellbeing' },
      { id: 'team', icon: ICONS.team, label: 'Team' },
      { id: 'context', icon: ICONS.context, label: 'World' },
      { id: 'stories', icon: ICONS.stories, label: 'Stories' },
    ];

    return tabs
      .map(
        (tab) => `
        <button 
          class="insights-hub-tab ${this.activeTab === tab.id ? 'active' : ''}"
          data-tab="${tab.id}"
          role="tab"
          aria-selected="${this.activeTab === tab.id}"
        >
          <span class="insights-hub-tab-icon">${tab.icon}</span>
          <span class="insights-hub-tab-label">${tab.label}</span>
        </button>
      `
      )
      .join('');
  }

  // ==========================================================================
  // DATA LOADING
  // ==========================================================================

  private async loadTabData(tab: InsightTab): Promise<void> {
    // Update UI to show loading
    this.updateContent(this.renderLoadingState(tab));
    
    // Check cache first
    if (this.dataCache[tab]) {
      this.updateContent(this.renderTabData(tab));
      return;
    }

    // Mark as loading
    this.loadingTabs.add(tab);

    try {
      switch (tab) {
        case 'journey':
          await this.loadJourneyData();
          break;
        case 'analytics':
          await this.loadAnalyticsData();
          break;
        case 'predictions':
          await this.loadPredictionsData();
          break;
        case 'wellbeing':
          await this.loadWellbeingData();
          break;
        case 'team':
          await this.loadTeamData();
          break;
        case 'context':
          await this.loadContextData();
          break;
        case 'stories':
          await this.loadStoriesData();
          break;
      }
    } catch (err) {
      log.warn({ tab, error: err }, 'Failed to load tab data');
    }

    this.loadingTabs.delete(tab);
    
    // Only update if still on same tab
    if (this.activeTab === tab) {
      this.updateContent(this.renderTabData(tab));
    }
  }

  private async loadJourneyData(): Promise<void> {
    // The insights API uses userId in the path
    const userId = getUserId();
    if (!userId) {
      log.debug('No user ID, skipping journey data load');
      return;
    }
    const result = await apiGet<JourneyData>(`/api/insights/${encodeURIComponent(userId)}`);
    if (result.ok && result.data) {
      this.dataCache.journey = result.data;
    }
  }

  private async loadAnalyticsData(): Promise<void> {
    const result = await apiGet<AnalyticsData>('/api/analytics/user');
    if (result.ok && result.data) {
      this.dataCache.analytics = result.data;
    }
  }

  private async loadPredictionsData(): Promise<void> {
    const result = await apiGet<PredictionsData>('/api/insights/predictions');
    if (result.ok && result.data) {
      this.dataCache.predictions = result.data;
    }
  }

  private async loadWellbeingData(): Promise<void> {
    const result = await apiGet<WellbeingData>('/api/wellbeing/dashboard');
    if (result.ok && result.data) {
      this.dataCache.wellbeing = result.data;
    }
  }

  private async loadTeamData(): Promise<void> {
    const result = await apiGet<TeamInsightsData>('/api/team-insights');
    if (result.ok && result.data) {
      this.dataCache.team = result.data;
    }
  }

  private async loadContextData(): Promise<void> {
    const result = await apiGet<Record<string, unknown>>('/api/engagement/profile');
    if (result.ok && result.data) {
      this.dataCache.context = result.data;
    }
  }

  private async loadStoriesData(): Promise<void> {
    // Stories data comes from aggregating other sources
    // In a real implementation, this would call a dedicated API
    // For now, we generate sample data to demonstrate the visualizations
    const now = new Date();
    const month = now.getMonth();

    // Determine current season
    let currentSeason: 'spring' | 'summer' | 'autumn' | 'winter';
    if (month >= 2 && month <= 4) currentSeason = 'spring';
    else if (month >= 5 && month <= 7) currentSeason = 'summer';
    else if (month >= 8 && month <= 10) currentSeason = 'autumn';
    else currentSeason = 'winter';

    // Generate mock data in the format expected by visualization components
    // Each visualization expects arrays matching the exported interface types
    const seasonInsight = currentSeason === 'winter'
      ? 'This is a time for rest and reflection. Your energy has naturally turned inward.'
      : currentSeason === 'spring'
      ? 'New beginnings are emerging. Your energy is shifting toward growth and renewal.'
      : currentSeason === 'summer'
      ? 'Your energy is at its peak. This is a time for action and expansion.'
      : 'A natural time for harvest and letting go. Integration is happening.';

    this.dataCache.stories = {
      lifeSeasons: [
        { season: currentSeason, label: 'Current Season', energy: 75, themes: ['growth', 'reflection'], insight: seasonInsight },
      ],
      conversationRiver: [
        { id: '1', name: 'Work', frequency: 45, trend: 'rising', lastMentioned: new Date(), emotionalWeight: 0.3 },
        { id: '2', name: 'Family', frequency: 32, trend: 'stable', lastMentioned: new Date(), emotionalWeight: 0.7 },
        { id: '3', name: 'Health', frequency: 28, trend: 'rising', lastMentioned: new Date(), emotionalWeight: 0.5 },
        { id: '4', name: 'Goals', frequency: 22, trend: 'falling', lastMentioned: new Date(), emotionalWeight: 0.4 },
        { id: '5', name: 'Finances', frequency: 15, trend: 'stable', lastMentioned: new Date(), emotionalWeight: -0.1 },
      ],
      mirror: [
        { surface: 'You mentioned feeling tired 8 times this week', deeper: 'The tiredness seems connected to boundary-setting challenges at work', pattern: 'recurring fatigue', invitation: 'What would rest look like for you?' },
        { surface: 'Most conversations happen between 9-11pm', deeper: 'Late-night conversations suggest processing needs that aren\'t being met during the day', pattern: 'late-night processing', invitation: 'What would it look like to create space for yourself during daylight hours?' },
      ],
      energyFlow: {
        nodes: [
          { id: 'morning', label: 'Morning routine', value: 25, type: 'source' },
          { id: 'work', label: 'Deep work', value: 35, type: 'source' },
          { id: 'exercise', label: 'Exercise', value: 20, type: 'source' },
          { id: 'social', label: 'Social time', value: 20, type: 'source' },
          { id: 'meetings', label: 'Meetings', value: 30, type: 'sink' },
          { id: 'commute', label: 'Commute', value: 20, type: 'sink' },
        ],
        flows: [
          { from: 'morning', to: 'work', value: 15, label: 'Focus' },
          { from: 'exercise', to: 'work', value: 10, label: 'Energy' },
          { from: 'work', to: 'meetings', value: 25, label: 'Drain' },
        ],
      },
      growthRings: [
        { period: '2022', label: 'Foundation', growth: 0.6, highlights: ['Started daily journaling'], color: 'var(--persona-ferni)' },
        { period: '2023', label: 'Discovery', growth: 0.8, highlights: ['Career transition'], color: 'var(--persona-maya)' },
        { period: '2024', label: 'Integration', growth: 0.7, highlights: ['Work-life balance focus'], color: 'var(--persona-alex)' },
      ],
      valuesAlignment: [
        { value: 'Family', stated: 95, lived: 75, gap: 20, insight: 'Opportunity to increase family time' },
        { value: 'Health', stated: 85, lived: 60, gap: 25, insight: 'Health habits could use attention' },
        { value: 'Growth', stated: 80, lived: 85, gap: -5, insight: 'Living your growth values well!' },
        { value: 'Creativity', stated: 70, lived: 40, gap: 30, insight: 'Biggest opportunity area' },
        { value: 'Connection', stated: 90, lived: 70, gap: 20, insight: 'Room for deeper connection' },
      ],
      unfinishedStories: [
        { id: '1', title: 'Learning Spanish', started: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000), lastMentioned: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), progress: 30, emotionalSignificance: 0.6, gentleReminder: 'Ready to pick this up again?' },
        { id: '2', title: 'Starting a side project', started: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), lastMentioned: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), progress: 50, emotionalSignificance: 0.8, gentleReminder: 'This excites you - what\'s next?' },
        { id: '3', title: 'Reconnecting with old friend', started: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), lastMentioned: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), progress: 70, emotionalSignificance: 0.7, gentleReminder: 'Time to reach out again?' },
      ],
      rippleEffects: {
        trigger: 'Started morning meditation',
        effects: [
          { area: 'Work focus', impact: 0.8, description: 'Better focus at work' },
          { area: 'Relationships', impact: 0.6, description: 'Less reactive in conflicts' },
          { area: 'Health', impact: 0.7, description: 'Sleeping better' },
        ],
        timeframe: 'Last 30 days',
      },
    };
  }

  // ==========================================================================
  // CONTENT RENDERING
  // ==========================================================================

  private updateContent(html: string): void {
    const contentEl = this.container?.querySelector('.insights-hub-content');
    if (contentEl) {
      contentEl.innerHTML = html;
    }
  }

  private renderLoadingState(tab: InsightTab): string {
    const descriptions: Record<InsightTab, { title: string; description: string }> = {
      journey: {
        title: t('menu.items.yourJourney'),
        description: 'Your growth story with Ferni. Milestones, breakthroughs, and how far you\'ve come.',
      },
      analytics: {
        title: t('menu.items.progressAnalytics'),
        description: 'See patterns in your conversations, topics you explore, and trends over time.',
      },
      predictions: {
        title: t('menu.items.predictionAccuracy'),
        description: 'How well we\'re getting to know you. Our predictions and their accuracy.',
      },
      wellbeing: {
        title: t('menu.items.wellbeingDashboard'),
        description: 'Your emotional patterns, energy levels, and overall wellbeing trends.',
      },
      team: {
        title: t('menu.items.teamInsights'),
        description: 'What the whole team notices about you. Cross-persona observations.',
      },
      context: {
        title: t('menu.items.lifeContext'),
        description: 'The full picture of your life. Work, relationships, health, and more.',
      },
      stories: {
        title: 'Your Story',
        description: 'What you notice, what I notice. Transforming metrics into meaning.',
      },
    };

    const content = descriptions[tab];
    return `
      <div class="insights-hub-panel" data-panel="${tab}">
        <div class="insights-hub-panel-header">
          <h3>${content.title}</h3>
          <p>${content.description}</p>
        </div>
        <div class="insights-hub-panel-body">
          <div class="insights-hub-loading">
            <div class="insights-hub-loading-spinner"></div>
            <span>Loading insights...</span>
          </div>
        </div>
      </div>
    `;
  }

  private renderTabData(tab: InsightTab): string {
    switch (tab) {
      case 'journey':
        return this.renderJourneyContent();
      case 'analytics':
        return this.renderAnalyticsContent();
      case 'predictions':
        return this.renderPredictionsContent();
      case 'wellbeing':
        return this.renderWellbeingContent();
      case 'team':
        return this.renderTeamContent();
      case 'context':
        return this.renderContextContent();
      case 'stories':
        return this.renderStoriesContent();
      default:
        return this.renderEmptyState('No data available');
    }
  }

  private renderJourneyContent(): string {
    const data = this.dataCache.journey;
    if (!data) return this.renderEmptyState('Start a conversation to see your journey');

    const sections: string[] = [];

    // Relationship milestone
    if (data.relationship) {
      sections.push(`
        <div class="insights-card insights-card--highlight">
          <div class="insights-card__icon">${ICONS.journey}</div>
          <div class="insights-card__content">
            <span class="insights-card__label">Journey Together</span>
            <p class="insights-card__value">${data.relationship.milestone || `${data.relationship.daysTogether} days, ${data.relationship.conversations} conversations`}</p>
          </div>
        </div>
      `);
    }

    // Current presence
    if (data.presence) {
      const weatherEmoji = this.getWeatherIcon(data.presence.weather);
      sections.push(`
        <div class="insights-card">
          <div class="insights-card__icon">${weatherEmoji}</div>
          <div class="insights-card__content">
            <span class="insights-card__label">How you're feeling</span>
            <p class="insights-card__value">${this.formatWeather(data.presence.weather)} • ${data.presence.energy} energy</p>
            ${data.presence.note ? `<p class="insights-card__note">"${this.escapeHtml(data.presence.note)}"</p>` : ''}
          </div>
        </div>
      `);
    }

    // What I'm noticing
    if (data.noticing && data.noticing.length > 0) {
      const noticingItems = data.noticing.slice(0, 3).map(n => `
        <div class="insights-notice insights-notice--${n.type}">
          <span class="insights-notice__icon">${this.getNoticeIcon(n.type)}</span>
          <div class="insights-notice__content">
            <p>${this.escapeHtml(n.insight)}</p>
            ${n.evidence ? `<span class="insights-notice__evidence">${this.escapeHtml(n.evidence)}</span>` : ''}
          </div>
        </div>
      `).join('');
      
      sections.push(`
        <div class="insights-section">
          <h4 class="insights-section__title">What I'm Noticing</h4>
          ${noticingItems}
        </div>
      `);
    }

    // Current chapter
    if (data.chapter) {
      sections.push(`
        <div class="insights-card insights-card--chapter">
          <span class="insights-card__badge">${data.chapter.type}</span>
          <h4 class="insights-card__title">${this.escapeHtml(data.chapter.title)}</h4>
          ${data.chapter.duration ? `<span class="insights-card__duration">${data.chapter.duration}</span>` : ''}
        </div>
      `);
    }

    // What I'm holding
    if (data.holding) {
      const holdingItems: string[] = [];
      
      if (data.holding.commitments?.length) {
        data.holding.commitments.slice(0, 2).forEach(c => {
          holdingItems.push(`<li class="insights-holding__item">${this.escapeHtml(c.text)} <span class="insights-holding__time">${this.formatDaysAgo(c.daysAgo)}</span></li>`);
        });
      }
      
      if (data.holding.dreams?.length) {
        data.holding.dreams.slice(0, 2).forEach(d => {
          holdingItems.push(`<li class="insights-holding__item insights-holding__item--dream">${this.escapeHtml(d.dream)}</li>`);
        });
      }
      
      if (data.holding.upcomingDates?.length) {
        data.holding.upcomingDates.slice(0, 2).forEach(u => {
          holdingItems.push(`<li class="insights-holding__item insights-holding__item--date">${this.escapeHtml(u.name)} <span class="insights-holding__time">${this.formatDaysUntil(u.daysUntil)}</span></li>`);
        });
      }

      if (holdingItems.length > 0) {
        sections.push(`
          <div class="insights-section">
            <h4 class="insights-section__title">What I'm Holding For You</h4>
            <ul class="insights-holding">${holdingItems.join('')}</ul>
          </div>
        `);
      }
    }

    // Growth
    if (data.growth) {
      sections.push(`
        <div class="insights-card insights-card--growth">
          <div class="insights-card__icon">${ICONS.analytics}</div>
          <div class="insights-card__content">
            <p class="insights-card__value">${this.escapeHtml(data.growth.message)}</p>
            ${data.growth.details ? `<span class="insights-card__details">${this.escapeHtml(data.growth.details)}</span>` : ''}
          </div>
        </div>
      `);
    }

    if (sections.length === 0) {
      return this.renderEmptyState('Keep talking with me. I\'ll share what I notice as we get to know each other.');
    }

    return `
      <div class="insights-hub-panel" data-panel="journey">
        <div class="insights-hub-panel-header">
          <h3>${t('menu.items.yourJourney')}</h3>
          <p>Your growth story with Ferni</p>
        </div>
        <div class="insights-hub-panel-body insights-hub-panel-body--journey">
          ${sections.join('')}
        </div>
      </div>
    `;
  }

  private renderAnalyticsContent(): string {
    const data = this.dataCache.analytics;
    if (!data) return this.renderEmptyState('Check in more to see your progress');

    const moodScore = data.averageMood ? Math.round(data.averageMood * 20) : 0; // Convert 0-5 to percentage

    return `
      <div class="insights-hub-panel" data-panel="analytics">
        <div class="insights-hub-panel-header">
          <h3>${t('menu.items.progressAnalytics')}</h3>
          <p>Your patterns and progress over time</p>
        </div>
        <div class="insights-hub-panel-body">
          <div class="insights-stats-grid">
            <div class="insights-stat">
              <span class="insights-stat__value">${data.totalDays}</span>
              <span class="insights-stat__label">Days Together</span>
            </div>
            <div class="insights-stat">
              <span class="insights-stat__value">${data.currentLongestStreak}</span>
              <span class="insights-stat__label">Day Streak</span>
            </div>
            <div class="insights-stat">
              <span class="insights-stat__value">${data.totalRituals}</span>
              <span class="insights-stat__label">Rituals Complete</span>
            </div>
            <div class="insights-stat">
              <span class="insights-stat__value">${moodScore}%</span>
              <span class="insights-stat__label">Avg Mood</span>
            </div>
          </div>

          ${data.predictionAccuracy !== null ? `
            <div class="insights-card">
              <div class="insights-card__content">
                <span class="insights-card__label">Prediction Accuracy</span>
                <p class="insights-card__value">${data.predictionAccuracy}%</p>
                <span class="insights-card__details">How well I'm learning you</span>
              </div>
            </div>
          ` : ''}

          ${data.bestDay ? `
            <div class="insights-card">
              <div class="insights-card__content">
                <span class="insights-card__label">Your Best Day</span>
                <p class="insights-card__value">${data.bestDay}</p>
                <span class="insights-card__details">Most consistent check-ins</span>
              </div>
            </div>
          ` : ''}

          ${data.mostConsistentRitual ? `
            <div class="insights-card">
              <div class="insights-card__content">
                <span class="insights-card__label">Most Consistent</span>
                <p class="insights-card__value">${this.escapeHtml(data.mostConsistentRitual)}</p>
              </div>
            </div>
          ` : ''}

          ${data.improvementAreas.length > 0 ? `
            <div class="insights-section">
              <h4 class="insights-section__title">Areas to Explore</h4>
              <ul class="insights-list">
                ${data.improvementAreas.map(area => `<li>${this.escapeHtml(area)}</li>`).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private renderPredictionsContent(): string {
    const data = this.dataCache.predictions;
    if (!data?.insights?.length) {
      return this.renderEmptyState('As I get to know you better, I\'ll share predictions here');
    }

    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    const sortedInsights = [...data.insights].sort((a, b) => 
      (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3) - 
      (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3)
    );

    const insightCards = sortedInsights.slice(0, 5).map(insight => `
      <div class="insights-prediction insights-prediction--${insight.priority}">
        <div class="insights-prediction__header">
          <span class="insights-prediction__type">${this.formatInsightType(insight.type)}</span>
          ${insight.confidence ? `<span class="insights-prediction__confidence">${Math.round(insight.confidence * 100)}% confident</span>` : ''}
        </div>
        <h4 class="insights-prediction__title">${this.escapeHtml(insight.title)}</h4>
        <p class="insights-prediction__message">${this.escapeHtml(insight.message)}</p>
        ${insight.suggestion ? `<p class="insights-prediction__suggestion">${this.escapeHtml(insight.suggestion)}</p>` : ''}
      </div>
    `).join('');

    return `
      <div class="insights-hub-panel" data-panel="predictions">
        <div class="insights-hub-panel-header">
          <h3>${t('menu.items.predictionAccuracy')}</h3>
          <p>What I think might help you</p>
        </div>
        <div class="insights-hub-panel-body">
          <div class="insights-predictions-list">
            ${insightCards}
          </div>
        </div>
      </div>
    `;
  }

  private renderWellbeingContent(): string {
    const data = this.dataCache.wellbeing;
    if (!data) return this.renderEmptyState('Check in to start tracking your wellbeing');

    const dimensions = [
      { key: 'mood', label: 'Mood', value: data.currentState.mood },
      { key: 'energy', label: 'Energy', value: data.currentState.energy },
      { key: 'connection', label: 'Connection', value: data.currentState.connection },
      { key: 'purpose', label: 'Purpose', value: data.currentState.purpose },
      { key: 'sleep', label: 'Sleep', value: data.currentState.sleep },
    ];

    const dimensionCards = dimensions.map(d => {
      const percentage = Math.round(d.value * 100);
      return `
        <div class="insights-dimension">
          <div class="insights-dimension__header">
            <span class="insights-dimension__label">${d.label}</span>
            <span class="insights-dimension__value">${percentage}%</span>
          </div>
          <div class="insights-dimension__bar">
            <div class="insights-dimension__fill" style="width: ${percentage}%"></div>
          </div>
        </div>
      `;
    }).join('');

    const trendIcon = data.trends.direction === 'improving' ? '↗' : 
                       data.trends.direction === 'declining' ? '↘' : '→';
    const trendClass = data.trends.direction;

    return `
      <div class="insights-hub-panel" data-panel="wellbeing">
        <div class="insights-hub-panel-header">
          <h3>${t('menu.items.wellbeingDashboard')}</h3>
          <p>How you've been feeling lately</p>
        </div>
        <div class="insights-hub-panel-body">
          <div class="insights-card insights-card--trend insights-card--trend-${trendClass}">
            <span class="insights-trend__icon">${trendIcon}</span>
            <span class="insights-trend__label">Overall trend: ${data.trends.direction}</span>
          </div>

          <div class="insights-dimensions">
            ${dimensionCards}
          </div>

          ${data.streaks.currentDays > 0 ? `
            <div class="insights-card">
              <div class="insights-card__content">
                <span class="insights-card__label">Check-in Streak</span>
                <p class="insights-card__value">${data.streaks.currentDays} days</p>
                <span class="insights-card__details">Best: ${data.streaks.bestDays} days</span>
              </div>
            </div>
          ` : ''}

          ${data.insights.length > 0 ? `
            <div class="insights-section">
              <h4 class="insights-section__title">What I Notice</h4>
              ${data.insights.slice(0, 3).map(i => `
                <div class="insights-notice insights-notice--${i.type}">
                  <p>${this.escapeHtml(i.message)}</p>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private renderTeamContent(): string {
    const data = this.dataCache.team;
    if (!data?.insights?.length) {
      return this.renderEmptyState('The team is still getting to know you. Check back soon!');
    }

    const personaColors: Record<string, string> = {
      peter: 'var(--persona-peter, #3a6b73)',
      maya: 'var(--persona-maya, #a67a6a)',
      jordan: 'var(--persona-jordan, #c4856a)',
      nayan: 'var(--persona-nayan, #8a7a6a)',
      alex: 'var(--persona-alex, #5a6b8a)',
      ferni: 'var(--persona-ferni, #4a6741)',
    };

    const insightCards = data.insights.slice(0, 6).map(insight => `
      <div class="insights-team-insight" style="--persona-color: ${personaColors[insight.source] || 'var(--color-accent)'}">
        <div class="insights-team-insight__header">
          <span class="insights-team-insight__source">${this.capitalizeFirst(insight.source)}</span>
          ${insight.isNew ? '<span class="insights-team-insight__badge">New</span>' : ''}
        </div>
        <p class="insights-team-insight__content">${this.escapeHtml(insight.content)}</p>
      </div>
    `).join('');

    // Team status summary
    const statusItems: string[] = [];
    if (data.teamStatus.habitHealth) {
      statusItems.push(`${data.teamStatus.habitHealth.activeHabits} active habits`);
    }
    if (data.teamStatus.goalHealth) {
      statusItems.push(`${data.teamStatus.goalHealth.activeGoals} goals in progress`);
    }

    return `
      <div class="insights-hub-panel" data-panel="team">
        <div class="insights-hub-panel-header">
          <h3>${t('menu.items.teamInsights')}</h3>
          <p>What the whole team notices about you</p>
        </div>
        <div class="insights-hub-panel-body">
          ${statusItems.length > 0 ? `
            <div class="insights-team-status">
              ${statusItems.map(s => `<span class="insights-team-status__item">${s}</span>`).join('')}
            </div>
          ` : ''}
          <div class="insights-team-grid">
            ${insightCards}
          </div>
        </div>
      </div>
    `;
  }

  private renderContextContent(): string {
    const data = this.dataCache.context;
    if (!data) return this.renderEmptyState('Share more about your life and I\'ll build a picture here');

    // Context is a general profile, render what we have
    const sections: string[] = [];

    if (typeof data === 'object') {
      const profile = data;

      if (typeof profile.totalRitualDays === 'number') {
        sections.push(`
          <div class="insights-card">
            <div class="insights-card__content">
              <span class="insights-card__label">Days of Practice</span>
              <p class="insights-card__value">${profile.totalRitualDays}</p>
            </div>
          </div>
        `);
      }

      if (profile.stats && typeof profile.stats === 'object') {
        const stats = profile.stats as Record<string, number>;
        if (stats.totalSkyChecks) {
          sections.push(`
            <div class="insights-card">
              <div class="insights-card__content">
                <span class="insights-card__label">Sky Checks</span>
                <p class="insights-card__value">${stats.totalSkyChecks}</p>
              </div>
            </div>
          `);
        }
      }
    }

    if (sections.length === 0) {
      return this.renderEmptyState('Your world context will build as we talk more');
    }

    return `
      <div class="insights-hub-panel" data-panel="context">
        <div class="insights-hub-panel-header">
          <h3>${t('menu.items.lifeContext')}</h3>
          <p>The full picture of your life</p>
        </div>
        <div class="insights-hub-panel-body">
          ${sections.join('')}
        </div>
      </div>
    `;
  }

  private renderStoriesContent(): string {
    const data = this.dataCache.stories;
    if (!data) {
      return this.renderEmptyState('Keep talking with me. Your story will unfold here.');
    }

    // Inject storytelling visualization styles
    injectStorytellingVisualizationStyles();

    // Create the container with a placeholder for DOM-based visualizations
    const html = `
      <div class="insights-hub-panel insights-hub-panel--stories" data-panel="stories">
        <div class="insights-hub-panel-header">
          <h3>Your Story</h3>
          <p>What you notice, what I notice. Transforming metrics into meaning.</p>
        </div>
        <div class="insights-hub-panel-body insights-hub-stories-body">
          <div class="stories-section stories-section--two-pattern">
            <div class="stories-section__header">
              <span class="stories-section__eyebrow">THE TWO-PATTERN</span>
              <h4>Surface / Deeper</h4>
            </div>
            <p class="stories-section__intro">Every insight has two layers. What the data shows, and what it means.</p>
          </div>
          <div id="stories-visualizations-container"></div>
        </div>
      </div>
    `;

    // After the HTML is rendered, populate with DOM elements
    setTimeout(() => this.populateStoriesVisualizations(), 0);

    return html;
  }

  private populateStoriesVisualizations(): void {
    const container = this.container?.querySelector('#stories-visualizations-container');
    if (!container || !this.dataCache.stories) return;

    const data = this.dataCache.stories;

    // Create visualization sections
    const sections: HTMLElement[] = [];

    // 1. Life Seasons
    if (data.lifeSeasons) {
      const section = document.createElement('div');
      section.className = 'stories-viz-section';
      section.appendChild(createLifeSeasonsElement(data.lifeSeasons));
      sections.push(section);
    }

    // 2. Conversation River
    if (data.conversationRiver) {
      const section = document.createElement('div');
      section.className = 'stories-viz-section';
      section.appendChild(createConversationRiverElement(data.conversationRiver));
      sections.push(section);
    }

    // 3. The Mirror
    if (data.mirror) {
      const section = document.createElement('div');
      section.className = 'stories-viz-section';
      section.appendChild(createMirrorElement(data.mirror));
      sections.push(section);
    }

    // 4. Energy Flow
    if (data.energyFlow) {
      const section = document.createElement('div');
      section.className = 'stories-viz-section';
      section.appendChild(createEnergyFlowElement(data.energyFlow.nodes, data.energyFlow.flows));
      sections.push(section);
    }

    // 5. Growth Rings
    if (data.growthRings) {
      const section = document.createElement('div');
      section.className = 'stories-viz-section';
      section.appendChild(createGrowthRingsElement(data.growthRings));
      sections.push(section);
    }

    // 6. Values Alignment
    if (data.valuesAlignment) {
      const section = document.createElement('div');
      section.className = 'stories-viz-section';
      section.appendChild(createValuesAlignmentElement(data.valuesAlignment));
      sections.push(section);
    }

    // 7. Unfinished Stories
    if (data.unfinishedStories) {
      const section = document.createElement('div');
      section.className = 'stories-viz-section';
      section.appendChild(createUnfinishedStoriesElement(data.unfinishedStories));
      sections.push(section);
    }

    // 8. Ripple Effects
    if (data.rippleEffects) {
      const section = document.createElement('div');
      section.className = 'stories-viz-section';
      section.appendChild(createRippleEffectsElement(data.rippleEffects));
      sections.push(section);
    }

    // Append all sections
    sections.forEach(section => container.appendChild(section));
  }

  private renderEmptyState(message: string): string {
    return `
      <div class="insights-hub-panel">
        <div class="insights-hub-empty">
          <div class="insights-hub-empty__icon">${ICONS.journey}</div>
          <p class="insights-hub-empty__message">${this.escapeHtml(message)}</p>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private formatDaysAgo(days: number): string {
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    return `${days} days ago`;
  }

  private formatDaysUntil(days: number): string {
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    return `in ${days} days`;
  }

  private getWeatherIcon(weather: string): string {
    const icons: Record<string, string> = {
      sunny: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
      cloudy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>',
      rainy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/></svg>',
      stormy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/></svg>',
    };
    return icons[weather] ?? icons.cloudy ?? '';
  }

  private formatWeather(weather: string): string {
    const labels: Record<string, string> = {
      sunny: 'Sunny skies',
      'partly-cloudy': 'Partly cloudy',
      cloudy: 'Cloudy',
      rainy: 'Rainy',
      stormy: 'Stormy',
      foggy: 'Foggy',
      rainbow: 'Rainbow',
    };
    return labels[weather] || weather;
  }

  private getNoticeIcon(type: string): string {
    const icons: Record<string, string> = {
      pattern: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
      growth: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/></svg>',
      concern: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
      celebration: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>',
      memory: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
    };
    return icons[type] ?? icons.pattern ?? '';
  }

  private formatInsightType(type: string): string {
    const labels: Record<string, string> = {
      energy_pattern: 'Energy',
      mood_prediction: 'Mood',
      habit_suggestion: 'Habits',
      relationship_insight: 'Relationships',
      goal_progress: 'Goals',
      stress_alert: 'Stress',
    };
    return labels[type] || this.capitalizeFirst(type.replace(/_/g, ' '));
  }

  private bindEvents(): void {
    if (!this.container) return;

    // Close button
    this.container.querySelector('.insights-hub-close')?.addEventListener('click', () => {
      this.hide();
    });

    // Backdrop click
    this.container.querySelector('.insights-hub-backdrop')?.addEventListener('click', () => {
      this.hide();
    });

    // Tab clicks
    this.container.querySelectorAll('.insights-hub-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabId = (tab as HTMLElement).dataset.tab as InsightTab;
        this.setTabActive(tabId);
      });
    });

    // Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.hide();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  private setTabActive(tab: InsightTab): void {
    this.activeTab = tab;
    
    // Update tab buttons
    this.container?.querySelectorAll('.insights-hub-tab').forEach((el) => {
      const isActive = (el as HTMLElement).dataset.tab === tab;
      el.classList.toggle('active', isActive);
      el.setAttribute('aria-selected', String(isActive));
    });

    // Load data for the new tab
    void this.loadTabData(tab);
  }

  private cleanupOrphanedElements(): void {
    document.querySelectorAll('.insights-hub-overlay').forEach((el) => el.remove());
  }
}

// ============================================================================
// STYLES
// ============================================================================

const styles = `
.insights-hub-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal, 2100);
  opacity: 0;
  visibility: hidden;
  transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD},
              visibility ${DURATION.SLOW}ms ${EASING.STANDARD};
}

.insights-hub-overlay.visible {
  opacity: 1;
  visibility: visible;
}

.insights-hub-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(44, 37, 32, 0.75);
}

.insights-hub-modal {
  position: relative;
  background: var(--color-background-elevated, #fffdfb);
  border-radius: var(--radius-2xl, 24px);
  box-shadow: var(--shadow-2xl);
  width: calc(100% - var(--space-8, 32px));
  max-width: 720px;
  max-height: calc(100vh - var(--space-16, 64px));
  display: flex;
  flex-direction: column;
  transform: scale(0.95);
  transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
  overflow: hidden;
}

.insights-hub-overlay.visible .insights-hub-modal {
  transform: scale(1);
}

/* Header */
.insights-hub-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--space-6, 24px);
  border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
}

.insights-hub-eyebrow {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  color: var(--color-accent, #3D5A45);
  text-transform: uppercase;
  margin-bottom: var(--space-1, 4px);
  display: block;
}

.insights-hub-header h2 {
  font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary, #2C2520);
  margin: 0;
}

.insights-hub-close {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-full, 9999px);
  color: var(--color-text-muted, #9a8f85);
  cursor: pointer;
  transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
}

.insights-hub-close:hover {
  background: var(--color-background-subtle, rgba(44, 37, 32, 0.04));
  color: var(--color-text-primary, #2C2520);
}

.insights-hub-close svg {
  width: 20px;
  height: 20px;
}

/* Tabs */
.insights-hub-tabs {
  display: flex;
  gap: var(--space-1, 4px);
  padding: var(--space-3, 12px) var(--space-6, 24px);
  border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.insights-hub-tab {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: var(--space-2, 8px) var(--space-3, 12px);
  background: transparent;
  border: none;
  border-radius: var(--radius-lg, 12px);
  color: var(--color-text-muted, #9a8f85);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background ${DURATION.FAST}ms, color ${DURATION.FAST}ms;
}

.insights-hub-tab:hover {
  background: var(--color-background-subtle, rgba(44, 37, 32, 0.04));
  color: var(--color-text-secondary, #5c544a);
}

.insights-hub-tab.active {
  background: var(--color-accent, #3D5A45);
  color: white;
}

.insights-hub-tab-icon svg {
  width: 18px;
  height: 18px;
}

/* Content */
.insights-hub-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6, 24px);
}

.insights-hub-panel-header {
  margin-bottom: var(--space-6, 24px);
}

.insights-hub-panel-header h3 {
  font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-text-primary, #2C2520);
  margin: 0 0 var(--space-2, 8px);
}

.insights-hub-panel-header p {
  font-size: 0.9rem;
  color: var(--color-text-muted, #9a8f85);
  margin: 0;
  line-height: 1.5;
}

.insights-hub-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12, 48px);
  color: var(--color-text-muted, #9a8f85);
  gap: var(--space-3, 12px);
}

.insights-hub-loading-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
  border-top-color: var(--color-accent, #3D5A45);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Empty state */
.insights-hub-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12, 48px) var(--space-6, 24px);
  text-align: center;
}

.insights-hub-empty__icon {
  width: 48px;
  height: 48px;
  margin-bottom: var(--space-4, 16px);
  color: var(--color-text-dimmed, #b5a99d);
}

.insights-hub-empty__icon svg {
  width: 100%;
  height: 100%;
}

.insights-hub-empty__message {
  font-size: 0.95rem;
  color: var(--color-text-muted, #9a8f85);
  line-height: 1.5;
  max-width: 280px;
  margin: 0;
}

/* Stats grid */
.insights-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3, 12px);
  margin-bottom: var(--space-5, 20px);
}

.insights-stat {
  background: var(--color-background-secondary, rgba(44, 37, 32, 0.03));
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-4, 16px);
  text-align: center;
}

.insights-stat__value {
  display: block;
  font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text-primary, #2C2520);
}

.insights-stat__label {
  font-size: 0.75rem;
  color: var(--color-text-muted, #9a8f85);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Insight cards */
.insights-card {
  background: var(--color-background-secondary, rgba(44, 37, 32, 0.03));
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-4, 16px);
  margin-bottom: var(--space-3, 12px);
  display: flex;
  gap: var(--space-3, 12px);
}

.insights-card--highlight {
  background: linear-gradient(135deg, var(--color-accent, #3D5A45) 0%, var(--color-accent-secondary, #4a6741) 100%);
  color: white;
}

.insights-card--highlight .insights-card__label,
.insights-card--highlight .insights-card__value {
  color: white;
}

.insights-card--chapter {
  flex-direction: column;
  gap: var(--space-2, 8px);
}

.insights-card--growth {
  background: var(--color-semantic-success-glow, rgba(74, 103, 65, 0.1));
  border: 1px solid var(--color-semantic-success, #4a6741);
}

.insights-card--trend {
  flex-direction: row;
  align-items: center;
  gap: var(--space-3, 12px);
}

.insights-card--trend-improving {
  background: var(--color-semantic-success-glow, rgba(74, 103, 65, 0.1));
}

.insights-card--trend-declining {
  background: var(--color-semantic-warning-glow, rgba(180, 110, 60, 0.1));
}

.insights-trend__icon {
  font-size: 1.5rem;
}

.insights-trend__label {
  font-size: 0.9rem;
  color: var(--color-text-primary, #2C2520);
}

.insights-card__icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--color-accent, #3D5A45);
}

.insights-card__icon svg {
  width: 24px;
  height: 24px;
}

.insights-card__content {
  flex: 1;
  min-width: 0;
}

.insights-card__label {
  display: block;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted, #9a8f85);
  margin-bottom: var(--space-1, 4px);
}

.insights-card__value {
  font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text-primary, #2C2520);
  margin: 0;
}

.insights-card__note,
.insights-card__details {
  font-size: 0.8rem;
  color: var(--color-text-muted, #9a8f85);
  margin-top: var(--space-1, 4px);
}

.insights-card__badge {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-accent, #3D5A45);
  background: var(--color-accent-subtle, rgba(74, 103, 65, 0.1));
  padding: var(--space-1, 4px) var(--space-2, 8px);
  border-radius: var(--radius-full, 9999px);
}

.insights-card__title {
  font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text-primary, #2C2520);
  margin: var(--space-1, 4px) 0;
}

.insights-card__duration {
  font-size: 0.8rem;
  color: var(--color-text-muted, #9a8f85);
}

/* Sections */
.insights-section {
  margin-bottom: var(--space-5, 20px);
}

.insights-section__title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted, #9a8f85);
  margin: 0 0 var(--space-3, 12px);
}

/* Notices */
.insights-notice {
  display: flex;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px);
  background: var(--color-background-secondary, rgba(44, 37, 32, 0.03));
  border-radius: var(--radius-md, 8px);
  margin-bottom: var(--space-2, 8px);
  border-left: 3px solid var(--color-accent, #3D5A45);
}

.insights-notice--concern {
  border-left-color: var(--color-semantic-warning, #b46e3c);
}

.insights-notice--celebration {
  border-left-color: var(--color-semantic-success, #4a6741);
  background: var(--color-semantic-success-glow, rgba(74, 103, 65, 0.08));
}

.insights-notice__icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: var(--color-accent, #3D5A45);
}

.insights-notice__icon svg {
  width: 100%;
  height: 100%;
}

.insights-notice__content {
  flex: 1;
  min-width: 0;
}

.insights-notice__content p {
  font-size: 0.9rem;
  color: var(--color-text-primary, #2C2520);
  margin: 0;
  line-height: 1.4;
}

.insights-notice__evidence {
  display: block;
  font-size: 0.75rem;
  color: var(--color-text-muted, #9a8f85);
  margin-top: var(--space-1, 4px);
  font-style: italic;
}

/* Holding list */
.insights-holding {
  list-style: none;
  padding: 0;
  margin: 0;
}

.insights-holding__item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: var(--space-3, 12px);
  background: var(--color-background-secondary, rgba(44, 37, 32, 0.03));
  border-radius: var(--radius-md, 8px);
  margin-bottom: var(--space-2, 8px);
  font-size: 0.9rem;
  color: var(--color-text-primary, #2C2520);
}

.insights-holding__item--dream {
  border-left: 3px solid var(--color-semantic-warning, #b46e3c);
}

.insights-holding__item--date {
  border-left: 3px solid var(--color-accent, #3D5A45);
}

.insights-holding__time {
  font-size: 0.75rem;
  color: var(--color-text-muted, #9a8f85);
  flex-shrink: 0;
  margin-left: var(--space-2, 8px);
}

/* Dimensions (wellbeing) */
.insights-dimensions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
  margin-bottom: var(--space-5, 20px);
}

.insights-dimension {
  background: var(--color-background-secondary, rgba(44, 37, 32, 0.03));
  border-radius: var(--radius-md, 8px);
  padding: var(--space-3, 12px);
}

.insights-dimension__header {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--space-2, 8px);
}

.insights-dimension__label {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-text-primary, #2C2520);
}

.insights-dimension__value {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-accent, #3D5A45);
}

.insights-dimension__bar {
  height: 6px;
  background: var(--color-border-subtle, rgba(44, 37, 32, 0.1));
  border-radius: var(--radius-full, 9999px);
  overflow: hidden;
}

.insights-dimension__fill {
  height: 100%;
  background: var(--color-accent, #3D5A45);
  border-radius: var(--radius-full, 9999px);
  transition: width ${DURATION.SLOW}ms ${EASING.SPRING};
}

/* Predictions */
.insights-predictions-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.insights-prediction {
  background: var(--color-background-secondary, rgba(44, 37, 32, 0.03));
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-4, 16px);
  border-left: 4px solid var(--color-accent, #3D5A45);
}

.insights-prediction--high,
.insights-prediction--urgent {
  border-left-color: var(--color-semantic-warning, #b46e3c);
  background: var(--color-semantic-warning-glow, rgba(180, 110, 60, 0.08));
}

.insights-prediction__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2, 8px);
}

.insights-prediction__type {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-accent, #3D5A45);
}

.insights-prediction__confidence {
  font-size: 0.7rem;
  color: var(--color-text-muted, #9a8f85);
}

.insights-prediction__title {
  font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-primary, #2C2520);
  margin: 0 0 var(--space-2, 8px);
}

.insights-prediction__message {
  font-size: 0.9rem;
  color: var(--color-text-secondary, #5c544a);
  line-height: 1.5;
  margin: 0;
}

.insights-prediction__suggestion {
  font-size: 0.85rem;
  color: var(--color-accent, #3D5A45);
  font-style: italic;
  margin: var(--space-2, 8px) 0 0;
}

/* Team insights */
.insights-team-status {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2, 8px);
  margin-bottom: var(--space-4, 16px);
}

.insights-team-status__item {
  font-size: 0.8rem;
  color: var(--color-text-muted, #9a8f85);
  background: var(--color-background-secondary, rgba(44, 37, 32, 0.03));
  padding: var(--space-1, 4px) var(--space-3, 12px);
  border-radius: var(--radius-full, 9999px);
}

.insights-team-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-3, 12px);
}

.insights-team-insight {
  background: var(--color-background-secondary, rgba(44, 37, 32, 0.03));
  border-radius: var(--radius-lg, 12px);
  padding: var(--space-4, 16px);
  border-left: 4px solid var(--persona-color, var(--color-accent));
}

.insights-team-insight__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-2, 8px);
}

.insights-team-insight__source {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--persona-color, var(--color-accent));
}

.insights-team-insight__badge {
  font-size: 0.65rem;
  font-weight: 600;
  background: var(--color-accent, #3D5A45);
  color: white;
  padding: 2px 6px;
  border-radius: var(--radius-full, 9999px);
}

.insights-team-insight__content {
  font-size: 0.9rem;
  color: var(--color-text-primary, #2C2520);
  line-height: 1.5;
  margin: 0;
}

/* Generic list */
.insights-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.insights-list li {
  padding: var(--space-2, 8px) var(--space-3, 12px);
  background: var(--color-background-secondary, rgba(44, 37, 32, 0.03));
  border-radius: var(--radius-md, 8px);
  margin-bottom: var(--space-2, 8px);
  font-size: 0.9rem;
  color: var(--color-text-secondary, #5c544a);
}

/* Stories tab */
.insights-hub-panel--stories .insights-hub-stories-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-6, 24px);
}

.stories-section {
  margin-bottom: var(--space-4, 16px);
}

.stories-section--two-pattern {
  text-align: center;
  padding: var(--space-4, 16px);
  background: linear-gradient(135deg,
    var(--color-background-secondary, rgba(44, 37, 32, 0.02)),
    var(--color-background-tertiary, rgba(44, 37, 32, 0.04))
  );
  border-radius: var(--radius-xl, 16px);
}

.stories-section__header {
  margin-bottom: var(--space-2, 8px);
}

.stories-section__eyebrow {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--color-accent, #3D5A45);
  display: block;
  margin-bottom: var(--space-1, 4px);
}

.stories-section__header h4 {
  font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--color-text-primary, #2C2520);
  margin: 0;
}

.stories-section__intro {
  font-size: 0.85rem;
  color: var(--color-text-muted, #9a8f85);
  line-height: 1.5;
  margin: 0;
}

#stories-visualizations-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-5, 20px);
}

.stories-viz-section {
  animation: stories-fade-in 0.4s ease-out forwards;
  opacity: 0;
}

.stories-viz-section:nth-child(1) { animation-delay: 0.05s; }
.stories-viz-section:nth-child(2) { animation-delay: 0.1s; }
.stories-viz-section:nth-child(3) { animation-delay: 0.15s; }
.stories-viz-section:nth-child(4) { animation-delay: 0.2s; }
.stories-viz-section:nth-child(5) { animation-delay: 0.25s; }
.stories-viz-section:nth-child(6) { animation-delay: 0.3s; }
.stories-viz-section:nth-child(7) { animation-delay: 0.35s; }
.stories-viz-section:nth-child(8) { animation-delay: 0.4s; }

@keyframes stories-fade-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Mobile adjustments */
@media (max-width: 640px) {
  .insights-hub-modal {
    max-height: calc(100vh - var(--space-8, 32px));
    border-radius: var(--radius-xl, 16px);
  }

  .insights-hub-tabs {
    padding: var(--space-2, 8px) var(--space-4, 16px);
  }

  .insights-hub-tab-label {
    display: none;
  }

  .insights-hub-tab {
    padding: var(--space-2, 8px);
  }
}

/* Dark theme */
[data-theme="midnight"] .insights-hub-backdrop {
  background: rgba(10, 10, 12, 0.7);
}

[data-theme="midnight"] .insights-hub-modal {
  background: var(--color-background-elevated, #1a1a1e);
}

[data-theme="midnight"] .insights-hub-header,
[data-theme="midnight"] .insights-hub-tabs {
  border-bottom-color: rgba(255, 255, 255, 0.06);
}
`;

// Inject styles
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}

// ============================================================================
// EXPORTS (DEPRECATED)
// ============================================================================

const insightsHubUI = new InsightsHubUI();

/**
 * @deprecated Use `showYourStoryDashboard()` from `panel-methods.ts` instead.
 */
export function showInsightsHub(callbacks?: InsightsHubCallbacks): void {
  insightsHubUI.show(callbacks);
}

/**
 * @deprecated Use `hideYourStory()` from `your-story-dashboard.ui.ts` instead.
 */
export function hideInsightsHub(): void {
  insightsHubUI.hide();
}

/**
 * @deprecated Use `getYourStoryUI()` from `your-story-dashboard.ui.ts` instead.
 */
export { insightsHubUI };

