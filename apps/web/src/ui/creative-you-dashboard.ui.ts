/**
 * Creative You Dashboard UI
 *
 * The main dashboard for Creative You features:
 * - Daily content picks (video + podcast)
 * - Creative DNA profile
 * - Learning tracks progress
 * - Saved insights
 *
 * Design: Apple-style minimalist with Ferni's warm palette
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { createLogger } from '../utils/logger.js';
import { t } from '../i18n/index.js';

const log = createLogger('CreativeYouDashboard');

// ============================================================================
// TYPES
// ============================================================================

interface VideoRecommendation {
  video: {
    id: string;
    title: string;
    channelTitle: string;
    thumbnailUrl: string;
    durationSeconds: number;
  };
  reason: string;
  discussionPrompts: string[];
  mood: 'learn' | 'chill' | 'inspire' | 'reflect';
}

interface PodcastRecommendation {
  episode: {
    id: string;
    title: string;
    podcastTitle: string;
    summary?: string;
    duration: number;
  };
  reason: string;
  estimatedListenTime: string;
  mood: 'learn' | 'chill' | 'inspire' | 'reflect';
}

interface CreativeDNA {
  personalityLabel: string;
  personalityDescription: string;
  topTopics: Array<{ topic: string; score: number }>;
  totalVideosWatched: number;
  totalPodcastsListened: number;
  totalInsightsSaved: number;
  learningStyle: string;
}

interface LearningTrack {
  id: string;
  title: string;
  description: string;
  totalDuration: number;
  episodes: Array<{ id: string; title: string }>;
}

interface IntelligentRecommendation {
  content: VideoRecommendation | PodcastRecommendation;
  contentType: 'video' | 'podcast';
  relevanceScore: number;
  personalizedReason: string;
  connectionToConversations: string | null;
  suggestedTiming: 'now' | 'later' | 'weekend';
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ICONS = {
  play: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  video: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg>`,
  headphones: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`,
  brain: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5a2.5 2.5 0 0 0-4.96-.46 2.5 2.5 0 0 0-1.98 3 2.5 2.5 0 0 0-1.32 4.24 3 3 0 0 0 .34 5.58 2.5 2.5 0 0 0 2.96 3.08A2.5 2.5 0 0 0 12 19.5a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 12 4.5"/><path d="m15.7 10.4-.9.4"/><path d="m9.2 13.2-.9.4"/><path d="m13.6 15.7-.4-.9"/><path d="m10.8 9.2-.4-.9"/><path d="m15.7 13.5-.9-.4"/><path d="m9.2 10.9-.9-.4"/><path d="m10.5 15.7.4-.9"/><path d="m13.1 9.2.4-.9"/></svg>`,
  lightbulb: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>`,
  book: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`,
  close: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  share: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
  refresh: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>`,
};

const MOOD_COLORS: Record<string, string> = {
  learn: 'var(--color-teal, #3a6b73)',
  chill: 'var(--color-ferni, #4a6741)',
  inspire: 'var(--color-coral, #c4856a)',
  reflect: 'var(--color-slate, #5a6b8a)',
};

// Warm mood labels (not clinical categories)
const MOOD_LABELS: Record<string, string> = {
  learn: 'Grow',
  chill: 'Unwind',
  inspire: 'Spark',
  reflect: 'Pause',
};

// ============================================================================
// DASHBOARD CLASS
// ============================================================================

export class CreativeYouDashboard {
  private container: HTMLElement | null = null;
  private isOpen = false;
  private userId: string;

  // State
  private dailyVideo: VideoRecommendation | null = null;
  private dailyPodcast: PodcastRecommendation | null = null;
  private creativeDNA: CreativeDNA | null = null;
  private learningTracks: LearningTrack[] = [];
  private userTopics: string[] = []; // Topics from conversations
  private personalizedTrackAvailable = false;

  constructor(userId: string, options?: { topics?: string[] }) {
    this.userId = userId;
    this.userTopics = options?.topics || [];
  }

  /**
   * Update user topics (call when new topics are learned from conversation)
   */
  setUserTopics(topics: string[]): void {
    this.userTopics = topics;
  }

  /**
   * Initialize the dashboard
   */
  async initialize(): Promise<void> {
    // Cleanup any existing
    this.cleanup();

    // Create the dashboard
    this.createDashboard();

    // Load data
    await this.loadData();
  }

  /**
   * Open the dashboard
   */
  open(): void {
    if (!this.container) {
      this.createDashboard();
    }
    this.container!.classList.add('open');
    this.isOpen = true;

    // Animate in
    requestAnimationFrame(() => {
      const content = this.container!.querySelector('.creative-dashboard-content');
      if (content) {
        (content as HTMLElement).style.transform = 'scale(1)';
        (content as HTMLElement).style.opacity = '1';
      }
    });
  }

  /**
   * Close the dashboard
   */
  close(): void {
    if (!this.container) return;

    const content = this.container.querySelector('.creative-dashboard-content') as HTMLElement;
    if (content) {
      content.style.transform = 'scale(0.95)';
      content.style.opacity = '0';
    }

    setTimeout(() => {
      this.container?.classList.remove('open');
      this.isOpen = false;
    }, DURATION.NORMAL);
  }

  /**
   * Toggle the dashboard
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

  private createDashboard(): void {
    this.container = document.createElement('div');
    this.container.className = 'creative-dashboard-overlay';
    this.container.innerHTML = this.renderDashboard();

    // Add styles
    this.injectStyles();

    // Add to DOM
    document.body.appendChild(this.container);

    // Bind events
    this.bindEvents();
  }

  private renderDashboard(): string {
    return `
      <div class="creative-dashboard-backdrop"></div>
      <div class="creative-dashboard-content">
        <header class="creative-dashboard-header">
          <div class="header-left">
            <span class="eyebrow">${t('creativeYou.eyebrow')}</span>
            <h2>${t('creativeYou.title')}</h2>
            <p class="welcome-message">${t('creativeYou.welcome')}</p>
          </div>
          <button class="close-btn" aria-label="${t('common.close')}">
            ${ICONS.close}
          </button>
        </header>

        <div class="creative-dashboard-body">
          <!-- Daily Picks Section -->
          <section class="dashboard-section daily-picks">
            <h3>${ICONS.lightbulb} ${t('creativeYou.todaysPicks')}</h3>
            <div class="picks-grid">
              <div class="pick-card video-pick" data-loading="true">
                <div class="pick-loading">${t('creativeYou.loadingPicks')}</div>
              </div>
              <div class="pick-card podcast-pick" data-loading="true">
                <div class="pick-loading">${t('creativeYou.loadingPicks')}</div>
              </div>
            </div>
          </section>

          <!-- What You're Into Section -->
          <section class="dashboard-section creative-dna-section">
            <h3>${ICONS.brain} ${t('creativeYou.yourDNA')}</h3>
            <div class="dna-card" data-loading="true">
              <div class="pick-loading">${t('creativeYou.loadingProfile')}</div>
            </div>
          </section>

          <!-- Paths Worth Exploring Section -->
          <section class="dashboard-section learning-tracks-section">
            <h3>${ICONS.book} ${t('creativeYou.learningTracks')}</h3>
            <div class="tracks-list" data-loading="true">
              <div class="pick-loading">${t('creativeYou.loadingTracks')}</div>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  private async loadData(): Promise<void> {
    const baseUrl = window.location.origin;

    try {
      // If we have user topics, use the intelligent endpoint for personalized recommendations
      if (this.userTopics.length > 0) {
        await this.loadIntelligentRecommendations(baseUrl);
      } else {
        // Fall back to daily picks
        await this.loadDailyPicks(baseUrl);
      }

      // Load DNA and tracks in parallel
      const [dnaRes, tracksRes] = await Promise.all([
        fetch(`${baseUrl}/api/creative/dna?userId=${this.userId}`),
        fetch(`${baseUrl}/api/creative/tracks`),
      ]);

      if (dnaRes.ok) {
        const data = await dnaRes.json();
        this.creativeDNA = data.dna;
        this.renderCreativeDNA();
      }

      if (tracksRes.ok) {
        const data = await tracksRes.json();
        this.learningTracks = data.tracks;
        this.renderLearningTracks();
      }
    } catch (error) {
      log.error('Failed to load Creative You data:', error);
    }
  }

  /**
   * Load intelligent recommendations based on user's conversation topics
   */
  private async loadIntelligentRecommendations(baseUrl: string): Promise<void> {
    const topicsParam = encodeURIComponent(this.userTopics.join(','));
    const url = `${baseUrl}/api/creative/intelligent?userId=${this.userId}&topics=${topicsParam}&count=4`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        log.warn('Intelligent recommendations failed, falling back to daily picks');
        await this.loadDailyPicks(baseUrl);
        return;
      }

      const data = await res.json();
      const recommendations = data.recommendations || [];

      // Find first video and podcast recommendation
      const videoRec = recommendations.find((r: IntelligentRecommendation) => r.contentType === 'video');
      const podcastRec = recommendations.find((r: IntelligentRecommendation) => r.contentType === 'podcast');

      if (videoRec) {
        this.dailyVideo = {
          ...videoRec.content,
          // Override reason with personalized reason
          reason: videoRec.personalizedReason || videoRec.content.reason,
        };
        this.renderVideoPick();
      }

      if (podcastRec) {
        this.dailyPodcast = {
          ...podcastRec.content,
          reason: podcastRec.personalizedReason || podcastRec.content.reason,
        };
        this.renderPodcastPick();
      }

      // If we didn't get both, load the missing ones from daily picks
      if (!videoRec || !podcastRec) {
        await this.loadDailyPicks(baseUrl, !videoRec, !podcastRec);
      }

      log.debug('Loaded intelligent recommendations', {
        topics: this.userTopics,
        videoFound: !!videoRec,
        podcastFound: !!podcastRec,
      });
    } catch (error) {
      log.error('Failed to load intelligent recommendations:', error);
      await this.loadDailyPicks(baseUrl);
    }
  }

  /**
   * Load daily picks (fallback or supplement)
   */
  private async loadDailyPicks(
    baseUrl: string,
    loadVideo = true,
    loadPodcast = true
  ): Promise<void> {
    const requests: Promise<Response>[] = [];

    if (loadVideo) {
      requests.push(fetch(`${baseUrl}/api/creative/videos/daily?userId=${this.userId}`));
    }
    if (loadPodcast) {
      requests.push(fetch(`${baseUrl}/api/creative/podcasts/daily?userId=${this.userId}`));
    }

    const responses = await Promise.all(requests);
    let idx = 0;

    if (loadVideo && responses[idx]) {
      const videoRes = responses[idx++];
      if (videoRes.ok) {
        const data = await videoRes.json();
        this.dailyVideo = data.dailyPick;
        this.renderVideoPick();
      }
    }

    if (loadPodcast && responses[idx]) {
      const podcastRes = responses[idx];
      if (podcastRes.ok) {
        const data = await podcastRes.json();
        this.dailyPodcast = data.dailyPick;
        this.renderPodcastPick();
      }
    }
  }

  private renderVideoPick(): void {
    const container = this.container?.querySelector('.video-pick');
    if (!container) return;

    container.setAttribute('data-loading', 'false');

    // Empty state - warm copy
    if (!this.dailyVideo) {
      container.innerHTML = `
        <div class="empty-pick">
          <div class="empty-icon">${ICONS.video}</div>
          <p>${t('creativeYou.noPicks')}</p>
        </div>
      `;
      return;
    }

    const video = this.dailyVideo.video;
    const moodColor = MOOD_COLORS[this.dailyVideo.mood] || MOOD_COLORS.learn;

    container.innerHTML = `
      <div class="pick-type" style="background: ${moodColor}">
        ${ICONS.video} ${t('creativeYou.video')}
      </div>
      <div class="pick-thumbnail" style="background-image: url('${video.thumbnailUrl}')">
        <div class="play-overlay">
          ${ICONS.play}
        </div>
        <span class="duration">${this.formatDuration(video.durationSeconds)}</span>
      </div>
      <div class="pick-info">
        <h4>${video.title}</h4>
        <p class="channel">${video.channelTitle}</p>
        <p class="reason">${this.dailyVideo.reason}</p>
        <span class="mood-badge" style="background: ${moodColor}">${MOOD_LABELS[this.dailyVideo.mood]}</span>
      </div>
    `;

    container.addEventListener('click', () => this.openVideo(video.id));
  }

  private renderPodcastPick(): void {
    const container = this.container?.querySelector('.podcast-pick');
    if (!container) return;

    container.setAttribute('data-loading', 'false');

    // Empty state - warm copy
    if (!this.dailyPodcast) {
      container.innerHTML = `
        <div class="empty-pick">
          <div class="empty-icon">${ICONS.headphones}</div>
          <p>${t('creativeYou.noPicks')}</p>
        </div>
      `;
      return;
    }

    const episode = this.dailyPodcast.episode;
    const moodColor = MOOD_COLORS[this.dailyPodcast.mood] || MOOD_COLORS.learn;

    container.innerHTML = `
      <div class="pick-type" style="background: ${moodColor}">
        ${ICONS.headphones} ${t('creativeYou.podcast')}
      </div>
      <div class="pick-icon-container" style="background: ${moodColor}20">
        ${ICONS.headphones}
      </div>
      <div class="pick-info">
        <h4>${episode.title}</h4>
        <p class="channel">${episode.podcastTitle}</p>
        <p class="reason">${this.dailyPodcast.reason}</p>
        <div class="pick-meta">
          <span class="duration">${this.dailyPodcast.estimatedListenTime}</span>
          <span class="mood-badge" style="background: ${moodColor}">${MOOD_LABELS[this.dailyPodcast.mood]}</span>
        </div>
      </div>
    `;

    container.addEventListener('click', () => this.openPodcast(episode.id));
  }

  private renderCreativeDNA(): void {
    const container = this.container?.querySelector('.dna-card');
    if (!container) return;

    container.setAttribute('data-loading', 'false');

    // Empty state - warm copy
    if (!this.creativeDNA) {
      container.innerHTML = `
        <div class="empty-dna">
          <div class="empty-icon">${ICONS.brain}</div>
          <p>${t('creativeYou.noProfile')}</p>
        </div>
      `;
      return;
    }

    const topTopics = this.creativeDNA.topTopics.slice(0, 4);
    const maxScore = Math.max(...topTopics.map((topic) => topic.score), 1);

    container.innerHTML = `
      <div class="dna-header">
        <div class="dna-personality">
          <span class="personality-label">${this.creativeDNA.personalityLabel}</span>
          <p class="personality-desc">${this.creativeDNA.personalityDescription}</p>
        </div>
        <button class="share-dna-btn" aria-label="${t('common.share')}">
          ${ICONS.share}
        </button>
      </div>

      <div class="dna-stats">
        <div class="stat">
          <span class="stat-value">${this.creativeDNA.totalVideosWatched}</span>
          <span class="stat-label">${t('creativeYou.videos')}</span>
        </div>
        <div class="stat">
          <span class="stat-value">${this.creativeDNA.totalPodcastsListened}</span>
          <span class="stat-label">${t('creativeYou.podcasts')}</span>
        </div>
        <div class="stat">
          <span class="stat-value">${this.creativeDNA.totalInsightsSaved}</span>
          <span class="stat-label">${t('creativeYou.insights')}</span>
        </div>
        <div class="stat">
          <span class="stat-value">${this.creativeDNA.learningStyle}</span>
          <span class="stat-label">${t('creativeYou.style')}</span>
        </div>
      </div>

      ${
        topTopics.length > 0
          ? `
      <div class="dna-interests">
        <h5>${t('creativeYou.topInterests')}</h5>
        <div class="interest-bars">
          ${topTopics
            .map(
              (topic) => `
            <div class="interest-bar">
              <span class="interest-name">${topic.topic}</span>
              <div class="bar-container">
                <div class="bar-fill" style="width: ${(topic.score / maxScore) * 100}%"></div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
      `
          : ''
      }
    `;

    // Bind share button
    const shareBtn = container.querySelector('.share-dna-btn');
    shareBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.shareCreativeDNA();
    });
  }

  private renderLearningTracks(): void {
    const container = this.container?.querySelector('.tracks-list');
    if (!container) return;

    container.setAttribute('data-loading', 'false');

    if (this.learningTracks.length === 0) {
      container.innerHTML = `<p class="empty-state">${t('creativeYou.noTracks')}</p>`;
      return;
    }

    container.innerHTML = this.learningTracks
      .map(
        (track) => `
        <div class="track-card" data-track-id="${track.id}">
          <div class="track-info">
            <h4>${track.title}</h4>
            <p>${track.description}</p>
            <div class="track-meta">
              <span>${track.episodes.length} ${t('creativeYou.episodes')}</span>
              <span>•</span>
              <span>${Math.round(track.totalDuration / 60)}h ${t('creativeYou.total')}</span>
            </div>
          </div>
          <button class="start-track-btn">${t('creativeYou.start')}</button>
        </div>
      `
      )
      .join('');

    // Bind track buttons
    container.querySelectorAll('.track-card').forEach((card) => {
      const btn = card.querySelector('.start-track-btn');
      btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const trackId = (card as HTMLElement).dataset.trackId;
        if (trackId) this.startLearningTrack(trackId);
      });
    });
  }

  private bindEvents(): void {
    // Close button
    const closeBtn = this.container?.querySelector('.close-btn');
    closeBtn?.addEventListener('click', () => this.close());

    // Backdrop click
    const backdrop = this.container?.querySelector('.creative-dashboard-backdrop');
    backdrop?.addEventListener('click', () => this.close());

    // Escape key
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  // ========================================
  // ACTIONS
  // ========================================

  private openVideo(videoId: string): void {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    window.open(url, '_blank');
  }

  private async openPodcast(episodeId: string): Promise<void> {
    log.debug('Open podcast:', episodeId);

    // Fetch episode details from API
    try {
      const response = await fetch(`/api/creative/podcasts/${episodeId}`);
      if (!response.ok) {
        log.error('Failed to fetch episode:', response.status);
        return;
      }

      const data = await response.json();
      const episode = data.episode;

      if (!episode) {
        log.error('Episode not found:', episodeId);
        return;
      }

      // Create episode detail modal
      const modal = document.createElement('div');
      modal.className = 'episode-detail-modal';
      modal.innerHTML = `
        <div class="episode-detail-backdrop"></div>
        <div class="episode-detail-content">
          <header>
            <button class="close-episode-btn" aria-label="Close">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </header>
          <div class="episode-hero">
            <div class="podcast-icon">${ICONS.headphones}</div>
            <span class="podcast-name">${episode.podcastTitle}</span>
          </div>
          <div class="episode-body">
            <h2>${episode.title}</h2>
            <p class="episode-duration">${Math.round(episode.duration / 60)} minutes</p>
            <p class="episode-summary">${episode.summary || episode.description}</p>
            ${
              data.discussionPrompts && data.discussionPrompts.length > 0
                ? `
              <div class="discussion-prompts">
                <h4>After you listen...</h4>
                <ul>
                  ${data.discussionPrompts.map((p: string) => `<li>${p}</li>`).join('')}
                </ul>
              </div>
            `
                : ''
            }
          </div>
          <div class="episode-cta">
            <p class="listen-hint">Find this episode on your favorite podcast app:</p>
            <div class="podcast-links">
              <a href="https://podcasts.apple.com/search?term=${encodeURIComponent(episode.podcastTitle + ' ' + episode.title)}" target="_blank" class="podcast-link">
                Apple Podcasts
              </a>
              <a href="https://open.spotify.com/search/${encodeURIComponent(episode.podcastTitle + ' ' + episode.title)}" target="_blank" class="podcast-link">
                Spotify
              </a>
              <a href="https://www.google.com/search?q=${encodeURIComponent(episode.podcastTitle + ' ' + episode.title + ' podcast')}" target="_blank" class="podcast-link">
                Search
              </a>
            </div>
          </div>
        </div>
      `;

      // Add styles if not already present
      if (!document.getElementById('episode-detail-styles')) {
        const styles = document.createElement('style');
        styles.id = 'episode-detail-styles';
        styles.textContent = `
          .episode-detail-modal {
            position: fixed;
            inset: 0;
            z-index: var(--z-modal, 2100);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: var(--space-4, 16px);
          }
          .episode-detail-backdrop {
            position: absolute;
            inset: 0;
            background: rgba(44, 37, 32, 0.5);
            backdrop-filter: blur(12px);
          }
          .episode-detail-content {
            position: relative;
            background: var(--color-background-elevated, #FFFDFB);
            border-radius: var(--radius-2xl, 24px);
            max-width: 420px;
            width: 100%;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(44, 37, 32, 0.2);
          }
          .episode-detail-content header {
            position: sticky;
            top: 0;
            display: flex;
            justify-content: flex-end;
            padding: var(--space-3, 12px);
            background: var(--color-background-elevated, #FFFDFB);
          }
          .close-episode-btn {
            background: var(--color-background-subtle, rgba(44, 37, 32, 0.05));
            border: none;
            padding: 8px;
            cursor: pointer;
            color: var(--color-text-muted, #7A6F63);
            border-radius: var(--radius-full, 9999px);
            transition: background 150ms ease;
          }
          .close-episode-btn:hover {
            background: var(--color-background-subtle, rgba(44, 37, 32, 0.1));
          }
          .episode-hero {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 0 var(--space-5, 20px) var(--space-4, 16px);
          }
          .podcast-icon {
            width: 64px;
            height: 64px;
            background: var(--color-teal, #3a6b73);
            color: white;
            border-radius: var(--radius-xl, 20px);
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .podcast-icon svg {
            width: 32px;
            height: 32px;
          }
          .podcast-name {
            font-size: 13px;
            color: var(--color-text-muted, #7A6F63);
          }
          .episode-body {
            padding: 0 var(--space-5, 20px) var(--space-4, 16px);
          }
          .episode-body h2 {
            font-size: 20px;
            font-weight: 700;
            color: var(--color-text-primary, #2C2520);
            margin: 0 0 8px;
            text-align: center;
          }
          .episode-duration {
            font-size: 13px;
            color: var(--color-teal, #3a6b73);
            text-align: center;
            margin: 0 0 16px;
          }
          .episode-summary {
            font-size: 14px;
            line-height: 1.6;
            color: var(--color-text-secondary, #5C5248);
            margin: 0;
          }
          .discussion-prompts {
            margin-top: 20px;
            padding: 16px;
            background: var(--color-background-subtle, rgba(44, 37, 32, 0.03));
            border-radius: var(--radius-lg, 16px);
          }
          .discussion-prompts h4 {
            font-size: 13px;
            font-weight: 600;
            color: var(--color-text-primary, #2C2520);
            margin: 0 0 12px;
          }
          .discussion-prompts ul {
            margin: 0;
            padding-left: 20px;
          }
          .discussion-prompts li {
            font-size: 13px;
            color: var(--color-text-secondary, #5C5248);
            margin-bottom: 8px;
            line-height: 1.5;
          }
          .discussion-prompts li:last-child {
            margin-bottom: 0;
          }
          .episode-cta {
            padding: var(--space-4, 16px) var(--space-5, 20px) var(--space-5, 20px);
            border-top: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
          }
          .listen-hint {
            font-size: 12px;
            color: var(--color-text-muted, #7A6F63);
            margin: 0 0 12px;
            text-align: center;
          }
          .podcast-links {
            display: flex;
            gap: 8px;
            justify-content: center;
          }
          .podcast-link {
            padding: 10px 16px;
            background: var(--color-background-subtle, rgba(44, 37, 32, 0.05));
            color: var(--color-text-primary, #2C2520);
            text-decoration: none;
            font-size: 13px;
            font-weight: 500;
            border-radius: var(--radius-full, 9999px);
            transition: background 150ms ease;
          }
          .podcast-link:hover {
            background: var(--color-background-subtle, rgba(44, 37, 32, 0.1));
          }
        `;
        document.head.appendChild(styles);
      }

      document.body.appendChild(modal);

      // Animate in
      requestAnimationFrame(() => {
        modal.style.opacity = '0';
        modal.offsetHeight;
        modal.style.transition = 'opacity 200ms ease';
        modal.style.opacity = '1';
      });

      // Close handlers
      const closeModal = () => {
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 200);
      };

      modal.querySelector('.close-episode-btn')?.addEventListener('click', closeModal);
      modal.querySelector('.episode-detail-backdrop')?.addEventListener('click', closeModal);
    } catch (error) {
      log.error('Failed to open podcast:', error);
    }
  }

  private async shareCreativeDNA(): Promise<void> {
    if (!this.creativeDNA) return;

    try {
      const response = await fetch('/api/creative/dna/card?userId=' + this.userId);
      if (response.ok) {
        // Use native share if available
        if (navigator.share) {
          await navigator.share({
            title: t('creativeYou.shareTitle'),
            text: t('creativeYou.shareText', { label: this.creativeDNA.personalityLabel }),
            url: window.location.origin,
          });
        } else {
          // Copy to clipboard
          await navigator.clipboard.writeText(
            `${t('creativeYou.shareText', { label: this.creativeDNA.personalityLabel })} ${window.location.origin}`
          );
          // Would use toast here
        }
      }
    } catch (error) {
      log.error('Failed to share:', error);
    }
  }

  private startLearningTrack(trackId: string): void {
    const track = this.learningTracks.find((t) => t.id === trackId);
    if (!track || track.episodes.length === 0) {
      log.warn('Track not found or empty:', trackId);
      return;
    }

    log.debug('Starting track:', trackId);

    // Create track detail modal
    const modal = document.createElement('div');
    modal.className = 'track-detail-modal';
    modal.innerHTML = `
      <div class="track-detail-backdrop"></div>
      <div class="track-detail-content">
        <header>
          <div>
            <span class="eyebrow">${track.episodes.length} episodes • ${Math.round(track.totalDuration / 60)}h</span>
            <h2>${track.title}</h2>
            <p class="track-desc">${track.description}</p>
          </div>
          <button class="close-track-btn" aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>
        <div class="track-episodes">
          ${track.episodes
            .map(
              (ep, i) => `
            <div class="track-episode" data-episode-id="${ep.id}">
              <div class="episode-number">${i + 1}</div>
              <div class="episode-info">
                <h4>${ep.title}</h4>
                <p>${ep.podcastTitle} • ${Math.round(ep.duration / 60)} min</p>
              </div>
              <button class="play-episode-btn" aria-label="Play episode">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </button>
            </div>
          `
            )
            .join('')}
        </div>
        <div class="track-cta">
          <button class="start-first-btn">Start with Episode 1</button>
        </div>
      </div>
    `;

    // Add styles if not already present
    if (!document.getElementById('track-detail-styles')) {
      const styles = document.createElement('style');
      styles.id = 'track-detail-styles';
      styles.textContent = `
        .track-detail-modal {
          position: fixed;
          inset: 0;
          z-index: var(--z-modal, 2100);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-4, 16px);
        }
        .track-detail-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(44, 37, 32, 0.5);
          backdrop-filter: blur(12px);
        }
        .track-detail-content {
          position: relative;
          background: var(--color-background-elevated, #FFFDFB);
          border-radius: var(--radius-2xl, 24px);
          max-width: 480px;
          width: 100%;
          max-height: 80vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 60px rgba(44, 37, 32, 0.2);
        }
        .track-detail-content header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: var(--space-5, 20px) var(--space-5, 20px) var(--space-3, 12px);
          border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
        }
        .track-detail-content .eyebrow {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--color-teal, #3a6b73);
          margin-bottom: 4px;
          display: block;
        }
        .track-detail-content h2 {
          font-size: 20px;
          font-weight: 700;
          color: var(--color-text-primary, #2C2520);
          margin: 0 0 8px;
        }
        .track-detail-content .track-desc {
          font-size: 13px;
          color: var(--color-text-secondary, #5C5248);
          margin: 0;
          line-height: 1.5;
        }
        .close-track-btn {
          background: none;
          border: none;
          padding: 8px;
          cursor: pointer;
          color: var(--color-text-muted, #7A6F63);
          border-radius: var(--radius-full, 9999px);
          transition: background 150ms ease;
        }
        .close-track-btn:hover {
          background: var(--color-background-subtle, rgba(44, 37, 32, 0.05));
        }
        .track-episodes {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-3, 12px) var(--space-5, 20px);
        }
        .track-episode {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 0;
          border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.05));
        }
        .track-episode:last-child {
          border-bottom: none;
        }
        .episode-number {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--color-background-subtle, rgba(44, 37, 32, 0.05));
          color: var(--color-text-muted, #7A6F63);
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .episode-info {
          flex: 1;
        }
        .episode-info h4 {
          font-size: 14px;
          font-weight: 600;
          color: var(--color-text-primary, #2C2520);
          margin: 0 0 2px;
        }
        .episode-info p {
          font-size: 12px;
          color: var(--color-text-muted, #7A6F63);
          margin: 0;
        }
        .play-episode-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: var(--color-teal, #3a6b73);
          color: white;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: transform 150ms ease, box-shadow 150ms ease;
        }
        .play-episode-btn:hover {
          transform: scale(1.1);
          box-shadow: 0 4px 12px rgba(58, 107, 115, 0.3);
        }
        .track-cta {
          padding: var(--space-4, 16px) var(--space-5, 20px);
          border-top: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
        }
        .start-first-btn {
          width: 100%;
          padding: 14px;
          background: var(--color-teal, #3a6b73);
          color: white;
          border: none;
          border-radius: var(--radius-lg, 16px);
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 150ms ease, box-shadow 150ms ease;
        }
        .start-first-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(58, 107, 115, 0.25);
        }
      `;
      document.head.appendChild(styles);
    }

    document.body.appendChild(modal);

    // Animate in
    requestAnimationFrame(() => {
      modal.style.opacity = '0';
      modal.offsetHeight; // Force reflow
      modal.style.transition = 'opacity 200ms ease';
      modal.style.opacity = '1';
    });

    // Close handlers
    const closeModal = () => {
      modal.style.opacity = '0';
      setTimeout(() => modal.remove(), 200);
    };

    modal.querySelector('.close-track-btn')?.addEventListener('click', closeModal);
    modal.querySelector('.track-detail-backdrop')?.addEventListener('click', closeModal);

    // Play episode handlers
    modal.querySelectorAll('.play-episode-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const episodeEl = (e.currentTarget as HTMLElement).closest('.track-episode');
        const episodeId = episodeEl?.getAttribute('data-episode-id');
        if (episodeId) {
          closeModal();
          this.openPodcast(episodeId);
        }
      });
    });

    // Start first episode
    modal.querySelector('.start-first-btn')?.addEventListener('click', () => {
      closeModal();
      if (track.episodes[0]) {
        this.openPodcast(track.episodes[0].id);
      }
    });
  }

  // ========================================
  // UTILITIES
  // ========================================

  private formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remainMins = mins % 60;
      return `${hrs}:${remainMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private injectStyles(): void {
    if (document.getElementById('creative-dashboard-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'creative-dashboard-styles';
    styles.textContent = `
      .creative-dashboard-overlay {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 2100);
        display: none;
        align-items: center;
        justify-content: center;
        padding: var(--space-4, 16px);
      }

      .creative-dashboard-overlay.open {
        display: flex;
      }

      .creative-dashboard-backdrop {
        position: absolute;
        inset: 0;
        background: var(--backdrop-heavy, rgba(44, 37, 32, 0.6));
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
      }

      .creative-dashboard-content {
        position: relative;
        width: 100%;
        max-width: 600px;
        max-height: 85vh;
        background: var(--color-background-elevated, #FFFDFB);
        border-radius: var(--radius-2xl, 24px);
        box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.25));
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transform: scale(0.95);
        opacity: 0;
        transition: transform ${DURATION.SLOW}ms ${EASING.SPRING},
                    opacity ${DURATION.NORMAL}ms ease-out;
      }

      .creative-dashboard-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        padding: var(--space-6, 24px);
        border-bottom: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      }

      .creative-dashboard-header .eyebrow {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: var(--color-teal, #3a6b73);
        margin-bottom: 4px;
        display: block;
      }

      .creative-dashboard-header .welcome-message {
        font-size: 14px;
        color: var(--color-text-secondary, #5C5248);
        margin: 8px 0 0;
        font-weight: 400;
      }

      .creative-dashboard-header h2 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 28px;
        font-weight: 700;
        color: var(--color-text-primary, #2C2520);
        margin: 0;
      }

      .creative-dashboard-header .close-btn {
        background: none;
        border: none;
        padding: 8px;
        cursor: pointer;
        color: var(--color-text-muted, #7A6F63);
        border-radius: var(--radius-full, 9999px);
        transition: background ${DURATION.FAST}ms ease;
      }

      .creative-dashboard-header .close-btn:hover,
      .creative-dashboard-header .close-btn:focus-visible {
        background: var(--color-background-subtle, rgba(44, 37, 32, 0.05));
      }

      .creative-dashboard-body {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-4, 16px) var(--space-6, 24px) var(--space-6, 24px);
      }

      .dashboard-section {
        margin-bottom: var(--space-6, 24px);
      }

      .dashboard-section h3 {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 600;
        color: var(--color-text-secondary, #5C5248);
        margin: 0 0 var(--space-3, 12px) 0;
      }

      .dashboard-section h3 svg {
        opacity: 0.7;
      }

      /* Daily Picks */
      .picks-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-3, 12px);
      }

      @media (max-width: 500px) {
        .picks-grid {
          grid-template-columns: 1fr;
        }
      }

      .pick-card {
        background: var(--color-background-elevated, white);
        border-radius: var(--radius-lg, 16px);
        overflow: hidden;
        cursor: pointer;
        transition: transform ${DURATION.FAST}ms ease,
                    box-shadow ${DURATION.FAST}ms ease;
        border: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      }

      .pick-card:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.1));
      }

      .pick-card[data-loading="true"] {
        min-height: 180px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .pick-loading {
        color: var(--color-text-muted, #7A6F63);
        font-size: 14px;
      }

      .pick-type {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        font-size: 11px;
        font-weight: 600;
        color: white;
        border-radius: 0 0 var(--radius-md, 12px) 0;
      }

      .pick-type svg {
        width: 14px;
        height: 14px;
      }

      .pick-thumbnail {
        position: relative;
        height: 100px;
        background-size: cover;
        background-position: center;
        margin: -28px 12px 12px 12px;
        border-radius: var(--radius-md, 12px);
        overflow: hidden;
      }

      .play-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.3);
        opacity: 0;
        transition: opacity ${DURATION.FAST}ms ease;
      }

      .pick-thumbnail:hover .play-overlay {
        opacity: 1;
      }

      .play-overlay svg {
        width: 40px;
        height: 40px;
        color: white;
      }

      .pick-thumbnail .duration {
        position: absolute;
        bottom: 8px;
        right: 8px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
      }

      .pick-icon-container {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 80px;
        margin: 12px;
        border-radius: var(--radius-md, 12px);
      }

      .pick-icon-container svg {
        width: 32px;
        height: 32px;
        color: var(--color-teal, #3a6b73);
      }

      .pick-info {
        padding: 0 12px 12px;
      }

      .pick-info h4 {
        font-size: 14px;
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
        margin: 0 0 4px 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .pick-info .channel {
        font-size: 12px;
        color: var(--color-text-muted, #7A6F63);
        margin: 0 0 8px 0;
      }

      .pick-info .reason {
        font-size: 12px;
        color: var(--color-text-secondary, #5C5248);
        margin: 0 0 8px 0;
        font-style: italic;
      }

      .pick-meta {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .pick-meta .duration {
        font-size: 11px;
        color: var(--color-text-muted, #7A6F63);
      }

      .mood-badge {
        display: inline-block;
        font-size: 10px;
        font-weight: 600;
        color: white;
        padding: 2px 8px;
        border-radius: var(--radius-full, 9999px);
      }

      /* Creative DNA */
      .dna-card {
        background: var(--color-background-elevated, white);
        border-radius: var(--radius-lg, 16px);
        padding: var(--space-4, 16px);
        border: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
      }

      .dna-card[data-loading="true"] {
        min-height: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .dna-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: var(--space-4, 16px);
      }

      .dna-personality .personality-label {
        font-size: 20px;
        font-weight: 700;
        color: var(--color-text-primary, #2C2520);
        display: block;
        margin-bottom: 4px;
      }

      .dna-personality .personality-desc {
        font-size: 14px;
        color: var(--color-text-secondary, #5C5248);
        margin: 0;
      }

      .share-dna-btn {
        background: var(--color-background-subtle, rgba(44, 37, 32, 0.05));
        border: none;
        padding: 10px;
        border-radius: var(--radius-full, 9999px);
        cursor: pointer;
        color: var(--color-text-muted, #7A6F63);
        transition: background ${DURATION.FAST}ms ease;
      }

      .share-dna-btn:hover,
      .share-dna-btn:focus-visible {
        background: var(--color-teal, #3a6b73);
        color: white;
      }

      .dna-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-4, 16px);
        padding: var(--space-3, 12px);
        background: var(--color-background-subtle, rgba(44, 37, 32, 0.03));
        border-radius: var(--radius-md, 12px);
      }

      .dna-stats .stat {
        text-align: center;
      }

      .dna-stats .stat-value {
        display: block;
        font-size: 20px;
        font-weight: 700;
        color: var(--color-teal, #3a6b73);
      }

      .dna-stats .stat-label {
        font-size: 11px;
        color: var(--color-text-muted, #7A6F63);
      }

      .dna-interests h5 {
        font-size: 12px;
        font-weight: 600;
        color: var(--color-text-secondary, #5C5248);
        margin: 0 0 var(--space-2, 8px) 0;
      }

      .interest-bars {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .interest-bar {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
      }

      .interest-bar .interest-name {
        width: 100px;
        font-size: 12px;
        color: var(--color-text-secondary, #5C5248);
        text-transform: capitalize;
      }

      .interest-bar .bar-container {
        flex: 1;
        height: 8px;
        background: var(--color-background-subtle, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-full, 9999px);
        overflow: hidden;
      }

      .interest-bar .bar-fill {
        height: 100%;
        background: var(--color-teal, #3a6b73);
        border-radius: var(--radius-full, 9999px);
        transition: width ${DURATION.SLOW}ms ${EASING.SPRING};
      }

      /* Learning Tracks */
      .tracks-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .tracks-list[data-loading="true"] {
        min-height: 100px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .track-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-3, 12px) var(--space-4, 16px);
        background: var(--color-background-elevated, white);
        border: 1px solid var(--color-border, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-lg, 16px);
        transition: border-color ${DURATION.FAST}ms ease;
      }

      .track-card:hover {
        border-color: var(--color-teal, #3a6b73);
      }

      .track-info h4 {
        font-size: 14px;
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
        margin: 0 0 4px 0;
      }

      .track-info p {
        font-size: 12px;
        color: var(--color-text-secondary, #5C5248);
        margin: 0 0 4px 0;
      }

      .track-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color: var(--color-text-muted, #7A6F63);
      }

      .start-track-btn {
        background: var(--color-teal, #3a6b73);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: var(--radius-full, 9999px);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: transform ${DURATION.FAST}ms ease,
                    box-shadow ${DURATION.FAST}ms ease;
      }

      .start-track-btn:hover,
      .start-track-btn:focus-visible {
        transform: scale(1.05);
        box-shadow: 0 4px 12px rgba(58, 107, 115, 0.3);
      }

      .empty-state {
        text-align: center;
        color: var(--color-text-muted, #7A6F63);
        padding: var(--space-4, 16px);
      }

      .empty-pick,
      .empty-dna {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-6, 24px);
        text-align: center;
        min-height: 120px;
      }

      .empty-pick .empty-icon,
      .empty-dna .empty-icon {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-background-subtle, rgba(44, 37, 32, 0.05));
        border-radius: var(--radius-full, 9999px);
        color: var(--color-text-muted, #7A6F63);
        margin-bottom: 12px;
      }

      .empty-pick .empty-icon svg,
      .empty-dna .empty-icon svg {
        width: 24px;
        height: 24px;
      }

      .empty-pick p,
      .empty-dna p {
        font-size: 13px;
        color: var(--color-text-muted, #7A6F63);
        margin: 0;
        line-height: 1.5;
        max-width: 200px;
      }

      /* Reduced motion */
      @media (prefers-reduced-motion: reduce) {
        .creative-dashboard-content,
        .pick-card,
        .start-track-btn,
        .share-dna-btn,
        .interest-bar .bar-fill {
          transition: none;
        }
      }
    `;

    document.head.appendChild(styles);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

let instance: CreativeYouDashboard | null = null;

export function getCreativeYouDashboard(
  userId: string,
  options?: { topics?: string[] }
): CreativeYouDashboard {
  if (!instance || (instance as CreativeYouDashboard & { userId: string }).userId !== userId) {
    instance = new CreativeYouDashboard(userId, options);
  } else if (options?.topics) {
    // Update topics on existing instance
    instance.setUserTopics(options.topics);
  }
  return instance;
}

export function openCreativeYouDashboard(userId: string, options?: { topics?: string[] }): void {
  const dashboard = getCreativeYouDashboard(userId, options);
  dashboard.initialize().then(() => dashboard.open());
}

/**
 * Open Creative You with topics from recent conversation
 */
export function openCreativeYouWithTopics(userId: string, topics: string[]): void {
  openCreativeYouDashboard(userId, { topics });
}

export function initCreativeYouDashboard(): void {
  // Initialization hook - nothing needed for now
}

