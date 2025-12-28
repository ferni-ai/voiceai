/**
 * 🎵 Music Dashboard UI - "Musical You"
 *
 * A coaching-focused dashboard showing music game insights.
 * Feels like insights from a coach who knows you, not a spreadsheet.
 *
 * DESIGN PRINCIPLES:
 *   - Personality-first presentation
 *   - Warm, coaching language throughout
 *   - Celebrate achievements, encourage growth
 *   - Beautiful visualizations that feel human
 *
 * This module uses:
 *   - ./music-dashboard/types.ts for type definitions
 *   - ./music-dashboard/icons.ts for SVG icons
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

// Import types and icons from modular structure
import type {
  MusicInsights,
  MusicalYouProfile,
  MusicDashboardUICallbacks,
  MusicKitType,
  PersonalitySummary,
  AffinityDisplay,
  MilestoneDisplay,
  MemorableMoment,
  JourneyStats,
  PersonaPlayStats,
} from './music-dashboard/types.js';
import { ICONS } from './music-dashboard/icons.js';

// Re-export types for backward compatibility
export type { MusicDashboardUICallbacks } from './music-dashboard/types.js';

const log = createLogger('MusicDashboard');

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// MUSIC DASHBOARD UI CLASS
// ============================================================================

class MusicDashboardUI {
  private panel: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private callbacks: MusicDashboardUICallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;
  private profileData: MusicalYouProfile | null = null;

  initialize(): void {
    if (this.panel) return;

    // HMR protection
    document.querySelectorAll('.music-dashboard').forEach((el) => el.remove());

    this.injectStyles();
    this.createPanel();
  }

  setCallbacks(callbacks: MusicDashboardUICallbacks): void {
    this.callbacks = callbacks;
  }

  async show(): Promise<void> {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.showLoading();

    try {
      // Get userId from localStorage (consistent with other dashboards)
      const userId = localStorage.getItem('ferni_user_id') || 'dev-user';

      // Fetch both the legacy insights and new Musical You profile in parallel
      const [insightsResponse, profileResponse] = await Promise.all([
        fetch(`/api/games/insights?userId=${encodeURIComponent(userId)}`),
        fetch(`/api/musical/profile?userId=${encodeURIComponent(userId)}`).catch(() => null),
      ]);

      const result = await insightsResponse.json();

      // Try to get profile data (may not be available)
      if (profileResponse?.ok) {
        const profileResult = await profileResponse.json();
        if (profileResult.success) {
          this.profileData = profileResult.profile;
        }
      }

      if (result.success && result.insights) {
        this.renderContent(result.insights);

        if (!prefersReducedMotion()) {
          this.animateIn();
        }
      } else {
        this.showError('Unable to load your music insights');
      }
    } catch (error) {
      log.error('Failed to fetch music insights', error);
      this.showError('Unable to load your music insights');
    }
  }

  showLoading(): void {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="music-dashboard__header">
        <div class="music-dashboard__header-content">
          <span class="music-dashboard__icon">${ICONS.music}</span>
          <h2 class="music-dashboard__title">${t('musicDashboard.title')}</h2>
        </div>
        <button class="music-dashboard__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>
      <div class="music-dashboard__loading">
        <div class="music-dashboard__loading-spinner"></div>
        <p>${t('musicDashboard.loading')}</p>
      </div>
    `;

    this.wrapper
      .querySelector('.music-dashboard__close')
      ?.addEventListener('click', () => void this.hide());
    this.panel.classList.add('music-dashboard--visible');
    this.isVisible = true;
  }

  showError(message: string): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="music-dashboard__header">
        <div class="music-dashboard__header-content">
          <span class="music-dashboard__icon">${ICONS.music}</span>
          <h2 class="music-dashboard__title">${t('musicDashboard.title')}</h2>
        </div>
        <button class="music-dashboard__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>
      <div class="music-dashboard__error">
        <div class="music-dashboard__error-icon">${ICONS.music}</div>
        <p class="music-dashboard__error-title">${message}</p>
        <p class="music-dashboard__error-hint">${t('musicDashboard.error.hint')}</p>
        <button aria-label="Play" class="music-dashboard__cta">${t('musicDashboard.buttons.startPlaying')}</button>
      </div>
    `;

    this.wrapper
      .querySelector('.music-dashboard__close')
      ?.addEventListener('click', () => void this.hide());
    this.wrapper.querySelector('.music-dashboard__cta')?.addEventListener('click', () => {
      this.hide();
      this.callbacks.onPlayGame?.('name-that-tune');
    });
  }

  hide(): void {
    if (!this.panel) return;

    this.panel.classList.remove('music-dashboard--visible');
    this.isVisible = false;
    this.callbacks.onClose?.();
  }

  isOpen(): boolean {
    return this.isVisible;
  }

  private renderContent(insights: MusicInsights): void {
    if (!this.wrapper) return;

    // Handle no data case
    if (!insights.hasData) {
      this.renderEmptyState(insights);
      return;
    }

    this.wrapper.innerHTML = `
      <header class="music-dashboard__header">
        <div class="music-dashboard__header-content">
          <span class="music-dashboard__icon">${ICONS.music}</span>
          <h2 class="music-dashboard__title">${t('musicDashboard.title')}</h2>
        </div>
        <button class="music-dashboard__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>

      <div class="music-dashboard__scroll">
        ${this.renderPersonality(insights.personality)}
        ${this.renderCoachingMessage(insights.coachingMessage)}
        ${this.renderMusicSources()}
        ${this.renderDailyChallenge()}
        ${this.renderJourneyStats(insights.journeyStats)}
        ${this.renderTimeMachine()}
        ${this.renderStrengths(insights.strengths)}
        ${this.renderGrowthAreas(insights.growthAreas)}
        ${this.renderSocialStats()}
        ${this.renderMilestones(insights.milestones, insights.nextMilestone)}
        ${this.renderMemorableMoments(insights.memorableMoments)}
        ${this.renderShareableCards()}
        ${this.renderPersonaStats(insights.personaStats)}
      </div>
    `;

    // Bind events
    this.wrapper
      .querySelector('.music-dashboard__close')
      ?.addEventListener('click', () => void this.hide());
    this.bindNewFeatureEvents();
  }

  private renderEmptyState(insights: MusicInsights): void {
    if (!this.wrapper) return;

    this.wrapper.innerHTML = `
      <header class="music-dashboard__header">
        <div class="music-dashboard__header-content">
          <span class="music-dashboard__icon">${ICONS.music}</span>
          <h2 class="music-dashboard__title">${t('musicDashboard.title')}</h2>
        </div>
        <button class="music-dashboard__close" aria-label="${t('common.close')}">${ICONS.close}</button>
      </header>

      <div class="music-dashboard__scroll">
        <div class="music-dashboard__empty-intro">
          <div class="music-dashboard__empty-icon">${ICONS.music}</div>
          <h3>${t('musicDashboard.empty.title')}</h3>
          <p>${insights.coachingMessage}</p>
        </div>

        ${this.renderMusicSourcesCompact()}

        <div class="music-dashboard__empty-cta">
          <p class="music-dashboard__empty-hint">
            ${t('musicDashboard.empty.hint', { count: insights.gamesNeededForFullInsights })}
          </p>
          <button aria-label="Play" class="music-dashboard__cta">${t('musicDashboard.buttons.playGame')}</button>
        </div>
      </div>
    `;

    this.wrapper
      .querySelector('.music-dashboard__close')
      ?.addEventListener('click', () => void this.hide());
    this.wrapper.querySelector('.music-dashboard__cta')?.addEventListener('click', () => {
      this.hide();
      this.callbacks.onPlayGame?.('name-that-tune');
    });
    this.bindMusicSourceEvents();
  }

  /**
   * Compact version of music sources for the empty state
   */
  private renderMusicSourcesCompact(): string {
    const sources = this.profileData?.musicSources;
    const gamesPlayed = sources?.games?.gamesPlayed || 0;

    const spotifyStatus = sources?.spotify?.connected
      ? `<span class="music-sources__status music-sources__status--connected">${ICONS.check} Connected</span>`
      : `<button aria-label="Connect" class="music-sources__connect-btn" data-action="connect-spotify">${ICONS.link} Connect</button>`;

    const appleMusicStatus = sources?.appleMusic?.connected
      ? `<span class="music-sources__status music-sources__status--connected">${ICONS.check} Connected</span>`
      : `<button aria-label="Connect" class="music-sources__connect-btn" data-action="connect-apple-music">${ICONS.link} Connect</button>`;

    return `
      <section class="music-sources music-sources--compact">
        <h3 class="music-dashboard__section-title">
          <span class="music-dashboard__section-icon">${ICONS.link}</span>
          Connect Your Music
        </h3>
        <p class="music-sources__intro">
          Link your music library for personalized games and richer insights
        </p>

        <div class="music-sources__grid">
          <div class="music-sources__item music-sources__item--games">
            <span class="music-sources__icon">${ICONS.gamepad}</span>
            <div class="music-sources__info">
              <span class="music-sources__name">Games</span>
              <span class="music-sources__detail">${gamesPlayed} plays</span>
            </div>
            <span class="music-sources__status">${ICONS.check}</span>
          </div>

          <div class="music-sources__item music-sources__item--spotify ${sources?.spotify?.connected ? 'music-sources__item--connected' : ''}">
            <span class="music-sources__icon music-sources__icon--spotify">${ICONS.spotify}</span>
            <div class="music-sources__info">
              <span class="music-sources__name">Spotify</span>
              <span class="music-sources__detail">${sources?.spotify?.connected ? 'Library synced' : 'Use your library'}</span>
            </div>
            ${spotifyStatus}
          </div>

          <div class="music-sources__item music-sources__item--apple ${sources?.appleMusic?.connected ? 'music-sources__item--connected' : ''}">
            <span class="music-sources__icon music-sources__icon--apple">${ICONS.apple}</span>
            <div class="music-sources__info">
              <span class="music-sources__name">Apple Music</span>
              <span class="music-sources__detail">${sources?.appleMusic?.connected ? 'Library synced' : 'Use your library'}</span>
            </div>
            ${appleMusicStatus}
          </div>
        </div>
      </section>
    `;
  }

  /**
   * Bind events for music source connect buttons (used in both states)
   */
  private bindMusicSourceEvents(): void {
    this.wrapper
      ?.querySelector('[data-action="connect-spotify"]')
      ?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('ferni:connect-spotify'));
        this.hide();
      });

    this.wrapper
      ?.querySelector('[data-action="connect-apple-music"]')
      ?.addEventListener('click', () => {
        this.connectAppleMusic();
      });
  }

  private renderPersonality(personality: PersonalitySummary | null): string {
    if (!personality) return '';

    const traitsHtml = personality.traits
      .filter((t) => t.confidence >= 0.5)
      .slice(0, 3)
      .map(
        (t) => `
        <div class="music-dashboard__trait">
          <span class="music-dashboard__trait-name">${t.displayName}</span>
          <div class="music-dashboard__trait-bar">
            <div class="music-dashboard__trait-fill" style="width: ${Math.round(t.confidence * 100)}%"></div>
          </div>
          <span class="music-dashboard__trait-explanation">${t.explanation}</span>
        </div>
      `
      )
      .join('');

    return `
      <section class="music-dashboard__section music-dashboard__personality">
        <div class="music-dashboard__personality-header">
          <span class="music-dashboard__personality-icon">${ICONS.star}</span>
          <div>
            <h3 class="music-dashboard__personality-label">${personality.label}</h3>
            <p class="music-dashboard__personality-desc">${personality.description}</p>
          </div>
        </div>
        ${traitsHtml ? `<div class="music-dashboard__traits">${traitsHtml}</div>` : ''}
        <blockquote class="music-dashboard__quote">${personality.coachingQuote}</blockquote>
      </section>
    `;
  }

  private renderCoachingMessage(message: string): string {
    return `
      <section class="music-dashboard__section music-dashboard__coaching">
        <p class="music-dashboard__coaching-message">${message}</p>
      </section>
    `;
  }

  private renderMusicSources(): string {
    const sources = this.profileData?.musicSources;

    // Calculate DNA confidence based on connected sources
    let confidence = 0;
    let _connectedCount = 0;

    // Games always contribute
    const gamesPlayed = sources?.games?.gamesPlayed || 0;
    if (gamesPlayed > 0) {
      confidence += Math.min(30, gamesPlayed * 2); // Up to 30% from games
      _connectedCount++;
    }

    // Spotify adds 35%
    if (sources?.spotify?.connected) {
      confidence += 35;
      _connectedCount++;
    }

    // Apple Music adds 35%
    if (sources?.appleMusic?.connected) {
      confidence += 35;
      _connectedCount++;
    }

    // Cap at 100
    confidence = Math.min(100, confidence);

    const confidenceLabel =
      confidence >= 80
        ? 'Excellent'
        : confidence >= 60
          ? 'High'
          : confidence >= 40
            ? 'Medium'
            : 'Low';

    const spotifyStatus = sources?.spotify?.connected
      ? `<span class="music-sources__status music-sources__status--connected">${ICONS.check} ${sources.spotify.trackCount || 0} tracks</span>`
      : `<button aria-label="Connect" class="music-sources__connect-btn" data-action="connect-spotify">${ICONS.link} Connect</button>`;

    const appleMusicStatus = sources?.appleMusic?.connected
      ? `<span class="music-sources__status music-sources__status--connected">${ICONS.check} ${sources.appleMusic.trackCount || 0} tracks</span>`
      : `<button aria-label="Connect" class="music-sources__connect-btn" data-action="connect-apple-music">${ICONS.link} Connect</button>`;

    return `
      <section class="music-dashboard__section music-sources">
        <h3 class="music-dashboard__section-title">
          <span class="music-dashboard__section-icon">${ICONS.music}</span>
          Your Music Sources
        </h3>
        
        <div class="music-sources__grid">
          <div class="music-sources__item music-sources__item--games">
            <span class="music-sources__icon">${ICONS.gamepad}</span>
            <div class="music-sources__info">
              <span class="music-sources__name">Games</span>
              <span class="music-sources__detail">${gamesPlayed} plays</span>
            </div>
            <span class="music-sources__status music-sources__status--connected">${ICONS.check}</span>
          </div>
          
          <div class="music-sources__item music-sources__item--spotify ${sources?.spotify?.connected ? 'music-sources__item--connected' : ''}">
            <span class="music-sources__icon music-sources__icon--spotify">${ICONS.spotify}</span>
            <div class="music-sources__info">
              <span class="music-sources__name">Spotify</span>
              <span class="music-sources__detail">${sources?.spotify?.connected ? 'Library synced' : 'Not connected'}</span>
            </div>
            ${spotifyStatus}
          </div>
          
          <div class="music-sources__item music-sources__item--apple ${sources?.appleMusic?.connected ? 'music-sources__item--connected' : ''}">
            <span class="music-sources__icon music-sources__icon--apple">${ICONS.apple}</span>
            <div class="music-sources__info">
              <span class="music-sources__name">Apple Music</span>
              <span class="music-sources__detail">${sources?.appleMusic?.connected ? 'Library synced' : 'Not connected'}</span>
            </div>
            ${appleMusicStatus}
          </div>
        </div>
        
        <div class="music-sources__confidence">
          <div class="music-sources__confidence-header">
            <span class="music-sources__confidence-label">DNA Confidence</span>
            <span class="music-sources__confidence-value">${confidence}% ${confidenceLabel}</span>
          </div>
          <div class="music-sources__confidence-bar">
            <div class="music-sources__confidence-fill" style="width: ${confidence}%"></div>
          </div>
          ${
            confidence < 70
              ? `
            <p class="music-sources__confidence-hint">
              Connect more sources for richer insights about your musical personality
            </p>
          `
              : ''
          }
        </div>
      </section>
    `;
  }

  private renderJourneyStats(stats: JourneyStats): string {
    return `
      <section class="music-dashboard__section">
        <h3 class="music-dashboard__section-title">
          <span class="music-dashboard__section-icon">${ICONS.trending}</span>
          ${t('musicDashboard.sections.journey')}
        </h3>
        <div class="music-dashboard__stats-grid">
          <div class="music-dashboard__stat">
            <span class="music-dashboard__stat-value">${stats.totalGames}</span>
            <span class="music-dashboard__stat-label">${t('musicDashboard.stats.gamesPlayed')}</span>
          </div>
          <div class="music-dashboard__stat">
            <span class="music-dashboard__stat-value">${stats.bestStreak}</span>
            <span class="music-dashboard__stat-label">${t('musicDashboard.stats.bestStreak')}</span>
          </div>
          <div class="music-dashboard__stat">
            <span class="music-dashboard__stat-value">${stats.totalMinutes}</span>
            <span class="music-dashboard__stat-label">${t('musicDashboard.stats.minutes')}</span>
          </div>
          <div class="music-dashboard__stat">
            <span class="music-dashboard__stat-value">${stats.gamesThisWeek}</span>
            <span class="music-dashboard__stat-label">${t('musicDashboard.stats.thisWeek')}</span>
          </div>
        </div>
        ${
          stats.favoriteGameDisplayName
            ? `
          <p class="music-dashboard__favorite">
            ${t('musicDashboard.favorite.label')} <strong>${stats.favoriteGameDisplayName}</strong>
          </p>
        `
            : ''
        }
      </section>
    `;
  }

  private renderStrengths(strengths: AffinityDisplay[]): string {
    if (strengths.length === 0) return '';

    const strengthsHtml = strengths
      .slice(0, 4)
      .map(
        (s) => `
      <div class="music-dashboard__affinity music-dashboard__affinity--strength">
        <div class="music-dashboard__affinity-header">
          <span class="music-dashboard__affinity-name">${s.displayName}</span>
          <span class="music-dashboard__affinity-score">${s.accuracy}%</span>
        </div>
        <div class="music-dashboard__affinity-bar">
          <div class="music-dashboard__affinity-fill" style="width: ${s.affinityScore}%"></div>
        </div>
        <span class="music-dashboard__affinity-note">${s.coachingNote}</span>
      </div>
    `
      )
      .join('');

    return `
      <section class="music-dashboard__section">
        <h3 class="music-dashboard__section-title">
          <span class="music-dashboard__section-icon">${ICONS.zap}</span>
          ${t('musicDashboard.sections.strengths')}
        </h3>
        <div class="music-dashboard__affinities">${strengthsHtml}</div>
      </section>
    `;
  }

  private renderGrowthAreas(areas: AffinityDisplay[]): string {
    if (areas.length === 0) return '';

    const areasHtml = areas
      .slice(0, 3)
      .map(
        (a) => `
      <div class="music-dashboard__affinity music-dashboard__affinity--growth">
        <div class="music-dashboard__affinity-header">
          <span class="music-dashboard__affinity-name">${a.displayName}</span>
          <span class="music-dashboard__affinity-score">${a.accuracy}%</span>
        </div>
        <div class="music-dashboard__affinity-bar">
          <div class="music-dashboard__affinity-fill" style="width: ${a.affinityScore}%"></div>
        </div>
        <span class="music-dashboard__affinity-note">${a.coachingNote}</span>
      </div>
    `
      )
      .join('');

    return `
      <section class="music-dashboard__section">
        <h3 class="music-dashboard__section-title">
          <span class="music-dashboard__section-icon">${ICONS.target}</span>
          ${t('musicDashboard.sections.growth')}
        </h3>
        <div class="music-dashboard__affinities">${areasHtml}</div>
      </section>
    `;
  }

  private renderMilestones(
    milestones: MilestoneDisplay[],
    nextMilestone: MusicInsights['nextMilestone']
  ): string {
    const milestonesHtml = milestones
      .slice(0, 5)
      .map(
        (m) => `
      <div class="music-dashboard__milestone">
        <span class="music-dashboard__milestone-icon">${m.icon}</span>
        <div class="music-dashboard__milestone-content">
          <span class="music-dashboard__milestone-name">${m.displayName}</span>
          <span class="music-dashboard__milestone-desc">${m.description}</span>
        </div>
      </div>
    `
      )
      .join('');

    const nextHtml = nextMilestone
      ? `
      <div class="music-dashboard__next-milestone">
        <span class="music-dashboard__next-label">${t('musicDashboard.milestone.nextLabel')}</span>
        <span class="music-dashboard__next-name">${nextMilestone.displayName}</span>
        <div class="music-dashboard__next-bar">
          <div class="music-dashboard__next-fill" style="width: ${Math.round(nextMilestone.progress)}%"></div>
        </div>
        <span class="music-dashboard__next-desc">${nextMilestone.description}</span>
      </div>
    `
      : '';

    return `
      <section class="music-dashboard__section">
        <h3 class="music-dashboard__section-title">
          <span class="music-dashboard__section-icon">${ICONS.trophy}</span>
          ${t('musicDashboard.sections.milestones')}
        </h3>
        ${nextHtml}
        ${milestonesHtml ? `<div class="music-dashboard__milestones">${milestonesHtml}</div>` : ''}
      </section>
    `;
  }

  private renderMemorableMoments(moments: MemorableMoment[]): string {
    if (moments.length === 0) return '';

    const momentsHtml = moments
      .map(
        (m) => `
      <div class="music-dashboard__moment">
        <span class="music-dashboard__moment-icon">${m.icon}</span>
        <div class="music-dashboard__moment-content">
          <span class="music-dashboard__moment-title">${m.title}</span>
          <span class="music-dashboard__moment-value">${m.value}</span>
          <span class="music-dashboard__moment-note">${m.coachingNote}</span>
        </div>
      </div>
    `
      )
      .join('');

    return `
      <section class="music-dashboard__section">
        <h3 class="music-dashboard__section-title">
          <span class="music-dashboard__section-icon">${ICONS.heart}</span>
          ${t('musicDashboard.sections.moments')}
        </h3>
        <div class="music-dashboard__moments">${momentsHtml}</div>
      </section>
    `;
  }

  private renderPersonaStats(stats: PersonaPlayStats[]): string {
    if (stats.length === 0) return '';

    const statsHtml = stats
      .slice(0, 5)
      .map(
        (s) => `
      <div class="music-dashboard__persona-stat">
        <span class="music-dashboard__persona-name">${s.displayName}</span>
        <span class="music-dashboard__persona-games">${s.gamesPlayed} games</span>
      </div>
    `
      )
      .join('');

    return `
      <section class="music-dashboard__section">
        <h3 class="music-dashboard__section-title">
          <span class="music-dashboard__section-icon">${ICONS.user}</span>
          ${t('musicDashboard.sections.personaStats')}
        </h3>
        <div class="music-dashboard__persona-stats">${statsHtml}</div>
      </section>
    `;
  }

  // ============================================================================
  // NEW FEATURE SECTIONS
  // ============================================================================

  private renderDailyChallenge(): string {
    if (!this.profileData?.dailyChallenge) return '';

    const challenge = this.profileData.dailyChallenge;
    const stats = this.profileData.challengeStats;

    return `
      <section class="music-dashboard__section music-dashboard__daily-challenge">
        <h3 class="music-dashboard__section-title">
          <span class="music-dashboard__section-icon">${ICONS.calendar}</span>
          Today's Challenge
        </h3>
        <div class="music-dashboard__challenge-card">
          <div class="music-dashboard__challenge-header">
            <span class="music-dashboard__challenge-type">${challenge.type.replace('-', ' ')}</span>
            <span class="music-dashboard__challenge-xp">+${challenge.xpReward} XP</span>
          </div>
          <h4 class="music-dashboard__challenge-title">${challenge.title}</h4>
          <p class="music-dashboard__challenge-desc">${challenge.description}</p>
          <div class="music-dashboard__challenge-meta">
            <span>${Math.round(challenge.completionRate * 100)}% completion</span>
            <span>${challenge.participantCount} playing</span>
          </div>
          <button aria-label="Play" class="music-dashboard__challenge-btn" data-challenge-id="${challenge.id}">
            ${ICONS.play} Start Challenge
          </button>
        </div>
        ${
          stats.currentStreak > 0
            ? `
          <div class="music-dashboard__streak-badge">
            ${ICONS.flame} ${stats.currentStreak} day streak!
          </div>
        `
            : ''
        }
      </section>
    `;
  }

  private renderTimeMachine(): string {
    if (!this.profileData?.timeMachine || this.profileData.timeMachine.length === 0) return '';

    const entries = this.profileData.timeMachine.slice(0, 6);

    const entriesHtml = entries
      .map(
        (entry) => `
      <div class="music-dashboard__time-entry ${entry.milestone ? 'music-dashboard__time-entry--mastered' : ''}">
        <div class="music-dashboard__time-category">
          <span class="music-dashboard__time-icon">${entry.type === 'genre' ? ICONS.music : ICONS.clock}</span>
          <span class="music-dashboard__time-name">${entry.displayName}</span>
        </div>
        <div class="music-dashboard__time-bar">
          <div class="music-dashboard__time-fill" style="width: ${entry.currentAffinity}%"></div>
        </div>
        ${entry.milestone ? `<span class="music-dashboard__time-badge">${entry.milestone}</span>` : ''}
      </div>
    `
      )
      .join('');

    return `
      <section class="music-dashboard__section music-dashboard__time-machine">
        <h3 class="music-dashboard__section-title">
          <span class="music-dashboard__section-icon">${ICONS.clock}</span>
          Your Musical Journey
        </h3>
        <p class="music-dashboard__time-intro">When you discovered your strengths</p>
        <div class="music-dashboard__time-entries">${entriesHtml}</div>
      </section>
    `;
  }

  private renderSocialStats(): string {
    if (!this.profileData?.socialStats) return '';

    const stats = this.profileData.socialStats;
    const rank = this.profileData.leaderboardRank;

    // Don't show if no social activity
    if (stats.challengesSent === 0 && stats.challengesReceived === 0 && !rank) return '';

    return `
      <section class="music-dashboard__section music-dashboard__social">
        <h3 class="music-dashboard__section-title">
          <span class="music-dashboard__section-icon">${ICONS.users}</span>
          Social Stats
        </h3>
        <div class="music-dashboard__social-grid">
          ${
            rank
              ? `
            <div class="music-dashboard__social-stat music-dashboard__social-stat--rank">
              <span class="music-dashboard__social-value">#${rank.rank}</span>
              <span class="music-dashboard__social-label">Leaderboard</span>
              ${
                rank.change !== 0
                  ? `
                <span class="music-dashboard__social-change ${rank.change > 0 ? 'up' : 'down'}">
                  ${rank.change > 0 ? '↑' : '↓'} ${Math.abs(rank.change)}
                </span>
              `
                  : ''
              }
            </div>
          `
              : ''
          }
          <div class="music-dashboard__social-stat">
            <span class="music-dashboard__social-value">${stats.challengesWon}</span>
            <span class="music-dashboard__social-label">Challenges Won</span>
          </div>
          <div class="music-dashboard__social-stat">
            <span class="music-dashboard__social-value">${stats.challengesSent}</span>
            <span class="music-dashboard__social-label">Sent</span>
          </div>
          <div class="music-dashboard__social-stat">
            <span class="music-dashboard__social-value">${stats.challengesReceived}</span>
            <span class="music-dashboard__social-label">Received</span>
          </div>
        </div>
        <button aria-label="View Leaderboard" class="music-dashboard__leaderboard-btn">
          ${ICONS.trophy} View Leaderboard
        </button>
      </section>
    `;
  }

  private renderShareableCards(): string {
    return `
      <section class="music-dashboard__section music-dashboard__share">
        <h3 class="music-dashboard__section-title">
          <span class="music-dashboard__section-icon">${ICONS.share}</span>
          Share Your DNA
        </h3>
        <p class="music-dashboard__share-intro">Show off your musical personality!</p>
        <div class="music-dashboard__share-buttons" role="button" tabindex="0">
          <button aria-label="Musical DNA Card" class="music-dashboard__share-btn" data-card-type="musical-dna">
            ${ICONS.sparkles} Musical DNA Card
          </button>
          <button aria-label="Desert Island Card" class="music-dashboard__share-btn" data-card-type="desert-island">
            ${ICONS.heart} Desert Island Card
          </button>
        </div>
      </section>
    `;
  }

  private bindNewFeatureEvents(): void {
    // Daily challenge button
    this.wrapper
      ?.querySelector('.music-dashboard__challenge-btn')
      ?.addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLElement;
        const challengeId = btn.dataset.challengeId;
        if (challengeId) {
          this.callbacks.onStartChallenge?.(challengeId);
          this.hide();
        }
      });

    // Leaderboard button
    this.wrapper
      ?.querySelector('.music-dashboard__leaderboard-btn')
      ?.addEventListener('click', () => {
        this.callbacks.onViewLeaderboard?.();
      });

    // Share buttons
    this.wrapper?.querySelectorAll('.music-dashboard__share-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const cardType = (e.currentTarget as HTMLElement).dataset.cardType;
        if (cardType) {
          this.callbacks.onShareCard?.(cardType);
        }
      });
    });

    // Music source connect buttons
    this.bindMusicSourceEvents();
  }

  private async connectAppleMusic(): Promise<void> {
    try {
      // First, get the developer token from our server
      const tokenResponse = await fetch('/api/musical/apple/token');
      const tokenResult = await tokenResponse.json();

      if (!tokenResult.success || !tokenResult.developerToken) {
        log.warn('Apple Music not configured on server');
        window.dispatchEvent(
          new CustomEvent('ferni:toast', {
            detail: { message: 'Apple Music not available yet', type: 'info' },
          })
        );
        return;
      }

      // Check if MusicKit is available (loaded via script tag)
      if (typeof window !== 'undefined' && 'MusicKit' in window) {
        const MusicKit = (window as unknown as { MusicKit: MusicKitType }).MusicKit;

        // Configure MusicKit
        await MusicKit.configure({
          developerToken: tokenResult.developerToken,
          app: {
            name: 'Ferni',
            build: '1.0.0',
          },
        });

        // Get instance and authorize
        const music = MusicKit.getInstance();
        const userToken = await music.authorize();

        // Send user token to our server to sync library
        const connectResponse = await fetch('/api/musical/apple/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 'dev-user', // TODO: Get actual user ID
            userToken,
          }),
        });

        const connectResult = await connectResponse.json();

        if (connectResult.success) {
          window.dispatchEvent(
            new CustomEvent('ferni:toast', {
              detail: { message: 'Apple Music connected!', type: 'success' },
            })
          );
          // Refresh the dashboard
          this.show();
        } else {
          throw new Error(connectResult.error || 'Failed to connect');
        }
      } else {
        // MusicKit not loaded - show message
        window.dispatchEvent(
          new CustomEvent('ferni:toast', {
            detail: { message: 'Apple Music requires Safari or the Ferni app', type: 'info' },
          })
        );
      }
    } catch (error) {
      log.error('Failed to connect Apple Music', error);
      window.dispatchEvent(
        new CustomEvent('ferni:toast', {
          detail: { message: "Couldn't connect Apple Music. Try again?", type: 'error' },
        })
      );
    }
  }

  private animateIn(): void {
    // Stagger animate sections
    const sections = this.wrapper?.querySelectorAll('.music-dashboard__section');
    sections?.forEach((section, i) => {
      const el = section as HTMLElement;
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';

      trackedTimeout(
        () => {
          el.style.transition = `opacity ${DURATION.SLOW}ms ${EASING.STANDARD}, transform ${DURATION.SLOW}ms ${EASING.STANDARD}`;
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
        },
        100 + i * 80
      );
    });
  }

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'music-dashboard';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Musical You Dashboard');

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'music-dashboard__backdrop';
    backdrop.addEventListener('click', () => this.hide());
    this.panel.appendChild(backdrop);

    // Wrapper
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'music-dashboard__card';
    this.panel.appendChild(this.wrapper);

    document.body.appendChild(this.panel);
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      .music-dashboard {
        position: fixed;
        inset: 0;
        z-index: var(--z-dropdown);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD},
                    visibility ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      .music-dashboard--visible {
        opacity: 1;
        visibility: visible;
      }

      .music-dashboard__backdrop {
        position: absolute;
        inset: 0;
        background: rgba(44, 37, 32, 0.75);
      }

      .music-dashboard__card {
        position: relative;
        width: 90%;
        max-width: clamp(364px, 90vw, 520px);
        max-height: 85vh;
        background: var(--color-background-elevated);
        border-radius: var(--radius-2xl);
        box-shadow: var(--shadow-2xl);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transform: scale(0.95);
        transition: transform ${DURATION.SLOW}ms ${EASING.SPRING};
      }

      .music-dashboard--visible .music-dashboard__card {
        transform: scale(1);
      }

      .music-dashboard__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-4) var(--space-5);
        border-bottom: var(--glass-border-subtle);
        background: var(--color-background-secondary);
      }

      .music-dashboard__header-content {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }

      .music-dashboard__icon {
        width: 28px;
        height: 28px;
        color: var(--color-text-secondary);
      }

      .music-dashboard__title {
        font-family: var(--font-display);
        font-size: var(--text-xl);
        font-weight: var(--font-weight-bold);
        color: var(--color-text-primary);
        margin: 0;
      }

      .music-dashboard__close {
        width: 36px;
        height: 36px;
        border: none;
        background: transparent;
        border-radius: var(--radius-full);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-secondary);
        transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .music-dashboard__close:hover {
        background: var(--color-background-glass);
      }

      .music-dashboard__close svg {
        width: 20px;
        height: 20px;
      }

      .music-dashboard__scroll {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-4) var(--space-5) var(--space-6);
      }

      .music-dashboard__section {
        margin-bottom: var(--space-5);
      }

      .music-dashboard__section:last-child {
        margin-bottom: 0;
      }

      .music-dashboard__section-title {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-secondary);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider);
        margin: 0 0 var(--space-3) 0;
      }

      .music-dashboard__section-icon {
        width: 18px;
        height: 18px;
        color: var(--color-text-secondary);
      }

      /* Personality Section */
      .music-dashboard__personality {
        background: linear-gradient(135deg, 
          var(--persona-tint),
          var(--color-background-secondary)
        );
        border-radius: var(--radius-xl);
        padding: var(--space-4);
      }

      .music-dashboard__personality-header {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
        margin-bottom: var(--space-3);
      }

      .music-dashboard__personality-icon {
        width: 32px;
        height: 32px;
        color: var(--color-text-secondary);
        flex-shrink: 0;
      }

      .music-dashboard__personality-label {
        font-family: var(--font-display);
        font-size: var(--text-xl);
        font-weight: var(--font-weight-bold);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-1) 0;
      }

      .music-dashboard__personality-desc {
        font-size: var(--text-base);
        color: var(--color-text-secondary);
        margin: 0;
        line-height: var(--leading-normal);
      }

      .music-dashboard__traits {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        margin-bottom: var(--space-3);
      }

      .music-dashboard__trait {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
      }

      .music-dashboard__trait-name {
        font-weight: var(--font-weight-semibold);
        font-size: var(--text-sm);
        color: var(--color-text-primary);
      }

      .music-dashboard__trait-bar {
        height: 6px;
        background: var(--color-background-elevated);
        border-radius: var(--radius-xs);
        overflow: hidden;
      }

      .music-dashboard__trait-fill {
        height: 100%;
        background: var(--persona-primary);
        border-radius: var(--radius-xs);
        transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      .music-dashboard__trait-explanation {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }

      .music-dashboard__quote {
        font-style: italic;
        font-size: var(--text-base);
        color: var(--color-text-secondary);
        border-left: 3px solid var(--persona-primary);
        padding-left: var(--space-3);
        margin: 0;
      }

      /* Coaching Message */
      .music-dashboard__coaching {
        background: var(--color-background-secondary);
        border-radius: var(--radius-lg);
        padding: var(--space-3) var(--space-4);
      }

      .music-dashboard__coaching-message {
        font-size: var(--text-base);
        color: var(--color-text-primary);
        line-height: var(--leading-normal);
        margin: 0;
      }

      /* Stats Grid */
      .music-dashboard__stats-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--space-3);
      }

      .music-dashboard__stat {
        text-align: center;
        padding: var(--space-3) var(--space-2);
        background: var(--color-background-secondary);
        border-radius: var(--radius-lg);
      }

      .music-dashboard__stat-value {
        display: block;
        font-family: var(--font-display);
        font-size: var(--text-2xl);
        font-weight: var(--font-weight-bold);
        color: var(--color-text-secondary);
      }

      .music-dashboard__stat-label {
        display: block;
        font-size: var(--text-2xs);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider);
      }

      .music-dashboard__favorite {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: var(--space-3) 0 0 0;
        text-align: center;
      }

      /* Affinities */
      .music-dashboard__affinities {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .music-dashboard__affinity {
        background: var(--color-background-secondary);
        border-radius: var(--radius-lg);
        padding: var(--space-3);
      }

      .music-dashboard__affinity-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-2);
      }

      .music-dashboard__affinity-name {
        font-weight: var(--font-weight-semibold);
        font-size: var(--text-base);
        color: var(--color-text-primary);
      }

      .music-dashboard__affinity-score {
        font-weight: var(--font-weight-bold);
        font-size: var(--text-base);
        color: var(--color-text-secondary);
      }

      .music-dashboard__affinity--growth .music-dashboard__affinity-score {
        color: var(--color-semantic-warning);
      }

      .music-dashboard__affinity-bar {
        height: 6px;
        background: var(--color-background-elevated);
        border-radius: var(--radius-xs);
        overflow: hidden;
        margin-bottom: var(--space-2);
      }

      .music-dashboard__affinity-fill {
        height: 100%;
        background: var(--persona-primary);
        border-radius: var(--radius-xs);
      }

      .music-dashboard__affinity--growth .music-dashboard__affinity-fill {
        background: var(--color-semantic-warning);
      }

      .music-dashboard__affinity-note {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }

      /* Milestones */
      .music-dashboard__next-milestone {
        background: linear-gradient(135deg, 
          var(--persona-tint),
          transparent
        );
        border: var(--glass-border-subtle);
        border-radius: var(--radius-lg);
        padding: var(--space-3);
        margin-bottom: var(--space-3);
      }

      .music-dashboard__next-label {
        font-size: var(--text-2xs);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider);
      }

      .music-dashboard__next-name {
        display: block;
        font-family: var(--font-display);
        font-size: var(--text-lg);
        font-weight: var(--font-weight-bold);
        color: var(--color-text-primary);
        margin: var(--space-1) 0;
      }

      .music-dashboard__next-bar {
        height: 8px;
        background: var(--color-background-elevated);
        border-radius: var(--radius-xs);
        overflow: hidden;
        margin-bottom: var(--space-1);
      }

      .music-dashboard__next-fill {
        height: 100%;
        background: var(--persona-primary);
        border-radius: var(--radius-xs);
        transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      .music-dashboard__next-desc {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }

      .music-dashboard__milestones {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .music-dashboard__milestone {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-2) var(--space-3);
        background: var(--color-background-secondary);
        border-radius: var(--radius-md);
      }

      .music-dashboard__milestone-icon {
        font-size: var(--text-xl);
      }

      .music-dashboard__milestone-content {
        flex: 1;
      }

      .music-dashboard__milestone-name {
        display: block;
        font-weight: var(--font-weight-semibold);
        font-size: var(--text-sm);
        color: var(--color-text-primary);
      }

      .music-dashboard__milestone-desc {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }

      /* Memorable Moments */
      .music-dashboard__moments {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .music-dashboard__moment {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
        padding: var(--space-3);
        background: var(--color-background-secondary);
        border-radius: var(--radius-lg);
      }

      .music-dashboard__moment-icon {
        font-size: var(--text-2xl);
        flex-shrink: 0;
      }

      .music-dashboard__moment-content {
        flex: 1;
      }

      .music-dashboard__moment-title {
        display: block;
        font-weight: var(--font-weight-semibold);
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin-bottom: var(--space-1);
      }

      .music-dashboard__moment-value {
        display: block;
        font-size: var(--text-base);
        color: var(--color-text-primary);
        font-weight: var(--font-weight-medium);
        margin-bottom: var(--space-1);
      }

      .music-dashboard__moment-note {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        font-style: italic;
      }

      /* Persona Stats */
      .music-dashboard__persona-stats {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .music-dashboard__persona-stat {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-2) var(--space-3);
        background: var(--color-background-secondary);
        border-radius: var(--radius-md);
      }

      .music-dashboard__persona-name {
        font-weight: var(--font-weight-semibold);
        font-size: var(--text-base);
        color: var(--color-text-primary);
      }

      .music-dashboard__persona-games {
        font-size: var(--text-sm);
        color: var(--color-text-muted);
      }

      /* ============================================================ */
      /* NEW FEATURE STYLES - Daily Challenge, Time Machine, Social   */
      /* ============================================================ */

      /* Daily Challenge */
      .music-dashboard__daily-challenge {
        background: linear-gradient(135deg, 
          var(--persona-tint),
          var(--color-background-secondary)
        );
        border-radius: var(--radius-xl);
        padding: var(--space-4);
      }

      .music-dashboard__challenge-card {
        background: var(--color-background-elevated);
        border-radius: var(--radius-lg);
        padding: var(--space-4);
        box-shadow: var(--shadow-sm);
      }

      .music-dashboard__challenge-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-2);
      }

      .music-dashboard__challenge-type {
        font-size: var(--text-2xs);
        font-weight: var(--font-weight-semibold);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider);
        color: var(--color-text-muted);
      }

      .music-dashboard__challenge-xp {
        font-size: var(--text-xs);
        font-weight: var(--font-weight-bold);
        color: var(--persona-text);
        background: var(--persona-tint);
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-full);
      }

      .music-dashboard__challenge-title {
        font-family: var(--font-display);
        font-size: var(--text-lg);
        font-weight: var(--font-weight-bold);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-1) 0;
      }

      .music-dashboard__challenge-desc {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-3) 0;
      }

      .music-dashboard__challenge-meta {
        display: flex;
        gap: var(--space-4);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        margin-bottom: var(--space-3);
      }

      .music-dashboard__challenge-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2);
        padding: var(--space-3);
        background: var(--persona-primary);
        color: var(--color-text-inverse);
        font-weight: var(--font-weight-semibold);
        font-size: var(--text-base);
        border: none;
        border-radius: var(--radius-lg);
        cursor: pointer;
        transition: transform ${DURATION.FAST}ms ${EASING.STANDARD},
                    box-shadow ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .music-dashboard__challenge-btn:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-glow);
      }

      .music-dashboard__challenge-btn svg {
        width: 16px;
        height: 16px;
      }

      .music-dashboard__streak-badge {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2);
        margin-top: var(--space-3);
        padding: var(--space-2) var(--space-3);
        background: linear-gradient(135deg, var(--color-semantic-error), var(--color-semantic-warning));
        color: var(--color-text-inverse);
        font-weight: var(--font-weight-semibold);
        font-size: var(--text-sm);
        border-radius: var(--radius-full);
      }

      .music-dashboard__streak-badge svg {
        width: 16px;
        height: 16px;
      }

      /* Time Machine */
      .music-dashboard__time-machine {
        background: var(--color-background-secondary);
        border-radius: var(--radius-xl);
        padding: var(--space-4);
      }

      .music-dashboard__time-intro {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-3) 0;
      }

      .music-dashboard__time-entries {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .music-dashboard__time-entry {
        background: var(--color-background-elevated);
        border-radius: var(--radius-md);
        padding: var(--space-2) var(--space-3);
      }

      .music-dashboard__time-entry--mastered {
        border-left: 3px solid var(--persona-primary);
      }

      .music-dashboard__time-category {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin-bottom: var(--space-1);
      }

      .music-dashboard__time-icon {
        width: 16px;
        height: 16px;
        color: var(--color-text-secondary);
      }

      .music-dashboard__time-name {
        font-weight: var(--font-weight-semibold);
        font-size: var(--text-sm);
        color: var(--color-text-primary);
      }

      .music-dashboard__time-bar {
        height: 4px;
        background: var(--color-border-subtle);
        border-radius: var(--radius-xs);
        overflow: hidden;
      }

      .music-dashboard__time-fill {
        height: 100%;
        background: var(--persona-primary);
        border-radius: var(--radius-xs);
        transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      .music-dashboard__time-badge {
        font-size: var(--text-2xs);
        font-weight: var(--font-weight-semibold);
        text-transform: uppercase;
        color: var(--persona-text);
        margin-left: auto;
      }

      /* Social Stats */
      .music-dashboard__social {
        background: var(--color-background-secondary);
        border-radius: var(--radius-xl);
        padding: var(--space-4);
      }

      .music-dashboard__social-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-2);
        margin-bottom: var(--space-3);
      }

      .music-dashboard__social-stat {
        text-align: center;
        padding: var(--space-3);
        background: var(--color-background-elevated);
        border-radius: var(--radius-lg);
        position: relative;
      }

      .music-dashboard__social-stat--rank {
        grid-column: span 2;
        background: linear-gradient(135deg, 
          var(--persona-tint),
          var(--color-background-elevated)
        );
      }

      .music-dashboard__social-value {
        display: block;
        font-family: var(--font-display);
        font-size: var(--text-2xl);
        font-weight: var(--font-weight-bold);
        color: var(--persona-text);
      }

      .music-dashboard__social-stat--rank .music-dashboard__social-value {
        font-size: var(--text-4xl);
      }

      .music-dashboard__social-label {
        display: block;
        font-size: var(--text-2xs);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider);
      }

      .music-dashboard__social-change {
        position: absolute;
        top: var(--space-2);
        right: var(--space-2);
        font-size: var(--text-2xs);
        font-weight: var(--font-weight-semibold);
      }

      .music-dashboard__social-change.up {
        color: var(--color-semantic-success);
      }

      .music-dashboard__social-change.down {
        color: var(--color-semantic-error);
      }

      .music-dashboard__leaderboard-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2);
        padding: var(--space-3);
        background: transparent;
        color: var(--persona-text);
        font-weight: var(--font-weight-semibold);
        font-size: var(--text-base);
        border: 2px solid var(--persona-primary);
        border-radius: var(--radius-lg);
        cursor: pointer;
        transition: background ${DURATION.FAST}ms ${EASING.STANDARD},
                    color ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .music-dashboard__leaderboard-btn:hover {
        background: var(--persona-primary);
        color: var(--color-text-inverse);
      }

      .music-dashboard__leaderboard-btn svg {
        width: 16px;
        height: 16px;
      }

      /* Shareable Cards */
      .music-dashboard__share {
        background: linear-gradient(135deg, 
          var(--color-accent-subtle),
          var(--color-background-secondary)
        );
        border-radius: var(--radius-xl);
        padding: var(--space-4);
      }

      .music-dashboard__share-intro {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-3) 0;
      }

      .music-dashboard__share-buttons {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .music-dashboard__share-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2);
        padding: var(--space-3);
        background: var(--color-background-elevated);
        color: var(--color-text-primary);
        font-weight: var(--font-weight-semibold);
        font-size: var(--text-base);
        border: var(--glass-border-subtle);
        border-radius: var(--radius-lg);
        cursor: pointer;
        transition: transform ${DURATION.FAST}ms ${EASING.STANDARD},
                    box-shadow ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .music-dashboard__share-btn:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-md);
      }

      .music-dashboard__share-btn svg {
        width: 16px;
        height: 16px;
        color: var(--persona-text);
      }

      /* Empty & Loading States */
      .music-dashboard__empty,
      .music-dashboard__loading,
      .music-dashboard__error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-8) var(--space-4);
        text-align: center;
      }

      .music-dashboard__empty-intro {
        text-align: center;
        padding: var(--space-4) 0;
      }

      .music-dashboard__empty-intro h3 {
        font-family: var(--font-display);
        font-size: var(--text-xl);
        font-weight: var(--font-weight-bold);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-2) 0;
      }

      .music-dashboard__empty-intro p {
        font-size: var(--text-base);
        color: var(--color-text-secondary);
        margin: 0;
        line-height: var(--leading-normal);
      }

      .music-dashboard__empty-cta {
        text-align: center;
        padding: var(--space-4) 0 var(--space-2);
      }

      /* Compact Music Sources (empty state) */
      .music-sources--compact {
        margin: var(--space-4) 0;
      }

      .music-sources__intro {
        font-size: var(--text-sm);
        color: var(--color-text-muted);
        margin: 0 0 var(--space-3) 0;
        line-height: var(--leading-snug);
      }

      .music-dashboard__empty-icon,
      .music-dashboard__error-icon {
        width: 64px;
        height: 64px;
        color: var(--color-text-secondary);
        margin-bottom: var(--space-4);
        opacity: 0.5;
      }

      .music-dashboard__empty-intro .music-dashboard__empty-icon {
        margin: 0 auto var(--space-3);
        width: 48px;
        height: 48px;
        opacity: 0.6;
      }

      .music-dashboard__empty h3 {
        font-family: var(--font-display);
        font-size: var(--text-xl);
        font-weight: var(--font-weight-bold);
        color: var(--color-text-primary);
        margin: 0 0 var(--space-2) 0;
      }

      .music-dashboard__empty p,
      .music-dashboard__error-title {
        font-size: var(--text-base);
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-2) 0;
        line-height: var(--leading-normal);
      }

      .music-dashboard__empty-hint,
      .music-dashboard__error-hint {
        font-size: var(--text-sm);
        color: var(--color-text-muted);
        margin-bottom: var(--space-4);
      }

      .music-dashboard__cta {
        padding: var(--space-3) var(--space-5);
        background: var(--persona-primary);
        color: var(--color-text-inverse);
        font-weight: var(--font-weight-semibold);
        font-size: var(--text-base);
        border: none;
        border-radius: var(--radius-full);
        cursor: pointer;
        transition: transform ${DURATION.FAST}ms ${EASING.STANDARD},
                    box-shadow ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .music-dashboard__cta:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-glow);
      }

      .music-dashboard__loading-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--color-border-subtle);
        border-top-color: var(--color-text-secondary);
        border-radius: var(--radius-full);
        animation: music-dashboard-spin 1s linear infinite;
        margin-bottom: var(--space-4);
      }

      @keyframes music-dashboard-spin {
        to { transform: rotate(360deg); }
      }

      /* Music Sources Section */
      .music-sources {
        background: var(--color-background-secondary);
        border-radius: var(--radius-xl);
        padding: var(--space-4);
      }

      .music-sources__grid {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        margin-bottom: var(--space-4);
      }

      .music-sources__item {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3);
        background: var(--color-background-elevated);
        border-radius: var(--radius-lg);
        border: var(--glass-border-subtle);
        transition: border-color ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .music-sources__item--connected {
        border-color: var(--persona-text);
        background: linear-gradient(135deg,
          var(--persona-tint),
          var(--color-background-elevated)
        );
      }

      .music-sources__icon {
        width: 24px;
        height: 24px;
        color: var(--color-text-secondary);
        flex-shrink: 0;
      }

      .music-sources__icon--spotify {
        color: var(--external-gpt-primary);
      }

      .music-sources__icon--apple {
        color: var(--color-semantic-error);
      }

      .music-sources__info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: var(--space-0_5);
      }

      .music-sources__name {
        font-weight: var(--font-weight-semibold);
        font-size: var(--text-base);
        color: var(--color-text-primary);
      }

      .music-sources__detail {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }

      .music-sources__status {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        display: flex;
        align-items: center;
        gap: var(--space-1);
      }

      .music-sources__status--connected {
        color: var(--persona-text);
      }

      .music-sources__status svg {
        width: 14px;
        height: 14px;
      }

      .music-sources__connect-btn {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        padding: var(--space-2) var(--space-3);
        background: var(--color-background-elevated);
        color: var(--persona-text);
        font-weight: var(--font-weight-semibold);
        font-size: var(--text-xs);
        border: 1px solid var(--persona-primary);
        border-radius: var(--radius-full);
        cursor: pointer;
        transition: background ${DURATION.FAST}ms ${EASING.STANDARD},
                    color ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .music-sources__connect-btn:hover {
        background: var(--persona-primary);
        color: var(--color-text-inverse);
      }

      .music-sources__connect-btn svg {
        width: 14px;
        height: 14px;
      }

      .music-sources__confidence {
        padding-top: var(--space-3);
        border-top: var(--glass-border-subtle);
      }

      .music-sources__confidence-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-2);
      }

      .music-sources__confidence-label {
        font-size: var(--text-xs);
        font-weight: var(--font-weight-semibold);
        color: var(--color-text-secondary);
      }

      .music-sources__confidence-value {
        font-size: var(--text-xs);
        font-weight: var(--font-weight-bold);
        color: var(--persona-text);
      }

      .music-sources__confidence-bar {
        height: 8px;
        background: var(--color-background-elevated);
        border-radius: var(--radius-xs);
        overflow: hidden;
      }

      .music-sources__confidence-fill {
        height: 100%;
        background: linear-gradient(90deg,
          var(--persona-secondary),
          var(--persona-primary)
        );
        border-radius: var(--radius-xs);
        transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      .music-sources__confidence-hint {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        margin: var(--space-2) 0 0 0;
        line-height: var(--leading-snug);
      }

      /* Dark theme - uses CSS variables which auto-switch via [data-theme="midnight"] */

      /* Mobile */
      @media (max-width: clamp(336px, 90vw, 480px)) {
        .music-dashboard__card {
          width: 100%;
          max-width: none;
          max-height: 100vh;
          border-radius: var(--radius-xl) var(--radius-xl) 0 0;
          margin-top: auto;
        }

        .music-dashboard__stats-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
    `;

    document.head.appendChild(this.styleElement);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const musicDashboard = new MusicDashboardUI();

/**
 * Show the music dashboard
 */
export function showMusicDashboard(): void {
  musicDashboard.show();
}

/**
 * Initialize the music dashboard (call once at app startup)
 */
export function initMusicDashboardUI(): void {
  // Dashboard is lazy-initialized, nothing to do here
}
