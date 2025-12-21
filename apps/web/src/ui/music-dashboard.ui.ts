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
 */

import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';
import { createLogger } from '../utils/logger.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

const log = createLogger('MusicDashboard');

// MusicKit type definition (loaded via Apple's script)
interface MusicKitType {
  configure(config: {
    developerToken: string;
    app: { name: string; build: string };
  }): Promise<void>;
  getInstance(): {
    authorize(): Promise<string>;
  };
}

// FIX BUG: Track all setTimeout calls for proper cleanup
const { trackedTimeout, clearAll: clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES (matching backend MusicInsights)
// ============================================================================

interface PersonalitySummary {
  label: string;
  description: string;
  traits: Array<{
    trait: string;
    displayName: string;
    confidence: number;
    explanation: string;
  }>;
  coachingQuote: string;
}

interface AffinityDisplay {
  category: string;
  displayName: string;
  accuracy: number;
  avgTimeSeconds: number;
  affinityScore: number;
  coachingNote: string;
}

interface MilestoneDisplay {
  type: string;
  displayName: string;
  achievedAt: string;
  icon: string;
  description: string;
  celebrated: boolean;
}

interface MemorableMoment {
  type: string;
  title: string;
  value: string;
  icon: string;
  coachingNote: string;
}

interface JourneyStats {
  totalGames: number;
  totalRounds: number;
  totalMinutes: number;
  favoriteGame: string | null;
  favoriteGameDisplayName: string | null;
  gamesThisWeek: number;
  currentStreak: number;
  bestStreak: number;
  averageScore: number;
}

interface PersonaPlayStats {
  personaId: string;
  displayName: string;
  gamesPlayed: number;
  lastPlayed: string | null;
}

interface MusicInsights {
  hasData: boolean;
  gamesNeededForFullInsights: number;
  personality: PersonalitySummary | null;
  strengths: AffinityDisplay[];
  growthAreas: AffinityDisplay[];
  milestones: MilestoneDisplay[];
  nextMilestone: {
    type: string;
    displayName: string;
    description: string;
    progress: number;
  } | null;
  memorableMoments: MemorableMoment[];
  journeyStats: JourneyStats;
  personaStats: PersonaPlayStats[];
  coachingMessage: string;
  generatedAt: string;
}

// New types for Musical You features
interface DailyChallenge {
  id: string;
  date: string;
  type: string;
  title: string;
  description: string;
  instructions: string;
  xpReward: number;
  participantCount: number;
  completionRate: number;
}

interface DailyChallengeProgress {
  status: 'not-started' | 'in-progress' | 'completed' | 'failed';
  score?: number;
  xpEarned: number;
}

interface TimeMachineEntry {
  category: string;
  displayName: string;
  type: 'genre' | 'decade';
  currentAffinity: number;
  milestone?: string;
}

interface LeaderboardRank {
  rank: number;
  score: number;
  change: number;
}

interface SocialStats {
  challengesSent: number;
  challengesReceived: number;
  challengesWon: number;
  currentLeaderboardRank: number | null;
}

interface MusicSource {
  connected: boolean;
  gamesPlayed?: number;
  trackCount?: number;
  lastPlayed?: string | null;
  lastSynced?: string | null;
}

interface MusicSources {
  games: MusicSource;
  spotify: MusicSource;
  appleMusic: MusicSource;
}

interface MusicalYouProfile {
  dna: unknown | null;
  coachingMessage: string | null;
  timeMachine: TimeMachineEntry[];
  dailyChallenge: DailyChallenge;
  challengeStats: {
    totalCompleted: number;
    currentStreak: number;
    totalXpEarned: number;
  };
  socialStats: SocialStats;
  leaderboardRank: LeaderboardRank | null;
  musicSources?: MusicSources;
  spotifyConnected?: boolean;
  appleMusicConnected?: boolean;
}

export interface MusicDashboardUICallbacks {
  onClose?: () => void;
  onPlayGame?: (gameType: string) => void;
  onShareCard?: (cardType: string) => void;
  onStartChallenge?: (challengeId: string) => void;
  onViewLeaderboard?: () => void;
}

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  music:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  trophy:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  flame:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  heart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  target:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  trending:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  // New icons for Musical You features
  calendar:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  clock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  share:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
  users:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  award:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
  sparkles:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  // Music source icons
  gamepad:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>',
  spotify:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>',
  apple:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
};

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
      // Fetch both the legacy insights and new Musical You profile in parallel
      const [insightsResponse, profileResponse] = await Promise.all([
        fetch('/api/games/insights?userId=dev-user'),
        fetch('/api/musical/profile?userId=dev-user').catch(() => null),
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
      ?.addEventListener('click', () => this.hide());
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
        <button class="music-dashboard__cta">${t('musicDashboard.buttons.startPlaying')}</button>
      </div>
    `;

    this.wrapper
      .querySelector('.music-dashboard__close')
      ?.addEventListener('click', () => this.hide());
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
      ?.addEventListener('click', () => this.hide());
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
          <button class="music-dashboard__cta">${t('musicDashboard.buttons.playGame')}</button>
        </div>
      </div>
    `;

    this.wrapper
      .querySelector('.music-dashboard__close')
      ?.addEventListener('click', () => this.hide());
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
      : `<button class="music-sources__connect-btn" data-action="connect-spotify">${ICONS.link} Connect</button>`;

    const appleMusicStatus = sources?.appleMusic?.connected
      ? `<span class="music-sources__status music-sources__status--connected">${ICONS.check} Connected</span>`
      : `<button class="music-sources__connect-btn" data-action="connect-apple-music">${ICONS.link} Connect</button>`;

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
    let connectedCount = 0;

    // Games always contribute
    const gamesPlayed = sources?.games?.gamesPlayed || 0;
    if (gamesPlayed > 0) {
      confidence += Math.min(30, gamesPlayed * 2); // Up to 30% from games
      connectedCount++;
    }

    // Spotify adds 35%
    if (sources?.spotify?.connected) {
      confidence += 35;
      connectedCount++;
    }

    // Apple Music adds 35%
    if (sources?.appleMusic?.connected) {
      confidence += 35;
      connectedCount++;
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
      : `<button class="music-sources__connect-btn" data-action="connect-spotify">${ICONS.link} Connect</button>`;

    const appleMusicStatus = sources?.appleMusic?.connected
      ? `<span class="music-sources__status music-sources__status--connected">${ICONS.check} ${sources.appleMusic.trackCount || 0} tracks</span>`
      : `<button class="music-sources__connect-btn" data-action="connect-apple-music">${ICONS.link} Connect</button>`;

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
          <button class="music-dashboard__challenge-btn" data-challenge-id="${challenge.id}">
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
        <button class="music-dashboard__leaderboard-btn">
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
        <div class="music-dashboard__share-buttons">
          <button class="music-dashboard__share-btn" data-card-type="musical-dna">
            ${ICONS.sparkles} Musical DNA Card
          </button>
          <button class="music-dashboard__share-btn" data-card-type="desert-island">
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
        z-index: 1000;
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
        background: rgba(44, 37, 32, 0.5);
        backdrop-filter: blur(var(--glass-blur-medium, 16px));
        -webkit-backdrop-filter: blur(var(--glass-blur-medium, 16px));
      }

      .music-dashboard__card {
        position: relative;
        width: 90%;
        max-width: 520px;
        max-height: 85vh;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-2xl, 20px);
        box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.25));
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
        padding: var(--space-4, 16px) var(--space-5, 20px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
        background: var(--color-background-subtle, #f5f2ed);
      }

      .music-dashboard__header-content {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
      }

      .music-dashboard__icon {
        width: 28px;
        height: 28px;
        color: var(--color-text-secondary);
      }

      .music-dashboard__title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--color-text-primary, #2c2520);
        margin: 0;
      }

      .music-dashboard__close {
        width: 36px;
        height: 36px;
        border: none;
        background: transparent;
        border-radius: var(--radius-full, 50%);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--color-text-secondary, #5c5248);
        transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .music-dashboard__close:hover {
        background: var(--color-background-hover, rgba(0, 0, 0, 0.05));
      }

      .music-dashboard__close svg {
        width: 20px;
        height: 20px;
      }

      .music-dashboard__scroll {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-4, 16px) var(--space-5, 20px) var(--space-6, 24px);
      }

      .music-dashboard__section {
        margin-bottom: var(--space-5, 20px);
      }

      .music-dashboard__section:last-child {
        margin-bottom: 0;
      }

      .music-dashboard__section-title {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-text-secondary, #5c5248);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin: 0 0 var(--space-3, 12px) 0;
      }

      .music-dashboard__section-icon {
        width: 18px;
        height: 18px;
        color: var(--color-text-secondary);
      }

      /* Personality Section */
      .music-dashboard__personality {
        background: linear-gradient(135deg, 
          var(--persona-tint, rgba(74, 103, 65, 0.08)),
          var(--color-background-subtle, #f5f2ed)
        );
        border-radius: var(--radius-xl, 16px);
        padding: var(--space-4, 16px);
      }

      .music-dashboard__personality-header {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3, 12px);
        margin-bottom: var(--space-3, 12px);
      }

      .music-dashboard__personality-icon {
        width: 32px;
        height: 32px;
        color: var(--color-text-secondary);
        flex-shrink: 0;
      }

      .music-dashboard__personality-label {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-1, 4px) 0;
      }

      .music-dashboard__personality-desc {
        font-size: 0.9rem;
        color: var(--color-text-secondary, #5c5248);
        margin: 0;
        line-height: 1.5;
      }

      .music-dashboard__traits {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
        margin-bottom: var(--space-3, 12px);
      }

      .music-dashboard__trait {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 4px);
      }

      .music-dashboard__trait-name {
        font-weight: 600;
        font-size: 0.85rem;
        color: var(--color-text-primary, #2c2520);
      }

      .music-dashboard__trait-bar {
        height: 6px;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: 3px;
        overflow: hidden;
      }

      .music-dashboard__trait-fill {
        height: 100%;
        background: var(--persona-primary, #4a6741);
        border-radius: 3px;
        transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      .music-dashboard__trait-explanation {
        font-size: 0.8rem;
        color: var(--color-text-muted, #7a6f63);
      }

      .music-dashboard__quote {
        font-style: italic;
        font-size: 0.9rem;
        color: var(--color-text-secondary, #5c5248);
        border-left: 3px solid var(--persona-primary, #4a6741);
        padding-left: var(--space-3, 12px);
        margin: 0;
      }

      /* Coaching Message */
      .music-dashboard__coaching {
        background: var(--color-background-subtle, #f5f2ed);
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-3, 12px) var(--space-4, 16px);
      }

      .music-dashboard__coaching-message {
        font-size: 0.95rem;
        color: var(--color-text-primary, #2c2520);
        line-height: 1.6;
        margin: 0;
      }

      /* Stats Grid */
      .music-dashboard__stats-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--space-3, 12px);
      }

      .music-dashboard__stat {
        text-align: center;
        padding: var(--space-3, 12px) var(--space-2, 8px);
        background: var(--color-background-subtle, #f5f2ed);
        border-radius: var(--radius-lg, 12px);
      }

      .music-dashboard__stat-value {
        display: block;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--color-text-secondary);
      }

      .music-dashboard__stat-label {
        display: block;
        font-size: 0.7rem;
        color: var(--color-text-muted, #7a6f63);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .music-dashboard__favorite {
        font-size: 0.85rem;
        color: var(--color-text-secondary, #5c5248);
        margin: var(--space-3, 12px) 0 0 0;
        text-align: center;
      }

      /* Affinities */
      .music-dashboard__affinities {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
      }

      .music-dashboard__affinity {
        background: var(--color-background-subtle, #f5f2ed);
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-3, 12px);
      }

      .music-dashboard__affinity-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-2, 8px);
      }

      .music-dashboard__affinity-name {
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--color-text-primary, #2c2520);
      }

      .music-dashboard__affinity-score {
        font-weight: 700;
        font-size: 0.9rem;
        color: var(--color-text-secondary);
      }

      .music-dashboard__affinity--growth .music-dashboard__affinity-score {
        color: var(--color-semantic-warning, #a67c35);
      }

      .music-dashboard__affinity-bar {
        height: 6px;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: 3px;
        overflow: hidden;
        margin-bottom: var(--space-2, 8px);
      }

      .music-dashboard__affinity-fill {
        height: 100%;
        background: var(--persona-primary, #4a6741);
        border-radius: 3px;
      }

      .music-dashboard__affinity--growth .music-dashboard__affinity-fill {
        background: var(--color-semantic-warning, #a67c35);
      }

      .music-dashboard__affinity-note {
        font-size: 0.8rem;
        color: var(--color-text-muted, #7a6f63);
      }

      /* Milestones */
      .music-dashboard__next-milestone {
        background: linear-gradient(135deg, 
          var(--persona-tint, rgba(74, 103, 65, 0.08)),
          transparent
        );
        border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-3, 12px);
        margin-bottom: var(--space-3, 12px);
      }

      .music-dashboard__next-label {
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--color-text-muted, #7a6f63);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .music-dashboard__next-name {
        display: block;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--color-text-primary, #2c2520);
        margin: var(--space-1, 4px) 0;
      }

      .music-dashboard__next-bar {
        height: 8px;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: var(--space-1, 4px);
      }

      .music-dashboard__next-fill {
        height: 100%;
        background: var(--persona-primary, #4a6741);
        border-radius: 4px;
        transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      .music-dashboard__next-desc {
        font-size: 0.8rem;
        color: var(--color-text-muted, #7a6f63);
      }

      .music-dashboard__milestones {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .music-dashboard__milestone {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-2, 8px) var(--space-3, 12px);
        background: var(--color-background-subtle, #f5f2ed);
        border-radius: var(--radius-md, 8px);
      }

      .music-dashboard__milestone-icon {
        font-size: 1.25rem;
      }

      .music-dashboard__milestone-content {
        flex: 1;
      }

      .music-dashboard__milestone-name {
        display: block;
        font-weight: 600;
        font-size: 0.85rem;
        color: var(--color-text-primary, #2c2520);
      }

      .music-dashboard__milestone-desc {
        font-size: 0.75rem;
        color: var(--color-text-muted, #7a6f63);
      }

      /* Memorable Moments */
      .music-dashboard__moments {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
      }

      .music-dashboard__moment {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-background-subtle, #f5f2ed);
        border-radius: var(--radius-lg, 12px);
      }

      .music-dashboard__moment-icon {
        font-size: 1.5rem;
        flex-shrink: 0;
      }

      .music-dashboard__moment-content {
        flex: 1;
      }

      .music-dashboard__moment-title {
        display: block;
        font-weight: 600;
        font-size: 0.85rem;
        color: var(--color-text-secondary, #5c5248);
        margin-bottom: var(--space-1, 4px);
      }

      .music-dashboard__moment-value {
        display: block;
        font-size: 0.9rem;
        color: var(--color-text-primary, #2c2520);
        font-weight: 500;
        margin-bottom: var(--space-1, 4px);
      }

      .music-dashboard__moment-note {
        font-size: 0.8rem;
        color: var(--color-text-muted, #7a6f63);
        font-style: italic;
      }

      /* Persona Stats */
      .music-dashboard__persona-stats {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .music-dashboard__persona-stat {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-2, 8px) var(--space-3, 12px);
        background: var(--color-background-subtle, #f5f2ed);
        border-radius: var(--radius-md, 8px);
      }

      .music-dashboard__persona-name {
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--color-text-primary, #2c2520);
      }

      .music-dashboard__persona-games {
        font-size: 0.85rem;
        color: var(--color-text-muted, #7a6f63);
      }

      /* ============================================================ */
      /* NEW FEATURE STYLES - Daily Challenge, Time Machine, Social   */
      /* ============================================================ */

      /* Daily Challenge */
      .music-dashboard__daily-challenge {
        background: linear-gradient(135deg, 
          var(--persona-tint, rgba(74, 103, 65, 0.08)),
          var(--color-background-subtle, #f5f2ed)
        );
        border-radius: var(--radius-xl, 16px);
        padding: var(--space-4, 16px);
      }

      .music-dashboard__challenge-card {
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-lg, 12px);
        padding: var(--space-4, 16px);
        box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.1));
      }

      .music-dashboard__challenge-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-2, 8px);
      }

      .music-dashboard__challenge-type {
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted, #7a6f63);
      }

      .music-dashboard__challenge-xp {
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--persona-primary, #4a6741);
        background: var(--persona-tint, rgba(74, 103, 65, 0.1));
        padding: var(--space-1, 4px) var(--space-2, 8px);
        border-radius: var(--radius-full, 50px);
      }

      .music-dashboard__challenge-title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-1, 4px) 0;
      }

      .music-dashboard__challenge-desc {
        font-size: 0.85rem;
        color: var(--color-text-secondary, #5c5248);
        margin: 0 0 var(--space-3, 12px) 0;
      }

      .music-dashboard__challenge-meta {
        display: flex;
        gap: var(--space-4, 16px);
        font-size: 0.75rem;
        color: var(--color-text-muted, #7a6f63);
        margin-bottom: var(--space-3, 12px);
      }

      .music-dashboard__challenge-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        padding: var(--space-3, 12px);
        background: var(--persona-primary, #4a6741);
        color: white;
        font-weight: 600;
        font-size: 0.9rem;
        border: none;
        border-radius: var(--radius-lg, 12px);
        cursor: pointer;
        transition: transform ${DURATION.FAST}ms ${EASING.STANDARD},
                    box-shadow ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .music-dashboard__challenge-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(74, 103, 65, 0.3);
      }

      .music-dashboard__challenge-btn svg {
        width: 16px;
        height: 16px;
      }

      .music-dashboard__streak-badge {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        margin-top: var(--space-3, 12px);
        padding: var(--space-2, 8px) var(--space-3, 12px);
        background: linear-gradient(135deg, #ff6b35, #f7931e);
        color: white;
        font-weight: 600;
        font-size: 0.85rem;
        border-radius: var(--radius-full, 50px);
      }

      .music-dashboard__streak-badge svg {
        width: 16px;
        height: 16px;
      }

      /* Time Machine */
      .music-dashboard__time-machine {
        background: var(--color-background-subtle, #f5f2ed);
        border-radius: var(--radius-xl, 16px);
        padding: var(--space-4, 16px);
      }

      .music-dashboard__time-intro {
        font-size: 0.85rem;
        color: var(--color-text-secondary, #5c5248);
        margin: 0 0 var(--space-3, 12px) 0;
      }

      .music-dashboard__time-entries {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .music-dashboard__time-entry {
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-md, 8px);
        padding: var(--space-2, 8px) var(--space-3, 12px);
      }

      .music-dashboard__time-entry--mastered {
        border-left: 3px solid var(--persona-primary, #4a6741);
      }

      .music-dashboard__time-category {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-1, 4px);
      }

      .music-dashboard__time-icon {
        width: 16px;
        height: 16px;
        color: var(--color-text-secondary, #5c5248);
      }

      .music-dashboard__time-name {
        font-weight: 600;
        font-size: 0.85rem;
        color: var(--color-text-primary, #2c2520);
      }

      .music-dashboard__time-bar {
        height: 4px;
        background: var(--color-border-subtle, rgba(0, 0, 0, 0.08));
        border-radius: 2px;
        overflow: hidden;
      }

      .music-dashboard__time-fill {
        height: 100%;
        background: var(--persona-primary, #4a6741);
        border-radius: 2px;
        transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      .music-dashboard__time-badge {
        font-size: 0.65rem;
        font-weight: 600;
        text-transform: uppercase;
        color: var(--persona-primary, #4a6741);
        margin-left: auto;
      }

      /* Social Stats */
      .music-dashboard__social {
        background: var(--color-background-subtle, #f5f2ed);
        border-radius: var(--radius-xl, 16px);
        padding: var(--space-4, 16px);
      }

      .music-dashboard__social-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-3, 12px);
      }

      .music-dashboard__social-stat {
        text-align: center;
        padding: var(--space-3, 12px);
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-lg, 12px);
        position: relative;
      }

      .music-dashboard__social-stat--rank {
        grid-column: span 2;
        background: linear-gradient(135deg, 
          var(--persona-tint, rgba(74, 103, 65, 0.1)),
          var(--color-background-elevated, #fffdfb)
        );
      }

      .music-dashboard__social-value {
        display: block;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--persona-primary, #4a6741);
      }

      .music-dashboard__social-stat--rank .music-dashboard__social-value {
        font-size: 2rem;
      }

      .music-dashboard__social-label {
        display: block;
        font-size: 0.7rem;
        color: var(--color-text-muted, #7a6f63);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .music-dashboard__social-change {
        position: absolute;
        top: var(--space-2, 8px);
        right: var(--space-2, 8px);
        font-size: 0.7rem;
        font-weight: 600;
      }

      .music-dashboard__social-change.up {
        color: var(--color-semantic-success, #4a6741);
      }

      .music-dashboard__social-change.down {
        color: var(--color-semantic-error, #a65a4a);
      }

      .music-dashboard__leaderboard-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        padding: var(--space-3, 12px);
        background: transparent;
        color: var(--persona-primary, #4a6741);
        font-weight: 600;
        font-size: 0.9rem;
        border: 2px solid var(--persona-primary, #4a6741);
        border-radius: var(--radius-lg, 12px);
        cursor: pointer;
        transition: background ${DURATION.FAST}ms ${EASING.STANDARD},
                    color ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .music-dashboard__leaderboard-btn:hover {
        background: var(--persona-primary, #4a6741);
        color: white;
      }

      .music-dashboard__leaderboard-btn svg {
        width: 16px;
        height: 16px;
      }

      /* Shareable Cards */
      .music-dashboard__share {
        background: linear-gradient(135deg, 
          rgba(196, 133, 106, 0.1),
          var(--color-background-subtle, #f5f2ed)
        );
        border-radius: var(--radius-xl, 16px);
        padding: var(--space-4, 16px);
      }

      .music-dashboard__share-intro {
        font-size: 0.85rem;
        color: var(--color-text-secondary, #5c5248);
        margin: 0 0 var(--space-3, 12px) 0;
      }

      .music-dashboard__share-buttons {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .music-dashboard__share-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        padding: var(--space-3, 12px);
        background: var(--color-background-elevated, #fffdfb);
        color: var(--color-text-primary, #2c2520);
        font-weight: 600;
        font-size: 0.9rem;
        border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
        border-radius: var(--radius-lg, 12px);
        cursor: pointer;
        transition: transform ${DURATION.FAST}ms ${EASING.STANDARD},
                    box-shadow ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .music-dashboard__share-btn:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,0.15));
      }

      .music-dashboard__share-btn svg {
        width: 16px;
        height: 16px;
        color: var(--persona-primary, #4a6741);
      }

      /* Empty & Loading States */
      .music-dashboard__empty,
      .music-dashboard__loading,
      .music-dashboard__error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-8, 48px) var(--space-4, 16px);
        text-align: center;
      }

      .music-dashboard__empty-intro {
        text-align: center;
        padding: var(--space-4, 16px) 0;
      }

      .music-dashboard__empty-intro h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-2, 8px) 0;
      }

      .music-dashboard__empty-intro p {
        font-size: 0.9rem;
        color: var(--color-text-secondary, #5c5248);
        margin: 0;
        line-height: 1.5;
      }

      .music-dashboard__empty-cta {
        text-align: center;
        padding: var(--space-4, 16px) 0 var(--space-2, 8px);
      }

      /* Compact Music Sources (empty state) */
      .music-sources--compact {
        margin: var(--space-4, 16px) 0;
      }

      .music-sources__intro {
        font-size: 0.85rem;
        color: var(--color-text-muted, #7a6f63);
        margin: 0 0 var(--space-3, 12px) 0;
        line-height: 1.4;
      }

      .music-dashboard__empty-icon,
      .music-dashboard__error-icon {
        width: 64px;
        height: 64px;
        color: var(--color-text-secondary);
        margin-bottom: var(--space-4, 16px);
        opacity: 0.5;
      }

      .music-dashboard__empty-intro .music-dashboard__empty-icon {
        margin: 0 auto var(--space-3, 12px);
        width: 48px;
        height: 48px;
        opacity: 0.6;
      }

      .music-dashboard__empty h3 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-2, 8px) 0;
      }

      .music-dashboard__empty p,
      .music-dashboard__error-title {
        font-size: 0.95rem;
        color: var(--color-text-secondary, #5c5248);
        margin: 0 0 var(--space-2, 8px) 0;
        line-height: 1.5;
      }

      .music-dashboard__empty-hint,
      .music-dashboard__error-hint {
        font-size: 0.85rem;
        color: var(--color-text-muted, #7a6f63);
        margin-bottom: var(--space-4, 16px);
      }

      .music-dashboard__cta {
        padding: var(--space-3, 12px) var(--space-5, 20px);
        background: var(--persona-primary, #4a6741);
        color: white;
        font-weight: 600;
        font-size: 0.9rem;
        border: none;
        border-radius: var(--radius-full, 50px);
        cursor: pointer;
        transition: transform ${DURATION.FAST}ms ${EASING.STANDARD},
                    box-shadow ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .music-dashboard__cta:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(74, 103, 65, 0.3);
      }

      .music-dashboard__loading-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
        border-top-color: var(--color-text-secondary);
        border-radius: 50%;
        animation: music-dashboard-spin 1s linear infinite;
        margin-bottom: var(--space-4, 16px);
      }

      @keyframes music-dashboard-spin {
        to { transform: rotate(360deg); }
      }

      /* Music Sources Section */
      .music-sources {
        background: var(--color-background-subtle, #f5f2ed);
        border-radius: var(--radius-xl, 16px);
        padding: var(--space-4, 16px);
      }

      .music-sources__grid {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-4, 16px);
      }

      .music-sources__item {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-lg, 12px);
        border: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
        transition: border-color ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .music-sources__item--connected {
        border-color: var(--persona-primary, #4a6741);
        background: linear-gradient(135deg,
          var(--persona-tint, rgba(74, 103, 65, 0.05)),
          var(--color-background-elevated, #fffdfb)
        );
      }

      .music-sources__icon {
        width: 24px;
        height: 24px;
        color: var(--color-text-secondary, #5c5248);
        flex-shrink: 0;
      }

      .music-sources__icon--spotify {
        color: #1DB954;
      }

      .music-sources__icon--apple {
        color: #FC3C44;
      }

      .music-sources__info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .music-sources__name {
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--color-text-primary, #2c2520);
      }

      .music-sources__detail {
        font-size: 0.75rem;
        color: var(--color-text-muted, #7a6f63);
      }

      .music-sources__status {
        font-size: 0.75rem;
        color: var(--color-text-muted, #7a6f63);
        display: flex;
        align-items: center;
        gap: var(--space-1, 4px);
      }

      .music-sources__status--connected {
        color: var(--persona-primary, #4a6741);
      }

      .music-sources__status svg {
        width: 14px;
        height: 14px;
      }

      .music-sources__connect-btn {
        display: flex;
        align-items: center;
        gap: var(--space-1, 4px);
        padding: var(--space-2, 8px) var(--space-3, 12px);
        background: var(--color-background-elevated, #fffdfb);
        color: var(--persona-primary, #4a6741);
        font-weight: 600;
        font-size: 0.8rem;
        border: 1px solid var(--persona-primary, #4a6741);
        border-radius: var(--radius-full, 50px);
        cursor: pointer;
        transition: background ${DURATION.FAST}ms ${EASING.STANDARD},
                    color ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .music-sources__connect-btn:hover {
        background: var(--persona-primary, #4a6741);
        color: white;
      }

      .music-sources__connect-btn svg {
        width: 14px;
        height: 14px;
      }

      .music-sources__confidence {
        padding-top: var(--space-3, 12px);
        border-top: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.08));
      }

      .music-sources__confidence-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-2, 8px);
      }

      .music-sources__confidence-label {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--color-text-secondary, #5c5248);
      }

      .music-sources__confidence-value {
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--persona-primary, #4a6741);
      }

      .music-sources__confidence-bar {
        height: 8px;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: 4px;
        overflow: hidden;
      }

      .music-sources__confidence-fill {
        height: 100%;
        background: linear-gradient(90deg,
          var(--persona-secondary, #3d5a35),
          var(--persona-primary, #4a6741)
        );
        border-radius: 4px;
        transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      .music-sources__confidence-hint {
        font-size: 0.75rem;
        color: var(--color-text-muted, #7a6f63);
        margin: var(--space-2, 8px) 0 0 0;
        line-height: 1.4;
      }

      /* Dark theme */
      @media (prefers-color-scheme: dark) {
        .music-dashboard__card {
          background: var(--color-background-elevated, #3a3530);
        }

        .music-dashboard__header {
          background: var(--color-background-subtle, #2c2825);
          border-bottom-color: var(--color-border-subtle, rgba(255, 255, 255, 0.08));
        }

        .music-dashboard__trait-bar,
        .music-dashboard__affinity-bar,
        .music-dashboard__next-bar {
          background: var(--color-background-subtle, #2c2825);
        }

        .music-sources {
          background: var(--color-background-subtle, #2c2825);
        }

        .music-sources__item {
          background: var(--color-background-elevated, #3a3530);
          border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.08));
        }

        .music-sources__confidence-bar {
          background: var(--color-background-elevated, #3a3530);
        }
      }

      /* Mobile */
      @media (max-width: 480px) {
        .music-dashboard__card {
          width: 100%;
          max-width: none;
          max-height: 100vh;
          border-radius: var(--radius-xl, 16px) var(--radius-xl, 16px) 0 0;
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
