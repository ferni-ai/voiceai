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

import { createLogger } from '../utils/logger.js';
import { DURATION, EASING } from '../config/animation-constants.js';

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
      const response = await fetch(`/api/year-in-review/${userId}`);
      if (response.ok) {
        return await response.json();
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
        conversationCounts.push({
          date: current.toISOString().split('T')[0],
          count: baseCount || Math.floor(Math.random() * 2) + 1,
          dominantEmotion: ['neutral', 'happy', 'reflective', 'stressed'][
            Math.floor(Math.random() * 4)
          ],
        });
      }
      current.setDate(current.getDate() + 1);
    }

    return {
      userId,
      startDate,
      conversationCounts,
      emotionalJourney: [
        { date: new Date('2024-03-15'), emotion: 'breakthrough', context: 'Career clarity', intensity: 0.9 },
        { date: new Date('2024-06-20'), emotion: 'celebration', context: 'Promotion', intensity: 0.85 },
        { date: new Date('2024-09-10'), emotion: 'growth', context: 'New perspective', intensity: 0.7 },
      ],
      teamUnlocks: [
        { personaId: 'ferni', personaName: 'Ferni', unlockedAt: startDate, primaryColor: '#4a6741' },
        { personaId: 'maya', personaName: 'Maya', unlockedAt: new Date('2024-02-15'), primaryColor: '#a67a6a' },
        { personaId: 'peter', personaName: 'Peter', unlockedAt: new Date('2024-04-01'), primaryColor: '#3a6b73' },
      ],
      dreams: [
        { dream: 'Learn piano', type: 'skill', mentionedAt: new Date('2024-01-20'), status: 'active', mentionCount: 5 },
        { dream: 'Visit Japan', type: 'travel', mentionedAt: new Date('2024-03-10'), status: 'active', mentionCount: 3 },
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
        teamMembersUnlocked: 3,
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
        <button class="your-year-close" aria-label="Close year review">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        <header class="your-year-header">
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
            <div class="your-year-timeline" role="list" aria-label="Emotional milestones timeline">
              ${this.renderTimeline()}
            </div>
          </section>

          <!-- Team Unlocks -->
          <section class="your-year-section" aria-labelledby="team-title">
            <h3 id="team-title" class="your-year-section-title">Your Team</h3>
            <div class="your-year-team" role="list" aria-label="Team members unlocked">
              ${this.renderTeam()}
            </div>
          </section>

          <!-- Dreams -->
          <section class="your-year-section" aria-labelledby="dreams-title">
            <h3 id="dreams-title" class="your-year-section-title">Dreams We're Guarding</h3>
            <div class="your-year-dreams" role="list" aria-label="Your tracked dreams">
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
    this.container.querySelector('.your-year-backdrop')?.addEventListener('click', () => this.close());

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
      .map(
        (moment) => {
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
        }
      )
      .join('');
  }

  private renderTeam(): string {
    if (!this.data) return '';

    return this.data.teamUnlocks
      .map(
        (member) => {
          const unlockDate = member.unlockedAt instanceof Date ? member.unlockedAt : new Date(member.unlockedAt);
          return `
      <div class="team-member" role="listitem">
        <div class="team-avatar" style="background: ${member.primaryColor}" aria-hidden="true">${member.personaName.charAt(0)}</div>
        <div class="team-name">${member.personaName}</div>
        <div class="team-unlocked">Unlocked ${unlockDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</div>
      </div>
    `;
        }
      )
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
      .your-year-overlay {
        position: fixed;
        inset: 0;
        z-index: var(--z-system, 9999);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
      }

      .your-year-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
      }

      .your-year-modal {
        position: relative;
        width: 90%;
        max-width: 800px;
        max-height: 85vh;
        background: var(--color-bg-elevated, #FFFDFB);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-2xl, 24px);
        box-shadow: var(--shadow-lg);
        overflow: hidden;
        transform: scale(0.9);
        opacity: 0;
      }

      .your-year-close {
        position: absolute;
        top: var(--space-4, 16px);
        right: var(--space-4, 16px);
        width: 44px;
        height: 44px;
        border: none;
        background: rgba(255, 255, 255, 0.2);
        border-radius: var(--radius-full, 9999px);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background var(--duration-fast, 150ms) ease;
        z-index: var(--z-raised, 1);
      }

      .your-year-close:hover,
      .your-year-close:focus-visible {
        background: rgba(255, 255, 255, 0.3);
        outline: none;
      }

      .your-year-close:focus-visible {
        box-shadow: 0 0 0 2px white;
      }

      .your-year-close svg {
        color: var(--color-text-secondary, #5a5046);
      }

      .your-year-header {
        padding: var(--space-8, 32px) var(--space-8, 32px) var(--space-4, 16px);
        text-align: center;
        background: linear-gradient(135deg, var(--color-ferni, #4a6741) 0%, var(--color-ferni-secondary, #3d5a35) 100%);
        color: white;
      }

      .your-year-eyebrow {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        opacity: 0.8;
      }

      .your-year-title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 28px;
        font-weight: 700;
        margin: var(--space-2, 8px) 0;
      }

      .your-year-subtitle {
        font-size: 14px;
        opacity: 0.9;
      }

      .your-year-content {
        padding: var(--space-6, 24px);
        overflow-y: auto;
        max-height: calc(85vh - 150px);
      }

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

      .your-year-stat-card {
        text-align: center;
        padding: var(--space-4, 16px);
        background: var(--color-background, #FAF6F0);
        border-radius: var(--radius-lg, 12px);
      }

      .your-year-stat-value {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 24px;
        font-weight: 700;
        color: var(--color-ferni, #4a6741);
      }

      .your-year-stat-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
        margin-top: var(--space-1, 4px);
      }

      .your-year-stat-subtext {
        font-size: 11px;
        color: var(--color-text-muted, #8a7e74);
      }

      .your-year-section {
        margin-bottom: var(--space-6, 24px);
      }

      .your-year-section-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--color-text-secondary, #5a5046);
        margin-bottom: var(--space-3, 12px);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      /* Heat Map */
      .your-year-heatmap {
        display: flex;
        gap: 3px;
        padding: var(--space-3, 12px);
        background: var(--color-background, #FAF6F0);
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
        border-radius: 2px;
        background: var(--color-background-elevated, #FFFDFB);
      }

      .heatmap-day[data-intensity="1"] { background: rgba(74, 103, 65, 0.2); }
      .heatmap-day[data-intensity="2"] { background: rgba(74, 103, 65, 0.4); }
      .heatmap-day[data-intensity="3"] { background: rgba(74, 103, 65, 0.6); }
      .heatmap-day[data-intensity="4"] { background: var(--color-ferni, #4a6741); }

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
        background: var(--color-border, #e8e2da);
      }

      .timeline-item {
        position: relative;
        margin-bottom: var(--space-4, 16px);
      }

      .timeline-dot {
        position: absolute;
        left: calc(-24px + 2px);
        top: 4px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
      }

      .timeline-date {
        font-size: 11px;
        color: var(--color-text-muted, #8a7e74);
      }

      .timeline-emotion {
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
        text-transform: capitalize;
      }

      .timeline-context {
        font-size: 13px;
        color: var(--color-text-secondary, #5a5046);
      }

      /* Team */
      .your-year-team {
        display: flex;
        gap: var(--space-4, 16px);
        flex-wrap: wrap;
      }

      .team-member {
        text-align: center;
      }

      .team-avatar {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 20px;
        font-weight: 600;
        margin: 0 auto var(--space-2, 8px);
      }

      .team-name {
        font-weight: 600;
        font-size: 14px;
        color: var(--color-text-primary, #2C2520);
      }

      .team-unlocked {
        font-size: 11px;
        color: var(--color-text-muted, #8a7e74);
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
        padding: var(--space-3, 12px);
        background: var(--color-background, #FAF6F0);
        border-radius: var(--radius-md, 8px);
      }

      .dream-item.achieved {
        background: var(--color-ferni-tint, rgba(74, 103, 65, 0.1));
      }

      .dream-icon {
        width: 20px;
        height: 20px;
        color: var(--color-ferni, #4a6741);
        flex-shrink: 0;
      }

      .dream-icon svg {
        display: block;
      }

      .dream-text {
        font-weight: 500;
        color: var(--color-text-primary, #2C2520);
      }

      .dream-meta {
        font-size: 12px;
        color: var(--color-text-muted, #8a7e74);
      }

      /* Reduced Motion */
      @media (prefers-reduced-motion: reduce) {
        .your-year-overlay,
        .your-year-modal {
          transition: none;
          animation: none;
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

