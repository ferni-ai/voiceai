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
import { roadmapService, STAGE_INFO, type RoadmapFeature } from '../services/roadmap.service.js';

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
};

// ============================================================================
// ROADMAP PANEL UI CLASS
// ============================================================================

class RoadmapPanelUI {
  private modal: HTMLElement | null = null;
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;

  /**
   * Show the roadmap panel, optionally highlighting a specific feature
   */
  show(featureId?: string): void {
    this.cleanup();
    this.injectStyles();
    this.createModal();

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

    this.modal.innerHTML = `
      <div class="roadmap-panel__backdrop"></div>
      <div class="roadmap-panel__card">
        <header class="roadmap-panel__header">
          <div class="roadmap-panel__header-content">
            <p class="roadmap-panel__eyebrow">${t('roadmap.eyebrow')}</p>
            <h2 class="roadmap-panel__title" id="roadmap-title">${t('roadmap.title')}</h2>
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
              <div class="roadmap-panel__legend-item">
                <span class="roadmap-panel__legend-emoji">${info.emoji}</span>
                <span class="roadmap-panel__legend-label">${info.label}</span>
              </div>
            `
              )
              .join('')}
          </div>

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
   * Render a feature card for the overview
   */
  private renderFeatureCard(feature: RoadmapFeature): string {
    const stageInfo = STAGE_INFO[feature.stage];
    const hasVoted = roadmapService.hasVoted(feature.id);
    const icon = ICONS[feature.icon] || ICONS.sparkles;

    return `
      <button class="roadmap-card" data-feature-id="${feature.id}" data-stage="${feature.stage}">
        <div class="roadmap-card__header">
          <div class="roadmap-card__icon">${icon}</div>
          <span class="roadmap-card__stage" style="color: ${stageInfo.color}">
            ${stageInfo.emoji} ${stageInfo.label}
          </span>
        </div>
        <h4 class="roadmap-card__headline">${feature.headline}</h4>
        <p class="roadmap-card__arrival">${feature.estimatedArrival}</p>
        ${
          feature.canVote
            ? `
          <div class="roadmap-card__interest">
            <span class="roadmap-card__heart ${hasVoted ? 'roadmap-card__heart--voted' : ''}">
              ${hasVoted ? ICONS.heartFilled : ICONS.heart}
            </span>
            <span class="roadmap-card__count">${this.formatNumber(feature.interestCount || 0)}</span>
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
    const hasVoted = roadmapService.hasVoted(feature.id);
    const icon = ICONS[feature.icon] || ICONS.sparkles;

    this.modal.innerHTML = `
      <div class="roadmap-panel__backdrop"></div>
      <div class="roadmap-panel__card roadmap-panel__card--detail">
        <header class="roadmap-panel__header">
          <button class="roadmap-panel__back" aria-label="${t('common.back')}">${ICONS.back}</button>
          <div class="roadmap-panel__header-content">
            <p class="roadmap-panel__eyebrow">${t('roadmap.eyebrow')}</p>
            <h2 class="roadmap-panel__title" id="roadmap-title">${feature.headline}</h2>
          </div>
          <button class="roadmap-panel__close" aria-label="${t('common.close')}">${ICONS.close}</button>
        </header>

        <div class="roadmap-panel__body">
          <!-- Feature Header -->
          <div class="roadmap-detail__header">
            <div class="roadmap-detail__icon" style="background: ${stageInfo.color}20; color: ${stageInfo.color}">
              ${icon}
            </div>
            <div class="roadmap-detail__stage" style="background: ${stageInfo.color}15; color: ${stageInfo.color}">
              ${stageInfo.emoji} ${stageInfo.label}
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

          <!-- Vote CTA -->
          ${
            feature.canVote
              ? `
            <div class="roadmap-detail__vote">
              <button class="roadmap-detail__vote-btn ${hasVoted ? 'roadmap-detail__vote-btn--voted' : ''}" data-vote="${feature.id}">
                <span class="roadmap-detail__vote-icon">${hasVoted ? ICONS.heartFilled : ICONS.heart}</span>
                <span class="roadmap-detail__vote-text">
                  ${hasVoted ? t('roadmap.voted') : t('roadmap.wantThis')}
                </span>
              </button>
              <p class="roadmap-detail__vote-count">
                ${t('roadmap.peopleExcited', { count: this.formatNumber(feature.interestCount || 0) })}
              </p>
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

    // Vote button
    const voteBtn = this.modal.querySelector('.roadmap-detail__vote-btn');
    if (voteBtn) {
      voteBtn.addEventListener('click', async () => {
        const hasVoted = roadmapService.hasVoted(feature.id);
        if (hasVoted) {
          await roadmapService.unvote(feature.id);
        } else {
          await roadmapService.vote(feature.id);
        }
        // Re-render to update UI
        this.renderFeatureDetail(feature);
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
        background: linear-gradient(180deg, rgba(44, 37, 32, 0.4) 0%, rgba(74, 103, 65, 0.3) 100%);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
      }

      /* Magical floating particles */
      .roadmap-panel__backdrop::before,
      .roadmap-panel__backdrop::after {
        content: '';
        position: absolute;
        border-radius: 50%;
        opacity: 0.4;
        animation: floatParticle 8s ease-in-out infinite;
      }

      .roadmap-panel__backdrop::before {
        width: 300px;
        height: 300px;
        background: radial-gradient(circle, rgba(74, 103, 65, 0.3) 0%, transparent 70%);
        top: 10%;
        left: -10%;
        animation-delay: 0s;
      }

      .roadmap-panel__backdrop::after {
        width: 200px;
        height: 200px;
        background: radial-gradient(circle, rgba(124, 179, 107, 0.3) 0%, transparent 70%);
        bottom: 20%;
        right: -5%;
        animation-delay: -4s;
      }

      @keyframes floatParticle {
        0%, 100% { transform: translate(0, 0) scale(1); }
        25% { transform: translate(20px, -30px) scale(1.1); }
        50% { transform: translate(-10px, 20px) scale(0.95); }
        75% { transform: translate(30px, 10px) scale(1.05); }
      }

      .roadmap-panel__card {
        position: relative;
        width: 100%;
        max-width: 600px;
        max-height: 85vh;
        background: linear-gradient(180deg, var(--color-background-elevated, #fffdfb) 0%, rgba(74, 103, 65, 0.03) 100%);
        border-radius: var(--radius-2xl, 24px);
        box-shadow: 
          0 25px 80px rgba(44, 37, 32, 0.25),
          0 10px 30px rgba(74, 103, 65, 0.15),
          inset 0 1px 0 rgba(255, 255, 255, 0.5);
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
        color: var(--persona-primary, #4a6741);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.1em);
        margin: 0 0 var(--space-1, 4px) 0;
        display: inline-flex;
        align-items: center;
        gap: var(--space-2, 8px);
      }

      .roadmap-panel__eyebrow::before {
        content: '🌱';
        font-size: 0.9em;
        animation: gentlePulse 2s ease-in-out infinite;
      }

      @keyframes gentlePulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.1); opacity: 0.8; }
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
        gap: var(--space-4, 16px);
        padding: var(--space-4, 16px);
        background: linear-gradient(135deg, var(--color-background-secondary, #f5f2ed) 0%, rgba(74, 103, 65, 0.05) 100%);
        border-radius: var(--radius-xl, 16px);
        margin-bottom: var(--space-6, 24px);
        justify-content: center;
      }

      .roadmap-panel__legend-item {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        padding: var(--space-1, 4px) var(--space-3, 12px);
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-full, 9999px);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
      }

      .roadmap-panel__legend-item:hover {
        transform: scale(1.05);
      }

      .roadmap-panel__legend-emoji {
        font-size: var(--text-sm, 0.875rem);
        line-height: 1;
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
        color: var(--persona-primary, #4a6741);
        margin: 0 0 var(--space-3, 12px) 0;
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
      }

      .roadmap-panel__section-title::before {
        content: '';
        width: 4px;
        height: 16px;
        background: linear-gradient(180deg, var(--persona-primary, #4a6741) 0%, var(--persona-secondary, #3d5a35) 100%);
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
         FEATURE CARDS (Overview) - Magical, inviting
         ======================================================================== */
      .roadmap-card {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
        padding: var(--space-4, 16px);
        background: linear-gradient(135deg, var(--color-background-elevated, #fffdfb) 0%, rgba(74, 103, 65, 0.02) 100%);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-lg, 12px);
        cursor: pointer;
        transition: all ${DURATION.SLOW}ms ${EASING.SPRING};
        text-align: left;
        position: relative;
        overflow: hidden;
      }

      /* Subtle shimmer effect on hover */
      .roadmap-card::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, transparent 40%, rgba(74, 103, 65, 0.08) 50%, transparent 60%);
        opacity: 0;
        transition: opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
      }

      .roadmap-card:hover {
        border-color: var(--persona-primary, #4a6741);
        box-shadow: 0 8px 32px rgba(74, 103, 65, 0.15);
        transform: translateY(-3px) scale(1.01);
      }

      .roadmap-card:hover::before {
        opacity: 1;
      }

      .roadmap-card__header {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        position: relative;
        z-index: 1;
      }

      .roadmap-card__icon {
        width: 40px;
        height: 40px;
        padding: 8px;
        background: linear-gradient(135deg, var(--persona-tint, rgba(74, 103, 65, 0.12)), rgba(74, 103, 65, 0.06));
        border-radius: var(--radius-lg, 12px);
        color: var(--persona-primary, #4a6741);
        transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
      }

      .roadmap-card:hover .roadmap-card__icon {
        transform: scale(1.1);
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
        background: rgba(74, 103, 65, 0.08);
      }

      .roadmap-card__headline {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0;
        line-height: 1.3;
        position: relative;
        z-index: 1;
      }

      .roadmap-card__arrival {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0;
        position: relative;
        z-index: 1;
      }

      .roadmap-card__interest {
        display: flex;
        align-items: center;
        gap: var(--space-1, 4px);
        margin-top: var(--space-1, 4px);
      }

      .roadmap-card__heart {
        width: 16px;
        height: 16px;
        color: var(--color-text-muted, #756a5e);
        transition: color ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .roadmap-card__heart--voted {
        color: var(--color-love, #e57373);
      }

      .roadmap-card__heart svg {
        width: 100%;
        height: 100%;
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
        color: var(--persona-primary, #4a6741);
      }

      .roadmap-detail__section {
        margin-bottom: var(--space-5, 20px);
      }

      .roadmap-detail__section--existing {
        padding: var(--space-4, 16px);
        background: linear-gradient(135deg, var(--persona-tint, rgba(74, 103, 65, 0.08)), transparent);
        border-radius: var(--radius-lg, 12px);
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
        content: '✦';
        color: var(--persona-primary, #4a6741);
        flex-shrink: 0;
      }

      .roadmap-detail__list--existing .roadmap-detail__list-item::before {
        content: none;
      }

      .roadmap-detail__check {
        width: 18px;
        height: 18px;
        color: var(--color-success, #4a6741);
        flex-shrink: 0;
      }

      .roadmap-detail__check svg {
        width: 100%;
        height: 100%;
      }

      /* ========================================================================
         VOTE CTA - Magical, engaging
         ======================================================================== */
      .roadmap-detail__vote {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-6, 24px);
        background: linear-gradient(180deg, var(--color-background-secondary, #f5f2ed) 0%, rgba(74, 103, 65, 0.05) 100%);
        border-radius: var(--radius-xl, 16px);
        text-align: center;
        position: relative;
        overflow: hidden;
      }

      /* Subtle glow behind vote section */
      .roadmap-detail__vote::before {
        content: '';
        position: absolute;
        top: -50%;
        left: 50%;
        transform: translateX(-50%);
        width: 200%;
        height: 100%;
        background: radial-gradient(ellipse, rgba(229, 115, 115, 0.08) 0%, transparent 70%);
        pointer-events: none;
      }

      .roadmap-detail__vote-btn {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        padding: var(--space-4, 16px) var(--space-6, 24px);
        background: var(--color-background-elevated, #fffdfb);
        border: 2px solid var(--color-border-medium, rgba(44, 37, 32, 0.12));
        border-radius: var(--radius-full, 9999px);
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        cursor: pointer;
        transition: all ${DURATION.MODERATE}ms ${EASING.SPRING};
        position: relative;
        z-index: 1;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      }

      .roadmap-detail__vote-btn:hover {
        border-color: var(--color-love, #e57373);
        background: linear-gradient(135deg, #fff 0%, rgba(229, 115, 115, 0.08) 100%);
        transform: scale(1.05);
        box-shadow: 0 8px 24px rgba(229, 115, 115, 0.2);
      }

      .roadmap-detail__vote-btn:active {
        transform: scale(0.98);
      }

      .roadmap-detail__vote-btn--voted {
        border-color: var(--color-love, #e57373);
        background: linear-gradient(135deg, rgba(229, 115, 115, 0.15) 0%, rgba(229, 115, 115, 0.08) 100%);
        color: var(--color-love, #c74a4a);
        box-shadow: 0 4px 16px rgba(229, 115, 115, 0.25);
      }

      .roadmap-detail__vote-icon {
        width: 22px;
        height: 22px;
        color: var(--color-love, #e57373);
        transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
      }

      .roadmap-detail__vote-btn:hover .roadmap-detail__vote-icon {
        transform: scale(1.2);
      }

      .roadmap-detail__vote-btn--voted .roadmap-detail__vote-icon {
        animation: heartPulse 0.6s ${EASING.SPRING};
      }

      @keyframes heartPulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.3); }
        100% { transform: scale(1); }
      }

      .roadmap-detail__vote-icon svg {
        width: 100%;
        height: 100%;
      }

      .roadmap-detail__vote-count {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted, #756a5e);
        margin: 0;
        position: relative;
        z-index: 1;
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
         DARK THEME
         ======================================================================== */
      [data-theme="midnight"] .roadmap-panel__backdrop {
        background: var(--backdrop-modal, rgba(0, 0, 0, 0.7));
      }

      [data-theme="midnight"] .roadmap-panel__card {
        background: var(--color-background-elevated, #70605a);
      }

      [data-theme="midnight"] .roadmap-panel__title {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .roadmap-panel__eyebrow {
        color: var(--color-accent-secondary, #7cb36b);
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
      }

      [data-theme="midnight"] .roadmap-panel__section-title {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .roadmap-card {
        background: var(--color-background-tertiary, #685852);
        border-color: var(--color-border-subtle, rgba(250, 246, 240, 0.1));
      }

      [data-theme="midnight"] .roadmap-card:hover {
        border-color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .roadmap-card__headline {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .roadmap-card__arrival,
      [data-theme="midnight"] .roadmap-card__count {
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .roadmap-detail__description {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .roadmap-detail__timeline {
        background: var(--color-background-tertiary, #685852);
      }

      [data-theme="midnight"] .roadmap-detail__section-title {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .roadmap-detail__list-item {
        color: var(--color-text-secondary, #f0ebe4);
        border-color: var(--color-border-subtle, rgba(250, 246, 240, 0.1));
      }

      [data-theme="midnight"] .roadmap-detail__vote {
        background: var(--color-background-tertiary, #685852);
      }

      [data-theme="midnight"] .roadmap-detail__vote-btn {
        background: var(--color-background-elevated, #70605a);
        border-color: var(--color-border-medium, rgba(250, 246, 240, 0.2));
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .roadmap-panel__footer-text {
        color: var(--color-text-muted, #e8e2da);
      }

      /* ========================================================================
         RESPONSIVE
         ======================================================================== */
      @media (max-width: 480px) {
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
