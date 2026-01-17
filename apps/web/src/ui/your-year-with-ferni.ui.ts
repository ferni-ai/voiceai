/**
 * "Your Year with Ferni" Visualization
 *
 * A beautiful, data-rich visualization showing the user's journey with Ferni.
 *
 * Displays:
 * - Conversation frequency over time (heat map)
 * - Emotional journey timeline
 * - Team members unlocked
 * - Dreams tracked & progress
 * - Commitments kept
 * - Milestones celebrated
 * - Relationship network growth
 *
 * Philosophy: This visualization shows the value Ferni provides beyond
 * individual conversations - the arc of growth, the threads of continuity,
 * the "Better Than Human" perfect memory in visual form.
 *
 * @module your-year-with-ferni
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';
import { apiGet } from '../utils/api.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('YourYearWithFerni');

// ============================================================================
// TYPES
// ============================================================================

export interface YearData {
  userId: string;
  startDate: Date;
  conversationCounts: DayData[];
  emotionalJourney: EmotionalMoment[];
  teamUnlocks: TeamUnlock[];
  dreams: DreamProgress[];
  commitments: CommitmentSummary[];
  milestones: Milestone[];
  topTopics: TopicSummary[];
  relationshipGrowth: RelationshipGrowth;
  stats: YearStats;
}

export interface DayData {
  date: string; // YYYY-MM-DD
  count: number;
  dominantEmotion?: string;
}

export interface EmotionalMoment {
  date: Date;
  emotion: string;
  context?: string;
  intensity: number;
}

export interface TeamUnlock {
  personaId: string;
  personaName: string;
  unlockedAt: Date;
  primaryColor: string;
}

export interface DreamProgress {
  dream: string;
  type: string;
  mentionedAt: Date;
  status: 'active' | 'dormant' | 'achieved';
  mentionCount: number;
}

export interface CommitmentSummary {
  type: 'intention' | 'promise' | 'decision';
  count: number;
  followedUp: number;
}

export interface Milestone {
  date: Date;
  type: string;
  description: string;
}

export interface TopicSummary {
  topic: string;
  count: number;
  lastDiscussed: Date;
}

export interface RelationshipGrowth {
  peopleTracked: number;
  newConnections: number;
  deepenedRelationships: number;
}

export interface YearStats {
  totalConversations: number;
  totalMinutes: number;
  longestStreak: number;
  currentStreak: number;
  averageConversationsPerWeek: number;
  mostActiveMonth: string;
  teamMembersUnlocked: number;
  dreamsTracked: number;
  commitmentsKept: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export class YourYearWithFerni {
  private container: HTMLElement | null = null;
  private data: YearData | null = null;
  private isOpen = false;

  constructor() {
    this.cleanupOrphaned();
  }

  private cleanupOrphaned(): void {
    document.querySelectorAll('.your-year-overlay').forEach((el) => el.remove());
  }

  /**
   * Open the visualization.
   */
  async open(userId: string): Promise<void> {
    if (this.isOpen) return;

    this.isOpen = true;
    log.debug({ userId }, 'Opening Your Year with Ferni');

    // Load data
    this.data = await this.loadYearData(userId);

    // Create and show UI
    this.createUI();
    await this.animateIn();
  }

  /**
   * Close the visualization.
   */
  async close(): Promise<void> {
    if (!this.isOpen || !this.container) return;

    await this.animateOut();
    this.container.remove();
    this.container = null;
    this.isOpen = false;
  }

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  private async loadYearData(userId: string): Promise<YearData> {
    try {
      const response = await apiGet<YearData>(`/api/year-in-review/${userId}`);
      if (response.ok && response.data) {
        return response.data;
      }
    } catch (error) {
      log.warn({ error }, 'Failed to load year data, using placeholder');
    }

    // Return placeholder data for demo
    return this.getPlaceholderData(userId);
  }

  private getPlaceholderData(userId: string): YearData {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setFullYear(startDate.getFullYear() - 1);

    // Generate conversation counts
    const conversationCounts: DayData[] = [];
    const current = new Date(startDate);
    while (current <= today) {
      const dayOfWeek = current.getDay();
      // More conversations on weekdays
      const baseCount = dayOfWeek === 0 || dayOfWeek === 6 ? 0 : Math.floor(Math.random() * 3);
      if (baseCount > 0 || Math.random() > 0.7) {
        const emotions = ['neutral', 'happy', 'reflective', 'stressed'] as const;
        conversationCounts.push({
          date: current.toISOString().split('T')[0] ?? '',
          count: baseCount || Math.floor(Math.random() * 2) + 1,
          dominantEmotion: emotions[Math.floor(Math.random() * 4)] ?? 'neutral',
        });
      }
      current.setDate(current.getDate() + 1);
    }

    return {
      userId,
      startDate,
      conversationCounts,
      emotionalJourney: [
        {
          date: new Date('2024-03-15'),
          emotion: 'breakthrough',
          context: 'Career clarity',
          intensity: 0.9,
        },
        {
          date: new Date('2024-06-20'),
          emotion: 'celebration',
          context: 'Promotion',
          intensity: 0.85,
        },
        {
          date: new Date('2024-09-10'),
          emotion: 'growth',
          context: 'New perspective',
          intensity: 0.7,
        },
      ],
      teamUnlocks: [
        {
          personaId: 'ferni',
          personaName: 'Ferni',
          unlockedAt: startDate,
          primaryColor: '#4A6741',
        },
        {
          personaId: 'maya',
          personaName: 'Maya',
          unlockedAt: new Date('2024-02-15'),
          primaryColor: '#A67A6A',
        },
        {
          personaId: 'peter',
          personaName: 'Peter',
          unlockedAt: new Date('2024-04-01'),
          primaryColor: '#3A6B73',
        },
        {
          personaId: 'alex',
          personaName: 'Alex',
          unlockedAt: new Date('2024-06-10'),
          primaryColor: '#5A6B8A',
        },
        {
          personaId: 'jordan',
          personaName: 'Jordan',
          unlockedAt: new Date('2024-08-20'),
          primaryColor: '#C4856A',
        },
      ],
      dreams: [
        {
          dream: 'Learn piano',
          type: 'skill',
          mentionedAt: new Date('2024-01-20'),
          status: 'active',
          mentionCount: 5,
        },
        {
          dream: 'Visit Japan',
          type: 'travel',
          mentionedAt: new Date('2024-03-10'),
          status: 'active',
          mentionCount: 3,
        },
      ],
      commitments: [
        { type: 'intention', count: 45, followedUp: 38 },
        { type: 'promise', count: 12, followedUp: 10 },
        { type: 'decision', count: 8, followedUp: 8 },
      ],
      milestones: [
        { date: new Date('2024-02-14'), type: 'conversation', description: '50 conversations' },
        { date: new Date('2024-05-20'), type: 'streak', description: '30-day streak' },
        { date: new Date('2024-08-01'), type: 'team', description: 'Full team unlocked' },
      ],
      topTopics: [
        { topic: 'Career growth', count: 34, lastDiscussed: new Date() },
        { topic: 'Health & wellness', count: 28, lastDiscussed: new Date() },
        { topic: 'Relationships', count: 22, lastDiscussed: new Date() },
      ],
      relationshipGrowth: {
        peopleTracked: 15,
        newConnections: 3,
        deepenedRelationships: 5,
      },
      stats: {
        totalConversations: conversationCounts.reduce((sum, d) => sum + d.count, 0),
        totalMinutes: conversationCounts.reduce((sum, d) => sum + d.count, 0) * 8,
        longestStreak: 32,
        currentStreak: 7,
        averageConversationsPerWeek: 4.2,
        mostActiveMonth: 'March',
        teamMembersUnlocked: 5,
        dreamsTracked: 2,
        commitmentsKept: 56,
      },
    };
  }

  // ============================================================================
  // UI CREATION
  // ============================================================================

  private createUI(): void {
    if (!this.data) return;

    this.container = document.createElement('div');
    this.container.className = 'your-year-overlay';
    this.container.innerHTML = `
      <div class="your-year-backdrop"></div>
      <div class="your-year-modal" role="dialog" aria-modal="true" aria-labelledby="your-year-title">
        <button class="your-year-close" aria-label="${t('accessibility.closeYearReview')}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <header class="your-year-header">
          <!-- Ferni Luxo-style avatar -->
          <div class="your-year-avatar" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="64" height="64">
              <defs>
                <linearGradient id="header-ferni-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#5a8060"/>
                  <stop offset="100%" stop-color="#3d5a35"/>
                </linearGradient>
                <clipPath id="header-ferni-clip">
                  <circle cx="32" cy="32" r="29"/>
                </clipPath>
              </defs>
              <!-- Presence ring -->
              <circle cx="32" cy="32" r="31" fill="none" stroke="rgba(74, 103, 65, 0.2)" stroke-width="1.5"/>
              <!-- Main orb -->
              <g clip-path="url(#header-ferni-clip)">
                <circle cx="32" cy="32" r="29" fill="url(#header-ferni-grad)"/>
                <!-- LUXO STYLE: opaque white eyes, NO pupils -->
                <ellipse cx="23" cy="31" rx="4.5" ry="6.5" fill="white"/>
                <ellipse cx="41" cy="31" rx="4.5" ry="6.5" fill="white"/>
              </g>
            </svg>
          </div>
          <span class="your-year-eyebrow">YOUR JOURNEY</span>
          <h2 id="your-year-title" class="your-year-title">Your Year with Ferni</h2>
          <p class="your-year-subtitle">${this.data.stats.totalConversations} conversations. ${this.data.stats.totalMinutes} minutes. Countless moments of growth.</p>
        </header>

        <div class="your-year-content">
          <!-- Stats Grid -->
          <section class="your-year-stats">
            ${this.renderStatCard('Conversations', this.data.stats.totalConversations.toString(), 'Total')}
            ${this.renderStatCard('Current Streak', `${this.data.stats.currentStreak} days`, `Best: ${this.data.stats.longestStreak}`)}
            ${this.renderStatCard('Team Members', this.data.stats.teamMembersUnlocked.toString(), 'Unlocked')}
            ${this.renderStatCard('Dreams Tracked', this.data.stats.dreamsTracked.toString(), 'Growing')}
          </section>

          <!-- Heat Map -->
          <section class="your-year-section">
            <h3 class="your-year-section-title">Conversation Activity</h3>
            <div class="your-year-heatmap">
              ${this.renderHeatMap()}
            </div>
          </section>

          <!-- Emotional Journey -->
          <section class="your-year-section" aria-labelledby="milestones-title">
            <h3 id="milestones-title" class="your-year-section-title">Emotional Milestones</h3>
            <div class="your-year-timeline" role="list" aria-label="${t('accessibility.emotionalMilestonesTimeline')}">
              ${this.renderTimeline()}
            </div>
          </section>

          <!-- Team Unlocks -->
          <section class="your-year-section" aria-labelledby="team-title">
            <h3 id="team-title" class="your-year-section-title">Your Team</h3>
            <div class="your-year-team" role="list" aria-label="${t('accessibility.teamMembersUnlocked')}">
              ${this.renderTeam()}
            </div>
          </section>

          <!-- Dreams -->
          <section class="your-year-section" aria-labelledby="dreams-title">
            <h3 id="dreams-title" class="your-year-section-title">Dreams We're Guarding</h3>
            <div class="your-year-dreams" role="list" aria-label="${t('accessibility.yourTrackedDreams')}">
              ${this.renderDreams()}
            </div>
          </section>
        </div>
      </div>
    `;

    // Add styles
    this.addStyles();

    // Add event listeners
    this.container.querySelector('.your-year-close')?.addEventListener('click', () => this.close());
    this.container
      .querySelector('.your-year-backdrop')
      ?.addEventListener('click', () => this.close());

    document.body.appendChild(this.container);
  }

  private renderStatCard(label: string, value: string, subtext: string): string {
    return `
      <div class="your-year-stat-card">
        <div class="your-year-stat-value">${value}</div>
        <div class="your-year-stat-label">${label}</div>
        <div class="your-year-stat-subtext">${subtext}</div>
      </div>
    `;
  }

  private renderHeatMap(): string {
    if (!this.data) return '';

    // Group by week for display
    const weeks: DayData[][] = [];
    let currentWeek: DayData[] = [];

    for (const day of this.data.conversationCounts.slice(-91)) {
      // Last ~3 months
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) weeks.push(currentWeek);

    return weeks
      .map(
        (week) => `
      <div class="heatmap-week">
        ${week
          .map((day) => {
            const intensity = Math.min(4, day.count);
            return `<div class="heatmap-day" data-count="${day.count}" data-intensity="${intensity}" title="${day.date}: ${day.count} conversations"></div>`;
          })
          .join('')}
      </div>
    `
      )
      .join('');
  }

  private renderTimeline(): string {
    if (!this.data) return '';

    return this.data.emotionalJourney
      .map((moment) => {
        const date = moment.date instanceof Date ? moment.date : new Date(moment.date);
        return `
      <div class="timeline-item" role="listitem">
        <div class="timeline-dot" aria-hidden="true"></div>
        <div class="timeline-content">
          <div class="timeline-date">${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
          <div class="timeline-emotion">${moment.emotion}</div>
          ${moment.context ? `<div class="timeline-context">${moment.context}</div>` : ''}
        </div>
      </div>
    `;
      })
      .join('');
  }

  private renderTeam(): string {
    if (!this.data) return '';

    // Persona gradients from design-system/tokens/colors.json
    // Each persona has distinct primary → secondary gradient
    // Support both short names (ferni, maya) AND full member IDs (maya-santos, peter-john)
    const personaGradients: Record<string, { light: string; dark: string; ring: string }> = {
      // Short names (for placeholder data)
      ferni: { light: '#4a6741', dark: '#3d5a35', ring: 'rgba(74, 103, 65, 0.28)' }, // Deep sage green
      maya: { light: '#a67a6a', dark: '#8a635a', ring: 'rgba(166, 122, 106, 0.28)' }, // Dusty terracotta
      peter: { light: '#3a6b73', dark: '#2d5359', ring: 'rgba(58, 107, 115, 0.28)' }, // Ocean teal
      jordan: { light: '#c4856a', dark: '#a86d55', ring: 'rgba(196, 133, 106, 0.28)' }, // Warm sunset coral
      alex: { light: '#5a6b8a', dark: '#4a5a73', ring: 'rgba(90, 107, 138, 0.28)' }, // Soft indigo
      nayan: { light: '#b8956a', dark: '#9a7a52', ring: 'rgba(184, 149, 106, 0.28)' }, // Golden amber
      // Full member IDs (for real API data from team-unlocks service)
      'maya-santos': { light: '#a67a6a', dark: '#8a635a', ring: 'rgba(166, 122, 106, 0.28)' },
      'peter-john': { light: '#3a6b73', dark: '#2d5359', ring: 'rgba(58, 107, 115, 0.28)' },
      'jordan-taylor': { light: '#c4856a', dark: '#a86d55', ring: 'rgba(196, 133, 106, 0.28)' },
      'alex-chen': { light: '#5a6b8a', dark: '#4a5a73', ring: 'rgba(90, 107, 138, 0.28)' },
      'nayan-patel': { light: '#b8956a', dark: '#9a7a52', ring: 'rgba(184, 149, 106, 0.28)' },
    };

    // Short display names per brand (not "Maya-santos", just "Maya")
    // Support both short names AND full member IDs
    const displayNames: Record<string, string> = {
      ferni: 'Ferni',
      maya: 'Maya',
      peter: 'Peter',
      jordan: 'Jordan',
      alex: 'Alex',
      nayan: 'Nayan',
      'maya-santos': 'Maya',
      'peter-john': 'Peter',
      'jordan-taylor': 'Jordan',
      'alex-chen': 'Alex',
      'nayan-patel': 'Nayan',
    };

    return this.data.teamUnlocks
      .map((member) => {
        const unlockDate =
          member.unlockedAt instanceof Date ? member.unlockedAt : new Date(member.unlockedAt);
        const personaId = member.personaId.toLowerCase();
        const gradient = personaGradients[personaId] ?? {
          light: member.primaryColor,
          dark: member.primaryColor,
          ring: `${member.primaryColor}40`,
        };
        const displayName =
          displayNames[personaId] ?? member.personaName.split('-')[0] ?? member.personaName;
        const initial = displayName.charAt(0).toUpperCase();

        // Luxo-style SVG avatar with gradient and white eyes (NO pupils per brand CLAUDE.md)
        return `
      <div class="team-member" role="listitem">
        <div class="team-avatar" style="color: ${gradient.ring}" aria-hidden="true">
          <svg viewBox="0 0 56 56" width="56" height="56" class="team-avatar-orb">
            <defs>
              <linearGradient id="grad-${personaId}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="${gradient.light}"/>
                <stop offset="100%" stop-color="${gradient.dark}"/>
              </linearGradient>
              <clipPath id="clip-${personaId}">
                <circle cx="28" cy="28" r="26"/>
              </clipPath>
            </defs>
            <!-- Presence ring -->
            <circle cx="28" cy="28" r="27" fill="none" stroke="${gradient.ring}" stroke-width="1.5"/>
            <!-- Main orb -->
            <g clip-path="url(#clip-${personaId})">
              <circle cx="28" cy="28" r="26" fill="url(#grad-${personaId})"/>
              <!-- LUXO STYLE: opaque white eyes, NO pupils per brand/CLAUDE.md -->
              <ellipse cx="21" cy="27" rx="4" ry="5.5" fill="white"/>
              <ellipse cx="35" cy="27" rx="4" ry="5.5" fill="white"/>
            </g>
          </svg>
        </div>
        <div class="team-name">${displayName}</div>
        <div class="team-unlocked">Unlocked ${unlockDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</div>
      </div>
    `;
      })
      .join('');
  }

  private renderDreams(): string {
    if (!this.data) return '';

    const achievedIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>`;
    const activeIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 22c4-4 8-7.582 8-12a8 8 0 1 0-16 0c0 4.418 4 8 8 12z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>`;

    return this.data.dreams
      .map(
        (dream) => `
      <div class="dream-item ${dream.status}" role="listitem">
        <div class="dream-icon" aria-hidden="true">${dream.status === 'achieved' ? achievedIcon : activeIcon}</div>
        <div class="dream-content">
          <div class="dream-text">${dream.dream}</div>
          <div class="dream-meta">Mentioned ${dream.mentionCount} times · ${dream.type}</div>
        </div>
      </div>
    `
      )
      .join('');
  }

  // ============================================================================
  // STYLES
  // ============================================================================

  private addStyles(): void {
    if (document.getElementById('your-year-styles')) return;

    const style = document.createElement('style');
    style.id = 'your-year-styles';
    style.textContent = `
      /* ============================================
         YOUR YEAR WITH FERNI - Brand Compliant Styles
         Per brand-book.html and master-tokens.css
         ============================================ */

      .your-year-overlay {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 50);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
      }

      /* Backdrop: Warm overlay per brand guidelines */
      .your-year-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(44, 37, 32, 0.4);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }

      .your-year-modal {
        position: relative;
        width: 90%;
        max-width: 800px;
        max-height: 85vh;
        background: var(--color-bg-elevated, #FFFFFF);
        border: 1px solid var(--color-border-subtle, rgba(29, 27, 24, 0.06));
        border-radius: var(--radius-2xl, 24px);
        box-shadow: var(--shadow-2xl, 0 25px 50px rgba(29, 27, 24, 0.12));
        overflow: hidden;
        transform: scale(0.9);
        opacity: 0;
      }

      /* Close button - Top right */
      .your-year-close {
        position: absolute;
        top: var(--space-4, 16px);
        right: var(--space-4, 16px);
        width: 44px;
        height: 44px;
        border: none;
        background: var(--color-bg-tertiary, #EFEBE4);
        border-radius: var(--radius-full, 9999px);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background var(--duration-fast, 150ms) var(--ease-out, cubic-bezier(0, 0, 0.2, 1));
        z-index: 1;
      }

      .your-year-close:hover {
        background: var(--color-bg-secondary, #F5F2ED);
      }

      .your-year-close:focus-visible {
        outline: none;
        box-shadow: var(--focus-ring, 0 0 0 3px rgba(61, 90, 69, 0.16));
      }

      .your-year-close svg {
        color: var(--color-text-secondary, #4A4641);
        width: 20px;
        height: 20px;
      }

      /* Header: Cream background with Ferni avatar, per other modal patterns */
      .your-year-header {
        padding: var(--space-8, 32px) var(--space-8, 32px) var(--space-6, 24px);
        text-align: center;
        background: var(--color-bg-elevated, #FFFFFF);
        border-bottom: 1px solid var(--color-border-subtle, rgba(29, 27, 24, 0.06));
        position: relative;
      }

      /* Ferni avatar at top of header */
      .your-year-avatar {
        width: 64px;
        height: 64px;
        margin: 0 auto var(--space-4, 16px);
      }

      /* Eyebrow: Brand typography spec - accent color on cream */
      .your-year-eyebrow {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-semibold, 600);
        letter-spacing: var(--tracking-widest, 0.1em);
        text-transform: uppercase;
        color: var(--color-ferni, #4A6741);
        margin-bottom: var(--space-2, 8px);
        display: block;
      }

      /* Title: Plus Jakarta Sans, dark text */
      .your-year-title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: clamp(var(--text-xl, 1.5rem), 4vw, var(--text-2xl, 2rem));
        font-weight: var(--font-bold, 700);
        letter-spacing: var(--tracking-tight, -0.015em);
        line-height: var(--leading-tight, 1.15);
        color: var(--color-text-primary, #1D1B18);
        margin: 0 0 var(--space-3, 12px);
      }

      /* Subtitle: Inter, secondary text */
      .your-year-subtitle {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-normal, 400);
        color: var(--color-text-secondary, #4A4641);
        line-height: var(--leading-normal, 1.5);
        max-width: 400px;
        margin: 0 auto;
      }

      .your-year-content {
        padding: var(--space-6, 24px);
        overflow-y: auto;
        max-height: calc(85vh - 160px);
        background: var(--color-bg-primary, #FAF8F5);
      }

      /* Stats Grid */
      .your-year-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--space-4, 16px);
        margin-bottom: var(--space-6, 24px);
      }

      @media (max-width: 640px) {
        .your-year-stats {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      /* Stat Cards: Brand-compliant card style */
      .your-year-stat-card {
        text-align: center;
        padding: var(--space-5, 20px) var(--space-4, 16px);
        background: var(--color-bg-elevated, #FFFFFF);
        border: 1px solid var(--color-border-subtle, rgba(29, 27, 24, 0.06));
        border-radius: var(--radius-lg, 12px);
        box-shadow: var(--shadow-sm, 0 1px 3px rgba(29, 27, 24, 0.06));
      }

      .your-year-stat-value {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-xl, 1.5rem);
        font-weight: var(--font-bold, 700);
        color: var(--color-ferni, #4A6741);
        line-height: var(--leading-tight, 1.15);
      }

      .your-year-stat-label {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-semibold, 600);
        color: var(--color-text-primary, #1D1B18);
        margin-top: var(--space-1, 4px);
      }

      .your-year-stat-subtext {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 11px;
        color: var(--color-text-muted, #8A847C);
        margin-top: var(--space-1, 4px);
      }

      /* Sections */
      .your-year-section {
        margin-bottom: var(--space-6, 24px);
      }

      /* Section Titles: Brand typography spec */
      .your-year-section-title {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-semibold, 600);
        color: var(--color-text-tertiary, #6B665F);
        margin-bottom: var(--space-3, 12px);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.05em);
      }

      /* Heat Map */
      .your-year-heatmap {
        display: flex;
        gap: 3px;
        padding: var(--space-4, 16px);
        background: var(--color-bg-elevated, #FFFFFF);
        border: 1px solid var(--color-border-subtle, rgba(29, 27, 24, 0.06));
        border-radius: var(--radius-lg, 12px);
        overflow-x: auto;
      }

      .heatmap-week {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .heatmap-day {
        width: 12px;
        height: 12px;
        border-radius: var(--radius-sm, 4px);
        background: var(--color-bg-tertiary, #EFEBE4);
        transition: background var(--duration-fast, 150ms) var(--ease-out);
      }

      .heatmap-day[data-intensity="1"] { background: var(--color-ferni-subtle, rgba(74, 103, 65, 0.15)); }
      .heatmap-day[data-intensity="2"] { background: rgba(74, 103, 65, 0.35); }
      .heatmap-day[data-intensity="3"] { background: rgba(74, 103, 65, 0.55); }
      .heatmap-day[data-intensity="4"] { background: var(--color-ferni, #4A6741); }

      /* Timeline */
      .your-year-timeline {
        position: relative;
        padding-left: var(--space-6, 24px);
      }

      .your-year-timeline::before {
        content: '';
        position: absolute;
        left: 6px;
        top: 8px;
        bottom: 8px;
        width: 2px;
        background: var(--color-border-default, rgba(29, 27, 24, 0.12));
        border-radius: 1px;
      }

      .timeline-item {
        position: relative;
        margin-bottom: var(--space-4, 16px);
      }

      .timeline-item:last-child {
        margin-bottom: 0;
      }

      .timeline-dot {
        position: absolute;
        left: calc(-24px + 2px);
        top: 4px;
        width: 10px;
        height: 10px;
        border-radius: var(--radius-full, 9999px);
        background: var(--color-ferni, #4A6741);
        box-shadow: 0 0 0 3px var(--color-ferni-subtle, rgba(74, 103, 65, 0.2));
      }

      .timeline-date {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 11px;
        color: var(--color-text-muted, #8A847C);
        margin-bottom: var(--space-1, 4px);
      }

      .timeline-emotion {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-weight: var(--font-semibold, 600);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-primary, #1D1B18);
        text-transform: capitalize;
      }

      .timeline-context {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #4A4641);
        margin-top: var(--space-1, 4px);
      }

      /* Team: Luxo-style avatars with gradients and presence rings */
      .your-year-team {
        display: flex;
        gap: var(--space-6, 24px);
        flex-wrap: wrap;
        justify-content: flex-start;
      }

      .team-member {
        text-align: center;
        min-width: 80px;
      }

      /* Luxo-style avatar with gradient and presence ring */
      .team-avatar {
        position: relative;
        width: 56px;
        height: 56px;
        margin: 0 auto var(--space-2, 8px);
      }

      .team-avatar-orb {
        width: 100%;
        height: 100%;
        border-radius: var(--radius-full, 9999px);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-lg, 1.25rem);
        font-weight: var(--font-semibold, 600);
        position: relative;
        overflow: hidden;
      }

      /* Presence ring per brand spec */
      .team-avatar::before {
        content: '';
        position: absolute;
        inset: -3px;
        border-radius: var(--radius-full, 9999px);
        border: 1.5px solid currentColor;
        opacity: 0.3;
      }

      .team-name {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-weight: var(--font-semibold, 600);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-primary, #1D1B18);
        margin-bottom: var(--space-1, 4px);
      }

      .team-unlocked {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: 11px;
        color: var(--color-text-muted, #8A847C);
      }

      /* Dreams */
      .your-year-dreams {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
      }

      .dream-item {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3, 12px);
        padding: var(--space-4, 16px);
        background: var(--color-bg-elevated, #FFFFFF);
        border: 1px solid var(--color-border-subtle, rgba(29, 27, 24, 0.06));
        border-radius: var(--radius-lg, 12px);
        transition: border-color var(--duration-fast, 150ms) var(--ease-out);
      }

      .dream-item:hover {
        border-color: var(--color-border-default, rgba(29, 27, 24, 0.12));
      }

      .dream-item.achieved {
        background: var(--color-ferni-subtle, rgba(74, 103, 65, 0.08));
        border-color: var(--color-ferni-border, rgba(74, 103, 65, 0.2));
      }

      .dream-icon {
        width: 24px;
        height: 24px;
        color: var(--color-ferni, #4A6741);
        flex-shrink: 0;
      }

      .dream-icon svg {
        display: block;
        width: 100%;
        height: 100%;
      }

      .dream-content {
        flex: 1;
        min-width: 0;
      }

      .dream-text {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-weight: var(--font-medium, 500);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-primary, #1D1B18);
      }

      .dream-meta {
        font-family: var(--font-body, 'Inter', sans-serif);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #8A847C);
        margin-top: var(--space-1, 4px);
      }

      /* Reduced Motion */
      @media (prefers-reduced-motion: reduce) {
        .your-year-overlay,
        .your-year-modal,
        .heatmap-day,
        .dream-item {
          transition: none;
        }

        .your-year-modal {
          transform: none;
        }
      }
    `;

    document.head.appendChild(style);
  }

  // ============================================================================
  // ANIMATIONS
  // ============================================================================

  private async animateIn(): Promise<void> {
    if (!this.container) return;

    const modal = this.container.querySelector('.your-year-modal') as HTMLElement;

    // Animate overlay
    this.container.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: DURATION.SLOW,
      easing: EASING.STANDARD,
      fill: 'forwards',
    });

    // Animate modal
    modal?.animate(
      [
        { transform: 'scale(0.9)', opacity: 0 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      {
        duration: DURATION.MODERATE,
        easing: EASING.SPRING,
        fill: 'forwards',
        delay: 100,
      }
    );

    await new Promise((r) => setTimeout(r, DURATION.MODERATE + 100));
  }

  private async animateOut(): Promise<void> {
    if (!this.container) return;

    const modal = this.container.querySelector('.your-year-modal') as HTMLElement;

    modal?.animate(
      [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(0.9)', opacity: 0 },
      ],
      {
        duration: DURATION.NORMAL,
        easing: EASING.STANDARD,
        fill: 'forwards',
      }
    );

    this.container.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: DURATION.NORMAL,
      easing: EASING.STANDARD,
      fill: 'forwards',
    });

    await new Promise((r) => setTimeout(r, DURATION.NORMAL));
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: YourYearWithFerni | null = null;

export function getYourYearWithFerni(): YourYearWithFerni {
  if (!instance) {
    instance = new YourYearWithFerni();
  }
  return instance;
}

export function openYourYearWithFerni(userId: string): Promise<void> {
  return getYourYearWithFerni().open(userId);
}

export function closeYourYearWithFerni(): Promise<void> {
  return getYourYearWithFerni().close();
}
