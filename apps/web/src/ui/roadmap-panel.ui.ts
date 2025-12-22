/**
 * Roadmap Panel UI
 *
 * A beautiful modal showcasing features that are growing.
 * Transforms "coming soon" into an inspiring journey experience.
 *
 * DESIGN PRINCIPLES:
 *   - Brand-aligned: Warm, human, earthy
 *   - Growth metaphors: Seeds → Sprouts → Buds → Blooms
 *   - Social proof: Show community interest
 *   - Interactive: Let users vote for what they want
 *
 * BRAND VOICE:
 *   - "We're growing this for you"
 *   - "This seed needs a little more sunlight"
 *   - "Almost ready to bloom"
 *   - "Help us decide what grows next"
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { t } from '../i18n/index.js';
import { roadmapService, smartPromptTracker, STAGE_INFO, type RoadmapFeature, type SmartPromptRecommendation } from '../services/roadmap.service.js';
import { getCurrentStreak, getNextStreakMilestone } from '../services/seeds-economy.service.js';

// ============================================================================
// ICONS - Natural, earthy, growth-focused (brand-aligned)
// ============================================================================

const ICONS: Record<string, string> = {
  // Navigation
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg>',
  chevronRight:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>',

  // Hearts (for voting)
  heart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  heartFilled:
    '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',

  // Growth stage icons (natural, zen-like)
  seed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><ellipse cx="12" cy="16" rx="4" ry="5"/><path d="M12 11V8"/><path d="M10 9c0-2 2-4 2-4s2 2 2 4"/></svg>',
  sprout:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 22V12"/><path d="M12 12c-3-3-6-2-8 1"/><path d="M12 12c3-3 6-2 8 1"/><path d="M12 12V8c0-2-1-4-3-5"/><path d="M12 8c0-2 1-4 3-5"/></svg>',
  bud: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 22v-8"/><path d="M12 14c-2-2-5-1.5-6 1"/><path d="M12 14c2-2 5-1.5 6 1"/><circle cx="12" cy="8" r="5"/><path d="M12 3v2"/></svg>',
  bloom:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 22v-6"/><circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.2"/><path d="M12 5c0-1.5.5-3 2-4-1.5 1-2.5 2-2 4"/><path d="M12 5c0-1.5-.5-3-2-4 1.5 1 2.5 2 2 4"/><path d="M7.5 7.5c-1-1-2.5-1.5-4-1 1.5.5 2.5 1.5 3 3"/><path d="M16.5 7.5c1-1 2.5-1.5 4-1-1.5.5-2.5 1.5-3 3"/><path d="M6 12c-1.5 0-3 .5-4 2 1-.5 2.5-.5 4 0"/><path d="M18 12c1.5 0 3 .5 4 2-1-.5-2.5-.5-4 0"/><path d="M7.5 16.5c-1 1-1.5 2.5-1 4 .5-1.5 1.5-2.5 3-3"/><path d="M16.5 16.5c1 1 1.5 2.5 1 4-.5-1.5-1.5-2.5-3-3"/></svg>',

  // Leaf icon for eyebrow
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>',

  // Natural/Growth themed icons (on-brand)
  // Group Coaching - Circle of connection (like stones in a zen garden)
  users:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="5" r="2"/><circle cx="18.5" cy="8.5" r="2"/><circle cx="18.5" cy="15.5" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="5.5" cy="15.5" r="2"/><circle cx="5.5" cy="8.5" r="2"/></svg>',

  // Video - Eye with warmth (seeing the person)
  video:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',

  // Wearable - Pulse of life (heartbeat rhythm)
  watch:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',

  // Connections - Linked chain (sync your world)
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',

  // Household - Nested circles (family unity)
  household:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',

  // Voice ID - Sound wave (unique voice)
  fingerprint:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 2v20"/><path d="M8 4v16"/><path d="M16 4v16"/><path d="M4 8v8"/><path d="M20 8v8"/></svg>',

  // Personalize - Flowing curves (personal expression)
  palette:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8Z"/><circle cx="7.5" cy="11.5" r="1.5" fill="currentColor"/><circle cx="12" cy="7.5" r="1.5" fill="currentColor"/><circle cx="16.5" cy="11.5" r="1.5" fill="currentColor"/></svg>',

  // Marketplace - Blooming flower (garden of coaches)
  sparkles:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 3v18"/><path d="M12 8c-2-2-5-2-7 0"/><path d="M12 8c2-2 5-2 7 0"/><path d="M12 13c-3-2-6-1-8 2"/><path d="M12 13c3-2 6-1 8 2"/><circle cx="12" cy="20" r="2" fill="currentColor"/></svg>',

  // Developer - Branching paths (growth)
  commands:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 22v-6"/><path d="M12 16l-4-4"/><path d="M12 16l4-4"/><path d="M12 16v-6"/><path d="M12 10l-2-2"/><path d="M12 10l2-2"/><path d="M12 10V4"/><circle cx="12" cy="4" r="2"/></svg>',

  // Additional UI icons
  flame:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  target:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  lightbulb:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
  star:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  vote:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m9 12 2 2 4-4"/><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"/><path d="M22 19H2"/></svg>',
  // Conversation - Speech bubble (for seeds earned)
  conversation:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
};

// ============================================================================
// ROADMAP PANEL UI CLASS
// ============================================================================

class RoadmapPanelUI {
  private modal: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;
  private isLoading = false;

  /**
   * Show the roadmap panel, optionally highlighting a specific feature
   */
  async show(featureId?: string): Promise<void> {
    this.cleanup();
    this.injectStyles();
    this.createModal();

    // Show loading state immediately, then fetch data
    this.renderLoading();

    // Fetch fresh data in parallel
    this.isLoading = true;
    await Promise.all([
      roadmapService.fetchStats(),
      roadmapService.fetchSeedBalance(),
      roadmapService.fetchUserVotes(),
    ]).catch(() => {
      // Continue with cached data on error
    });
    this.isLoading = false;

    if (featureId) {
      const feature = roadmapService.getFeature(featureId);
      if (feature) {
        this.renderFeatureDetail(feature);
      } else {
        this.renderOverview();
      }
    } else {
      this.renderOverview();
    }

    // Show with animation
    requestAnimationFrame(() => {
      this.modal?.classList.add('roadmap-panel--visible');
      this.isVisible = true;
    });
  }

  /**
   * Render loading state while fetching data
   */
  private renderLoading(): void {
    if (!this.modal) return;

    this.modal.innerHTML = `
      <div class="roadmap-panel__backdrop"></div>
      <div class="roadmap-panel__card">
        <div class="roadmap-panel__loading">
          <div class="roadmap-panel__loading-icon">${ICONS.seed}</div>
          <p class="roadmap-panel__loading-text">${t('roadmap.loading') || 'Loading...'}</p>
        </div>
      </div>
    `;
  }

  /**
   * Hide the roadmap panel
   */
  hide(): void {
    if (!this.modal) return;

    this.modal.classList.remove('roadmap-panel--visible');
    this.isVisible = false;

    // Remove after animation
    setTimeout(() => {
      this.modal?.remove();
      this.modal = null;
    }, DURATION.MODERATE);
  }

  /**
   * Toggle visibility
   */
  toggle(featureId?: string): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show(featureId);
    }
  }

  /**
   * Clean up orphaned elements (HMR protection)
   */
  private cleanup(): void {
    document.querySelectorAll('.roadmap-panel').forEach((el) => el.remove());
  }

  /**
   * Create the modal container
   */
  private createModal(): void {
    this.modal = document.createElement('div');
    this.modal.className = 'roadmap-panel';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-labelledby', 'roadmap-title');

    // Close on escape
    document.addEventListener('keydown', this.handleKeyDown);

    document.body.appendChild(this.modal);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.isVisible) {
      this.hide();
    }
  };

  /**
   * Render the overview showing all features
   */
  private renderOverview(): void {
    if (!this.modal) return;

    const features = roadmapService.getAllFeatures();
    const connectFeatures = features.filter((f) => f.category === 'connect');
    const personalizeFeatures = features.filter((f) => f.category === 'personalize');
    const platformFeatures = features.filter((f) => f.category === 'platform');
    const seedBalance = roadmapService.getSeedBalance();

    this.modal.innerHTML = `
      <div class="roadmap-panel__backdrop"></div>
      <div class="roadmap-panel__card">
        <header class="roadmap-panel__header">
          <div class="roadmap-panel__header-content">
            <p class="roadmap-panel__eyebrow">
              <span class="roadmap-panel__eyebrow-icon">${ICONS.leaf}</span>
              ${t('roadmap.eyebrow')}
            </p>
            <h2 class="roadmap-panel__title" id="roadmap-title">${t('roadmap.title')}</h2>
          </div>
          <div class="roadmap-panel__header-stats">
            <div class="roadmap-panel__seed-balance" data-seeds-info>
              <span class="roadmap-panel__seed-icon">${ICONS.seed}</span>
              <span class="roadmap-panel__seed-count">${seedBalance}</span>
              <span class="roadmap-panel__seed-info-trigger" role="button" tabindex="0" title="${t('roadmap.howSeedsWork.title') || 'How do seeds work?'}">?</span>
            </div>
            ${this.renderStreakProgress()}
          </div>
          <button class="roadmap-panel__close" aria-label="${t('common.close')}">${ICONS.close}</button>
        </header>

        <div class="roadmap-panel__body">
          <p class="roadmap-panel__intro">${t('roadmap.intro')}</p>

          <!-- Stage Legend -->
          <div class="roadmap-panel__legend">
            ${Object.entries(STAGE_INFO)
              .map(
                ([_stage, info]) => `
              <div class="roadmap-panel__legend-item ${info.colorClass}">
                <span class="roadmap-panel__legend-icon">${ICONS[info.icon] || ''}</span>
                <span class="roadmap-panel__legend-label">${info.label}</span>
              </div>
            `
              )
              .join('')}
          </div>

          <!-- Suggest a Feature Button -->
          <button aria-label=") || '5 seeds'}" class="roadmap-panel__suggest-btn" ${seedBalance < 5 ? 'disabled' : ''}>
            <span class="roadmap-panel__suggest-icon">${ICONS.lightbulb}</span>
            <span class="roadmap-panel__suggest-text">${t('roadmap.plantNewSeed') || 'Plant a New Seed'}</span>
            <span class="roadmap-panel__suggest-cost">${t('roadmap.costSeeds', { count: 5 }) || '5 seeds'}</span>
          </button>

          <!-- Smart Recommendations (based on usage patterns) -->
          ${this.renderRecommendations()}

          <!-- Connect Section -->
          ${this.renderSection('connect', t('roadmap.sections.connect'), connectFeatures)}

          <!-- Personalize Section -->
          ${this.renderSection('personalize', t('roadmap.sections.personalize'), personalizeFeatures)}

          <!-- Platform Section -->
          ${this.renderSection('platform', t('roadmap.sections.platform'), platformFeatures)}
        </div>

        <footer class="roadmap-panel__footer">
          <p class="roadmap-panel__footer-text">${t('roadmap.footerText')}</p>
        </footer>
      </div>
    `;

    this.bindOverviewEvents();
  }

  /**
   * Render streak progress indicator
   */
  private renderStreakProgress(): string {
    const currentStreak = getCurrentStreak();
    const nextMilestone = getNextStreakMilestone();

    if (currentStreak === 0) {
      return `
        <div class="roadmap-panel__streak-progress roadmap-panel__streak-progress--inactive">
          <span class="roadmap-panel__streak-icon">${ICONS.flame}</span>
          <span class="roadmap-panel__streak-text">${t('roadmap.streak.startStreak') || 'Start a streak!'}</span>
        </div>
      `;
    }

    // Calculate progress to next milestone
    const progress = nextMilestone ? Math.min((currentStreak / nextMilestone) * 100, 100) : 100;
    const daysToGo = nextMilestone ? nextMilestone - currentStreak : 0;

    return `
      <div class="roadmap-panel__streak-progress" title="${t('roadmap.streak.tooltip', { days: currentStreak }) || `${currentStreak} day streak!`}">
        <span class="roadmap-panel__streak-icon">${ICONS.flame}</span>
        <span class="roadmap-panel__streak-count">${currentStreak}</span>
        ${nextMilestone ? `
          <div class="roadmap-panel__streak-bar">
            <div class="roadmap-panel__streak-bar-fill" style="width: ${progress}%"></div>
          </div>
          <span class="roadmap-panel__streak-next" title="${t('roadmap.streak.nextReward', { days: daysToGo }) || `${daysToGo} days to next reward`}">
            ${nextMilestone}
          </span>
        ` : `
          <span class="roadmap-panel__streak-complete">✓</span>
        `}
      </div>
    `;
  }

  /**
   * Render a section of features
   */
  private renderSection(_category: string, title: string, features: RoadmapFeature[]): string {
    if (features.length === 0) return '';

    return `
      <section class="roadmap-panel__section">
        <h3 class="roadmap-panel__section-title">${title}</h3>
        <div class="roadmap-panel__grid">
          ${features.map((f) => this.renderFeatureCard(f)).join('')}
        </div>
      </section>
    `;
  }

  /**
   * Render personalized recommendations section based on usage patterns
   */
  private renderRecommendations(): string {
    const recommendations = smartPromptTracker.getRecommendations();

    // Only show if we have recommendations
    if (recommendations.length === 0) return '';

    // Show top 3 recommendations max
    const topRecs = recommendations.slice(0, 3);

    return `
      <section class="roadmap-panel__recommendations">
        <div class="roadmap-panel__recommendations-header">
          <span class="roadmap-panel__recommendations-icon">${ICONS.sparkles}</span>
          <h3 class="roadmap-panel__recommendations-title">
            ${t('roadmap.recommendedForYou') || 'Recommended for you'}
          </h3>
        </div>
        <p class="roadmap-panel__recommendations-subtitle">
          ${t('roadmap.recommendedSubtitle') || 'Based on your conversations'}
        </p>
        <div class="roadmap-panel__recommendations-list">
          ${topRecs.map((rec) => this.renderRecommendationCard(rec)).join('')}
        </div>
      </section>
    `;
  }

  /**
   * Render a single recommendation card
   */
  private renderRecommendationCard(rec: SmartPromptRecommendation): string {
    const stageInfo = STAGE_INFO[rec.feature.stage];
    const featureIcon = ICONS[rec.feature.icon] || ICONS.sparkles;

    // Generate a human-friendly reason based on matched triggers
    const triggerSample = rec.matchedTriggers.slice(0, 2).join(', ');
    const confidenceIcon = rec.confidence === 'high' ? ICONS.target : rec.confidence === 'medium' ? ICONS.lightbulb : ICONS.seed;

    return `
      <button aria-label="Close" class="roadmap-recommendation" data-feature-id="${rec.featureId}" data-rec-confidence="${rec.confidence}">
        <div class="roadmap-recommendation__badge">${confidenceIcon}</div>
        <div class="roadmap-recommendation__content">
          <div class="roadmap-recommendation__header">
            <span class="roadmap-recommendation__icon">${featureIcon}</span>
            <span class="roadmap-recommendation__headline">${rec.feature.headline}</span>
          </div>
          <p class="roadmap-recommendation__reason">
            ${t('roadmap.youMentioned') || 'You\'ve mentioned'} "${triggerSample}"
          </p>
          <div class="roadmap-recommendation__meta">
            <span class="roadmap-recommendation__stage ${stageInfo.colorClass}">${stageInfo.label}</span>
            <span class="roadmap-recommendation__cta">${t('roadmap.learnMore') || 'Learn more'} →</span>
          </div>
        </div>
        <button class="roadmap-recommendation__dismiss" data-dismiss="${rec.featureId}" aria-label="${t('common.dismiss') || 'Dismiss'}">
          ×
        </button>
      </button>
    `;
  }

  /**
   * Render a feature card for the overview
   */
  private renderFeatureCard(feature: RoadmapFeature): string {
    const stageInfo = STAGE_INFO[feature.stage];
    const hasVoted = roadmapService.hasVoted(feature.id);
    const seedsPlanted = roadmapService.getSeedsPlanted(feature.id);
    const featureIcon = ICONS[feature.icon] || ICONS.sparkles;
    const stageIcon = ICONS[stageInfo.icon] || '';
    const totalSeeds = feature.totalSeeds || 0;

    return `
      <button aria-label="Go forward" class="roadmap-card" data-feature-id="${feature.id}" data-stage="${feature.stage}">
        <div class="roadmap-card__header">
          <div class="roadmap-card__icon">${featureIcon}</div>
          <span class="roadmap-card__stage ${stageInfo.colorClass}">
            <span class="roadmap-card__stage-icon">${stageIcon}</span>
            ${stageInfo.label}
          </span>
        </div>
        <h4 class="roadmap-card__headline">${feature.headline}</h4>
        <p class="roadmap-card__arrival">${feature.estimatedArrival}</p>
        ${
          feature.canVote
            ? `
          <div class="roadmap-card__interest">
            <span class="roadmap-card__seed-indicator ${hasVoted ? 'roadmap-card__seed-indicator--voted' : ''}">
              ${ICONS.seed}
            </span>
            <span class="roadmap-card__count">
              ${this.formatNumber(totalSeeds)}${seedsPlanted > 0 ? ` · ${seedsPlanted} ${t('roadmap.yours') || 'yours'}` : ''}
            </span>
          </div>
        `
            : ''
        }
        <span class="roadmap-card__chevron">${ICONS.chevronRight}</span>
      </button>
    `;
  }

  /**
   * Render detail view for a single feature
   */
  private renderFeatureDetail(feature: RoadmapFeature): void {
    if (!this.modal) return;

    const stageInfo = STAGE_INFO[feature.stage];
    const seedsPlanted = roadmapService.getSeedsPlanted(feature.id);
    const hasVoted = seedsPlanted > 0;
    const seedBalance = roadmapService.getSeedBalance();
    const totalSeeds = feature.totalSeeds || 0;
    const uniqueVoters = feature.uniqueVoters || 0;
    const featureIcon = ICONS[feature.icon] || ICONS.sparkles;
    const stageIcon = ICONS[stageInfo.icon] || '';

    this.modal.innerHTML = `
      <div class="roadmap-panel__backdrop"></div>
      <div class="roadmap-panel__card roadmap-panel__card--detail">
        <header class="roadmap-panel__header">
          <button class="roadmap-panel__back" aria-label="${t('common.back')}">${ICONS.back}</button>
          <div class="roadmap-panel__header-content">
            <p class="roadmap-panel__eyebrow">
              <span class="roadmap-panel__eyebrow-icon">${ICONS.leaf}</span>
              ${t('roadmap.eyebrow')}
            </p>
            <h2 class="roadmap-panel__title" id="roadmap-title">${feature.headline}</h2>
          </div>
          <div class="roadmap-panel__seed-balance" title="${t('roadmap.seedBalanceTooltip') || 'Your seeds to plant on features'}">
            <span class="roadmap-panel__seed-icon">${ICONS.seed}</span>
            <span class="roadmap-panel__seed-count">${seedBalance}</span>
          </div>
          <button class="roadmap-panel__close" aria-label="${t('common.close')}">${ICONS.close}</button>
        </header>

        <div class="roadmap-panel__body">
          <!-- Feature Header -->
          <div class="roadmap-detail__header">
            <div class="roadmap-detail__icon ${stageInfo.colorClass}">
              ${featureIcon}
            </div>
            <div class="roadmap-detail__stage ${stageInfo.colorClass}">
              <span class="roadmap-detail__stage-icon">${stageIcon}</span>
              ${stageInfo.label}
            </div>
          </div>

          <!-- Description -->
          <p class="roadmap-detail__description">${feature.description}</p>

          <!-- Timeline -->
          <div class="roadmap-detail__timeline">
            <span class="roadmap-detail__timeline-label">${t('roadmap.expectedArrival')}</span>
            <span class="roadmap-detail__timeline-value">${feature.estimatedArrival}</span>
          </div>

          <!-- Superhuman Promises -->
          <div class="roadmap-detail__section">
            <h3 class="roadmap-detail__section-title">${t('roadmap.betterThanHuman')}</h3>
            <ul class="roadmap-detail__list">
              ${feature.superhuman.map((s) => `<li class="roadmap-detail__list-item">${s}</li>`).join('')}
            </ul>
          </div>

          <!-- What's Already Growing (if partial) -->
          ${
            feature.existing && feature.existing.length > 0
              ? `
            <div class="roadmap-detail__section roadmap-detail__section--existing">
              <h3 class="roadmap-detail__section-title">${t('roadmap.alreadyGrowing')}</h3>
              <ul class="roadmap-detail__list roadmap-detail__list--existing">
                ${feature.existing.map((e) => `<li class="roadmap-detail__list-item"><span class="roadmap-detail__check">${ICONS.check}</span> ${e}</li>`).join('')}
              </ul>
            </div>
          `
              : ''
          }

          <!-- Seed Planting CTA -->
          ${
            feature.canVote
              ? `
            <div class="roadmap-detail__vote">
              <div class="roadmap-detail__seed-stats">
                <div class="roadmap-detail__seed-total">
                  <span class="roadmap-detail__seed-total-icon">${ICONS.seed}</span>
                  <span class="roadmap-detail__seed-total-count">${this.formatNumber(totalSeeds)}</span>
                  <span class="roadmap-detail__seed-total-label">${t('roadmap.seedsPlanted') || 'seeds planted'}</span>
                </div>
                <div class="roadmap-detail__seed-gardeners">
                  ${t('roadmap.gardeners', { count: this.formatNumber(uniqueVoters) }) || `${this.formatNumber(uniqueVoters)} gardeners`}
                </div>
              </div>

              ${hasVoted ? `
                <div class="roadmap-detail__your-seeds">
                  <span class="roadmap-detail__your-seeds-label">${t('roadmap.yourSeeds') || 'Your seeds'}:</span>
                  <span class="roadmap-detail__your-seeds-count">${seedsPlanted}</span>
                </div>
              ` : ''}

              <!-- Priority Voting: Seed Allocation Slider -->
              ${seedBalance > 0 ? `
                <div class="roadmap-detail__allocator">
                  <label class="roadmap-detail__allocator-label">
                    ${t('roadmap.plantSeeds') || 'Plant seeds on this feature'}
                  </label>
                  <div class="roadmap-detail__slider-row">
                    <button class="roadmap-detail__slider-btn" data-action="decrease" aria-label="Decrease">−</button>
                    <div class="roadmap-detail__slider-container">
                      <input type="range"
                             class="roadmap-detail__slider"
                             min="1"
                             max="${Math.min(10, seedBalance)}"
                             value="1"
                             data-feature="${feature.id}">
                      <div class="roadmap-detail__slider-track"></div>
                    </div>
                    <button class="roadmap-detail__slider-btn" data-action="increase" aria-label="Increase">+</button>
                  </div>
                  <div class="roadmap-detail__slider-value">
                    <span class="roadmap-detail__slider-seeds">${ICONS.seed}</span>
                    <span class="roadmap-detail__slider-count">1</span>
                    <span class="roadmap-detail__slider-label">${t('roadmap.seedsToPlant') || 'seed to plant'}</span>
                  </div>
                  <button class="roadmap-detail__plant-btn"
                          data-action="plant-multiple"
                          data-feature="${feature.id}">
                    <span class="roadmap-detail__plant-btn-icon" role="button" tabindex="0">${ICONS.seed}</span>
                    <span class="roadmap-detail__plant-btn-text" role="button" tabindex="0">${t('roadmap.plantNow') || 'Plant Now'}</span>
                  </button>
                </div>
              ` : `
                <p class="roadmap-detail__vote-hint roadmap-detail__vote-hint--empty">
                  ${t('roadmap.noSeedsHint') || 'Have more conversations to earn seeds!'}
                </p>
              `}

              ${hasVoted ? `
                <button aria-label="()" class="roadmap-detail__remove-btn"
                        data-action="unplant"
                        data-feature="${feature.id}">
                  ${t('roadmap.removeSeeds') || 'Remove my seeds'} (${t('roadmap.refund50') || '50% refund'})
                </button>
              ` : ''}
            </div>
          `
              : ''
          }
        </div>
      </div>
    `;

    this.bindDetailEvents(feature);
  }

  /**
   * Render the suggestion submission modal
   */
  private renderSuggestionModal(): void {
    if (!this.modal) return;

    const seedBalance = roadmapService.getSeedBalance();

    this.modal.innerHTML = `
      <div class="roadmap-panel__backdrop"></div>
      <div class="roadmap-panel__card roadmap-panel__card--suggestion">
        <header class="roadmap-panel__header">
          <button class="roadmap-panel__back" aria-label="${t('common.back')}">${ICONS.back}</button>
          <div class="roadmap-panel__header-content">
            <p class="roadmap-panel__eyebrow">
              <span class="roadmap-panel__eyebrow-icon">${ICONS.lightbulb}</span>
              ${t('roadmap.newIdea') || 'New Idea'}
            </p>
            <h2 class="roadmap-panel__title" id="roadmap-title">${t('roadmap.plantNewSeed') || 'Plant a New Seed'}</h2>
          </div>
          <div class="roadmap-panel__seed-balance" title="${t('roadmap.seedBalanceTooltip') || 'Your seeds to plant on features'}">
            <span class="roadmap-panel__seed-icon">${ICONS.seed}</span>
            <span class="roadmap-panel__seed-count">${seedBalance}</span>
          </div>
          <button class="roadmap-panel__close" aria-label="${t('common.close')}">${ICONS.close}</button>
        </header>

        <div class="roadmap-panel__body">
          <p class="roadmap-suggestion__intro">
            ${t('roadmap.suggestionIntro') || 'Have an idea for something Ferni should do? Plant a seed and let the community water it!'}
          </p>

          <form class="roadmap-suggestion__form" id="suggestion-form">
            <div class="roadmap-suggestion__field">
              <label class="roadmap-suggestion__label" for="suggestion-title">
                ${t('roadmap.suggestionTitle') || 'What should Ferni be able to do?'}
              </label>
              <input
                type="text"
                id="suggestion-title"
                class="roadmap-suggestion__input"
                placeholder="${t('roadmap.suggestionTitlePlaceholder') || 'e.g., Remember my pet\'s name'}"
                maxlength="100"
                required>
              <span class="roadmap-suggestion__char-count"><span id="title-count">0</span>/100</span>
            </div>

            <div class="roadmap-suggestion__field">
              <label class="roadmap-suggestion__label" for="suggestion-description">
                ${t('roadmap.suggestionDescription') || 'Tell us more (optional)'}
              </label>
              <textarea
                id="suggestion-description"
                class="roadmap-suggestion__textarea"
                placeholder="${t('roadmap.suggestionDescriptionPlaceholder') || 'Why would this be helpful? How would you use it?'}"
                maxlength="500"
                rows="4"></textarea>
              <span class="roadmap-suggestion__char-count"><span id="desc-count">0</span>/500</span>
            </div>

            <div class="roadmap-suggestion__field">
              <label class="roadmap-suggestion__label" for="suggestion-category">
                ${t('roadmap.suggestionCategory') || 'Category'}
              </label>
              <select id="suggestion-category" class="roadmap-suggestion__select" required>
                <option value="connect">${t('roadmap.categories.connect') || 'Connect - Relationships & Communication'}</option>
                <option value="personalize">${t('roadmap.categories.personalize') || 'Personalize - Make Ferni Yours'}</option>
                <option value="platform">${t('roadmap.categories.platform') || 'Platform - New Capabilities'}</option>
              </select>
            </div>

            <div class="roadmap-suggestion__cost-notice">
              <span class="roadmap-suggestion__cost-icon">${ICONS.seed}</span>
              <span class="roadmap-suggestion__cost-text">
                ${t('roadmap.suggestionCost') || 'Submitting costs 5 seeds (shows commitment, prevents spam)'}
              </span>
            </div>

            <button aria-label="Submit"
              type="submit"
              class="roadmap-suggestion__submit"
              ${seedBalance < 5 ? 'disabled' : ''}>
              <span class="roadmap-suggestion__submit-icon">${ICONS.seed}</span>
              <span class="roadmap-suggestion__submit-text">${t('roadmap.submitSuggestion') || 'Plant This Seed'}</span>
            </button>

            ${seedBalance < 5 ? `
              <p class="roadmap-suggestion__warning">
                ${t('roadmap.needMoreSeeds') || 'You need at least 5 seeds to submit a suggestion. Have more conversations to earn seeds!'}
              </p>
            ` : ''}
          </form>
        </div>
      </div>
    `;

    this.bindSuggestionEvents();
  }

  /**
   * Bind events for suggestion modal
   */
  private bindSuggestionEvents(): void {
    if (!this.modal) return;

    // Close on backdrop click
    this.modal
      .querySelector('.roadmap-panel__backdrop')
      ?.addEventListener('click', () => this.hide());

    // Close button
    this.modal.querySelector('.roadmap-panel__close')?.addEventListener('click', () => this.hide());

    // Back button
    this.modal.querySelector('.roadmap-panel__back')?.addEventListener('click', () => {
      this.renderOverview();
    });

    // Character count for title
    const titleInput = this.modal.querySelector('#suggestion-title') as HTMLInputElement;
    const titleCount = this.modal.querySelector('#title-count');
    if (titleInput && titleCount) {
      titleInput.addEventListener('input', () => {
        titleCount.textContent = String(titleInput.value.length);
      });
    }

    // Character count for description
    const descInput = this.modal.querySelector('#suggestion-description') as HTMLTextAreaElement;
    const descCount = this.modal.querySelector('#desc-count');
    if (descInput && descCount) {
      descInput.addEventListener('input', () => {
        descCount.textContent = String(descInput.value.length);
      });
    }

    // Form submission
    const form = this.modal.querySelector('#suggestion-form') as HTMLFormElement;
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = (this.modal?.querySelector('#suggestion-title') as HTMLInputElement)?.value.trim();
        const description = (this.modal?.querySelector('#suggestion-description') as HTMLTextAreaElement)?.value.trim();
        const category = (this.modal?.querySelector('#suggestion-category') as HTMLSelectElement)?.value as 'connect' | 'personalize' | 'platform';

        if (!title) return;

        const submitBtn = form.querySelector('.roadmap-suggestion__submit') as HTMLButtonElement;
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = `<span class="roadmap-suggestion__submit-text">${t('roadmap.submitting') || 'Planting...'}</span>`;
        }

        const result = await roadmapService.submitSuggestion(title, description, category);

        if (result.success) {
          // Show success state
          this.renderSuggestionSuccess();
        } else {
          // Re-enable button on error
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
              <span class="roadmap-suggestion__submit-icon">${ICONS.seed}</span>
              <span class="roadmap-suggestion__submit-text">${t('roadmap.submitSuggestion') || 'Plant This Seed'}</span>
            `;
          }
          // Show error (could add toast notification here)
          alert(result.error || 'Failed to submit suggestion');
        }
      });
    }
  }

  /**
   * Render success state after suggestion submission
   */
  private renderSuggestionSuccess(): void {
    if (!this.modal) return;

    const body = this.modal.querySelector('.roadmap-panel__body');
    if (body) {
      body.innerHTML = `
        <div class="roadmap-suggestion__success">
          <div class="roadmap-suggestion__success-icon">${ICONS.seed}</div>
          <h3 class="roadmap-suggestion__success-title">${t('roadmap.suggestionPlanted') || 'Your seed has been planted!'}</h3>
          <p class="roadmap-suggestion__success-text">
            ${t('roadmap.suggestionThanks') || 'Thank you for sharing your idea. Others can now water it with their seeds!'}
          </p>
          <button class="roadmap-suggestion__success-btn" onclick="roadmapPanelUI.renderOverview()">
            ${t('roadmap.backToRoadmap') || 'Back to Roadmap'}
          </button>
        </div>
      `;

      // Bind the back button
      const backBtn = body.querySelector('.roadmap-suggestion__success-btn');
      if (backBtn) {
        backBtn.addEventListener('click', () => this.renderOverview());
      }
    }
  }

  /**
   * Bind events for overview mode
   */
  private bindOverviewEvents(): void {
    if (!this.modal) return;

    // Close on backdrop click
    this.modal
      .querySelector('.roadmap-panel__backdrop')
      ?.addEventListener('click', () => this.hide());

    // Close button
    this.modal.querySelector('.roadmap-panel__close')?.addEventListener('click', () => this.hide());

    // Feature cards
    this.modal.querySelectorAll('.roadmap-card').forEach((card) => {
      card.addEventListener('click', () => {
        const featureId = (card as HTMLElement).dataset.featureId;
        if (featureId) {
          const feature = roadmapService.getFeature(featureId);
          if (feature) {
            this.renderFeatureDetail(feature);
          }
        }
      });
    });

    // Suggest new feature button
    this.modal.querySelector('.roadmap-panel__suggest-btn')?.addEventListener('click', () => {
      this.renderSuggestionModal();
    });

    // Recommendation cards - click to view detail
    this.modal.querySelectorAll('.roadmap-recommendation').forEach((card) => {
      card.addEventListener('click', (e) => {
        // Don't trigger if dismiss button was clicked
        const target = e.target as HTMLElement;
        if (target.closest('.roadmap-recommendation__dismiss')) return;

        const featureId = (card as HTMLElement).dataset.featureId;
        if (featureId) {
          const feature = roadmapService.getFeature(featureId);
          if (feature) {
            this.renderFeatureDetail(feature);
          }
        }
      });
    });

    // Recommendation dismiss buttons
    this.modal.querySelectorAll('.roadmap-recommendation__dismiss').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const featureId = (btn as HTMLElement).dataset.dismiss;
        if (featureId) {
          smartPromptTracker.dismissFeature(featureId);
          // Re-render to update recommendations
          this.renderOverview();
        }
      });
    });

    // Seeds info tooltip trigger
    this.modal.querySelector('.roadmap-panel__seed-info-trigger')?.addEventListener('click', () => {
      this.showSeedsInfoTooltip();
    });
  }

  /**
   * Show "How Seeds Work" tooltip/popover
   */
  private showSeedsInfoTooltip(): void {
    // Remove existing tooltip if any
    const existingTooltip = this.modal?.querySelector('.roadmap-panel__seeds-tooltip');
    if (existingTooltip) {
      existingTooltip.remove();
      return; // Toggle off
    }

    const trigger = this.modal?.querySelector('.roadmap-panel__seed-info-trigger');
    if (!trigger) return;

    const tooltip = document.createElement('div');
    tooltip.className = 'roadmap-panel__seeds-tooltip';
    tooltip.innerHTML = `
      <div class="roadmap-panel__seeds-tooltip-arrow"></div>
      <h4 class="roadmap-panel__seeds-tooltip-title">
        ${t('roadmap.howSeedsWork.title') || 'How Seeds Work'}
      </h4>
      <ul class="roadmap-panel__seeds-tooltip-list">
        <li>
          <span class="roadmap-panel__seeds-tooltip-icon">${ICONS.conversation}</span>
          <span>${t('roadmap.howSeedsWork.conversation') || 'Have a conversation: +1 seed'}</span>
        </li>
        <li>
          <span class="roadmap-panel__seeds-tooltip-icon">${ICONS.flame}</span>
          <span>${t('roadmap.howSeedsWork.streak7') || '7-day streak: +5 seeds'}</span>
        </li>
        <li>
          <span class="roadmap-panel__seeds-tooltip-icon">${ICONS.star}</span>
          <span>${t('roadmap.howSeedsWork.streak30') || '30-day streak: +15 seeds'}</span>
        </li>
        <li>
          <span class="roadmap-panel__seeds-tooltip-icon">${ICONS.lightbulb}</span>
          <span>${t('roadmap.howSeedsWork.suggest') || 'Suggest a feature: -5 seeds'}</span>
        </li>
        <li>
          <span class="roadmap-panel__seeds-tooltip-icon">${ICONS.vote}</span>
          <span>${t('roadmap.howSeedsWork.vote') || 'Vote for features: 1-10 seeds'}</span>
        </li>
      </ul>
      <p class="roadmap-panel__seeds-tooltip-note">
        ${t('roadmap.howSeedsWork.note') || 'Seeds help us prioritize what to build next!'}
      </p>
    `;

    // Position relative to trigger
    const rect = trigger.getBoundingClientRect();
    const modalRect = this.modal?.getBoundingClientRect();
    if (modalRect) {
      tooltip.style.position = 'absolute';
      tooltip.style.top = `${rect.bottom - modalRect.top + 8}px`;
      tooltip.style.left = `${rect.left - modalRect.left - 100}px`; // Center-ish
    }

    this.modal?.querySelector('.roadmap-panel__card')?.appendChild(tooltip);

    // Close on click outside
    const closeTooltip = (e: Event) => {
      if (!tooltip.contains(e.target as Node) && e.target !== trigger) {
        tooltip.remove();
        document.removeEventListener('click', closeTooltip);
      }
    };
    setTimeout(() => document.addEventListener('click', closeTooltip), 0);
  }

  /**
   * Bind events for detail mode
   */
  private bindDetailEvents(feature: RoadmapFeature): void {
    if (!this.modal) return;

    // Close on backdrop click
    this.modal
      .querySelector('.roadmap-panel__backdrop')
      ?.addEventListener('click', () => this.hide());

    // Close button
    this.modal.querySelector('.roadmap-panel__close')?.addEventListener('click', () => this.hide());

    // Back button
    this.modal.querySelector('.roadmap-panel__back')?.addEventListener('click', () => {
      this.renderOverview();
    });

    // Seed allocation slider
    const slider = this.modal.querySelector('.roadmap-detail__slider') as HTMLInputElement;
    const sliderCount = this.modal.querySelector('.roadmap-detail__slider-count');
    const sliderLabel = this.modal.querySelector('.roadmap-detail__slider-label');

    if (slider && sliderCount) {
      // Update display on slider change
      const updateSliderDisplay = () => {
        const value = parseInt(slider.value);
        sliderCount.textContent = String(value);
        if (sliderLabel) {
          sliderLabel.textContent = value === 1
            ? (t('roadmap.seedToPlant') || 'seed to plant')
            : (t('roadmap.seedsToPlant') || 'seeds to plant');
        }
        // Update slider track fill
        const percent = ((value - 1) / (parseInt(slider.max) - 1)) * 100;
        slider.style.setProperty('--slider-percent', `${percent}%`);
      };

      slider.addEventListener('input', updateSliderDisplay);
      updateSliderDisplay(); // Initial call

      // +/- buttons
      this.modal.querySelectorAll('.roadmap-detail__slider-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const action = (btn as HTMLElement).dataset.action;
          const current = parseInt(slider.value);
          const max = parseInt(slider.max);

          if (action === 'increase' && current < max) {
            slider.value = String(current + 1);
          } else if (action === 'decrease' && current > 1) {
            slider.value = String(current - 1);
          }
          updateSliderDisplay();
        });
      });
    }

    // Plant multiple seeds button
    const plantBtn = this.modal.querySelector('.roadmap-detail__plant-btn');
    if (plantBtn) {
      plantBtn.addEventListener('click', async () => {
        const featureId = (plantBtn as HTMLElement).dataset.feature;
        if (!featureId || !slider) return;

        const seeds = parseInt(slider.value);
        (plantBtn as HTMLButtonElement).disabled = true;

        await roadmapService.vote(featureId, seeds);

        // Re-render to update UI
        const updatedFeature = roadmapService.getFeature(featureId);
        if (updatedFeature) {
          this.renderFeatureDetail(updatedFeature);
        }
      });
    }

    // Remove seeds button
    const removeBtn = this.modal.querySelector('.roadmap-detail__remove-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', async () => {
        const featureId = (removeBtn as HTMLElement).dataset.feature;
        if (!featureId) return;

        (removeBtn as HTMLButtonElement).disabled = true;
        await roadmapService.unvote(featureId);

        // Re-render to update UI
        const updatedFeature = roadmapService.getFeature(featureId);
        if (updatedFeature) {
          this.renderFeatureDetail(updatedFeature);
        }
      });
    }
  }

  /**
   * Format number with K suffix for thousands
   */
  private formatNumber(num: number): string {
    if (num >= 1000) {
      return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return num.toLocaleString();
  }

  /**
   * Inject styles
   */
  private injectStyles(): void {
    if (this.styleElement || document.getElementById('roadmap-panel-styles')) return;

    this.styleElement = document.createElement('style');
    this.styleElement.id = 'roadmap-panel-styles';
    this.styleElement.textContent = `
      /* ========================================================================
         ROADMAP PANEL - MODAL OVERLAY
         ======================================================================== */
      .roadmap-panel {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 1400);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-4, 16px);
        pointer-events: none;
        opacity: 0;
        transition: opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
      }

      .roadmap-panel--visible {
        pointer-events: auto;
        opacity: 1;
      }

      .roadmap-panel__backdrop {
        position: absolute;
        inset: 0;
        background: var(--color-background-overlay, rgba(44, 37, 32, 0.6));
        backdrop-filter: blur(var(--glass-blur-strong, 24px));
        -webkit-backdrop-filter: blur(var(--glass-blur-strong, 24px));
      }

      .roadmap-panel__card {
        position: relative;
        width: 100%;
        max-width: clamp(420px, 90vw, 600px);
        max-height: 85vh;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-2xl, 24px);
        box-shadow: var(--shadow-2xl, 0 25px 50px -12px rgba(0, 0, 0, 0.25));
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: scale(0.9) translateY(40px);
        transition: transform ${DURATION.DRAMATIC}ms ${EASING.SPRING};
      }

      .roadmap-panel--visible .roadmap-panel__card {
        transform: scale(1) translateY(0);
      }

      /* ========================================================================
         HEADER
         ======================================================================== */
      .roadmap-panel__header {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3, 12px);
        padding: var(--space-5, 20px) var(--space-6, 24px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        flex-shrink: 0;
      }

      .roadmap-panel__header-content {
        flex: 1;
      }

      .roadmap-panel__eyebrow {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-accent-primary, #3D5A45);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.1em);
        margin: 0 0 var(--space-1, 4px) 0;
        display: inline-flex;
        align-items: center;
        gap: var(--space-2, 8px);
      }

      .roadmap-panel__eyebrow-icon {
        width: 14px;
        height: 14px;
        color: var(--color-accent-primary, #3D5A45);
      }

      .roadmap-panel__eyebrow-icon svg {
        width: 100%;
        height: 100%;
      }

      .roadmap-panel__title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-text-primary, #2c2520);
        margin: 0;
        line-height: 1.2;
      }

      .roadmap-panel__close,
      .roadmap-panel__back {
        width: 36px;
        height: 36px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-background-tertiary, #ebe6df);
        border: none;
        border-radius: var(--radius-full, 9999px);
        color: var(--color-text-secondary, #5c544a);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
        flex-shrink: 0;
      }

      .roadmap-panel__close:hover,
      .roadmap-panel__back:hover {
        background: var(--color-background-secondary, #f5f2ed);
        color: var(--color-text-primary, #2c2520);
        transform: scale(1.05);
      }

      .roadmap-panel__close svg,
      .roadmap-panel__back svg {
        width: 18px;
        height: 18px;
      }

      /* ========================================================================
         SEED BALANCE (Header)
         ======================================================================== */
      .roadmap-panel__seed-balance {
        display: flex;
        align-items: center;
        gap: var(--space-1, 4px);
        padding: var(--space-2, 8px) var(--space-3, 12px);
        background: var(--color-accent-subtle, rgba(61, 90, 69, 0.08));
        border-radius: var(--radius-full, 9999px);
        flex-shrink: 0;
        cursor: default;
      }

      .roadmap-panel__seed-icon {
        font-size: 16px;
        line-height: 1;
      }

      .roadmap-panel__seed-count {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-accent-primary, #3D5A45);
      }

      .roadmap-panel__seed-info-trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        font-size: 10px;
        font-weight: 700;
        color: var(--color-text-tertiary, #8a817a);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: 50%;
        cursor: help;
        margin-left: 2px;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .roadmap-panel__seed-info-trigger:hover {
        background: var(--color-accent-primary, #3D5A45);
        color: white;
      }

      /* ========================================================================
         HEADER STATS CONTAINER
         ======================================================================== */
      .roadmap-panel__header-stats {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        flex-shrink: 0;
      }

      /* ========================================================================
         STREAK PROGRESS
         ======================================================================== */
      .roadmap-panel__streak-progress {
        display: flex;
        align-items: center;
        gap: var(--space-1, 4px);
        padding: var(--space-2, 8px) var(--space-3, 12px);
        background: var(--color-semantic-warning-subtle, rgba(255, 140, 0, 0.08));
        border-radius: var(--radius-full, 9999px);
        flex-shrink: 0;
        cursor: default;
      }

      .roadmap-panel__streak-progress--inactive {
        opacity: 0.6;
      }

      .roadmap-panel__streak-icon {
        font-size: 14px;
        line-height: 1;
      }

      .roadmap-panel__streak-count {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-semantic-warning, #ff8c00);
      }

      .roadmap-panel__streak-text {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-secondary, #5c544a);
      }

      .roadmap-panel__streak-bar {
        width: 40px;
        height: 4px;
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-full, 9999px);
        overflow: hidden;
      }

      .roadmap-panel__streak-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--color-semantic-warning, #ff8c00), #ff6b00);
        border-radius: var(--radius-full, 9999px);
        transition: width ${DURATION.NORMAL}ms ${EASING.SPRING};
      }

      .roadmap-panel__streak-next {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-tertiary, #8a817a);
        cursor: help;
      }

      .roadmap-panel__streak-complete {
        font-size: 12px;
        color: var(--color-semantic-success, #4a9);
      }

      /* ========================================================================
         SEEDS INFO TOOLTIP
         ======================================================================== */
      .roadmap-panel__seeds-tooltip {
        position: absolute;
        z-index: var(--z-docked);
        min-width: min(240px, 100%);
        padding: var(--space-4, 16px);
        background: var(--color-background-elevated, #fff);
        border-radius: var(--radius-lg, 12px);
        box-shadow: var(--shadow-lg, 0 20px 40px rgba(0, 0, 0, 0.15));
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        animation: tooltipFadeIn ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      @keyframes tooltipFadeIn {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .roadmap-panel__seeds-tooltip-arrow {
        position: absolute;
        top: -8px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-bottom: 8px solid var(--color-background-elevated, #fff);
      }

      .roadmap-panel__seeds-tooltip-title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-3, 12px) 0;
      }

      .roadmap-panel__seeds-tooltip-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .roadmap-panel__seeds-tooltip-list li {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-secondary, #5c544a);
      }

      .roadmap-panel__seeds-tooltip-icon {
        font-size: 14px;
        line-height: 1;
        width: 20px;
        text-align: center;
      }

      .roadmap-panel__seeds-tooltip-note {
        margin: var(--space-3, 12px) 0 0 0;
        padding-top: var(--space-3, 12px);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-tertiary, #8a817a);
        font-style: italic;
      }

      /* ========================================================================
         LOADING STATE
         ======================================================================== */
      .roadmap-panel__loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-12, 48px);
        gap: var(--space-4, 16px);
      }

      .roadmap-panel__loading-icon {
        font-size: 48px;
        animation: seedPulse 1.5s ${EASING.SPRING} infinite;
      }

      @keyframes seedPulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.1); opacity: 0.8; }
      }

      .roadmap-panel__loading-text {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-base, 1rem);
        color: var(--color-text-secondary, #5c544a);
        margin: 0;
      }

      /* ========================================================================
         BODY
         ======================================================================== */
      .roadmap-panel__body {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-5, 20px) var(--space-6, 24px);
      }

      .roadmap-panel__intro {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-base, 1rem);
        color: var(--color-text-secondary, #5c544a);
        line-height: 1.6;
        margin: 0 0 var(--space-5, 20px) 0;
      }

      /* ========================================================================
         LEGEND - Growth stages visualization
         ======================================================================== */
      .roadmap-panel__legend {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-3, 12px);
        padding: var(--space-4, 16px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-xl, 16px);
        margin-bottom: var(--space-6, 24px);
        justify-content: center;
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .roadmap-panel__legend-item {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        padding: var(--space-1, 4px) var(--space-3, 12px);
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-full, 9999px);
        box-shadow: var(--shadow-xs, 0 1px 2px rgba(0, 0, 0, 0.04));
      }

      .roadmap-panel__legend-icon {
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .roadmap-panel__legend-icon svg {
        width: 100%;
        height: 100%;
      }

      .roadmap-panel__legend-label {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-secondary, #5c544a);
        font-weight: var(--font-weight-medium, 500);
      }

      /* ========================================================================
         SECTIONS
         ======================================================================== */
      .roadmap-panel__section {
        margin-bottom: var(--space-6, 24px);
      }

      .roadmap-panel__section:last-child {
        margin-bottom: 0;
      }

      .roadmap-panel__section-title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-accent-primary, #3D5A45);
        margin: 0 0 var(--space-3, 12px) 0;
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
      }

      .roadmap-panel__section-title::before {
        content: '';
        width: 4px;
        height: 16px;
        background: var(--color-accent-primary, #3D5A45);
        border-radius: 2px;
      }

      .roadmap-panel__grid {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
      }

      /* Staggered entrance animation for cards */
      .roadmap-panel--visible .roadmap-card {
        animation: cardEntrance 0.5s ${EASING.SPRING} backwards;
      }

      .roadmap-panel--visible .roadmap-card:nth-child(1) { animation-delay: 0.1s; }
      .roadmap-panel--visible .roadmap-card:nth-child(2) { animation-delay: 0.15s; }
      .roadmap-panel--visible .roadmap-card:nth-child(3) { animation-delay: 0.2s; }
      .roadmap-panel--visible .roadmap-card:nth-child(4) { animation-delay: 0.25s; }
      .roadmap-panel--visible .roadmap-card:nth-child(5) { animation-delay: 0.3s; }

      @keyframes cardEntrance {
        from {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      /* ========================================================================
         FEATURE CARDS (Overview)
         ======================================================================== */
      .roadmap-card {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
        padding: var(--space-4, 16px);
        background: var(--color-background-elevated, #fffdfb);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-lg, 12px);
        cursor: pointer;
        transition: all ${DURATION.SLOW}ms ${EASING.SPRING};
        text-align: left;
        position: relative;
        overflow: hidden;
      }

      .roadmap-card:hover {
        border-color: var(--color-accent-primary, #3D5A45);
        box-shadow: var(--shadow-lg, 0 8px 16px rgba(0, 0, 0, 0.1));
        transform: translateY(-2px);
      }

      .roadmap-card:focus-visible {
        outline: 2px solid var(--color-accent-primary, #3D5A45);
        outline-offset: 2px;
      }

      .roadmap-card__header {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        position: relative;
        z-index: var(--z-docked);
      }

      .roadmap-card__icon {
        width: 40px;
        height: 40px;
        padding: 8px;
        background: var(--color-accent-subtle, rgba(61, 90, 69, 0.08));
        border-radius: var(--radius-lg, 12px);
        color: var(--color-accent-primary, #3D5A45);
        transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
      }

      .roadmap-card:hover .roadmap-card__icon {
        transform: scale(1.05);
      }

      .roadmap-card__icon svg {
        width: 100%;
        height: 100%;
      }

      .roadmap-card__stage {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-medium, 500);
        margin-left: auto;
        padding: 2px 8px;
        border-radius: var(--radius-full, 9999px);
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .roadmap-card__stage-icon {
        width: 12px;
        height: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .roadmap-card__stage-icon svg {
        width: 100%;
        height: 100%;
      }

      /* Stage color classes - using design system semantic colors */
      .stage--seed {
        background: var(--color-background-tertiary, #ebe6df);
        color: var(--color-text-muted, #756a5e);
      }

      .stage--sprout {
        background: var(--color-accent-subtle, rgba(61, 90, 69, 0.08));
        color: var(--color-accent-primary, #3D5A45);
      }

      .stage--bud {
        background: var(--color-semantic-warning-glow, rgba(166, 124, 53, 0.18));
        color: var(--color-semantic-warning, #a67c35);
      }

      .stage--bloom {
        background: var(--color-semantic-success-glow, rgba(61, 122, 82, 0.18));
        color: var(--color-semantic-success, #3d7a52);
      }

      .roadmap-card__headline {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0;
        line-height: 1.3;
        position: relative;
        z-index: var(--z-docked);
      }

      .roadmap-card__arrival {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0;
        position: relative;
        z-index: var(--z-docked);
      }

      .roadmap-card__interest {
        display: flex;
        align-items: center;
        gap: var(--space-1, 4px);
        margin-top: var(--space-1, 4px);
      }

      .roadmap-card__seed-indicator {
        font-size: 14px;
        line-height: 1;
        opacity: 0.6;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .roadmap-card__seed-indicator--voted {
        opacity: 1;
        animation: seedBounce 0.5s ${EASING.SPRING};
      }

      @keyframes seedBounce {
        0% { transform: scale(1); }
        50% { transform: scale(1.3); }
        100% { transform: scale(1); }
      }

      .roadmap-card__count {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
      }

      .roadmap-card__chevron {
        position: absolute;
        right: var(--space-3, 12px);
        top: 50%;
        transform: translateY(-50%);
        width: 16px;
        height: 16px;
        color: var(--color-text-muted, #756a5e);
        opacity: 0;
        transition: opacity ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .roadmap-card__chevron svg {
        width: 100%;
        height: 100%;
      }

      .roadmap-card:hover .roadmap-card__chevron {
        opacity: 1;
      }

      /* ========================================================================
         FEATURE DETAIL VIEW
         ======================================================================== */
      .roadmap-detail__header {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        margin-bottom: var(--space-5, 20px);
      }

      .roadmap-detail__icon {
        width: 56px;
        height: 56px;
        padding: 14px;
        border-radius: var(--radius-xl, 16px);
        flex-shrink: 0;
        /* Colors come from .stage--* classes */
      }

      .roadmap-detail__icon.stage--seed {
        background: var(--color-background-tertiary, #ebe6df);
        color: var(--color-text-muted, #756a5e);
      }

      .roadmap-detail__icon.stage--sprout {
        background: var(--color-accent-subtle, rgba(61, 90, 69, 0.08));
        color: var(--color-accent-primary, #3D5A45);
      }

      .roadmap-detail__icon.stage--bud {
        background: var(--color-semantic-warning-glow, rgba(166, 124, 53, 0.18));
        color: var(--color-semantic-warning, #a67c35);
      }

      .roadmap-detail__icon.stage--bloom {
        background: var(--color-semantic-success-glow, rgba(61, 122, 82, 0.18));
        color: var(--color-semantic-success, #3d7a52);
      }

      .roadmap-detail__icon svg {
        width: 100%;
        height: 100%;
      }

      .roadmap-detail__stage {
        padding: var(--space-1, 4px) var(--space-3, 12px);
        border-radius: var(--radius-full, 9999px);
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .roadmap-detail__stage-icon {
        width: 14px;
        height: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .roadmap-detail__stage-icon svg {
        width: 100%;
        height: 100%;
      }

      .roadmap-detail__description {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-base, 1rem);
        color: var(--color-text-secondary, #5c544a);
        line-height: 1.7;
        margin: 0 0 var(--space-5, 20px) 0;
        font-style: italic;
      }

      .roadmap-detail__timeline {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-3, 12px) var(--space-4, 16px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-md, 8px);
        margin-bottom: var(--space-5, 20px);
      }

      .roadmap-detail__timeline-label {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
      }

      .roadmap-detail__timeline-value {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-accent-primary, #3D5A45);
      }

      .roadmap-detail__section {
        margin-bottom: var(--space-5, 20px);
      }

      .roadmap-detail__section--existing {
        padding: var(--space-4, 16px);
        background: var(--color-accent-subtle, rgba(61, 90, 69, 0.05));
        border-radius: var(--radius-lg, 12px);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .roadmap-detail__section-title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0 0 var(--space-3, 12px) 0;
      }

      .roadmap-detail__list {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .roadmap-detail__list-item {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5c544a);
        line-height: 1.6;
        padding: var(--space-2, 8px) 0;
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        display: flex;
        align-items: flex-start;
        gap: var(--space-2, 8px);
      }

      .roadmap-detail__list-item:last-child {
        border-bottom: none;
        padding-bottom: 0;
      }

      .roadmap-detail__list-item::before {
        content: '';
        width: 6px;
        height: 6px;
        background: var(--persona-primary, #4a6741);
        border-radius: 50%;
        flex-shrink: 0;
        margin-top: 7px;
      }

      .roadmap-detail__list--existing .roadmap-detail__list-item::before {
        content: none;
      }

      .roadmap-detail__check {
        width: 18px;
        height: 18px;
        color: var(--color-semantic-success, #3d7a52);
        flex-shrink: 0;
      }

      .roadmap-detail__check svg {
        width: 100%;
        height: 100%;
      }

      /* ========================================================================
         SEED PLANTING CTA
         ======================================================================== */
      .roadmap-detail__vote {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 16px);
        padding: var(--space-5, 20px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-xl, 16px);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .roadmap-detail__seed-stats {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: var(--space-3, 12px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      }

      .roadmap-detail__seed-total {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
      }

      .roadmap-detail__seed-total-icon {
        font-size: 24px;
        line-height: 1;
      }

      .roadmap-detail__seed-total-count {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-accent-primary, #3D5A45);
      }

      .roadmap-detail__seed-total-label {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
      }

      .roadmap-detail__seed-gardeners {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5c544a);
      }

      .roadmap-detail__your-seeds {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        padding: var(--space-3, 12px);
        background: var(--color-accent-subtle, rgba(61, 90, 69, 0.08));
        border-radius: var(--radius-md, 8px);
      }

      .roadmap-detail__your-seeds-label {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #5c544a);
      }

      .roadmap-detail__your-seeds-count {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-accent-primary, #3D5A45);
      }

      .roadmap-detail__seed-actions {
        display: flex;
        gap: var(--space-3, 12px);
      }

      .roadmap-detail__seed-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        padding: var(--space-3, 12px) var(--space-4, 16px);
        background: var(--color-background-elevated, #fffdfb);
        border: 2px solid var(--color-border-medium, rgba(44, 37, 32, 0.12));
        border-radius: var(--radius-lg, 12px);
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        cursor: pointer;
        transition: all ${DURATION.MODERATE}ms ${EASING.SPRING};
      }

      .roadmap-detail__seed-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: var(--shadow-md, 0 4px 8px rgba(0, 0, 0, 0.08));
      }

      .roadmap-detail__seed-btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .roadmap-detail__seed-btn:focus-visible {
        outline: 2px solid var(--color-accent-primary, #3D5A45);
        outline-offset: 2px;
      }

      .roadmap-detail__seed-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .roadmap-detail__seed-btn--add {
        background: var(--color-accent-primary, #3D5A45);
        border-color: var(--color-accent-primary, #3D5A45);
        color: white;
      }

      .roadmap-detail__seed-btn--add:hover:not(:disabled) {
        background: var(--color-accent-hover, #4a6b52);
        border-color: var(--color-accent-hover, #4a6b52);
      }

      .roadmap-detail__seed-btn--remove {
        background: transparent;
        border-color: var(--color-border-medium, rgba(44, 37, 32, 0.12));
        color: var(--color-text-secondary, #5c544a);
      }

      .roadmap-detail__seed-btn--remove:hover:not(:disabled) {
        border-color: var(--color-semantic-error, #b5453a);
        color: var(--color-semantic-error, #b5453a);
      }

      .roadmap-detail__seed-btn-icon {
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-bold, 700);
        line-height: 1;
      }

      .roadmap-detail__vote-hint {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
        text-align: center;
        margin: 0;
        font-style: italic;
      }

      .roadmap-detail__vote-hint--empty {
        color: var(--color-semantic-warning, #a67c35);
      }

      /* ========================================================================
         PRIORITY VOTING - SEED ALLOCATOR
         ======================================================================== */
      .roadmap-detail__allocator {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
        padding: var(--space-4, 16px);
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-lg, 12px);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
      }

      .roadmap-detail__allocator-label {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-secondary, #5c544a);
        text-align: center;
      }

      .roadmap-detail__slider-row {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
      }

      .roadmap-detail__slider-btn {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-background-tertiary, #ebe6df);
        border: none;
        border-radius: var(--radius-full, 9999px);
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-text-secondary, #5c544a);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
        flex-shrink: 0;
      }

      .roadmap-detail__slider-btn:hover {
        background: var(--color-accent-subtle, rgba(61, 90, 69, 0.08));
        color: var(--color-accent-primary, #3D5A45);
        transform: scale(1.1);
      }

      .roadmap-detail__slider-btn:active {
        transform: scale(0.95);
      }

      .roadmap-detail__slider-container {
        flex: 1;
        position: relative;
        height: 8px;
      }

      .roadmap-detail__slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 8px;
        background: var(--color-background-tertiary, #ebe6df);
        border-radius: var(--radius-full, 9999px);
        outline: none;
        cursor: pointer;
        position: relative;
        --slider-percent: 0%;
      }

      .roadmap-detail__slider::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: var(--slider-percent);
        background: var(--color-accent-primary, #3D5A45);
        border-radius: var(--radius-full, 9999px);
        pointer-events: none;
      }

      .roadmap-detail__slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 24px;
        height: 24px;
        background: var(--color-accent-primary, #3D5A45);
        border-radius: var(--radius-full, 9999px);
        cursor: grab;
        box-shadow: var(--shadow-md, 0 4px 8px rgba(0, 0, 0, 0.08));
        transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
        position: relative;
        z-index: var(--z-docked);
      }

      .roadmap-detail__slider::-webkit-slider-thumb:hover {
        transform: scale(1.15);
      }

      .roadmap-detail__slider::-webkit-slider-thumb:active {
        cursor: grabbing;
        transform: scale(1.1);
      }

      .roadmap-detail__slider::-moz-range-thumb {
        width: 24px;
        height: 24px;
        background: var(--color-accent-primary, #3D5A45);
        border: none;
        border-radius: var(--radius-full, 9999px);
        cursor: grab;
        box-shadow: var(--shadow-md, 0 4px 8px rgba(0, 0, 0, 0.08));
      }

      .roadmap-detail__slider-value {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
      }

      .roadmap-detail__slider-seeds {
        font-size: 20px;
        line-height: 1;
      }

      .roadmap-detail__slider-count {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-2xl, 1.5rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-accent-primary, #3D5A45);
      }

      .roadmap-detail__slider-label {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
      }

      .roadmap-detail__plant-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        padding: var(--space-4, 16px) var(--space-6, 24px);
        background: var(--color-accent-primary, #3D5A45);
        border: none;
        border-radius: var(--radius-full, 9999px);
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-semibold, 600);
        color: white;
        cursor: pointer;
        transition: all ${DURATION.MODERATE}ms ${EASING.SPRING};
        box-shadow: var(--shadow-md, 0 4px 8px rgba(0, 0, 0, 0.08));
      }

      .roadmap-detail__plant-btn:hover:not(:disabled) {
        background: var(--color-accent-hover, #4a6b52);
        transform: translateY(-2px);
        box-shadow: var(--shadow-lg, 0 8px 16px rgba(0, 0, 0, 0.12));
      }

      .roadmap-detail__plant-btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .roadmap-detail__plant-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .roadmap-detail__plant-btn-icon {
        font-size: 18px;
        line-height: 1;
      }

      .roadmap-detail__remove-btn {
        display: block;
        width: 100%;
        padding: var(--space-3, 12px);
        background: transparent;
        border: 1px solid var(--color-border-medium, rgba(44, 37, 32, 0.12));
        border-radius: var(--radius-md, 8px);
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
        text-align: center;
      }

      .roadmap-detail__remove-btn:hover:not(:disabled) {
        border-color: var(--color-semantic-error, #b5453a);
        color: var(--color-semantic-error, #b5453a);
        background: var(--color-semantic-error-glow, rgba(181, 69, 58, 0.08));
      }

      .roadmap-detail__remove-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* ========================================================================
         FOOTER
         ======================================================================== */
      .roadmap-panel__footer {
        padding: var(--space-4, 16px) var(--space-6, 24px);
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        flex-shrink: 0;
      }

      .roadmap-panel__footer-text {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        text-align: center;
        margin: 0;
        font-style: italic;
      }

      /* ========================================================================
         SUGGEST BUTTON (Overview)
         ======================================================================== */
      .roadmap-panel__suggest-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-3, 12px);
        width: 100%;
        padding: var(--space-4, 16px) var(--space-5, 20px);
        margin-top: var(--space-6, 24px);
        background: linear-gradient(135deg,
          var(--color-accent-primary, #3D5A45) 0%,
          var(--color-accent-hover, #4a6b52) 100%);
        border: none;
        border-radius: var(--radius-lg, 12px);
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-semibold, 600);
        color: white;
        cursor: pointer;
        transition: all ${DURATION.MODERATE}ms ${EASING.SPRING};
        box-shadow: var(--shadow-md, 0 4px 8px rgba(0, 0, 0, 0.08));
      }

      .roadmap-panel__suggest-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: var(--shadow-lg, 0 8px 16px rgba(0, 0, 0, 0.12));
      }

      .roadmap-panel__suggest-btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .roadmap-panel__suggest-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        background: var(--color-text-muted, #756a5e);
      }

      .roadmap-panel__suggest-icon {
        font-size: 20px;
        line-height: 1;
      }

      .roadmap-panel__suggest-text {
        flex: 1;
        text-align: left;
      }

      .roadmap-panel__suggest-cost {
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-normal, 400);
        opacity: 0.85;
        background: rgba(255, 255, 255, 0.15);
        padding: var(--space-1, 4px) var(--space-2, 8px);
        border-radius: var(--radius-full, 9999px);
      }

      /* ========================================================================
         SMART RECOMMENDATIONS
         ======================================================================== */
      .roadmap-panel__recommendations {
        margin-top: var(--space-6, 24px);
        padding: var(--space-5, 20px);
        background: linear-gradient(135deg,
          var(--color-accent-glow, rgba(61, 90, 69, 0.08)) 0%,
          var(--color-semantic-success-glow, rgba(61, 90, 69, 0.04)) 100%);
        border-radius: var(--radius-lg, 12px);
        border: 1px solid var(--color-accent-subtle, rgba(61, 90, 69, 0.12));
      }

      .roadmap-panel__recommendations-header {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-1, 4px);
      }

      .roadmap-panel__recommendations-icon {
        font-size: 18px;
        line-height: 1;
      }

      .roadmap-panel__recommendations-title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2C2520);
        margin: 0;
      }

      .roadmap-panel__recommendations-subtitle {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0 0 var(--space-4, 16px) 0;
      }

      .roadmap-panel__recommendations-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-3, 12px);
      }

      .roadmap-recommendation {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-background-primary, #fcfaf7);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-md, 8px);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
        text-align: left;
        width: 100%;
        position: relative;
      }

      .roadmap-recommendation:hover {
        border-color: var(--color-accent-primary, #3D5A45);
        box-shadow: var(--shadow-md, 0 4px 8px rgba(0, 0, 0, 0.08));
        transform: translateY(-1px);
      }

      .roadmap-recommendation__badge {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-accent-glow, rgba(61, 90, 69, 0.08));
        border-radius: var(--radius-full, 9999px);
        flex-shrink: 0;
        color: var(--persona-primary, #4a6741);
      }

      .roadmap-recommendation__badge svg {
        width: 16px;
        height: 16px;
      }

      .roadmap-recommendation__content {
        flex: 1;
        min-width: 0;
      }

      .roadmap-recommendation__header {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-1, 4px);
      }

      .roadmap-recommendation__icon {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
        color: var(--color-accent-primary, #3D5A45);
      }

      .roadmap-recommendation__icon svg {
        width: 100%;
        height: 100%;
      }

      .roadmap-recommendation__headline {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2C2520);
      }

      .roadmap-recommendation__reason {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0 0 var(--space-2, 8px) 0;
        font-style: italic;
      }

      .roadmap-recommendation__meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2, 8px);
      }

      .roadmap-recommendation__stage {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-medium, 500);
        padding: var(--space-1, 4px) var(--space-2, 8px);
        border-radius: var(--radius-full, 9999px);
      }

      .roadmap-recommendation__cta {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-xs, 0.75rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-accent-primary, #3D5A45);
      }

      .roadmap-recommendation__dismiss {
        position: absolute;
        top: var(--space-2, 8px);
        right: var(--space-2, 8px);
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: var(--radius-full, 9999px);
        font-size: 14px;
        color: var(--color-text-muted, #756a5e);
        cursor: pointer;
        opacity: 0;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .roadmap-recommendation:hover .roadmap-recommendation__dismiss {
        opacity: 1;
      }

      .roadmap-recommendation__dismiss:hover {
        background: var(--color-semantic-error-glow, rgba(181, 69, 58, 0.08));
        color: var(--color-semantic-error, #b5453a);
      }

      /* ========================================================================
         SUGGESTION FORM
         ======================================================================== */
      .roadmap-suggestion__form {
        display: flex;
        flex-direction: column;
        gap: var(--space-5, 20px);
        padding: var(--space-6, 24px);
        flex: 1;
        overflow-y: auto;
      }

      .roadmap-suggestion__intro {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #4a423b);
        line-height: 1.6;
        margin: 0;
      }

      .roadmap-suggestion__field {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .roadmap-suggestion__label {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2C2520);
      }

      .roadmap-suggestion__required {
        color: var(--color-semantic-error, #b5453a);
        margin-left: 2px;
      }

      .roadmap-suggestion__input,
      .roadmap-suggestion__textarea,
      .roadmap-suggestion__select {
        width: 100%;
        padding: var(--space-3, 12px) var(--space-4, 16px);
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-base, 1rem);
        color: var(--color-text-primary, #2C2520);
        background: var(--color-background-primary, #fcfaf7);
        border: 1px solid var(--color-border-medium, rgba(44, 37, 32, 0.12));
        border-radius: var(--radius-md, 8px);
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .roadmap-suggestion__input:focus,
      .roadmap-suggestion__textarea:focus,
      .roadmap-suggestion__select:focus {
        outline: none;
        border-color: var(--color-accent-primary, #3D5A45);
        box-shadow: 0 0 0 3px var(--color-accent-glow, rgba(61, 90, 69, 0.15));
      }

      .roadmap-suggestion__input::placeholder,
      .roadmap-suggestion__textarea::placeholder {
        color: var(--color-text-muted, #756a5e);
      }

      .roadmap-suggestion__textarea {
        resize: vertical;
        min-height: 120px;
        line-height: 1.5;
      }

      .roadmap-suggestion__select {
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23756a5e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 12px center;
        padding-right: 40px;
        cursor: pointer;
      }

      .roadmap-suggestion__char-count {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        text-align: right;
      }

      .roadmap-suggestion__char-count--warning {
        color: var(--color-semantic-warning, #c98a2e);
      }

      .roadmap-suggestion__char-count--error {
        color: var(--color-semantic-error, #b5453a);
      }

      .roadmap-suggestion__cost-notice {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-4, 16px);
        background: var(--color-accent-glow, rgba(61, 90, 69, 0.08));
        border-radius: var(--radius-md, 8px);
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-secondary, #4a423b);
      }

      .roadmap-suggestion__cost-icon {
        font-size: 20px;
        line-height: 1;
      }

      .roadmap-suggestion__submit {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        padding: var(--space-4, 16px) var(--space-6, 24px);
        background: var(--color-accent-primary, #3D5A45);
        border: none;
        border-radius: var(--radius-full, 9999px);
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-semibold, 600);
        color: white;
        cursor: pointer;
        transition: all ${DURATION.MODERATE}ms ${EASING.SPRING};
        box-shadow: var(--shadow-md, 0 4px 8px rgba(0, 0, 0, 0.08));
        margin-top: var(--space-4, 16px);
      }

      .roadmap-suggestion__submit:hover:not(:disabled) {
        background: var(--color-accent-hover, #4a6b52);
        transform: translateY(-2px);
        box-shadow: var(--shadow-lg, 0 8px 16px rgba(0, 0, 0, 0.12));
      }

      .roadmap-suggestion__submit:active:not(:disabled) {
        transform: translateY(0);
      }

      .roadmap-suggestion__submit:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .roadmap-suggestion__submit-icon {
        font-size: 18px;
        line-height: 1;
      }

      /* ========================================================================
         SUGGESTION SUCCESS STATE
         ======================================================================== */
      .roadmap-suggestion__success {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--space-8, 32px);
        flex: 1;
        gap: var(--space-5, 20px);
      }

      .roadmap-suggestion__success-icon {
        width: 80px;
        height: 80px;
        background: var(--color-semantic-success-glow, rgba(61, 90, 69, 0.15));
        border-radius: var(--radius-full, 9999px);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 40px;
        animation: successPop ${DURATION.SLOW}ms ${EASING.SPRING} forwards;
      }

      @keyframes successPop {
        0% { transform: scale(0); opacity: 0; }
        60% { transform: scale(1.1); }
        100% { transform: scale(1); opacity: 1; }
      }

      .roadmap-suggestion__success-title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-text-primary, #2C2520);
        margin: 0;
      }

      .roadmap-suggestion__success-text {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-base, 1rem);
        color: var(--color-text-secondary, #4a423b);
        line-height: 1.6;
        margin: 0;
        max-width: min(280px, 100%);
      }

      .roadmap-suggestion__done-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2, 8px);
        padding: var(--space-3, 12px) var(--space-6, 24px);
        background: var(--color-accent-primary, #3D5A45);
        border: none;
        border-radius: var(--radius-full, 9999px);
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-semibold, 600);
        color: white;
        cursor: pointer;
        transition: all ${DURATION.MODERATE}ms ${EASING.SPRING};
        margin-top: var(--space-4, 16px);
      }

      .roadmap-suggestion__done-btn:hover {
        background: var(--color-accent-hover, #4a6b52);
        transform: translateY(-2px);
      }

      /* ========================================================================
         DARK THEME (Midnight / Cedar Night)
         ======================================================================== */
      [data-theme="midnight"] .roadmap-panel__backdrop {
        background: var(--color-background-overlay, rgba(88, 72, 64, 0.95));
      }

      [data-theme="midnight"] .roadmap-panel__card {
        background: var(--color-background-elevated, #70605a);
        box-shadow: var(--shadow-2xl);
      }

      [data-theme="midnight"] .roadmap-panel__title {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .roadmap-panel__eyebrow {
        color: var(--color-accent-text, #e8c870);
      }

      [data-theme="midnight"] .roadmap-panel__eyebrow-icon {
        color: var(--color-accent-text, #e8c870);
      }

      [data-theme="midnight"] .roadmap-panel__close,
      [data-theme="midnight"] .roadmap-panel__back {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .roadmap-panel__close:hover,
      [data-theme="midnight"] .roadmap-panel__back:hover {
        background: var(--color-background-secondary, #60504a);
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .roadmap-panel__intro {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .roadmap-panel__legend {
        background: var(--color-background-tertiary, #685852);
        border-color: var(--color-border-subtle, rgba(215, 185, 145, 0.12));
      }

      [data-theme="midnight"] .roadmap-panel__legend-item {
        background: var(--color-background-elevated, #70605a);
        box-shadow: var(--shadow-sm);
      }

      [data-theme="midnight"] .roadmap-panel__section-title {
        color: var(--color-accent-text, #e8c870);
      }

      [data-theme="midnight"] .roadmap-panel__section-title::before {
        background: var(--color-accent-primary, #d4a84a);
      }

      [data-theme="midnight"] .roadmap-card {
        background: var(--color-background-tertiary, #685852);
        border-color: var(--color-border-subtle, rgba(215, 185, 145, 0.12));
      }

      [data-theme="midnight"] .roadmap-card:hover {
        border-color: var(--color-accent-primary, #d4a84a);
        box-shadow: var(--shadow-lg);
      }

      [data-theme="midnight"] .roadmap-card__icon {
        background: var(--color-accent-subtle, rgba(212, 168, 74, 0.08));
        color: var(--color-accent-text, #e8c870);
      }

      [data-theme="midnight"] .roadmap-card__headline {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .roadmap-card__arrival,
      [data-theme="midnight"] .roadmap-card__count,
      [data-theme="midnight"] .roadmap-card__chevron {
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .roadmap-detail__icon {
        background: var(--color-accent-subtle, rgba(212, 168, 74, 0.08));
        color: var(--color-accent-text, #e8c870);
      }

      [data-theme="midnight"] .roadmap-detail__description {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .roadmap-detail__timeline {
        background: var(--color-background-tertiary, #685852);
      }

      [data-theme="midnight"] .roadmap-detail__timeline-value {
        color: var(--color-accent-text, #e8c870);
      }

      [data-theme="midnight"] .roadmap-detail__section-title {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .roadmap-detail__section--existing {
        background: var(--color-accent-subtle, rgba(212, 168, 74, 0.05));
        border-color: var(--color-border-subtle, rgba(215, 185, 145, 0.12));
      }

      [data-theme="midnight"] .roadmap-detail__list-item {
        color: var(--color-text-secondary, #f0ebe4);
        border-color: var(--color-border-subtle, rgba(215, 185, 145, 0.12));
      }

      [data-theme="midnight"] .roadmap-detail__list-item::before {
        background: var(--color-accent-primary, #d4a84a);
      }

      [data-theme="midnight"] .roadmap-detail__check {
        color: var(--color-semantic-success, #6bc48f);
      }

      [data-theme="midnight"] .roadmap-panel__seed-balance {
        background: var(--color-accent-subtle, rgba(212, 168, 74, 0.12));
      }

      [data-theme="midnight"] .roadmap-panel__seed-count {
        color: var(--color-accent-text, #e8c870);
      }

      [data-theme="midnight"] .roadmap-panel__seed-info-trigger {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-tertiary, #b5a99a);
      }

      [data-theme="midnight"] .roadmap-panel__seed-info-trigger:hover {
        background: var(--color-accent-primary, #d4a84a);
        color: var(--color-text-on-accent, #2c2520);
      }

      [data-theme="midnight"] .roadmap-panel__streak-progress {
        background: var(--color-semantic-warning-subtle, rgba(255, 140, 0, 0.12));
      }

      [data-theme="midnight"] .roadmap-panel__streak-count {
        color: var(--color-semantic-warning, #ff9f40);
      }

      [data-theme="midnight"] .roadmap-panel__streak-text {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .roadmap-panel__streak-bar {
        background: var(--color-background-tertiary, #685852);
      }

      [data-theme="midnight"] .roadmap-panel__streak-next {
        color: var(--color-text-tertiary, #b5a99a);
      }

      [data-theme="midnight"] .roadmap-panel__seeds-tooltip {
        background: var(--color-background-elevated, #5a4a45);
        border-color: var(--color-border-subtle, rgba(215, 185, 145, 0.12));
      }

      [data-theme="midnight"] .roadmap-panel__seeds-tooltip-arrow {
        border-bottom-color: var(--color-background-elevated, #5a4a45);
      }

      [data-theme="midnight"] .roadmap-panel__seeds-tooltip-title {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .roadmap-panel__seeds-tooltip-list li {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .roadmap-panel__seeds-tooltip-note {
        color: var(--color-text-tertiary, #b5a99a);
        border-top-color: var(--color-border-subtle, rgba(215, 185, 145, 0.12));
      }

      [data-theme="midnight"] .roadmap-detail__vote {
        background: var(--color-background-tertiary, #685852);
        border-color: var(--color-border-subtle, rgba(215, 185, 145, 0.12));
      }

      [data-theme="midnight"] .roadmap-detail__seed-stats {
        border-color: var(--color-border-subtle, rgba(215, 185, 145, 0.12));
      }

      [data-theme="midnight"] .roadmap-detail__seed-total-count {
        color: var(--color-accent-text, #e8c870);
      }

      [data-theme="midnight"] .roadmap-detail__seed-total-label {
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .roadmap-detail__seed-gardeners {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .roadmap-detail__your-seeds {
        background: var(--color-accent-subtle, rgba(212, 168, 74, 0.12));
      }

      [data-theme="midnight"] .roadmap-detail__your-seeds-label {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .roadmap-detail__your-seeds-count {
        color: var(--color-accent-text, #e8c870);
      }

      [data-theme="midnight"] .roadmap-detail__seed-btn {
        background: var(--color-background-elevated, #70605a);
        border-color: var(--color-border-medium, rgba(215, 185, 145, 0.2));
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .roadmap-detail__seed-btn--add {
        background: var(--color-accent-primary, #d4a84a);
        border-color: var(--color-accent-primary, #d4a84a);
        color: var(--color-text-on-accent, #2c2520);
      }

      [data-theme="midnight"] .roadmap-detail__seed-btn--add:hover:not(:disabled) {
        background: var(--color-accent-text, #e8c870);
        border-color: var(--color-accent-text, #e8c870);
      }

      [data-theme="midnight"] .roadmap-detail__seed-btn--remove:hover:not(:disabled) {
        border-color: var(--color-semantic-error, #e07575);
        color: var(--color-semantic-error, #e07575);
      }

      [data-theme="midnight"] .roadmap-detail__vote-hint {
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .roadmap-detail__vote-hint--empty {
        color: var(--color-semantic-warning, #e0b860);
      }

      [data-theme="midnight"] .roadmap-detail__allocator {
        background: var(--color-background-elevated, #70605a);
        border-color: var(--color-border-subtle, rgba(215, 185, 145, 0.12));
      }

      [data-theme="midnight"] .roadmap-detail__allocator-label {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .roadmap-detail__slider-btn {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .roadmap-detail__slider-btn:hover {
        background: var(--color-accent-subtle, rgba(212, 168, 74, 0.12));
        color: var(--color-accent-text, #e8c870);
      }

      [data-theme="midnight"] .roadmap-detail__slider {
        background: var(--color-background-tertiary, #685852);
      }

      [data-theme="midnight"] .roadmap-detail__slider::before {
        background: var(--color-accent-primary, #d4a84a);
      }

      [data-theme="midnight"] .roadmap-detail__slider::-webkit-slider-thumb {
        background: var(--color-accent-primary, #d4a84a);
      }

      [data-theme="midnight"] .roadmap-detail__slider::-moz-range-thumb {
        background: var(--color-accent-primary, #d4a84a);
      }

      [data-theme="midnight"] .roadmap-detail__slider-count {
        color: var(--color-accent-text, #e8c870);
      }

      [data-theme="midnight"] .roadmap-detail__slider-label {
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .roadmap-detail__plant-btn {
        background: var(--color-accent-primary, #d4a84a);
        color: var(--color-text-on-accent, #2c2520);
      }

      [data-theme="midnight"] .roadmap-detail__plant-btn:hover:not(:disabled) {
        background: var(--color-accent-text, #e8c870);
      }

      [data-theme="midnight"] .roadmap-detail__remove-btn {
        border-color: var(--color-border-medium, rgba(215, 185, 145, 0.2));
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .roadmap-detail__remove-btn:hover:not(:disabled) {
        border-color: var(--color-semantic-error, #e07575);
        color: var(--color-semantic-error, #e07575);
        background: var(--color-semantic-error-glow, rgba(224, 117, 117, 0.12));
      }

      [data-theme="midnight"] .roadmap-panel__footer {
        border-color: var(--color-border-subtle, rgba(215, 185, 145, 0.12));
      }

      [data-theme="midnight"] .roadmap-panel__footer-text {
        color: var(--color-text-muted, #e8e2da);
      }

      /* Dark theme suggest button */
      [data-theme="midnight"] .roadmap-panel__suggest-btn {
        background: linear-gradient(135deg,
          var(--color-accent-primary, #d4a84a) 0%,
          var(--color-accent-text, #e8c870) 100%);
        color: var(--color-text-on-accent, #2c2520);
      }

      [data-theme="midnight"] .roadmap-panel__suggest-btn:disabled {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-muted, #e8e2da);
      }

      /* Dark theme recommendations */
      [data-theme="midnight"] .roadmap-panel__recommendations {
        background: linear-gradient(135deg,
          var(--color-accent-subtle, rgba(212, 168, 74, 0.08)) 0%,
          var(--color-accent-subtle, rgba(212, 168, 74, 0.04)) 100%);
        border-color: var(--color-accent-subtle, rgba(212, 168, 74, 0.15));
      }

      [data-theme="midnight"] .roadmap-panel__recommendations-title {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .roadmap-panel__recommendations-subtitle {
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .roadmap-recommendation {
        background: var(--color-background-tertiary, #685852);
        border-color: var(--color-border-subtle, rgba(215, 185, 145, 0.12));
      }

      [data-theme="midnight"] .roadmap-recommendation:hover {
        border-color: var(--color-accent-primary, #d4a84a);
      }

      [data-theme="midnight"] .roadmap-recommendation__badge {
        background: var(--color-accent-subtle, rgba(212, 168, 74, 0.12));
      }

      [data-theme="midnight"] .roadmap-recommendation__icon {
        color: var(--color-accent-text, #e8c870);
      }

      [data-theme="midnight"] .roadmap-recommendation__headline {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .roadmap-recommendation__reason {
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .roadmap-recommendation__cta {
        color: var(--color-accent-text, #e8c870);
      }

      [data-theme="midnight"] .roadmap-recommendation__dismiss {
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .roadmap-recommendation__dismiss:hover {
        background: var(--color-semantic-error-glow, rgba(224, 117, 117, 0.12));
        color: var(--color-semantic-error, #e07575);
      }

      /* Dark theme suggestion form */
      [data-theme="midnight"] .roadmap-suggestion__intro {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .roadmap-suggestion__label {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .roadmap-suggestion__input,
      [data-theme="midnight"] .roadmap-suggestion__textarea,
      [data-theme="midnight"] .roadmap-suggestion__select {
        background: var(--color-background-tertiary, #685852);
        border-color: var(--color-border-medium, rgba(215, 185, 145, 0.2));
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .roadmap-suggestion__input:focus,
      [data-theme="midnight"] .roadmap-suggestion__textarea:focus,
      [data-theme="midnight"] .roadmap-suggestion__select:focus {
        border-color: var(--color-accent-primary, #d4a84a);
        box-shadow: 0 0 0 3px var(--color-accent-subtle, rgba(212, 168, 74, 0.2));
      }

      [data-theme="midnight"] .roadmap-suggestion__input::placeholder,
      [data-theme="midnight"] .roadmap-suggestion__textarea::placeholder {
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .roadmap-suggestion__select {
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23e8e2da' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
      }

      [data-theme="midnight"] .roadmap-suggestion__char-count {
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .roadmap-suggestion__cost-notice {
        background: var(--color-accent-subtle, rgba(212, 168, 74, 0.12));
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .roadmap-suggestion__submit {
        background: var(--color-accent-primary, #d4a84a);
        color: var(--color-text-on-accent, #2c2520);
      }

      [data-theme="midnight"] .roadmap-suggestion__submit:hover:not(:disabled) {
        background: var(--color-accent-text, #e8c870);
      }

      /* Dark theme suggestion success */
      [data-theme="midnight"] .roadmap-suggestion__success-icon {
        background: var(--color-accent-subtle, rgba(212, 168, 74, 0.15));
      }

      [data-theme="midnight"] .roadmap-suggestion__success-title {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .roadmap-suggestion__success-text {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .roadmap-suggestion__done-btn {
        background: var(--color-accent-primary, #d4a84a);
        color: var(--color-text-on-accent, #2c2520);
      }

      [data-theme="midnight"] .roadmap-suggestion__done-btn:hover {
        background: var(--color-accent-text, #e8c870);
      }

      /* Dark theme stage colors */
      [data-theme="midnight"] .stage--seed {
        background: var(--color-background-secondary, #60504a);
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .stage--sprout {
        background: var(--color-accent-subtle, rgba(212, 168, 74, 0.08));
        color: var(--color-accent-text, #e8c870);
      }

      [data-theme="midnight"] .stage--bud {
        background: var(--color-semantic-warning-glow, rgba(224, 184, 96, 0.22));
        color: var(--color-semantic-warning, #e0b860);
      }

      [data-theme="midnight"] .stage--bloom {
        background: var(--color-semantic-success-glow, rgba(107, 196, 143, 0.22));
        color: var(--color-semantic-success, #6bc48f);
      }

      /* ========================================================================
         RESPONSIVE
         ======================================================================== */
      @media (max-width: clamp(336px, 90vw, 480px)) {
        .roadmap-panel {
          padding: 0;
          align-items: flex-end;
        }

        .roadmap-panel__card {
          max-height: 90vh;
          border-radius: var(--radius-2xl, 24px) var(--radius-2xl, 24px) 0 0;
          transform: translateY(100%);
        }

        .roadmap-panel--visible .roadmap-panel__card {
          transform: translateY(0);
        }

        .roadmap-panel__header {
          padding: var(--space-4, 16px);
        }

        .roadmap-panel__body {
          padding: var(--space-4, 16px);
        }
      }

      /* ========================================================================
         REDUCED MOTION
         ======================================================================== */
      @media (prefers-reduced-motion: reduce) {
        .roadmap-panel,
        .roadmap-panel__card,
        .roadmap-card {
          transition: none !important;
        }
      }
    `;

    document.head.appendChild(this.styleElement);
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.modal?.remove();
    this.styleElement?.remove();
    this.modal = null;
    this.styleElement = null;
    this.isVisible = false;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: RoadmapPanelUI | null = null;

export function getRoadmapPanelUI(): RoadmapPanelUI {
  if (!instance) {
    instance = new RoadmapPanelUI();
  }
  return instance;
}

export function showRoadmapPanel(featureId?: string): void {
  getRoadmapPanelUI().show(featureId);
}

export function hideRoadmapPanel(): void {
  getRoadmapPanelUI().hide();
}

export default RoadmapPanelUI;
