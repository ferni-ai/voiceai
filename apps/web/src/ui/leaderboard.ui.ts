/**
 * 🏆 Leaderboard UI Component
 *
 * Displays game leaderboards with:
 * - Period tabs (Daily/Weekly/Monthly/All-Time)
 * - User ranking with context
 * - Level & XP progress
 * - Challenge friends
 *
 * Design: Gaming-inspired with Ferni's warm palette
 */

import { DURATION, EASING } from '../config/animation-constants.js';

// ============================================================================
// TYPES
// ============================================================================

type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all-time';

interface LeaderboardEntry {
  userId: string;
  displayName: string;
  score: number;
  gamesPlayed: number;
  winRate: number;
  currentStreak: number;
  rank: number;
  previousRank?: number;
  isCurrentUser?: boolean;
}

interface UserStats {
  userId: string;
  displayName: string;
  totalGamesPlayed: number;
  totalScore: number;
  totalXP: number;
  level: number;
  currentStreak: number;
  longestStreak: number;
  challengesWon: number;
  challengesLost: number;
}

interface XPProgress {
  currentXP: number;
  neededXP: number;
  progress: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ICONS = {
  trophy: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  flame: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  star: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  arrowUp: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>`,
  arrowDown: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  zap: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  swords: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" y1="14" x2="9" y2="18"/><line x1="7" y1="17" x2="4" y2="20"/><line x1="3" y1="19" x2="5" y2="21"/></svg>`,
};

const RANK_MEDALS: Record<number, string> = {
  1: '🥇',
  2: '🥈',
  3: '🥉',
};

const PERIOD_LABELS: Record<LeaderboardPeriod, string> = {
  daily: 'Today',
  weekly: 'This Week',
  monthly: 'This Month',
  'all-time': 'All Time',
};

// ============================================================================
// LEADERBOARD UI CLASS
// ============================================================================

export class LeaderboardUI {
  private container: HTMLElement | null = null;
  private isOpen = false;
  private userId: string;
  private currentPeriod: LeaderboardPeriod = 'weekly';

  // State
  private entries: LeaderboardEntry[] = [];
  private userStats: UserStats | null = null;
  private userRank: { rank: number; totalUsers: number } | null = null;
  private xpProgress: XPProgress | null = null;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Open the leaderboard
   */
  async open(): Promise<void> {
    if (!this.container) {
      this.createContainer();
    }
    this.container!.classList.add('open');
    this.isOpen = true;

    await this.loadData();

    requestAnimationFrame(() => {
      const content = this.container!.querySelector('.leaderboard-content');
      if (content) {
        (content as HTMLElement).style.transform = 'translateY(0)';
        (content as HTMLElement).style.opacity = '1';
      }
    });
  }

  /**
   * Close the leaderboard
   */
  close(): void {
    if (!this.container) return;

    const content = this.container.querySelector('.leaderboard-content') as HTMLElement;
    if (content) {
      content.style.transform = 'translateY(20px)';
      content.style.opacity = '0';
    }

    setTimeout(() => {
      this.container?.classList.remove('open');
      this.isOpen = false;
    }, DURATION.NORMAL);
  }

  /**
   * Toggle the leaderboard
   */
  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  // ========================================
  // PRIVATE METHODS
  // ========================================

  private createContainer(): void {
    // Cleanup existing
    document.querySelectorAll('.leaderboard-overlay').forEach((el) => el.remove());

    this.container = document.createElement('div');
    this.container.className = 'leaderboard-overlay';
    this.container.innerHTML = this.renderLeaderboard();

    this.injectStyles();
    document.body.appendChild(this.container);
    this.bindEvents();
  }

  private renderLeaderboard(): string {
    return `
      <div class="leaderboard-backdrop"></div>
      <div class="leaderboard-content">
        <header class="leaderboard-header">
          <div class="header-title">
            ${ICONS.trophy}
            <h2>Leaderboard</h2>
          </div>
          <button class="close-btn" aria-label="Close">
            ${ICONS.close}
          </button>
        </header>

        <!-- User Stats Card -->
        <div class="user-stats-card" data-loading="true">
          <div class="loading-spinner">Loading your stats...</div>
        </div>

        <!-- Period Tabs -->
        <div class="period-tabs">
          ${Object.entries(PERIOD_LABELS)
            .map(
              ([period, label]) => `
            <button 
              class="period-tab ${period === this.currentPeriod ? 'active' : ''}"
              data-period="${period}"
            >
              ${label}
            </button>
          `
            )
            .join('')}
        </div>

        <!-- Leaderboard List -->
        <div class="leaderboard-list" data-loading="true">
          <div class="loading-spinner">Loading rankings...</div>
        </div>
      </div>
    `;
  }

  private async loadData(): Promise<void> {
    const baseUrl = window.location.origin;

    try {
      // Load user stats and leaderboard in parallel
      const [statsRes, leaderboardRes] = await Promise.all([
        fetch(`${baseUrl}/api/social/stats?userId=${this.userId}&displayName=You`),
        fetch(
          `${baseUrl}/api/social/leaderboard?period=${this.currentPeriod}&userId=${this.userId}`
        ),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        this.userStats = data.stats;
        this.userRank = data.weeklyRank;
        this.xpProgress = this.calculateXPProgress(data.stats?.totalXP || 0);
        this.renderUserStats();
      }

      if (leaderboardRes.ok) {
        const data = await leaderboardRes.json();
        this.entries = data.leaderboard?.entries || [];
        this.renderLeaderboardList();
      }
    } catch (error) {
      console.error('Failed to load leaderboard data:', error);
    }
  }

  private renderUserStats(): void {
    const container = this.container?.querySelector('.user-stats-card');
    if (!container || !this.userStats) return;

    container.setAttribute('data-loading', 'false');

    const stats = this.userStats;
    const winRate =
      stats.challengesWon + stats.challengesLost > 0
        ? Math.round(
            (stats.challengesWon / (stats.challengesWon + stats.challengesLost)) * 100
          )
        : 0;

    container.innerHTML = `
      <div class="stats-header">
        <div class="level-badge">
          ${ICONS.star}
          <span>Level ${stats.level}</span>
        </div>
        <div class="xp-display">
          ${ICONS.zap}
          <span>${stats.totalXP.toLocaleString()} XP</span>
        </div>
      </div>

      ${
        this.xpProgress
          ? `
      <div class="xp-progress">
        <div class="xp-bar">
          <div class="xp-fill" style="width: ${this.xpProgress.progress}%"></div>
        </div>
        <span class="xp-text">${this.xpProgress.currentXP}/${this.xpProgress.neededXP} to Level ${stats.level + 1}</span>
      </div>
      `
          : ''
      }

      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-value">${this.userRank?.rank || '-'}</span>
          <span class="stat-label">Rank</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${stats.totalScore.toLocaleString()}</span>
          <span class="stat-label">Score</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${stats.totalGamesPlayed}</span>
          <span class="stat-label">Games</span>
        </div>
        <div class="stat-item streak">
          <span class="stat-value">${ICONS.flame} ${stats.currentStreak}</span>
          <span class="stat-label">Streak</span>
        </div>
      </div>

      <div class="challenge-stats">
        <div class="challenge-record">
          ${ICONS.swords}
          <span>${stats.challengesWon}W - ${stats.challengesLost}L</span>
          <span class="win-rate">(${winRate}% win rate)</span>
        </div>
      </div>
    `;
  }

  private renderLeaderboardList(): void {
    const container = this.container?.querySelector('.leaderboard-list');
    if (!container) return;

    container.setAttribute('data-loading', 'false');

    if (this.entries.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No rankings yet for this period.</p>
          <p>Play some games to climb the leaderboard!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.entries
      .map((entry, index) => this.renderLeaderboardEntry(entry, index))
      .join('');
  }

  private renderLeaderboardEntry(entry: LeaderboardEntry, index: number): string {
    const medal = RANK_MEDALS[entry.rank] || '';
    const rankChange = this.getRankChange(entry);
    const isCurrentUser = entry.isCurrentUser;

    return `
      <div class="leaderboard-entry ${isCurrentUser ? 'current-user' : ''}" 
           style="animation-delay: ${index * 30}ms">
        <div class="entry-rank">
          ${medal || `#${entry.rank}`}
        </div>
        <div class="entry-info">
          <span class="entry-name">${entry.displayName}</span>
          <span class="entry-meta">${entry.gamesPlayed} games • ${entry.currentStreak}🔥</span>
        </div>
        <div class="entry-score">
          <span class="score-value">${entry.score.toLocaleString()}</span>
          ${rankChange}
        </div>
      </div>
    `;
  }

  private getRankChange(entry: LeaderboardEntry): string {
    if (!entry.previousRank) return '';

    const diff = entry.previousRank - entry.rank;
    if (diff > 0) {
      return `<span class="rank-change up">${ICONS.arrowUp} ${diff}</span>`;
    } else if (diff < 0) {
      return `<span class="rank-change down">${ICONS.arrowDown} ${Math.abs(diff)}</span>`;
    }
    return '';
  }

  private calculateXPProgress(totalXP: number): XPProgress {
    const xpPerLevel = 100;
    const levelScaling = 1.2;

    let level = 1;
    let xpNeeded = xpPerLevel;
    let xpRemaining = totalXP;

    while (xpRemaining >= xpNeeded) {
      xpRemaining -= xpNeeded;
      level++;
      xpNeeded = Math.floor(xpNeeded * levelScaling);
    }

    return {
      currentXP: xpRemaining,
      neededXP: xpNeeded,
      progress: Math.round((xpRemaining / xpNeeded) * 100),
    };
  }

  private bindEvents(): void {
    // Close button
    const closeBtn = this.container?.querySelector('.close-btn');
    closeBtn?.addEventListener('click', () => this.close());

    // Backdrop click
    const backdrop = this.container?.querySelector('.leaderboard-backdrop');
    backdrop?.addEventListener('click', () => this.close());

    // Period tabs
    const tabs = this.container?.querySelectorAll('.period-tab');
    tabs?.forEach((tab) => {
      tab.addEventListener('click', () => {
        const period = (tab as HTMLElement).dataset.period as LeaderboardPeriod;
        this.switchPeriod(period);
      });
    });

    // Escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  private async switchPeriod(period: LeaderboardPeriod): Promise<void> {
    if (period === this.currentPeriod) return;

    this.currentPeriod = period;

    // Update tab styles
    const tabs = this.container?.querySelectorAll('.period-tab');
    tabs?.forEach((tab) => {
      const tabPeriod = (tab as HTMLElement).dataset.period;
      tab.classList.toggle('active', tabPeriod === period);
    });

    // Show loading
    const list = this.container?.querySelector('.leaderboard-list');
    if (list) {
      list.setAttribute('data-loading', 'true');
      list.innerHTML = '<div class="loading-spinner">Loading...</div>';
    }

    // Reload data
    try {
      const res = await fetch(
        `${window.location.origin}/api/social/leaderboard?period=${period}&userId=${this.userId}`
      );
      if (res.ok) {
        const data = await res.json();
        this.entries = data.leaderboard?.entries || [];
        this.renderLeaderboardList();
      }
    } catch (error) {
      console.error('Failed to switch period:', error);
    }
  }

  private injectStyles(): void {
    if (document.getElementById('leaderboard-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'leaderboard-styles';
    styles.textContent = `
      .leaderboard-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: none;
        align-items: center;
        justify-content: center;
        padding: var(--space-4, 16px);
      }

      .leaderboard-overlay.open {
        display: flex;
      }

      .leaderboard-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(44, 37, 32, 0.6);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
      }

      .leaderboard-content {
        position: relative;
        width: 100%;
        max-width: 480px;
        max-height: 85vh;
        background: linear-gradient(180deg, #2C2520 0%, #1a1815 100%);
        border-radius: var(--radius-2xl, 24px);
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transform: translateY(20px);
        opacity: 0;
        transition: transform ${DURATION.SLOW}ms ${EASING.SPRING},
                    opacity ${DURATION.NORMAL}ms ease-out;
      }

      .leaderboard-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-4, 16px) var(--space-5, 20px);
        background: linear-gradient(90deg, var(--color-gold, #C4A35A) 0%, #daa520 100%);
      }

      .leaderboard-header .header-title {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .leaderboard-header .header-title svg {
        color: #2C2520;
      }

      .leaderboard-header h2 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 22px;
        font-weight: 700;
        color: #2C2520;
        margin: 0;
      }

      .leaderboard-header .close-btn {
        background: rgba(44, 37, 32, 0.2);
        border: none;
        padding: 8px;
        cursor: pointer;
        color: #2C2520;
        border-radius: var(--radius-full, 9999px);
        transition: background ${DURATION.FAST}ms ease;
      }

      .leaderboard-header .close-btn:hover {
        background: rgba(44, 37, 32, 0.3);
      }

      /* User Stats Card */
      .user-stats-card {
        margin: var(--space-4, 16px);
        padding: var(--space-4, 16px);
        background: rgba(255, 255, 255, 0.05);
        border-radius: var(--radius-lg, 16px);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      .user-stats-card[data-loading="true"] {
        min-height: 150px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .loading-spinner {
        color: rgba(255, 255, 255, 0.5);
        font-size: 14px;
      }

      .stats-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-3, 12px);
      }

      .level-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        background: linear-gradient(135deg, var(--color-gold, #C4A35A), #daa520);
        color: #2C2520;
        padding: 6px 12px;
        border-radius: var(--radius-full, 9999px);
        font-weight: 700;
        font-size: 14px;
      }

      .level-badge svg {
        width: 16px;
        height: 16px;
      }

      .xp-display {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--color-teal, #3a6b73);
        font-weight: 600;
        font-size: 14px;
      }

      .xp-display svg {
        color: var(--color-teal, #3a6b73);
      }

      .xp-progress {
        margin-bottom: var(--space-3, 12px);
      }

      .xp-bar {
        height: 8px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-full, 9999px);
        overflow: hidden;
        margin-bottom: 4px;
      }

      .xp-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--color-teal, #3a6b73), #5a9ba3);
        border-radius: var(--radius-full, 9999px);
        transition: width ${DURATION.SLOW}ms ${EASING.SPRING};
      }

      .xp-text {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-3, 12px);
      }

      .stat-item {
        text-align: center;
        padding: var(--space-2, 8px);
        background: rgba(255, 255, 255, 0.05);
        border-radius: var(--radius-md, 12px);
      }

      .stat-item .stat-value {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        font-size: 18px;
        font-weight: 700;
        color: white;
      }

      .stat-item .stat-value svg {
        width: 16px;
        height: 16px;
        color: #ff6b35;
      }

      .stat-item .stat-label {
        font-size: 10px;
        color: rgba(255, 255, 255, 0.5);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .challenge-stats {
        padding-top: var(--space-2, 8px);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }

      .challenge-record {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        color: rgba(255, 255, 255, 0.7);
        font-size: 13px;
      }

      .challenge-record svg {
        width: 16px;
        height: 16px;
      }

      .win-rate {
        color: rgba(255, 255, 255, 0.4);
        font-size: 12px;
      }

      /* Period Tabs */
      .period-tabs {
        display: flex;
        gap: var(--space-1, 4px);
        padding: 0 var(--space-4, 16px);
        margin-bottom: var(--space-3, 12px);
      }

      .period-tab {
        flex: 1;
        padding: 10px;
        background: transparent;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: var(--radius-md, 12px);
        color: rgba(255, 255, 255, 0.6);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ease;
      }

      .period-tab:hover {
        background: rgba(255, 255, 255, 0.05);
        color: white;
      }

      .period-tab.active {
        background: var(--color-gold, #C4A35A);
        border-color: var(--color-gold, #C4A35A);
        color: #2C2520;
      }

      /* Leaderboard List */
      .leaderboard-list {
        flex: 1;
        overflow-y: auto;
        padding: 0 var(--space-4, 16px) var(--space-4, 16px);
      }

      .leaderboard-list[data-loading="true"] {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 200px;
      }

      .leaderboard-entry {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: rgba(255, 255, 255, 0.03);
        border-radius: var(--radius-md, 12px);
        margin-bottom: var(--space-2, 8px);
        animation: slideIn ${DURATION.NORMAL}ms ${EASING.SPRING} forwards;
        opacity: 0;
        transform: translateX(-10px);
      }

      @keyframes slideIn {
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      .leaderboard-entry.current-user {
        background: rgba(196, 163, 90, 0.15);
        border: 1px solid rgba(196, 163, 90, 0.3);
      }

      .entry-rank {
        min-width: 40px;
        text-align: center;
        font-size: 16px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.7);
      }

      .entry-info {
        flex: 1;
      }

      .entry-name {
        display: block;
        font-size: 14px;
        font-weight: 600;
        color: white;
        margin-bottom: 2px;
      }

      .entry-meta {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.4);
      }

      .entry-score {
        text-align: right;
      }

      .score-value {
        display: block;
        font-size: 16px;
        font-weight: 700;
        color: var(--color-gold, #C4A35A);
      }

      .rank-change {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 2px;
        font-size: 11px;
        font-weight: 600;
      }

      .rank-change.up {
        color: #4ade80;
      }

      .rank-change.down {
        color: #f87171;
      }

      .rank-change svg {
        width: 12px;
        height: 12px;
      }

      .empty-state {
        text-align: center;
        padding: var(--space-6, 24px);
        color: rgba(255, 255, 255, 0.5);
      }

      .empty-state p {
        margin: 4px 0;
      }
    `;

    document.head.appendChild(styles);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

let instance: LeaderboardUI | null = null;

export function getLeaderboardUI(userId: string): LeaderboardUI {
  if (!instance) {
    instance = new LeaderboardUI(userId);
  }
  return instance;
}

export function openLeaderboard(userId: string): void {
  const ui = getLeaderboardUI(userId);
  ui.open();
}

