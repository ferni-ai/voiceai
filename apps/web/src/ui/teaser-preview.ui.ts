/**
 * Teaser Preview System
 *
 * Transforms empty states into forward-looking previews showing users
 * what their data WILL look like as their relationship with Ferni deepens.
 *
 * PHILOSOPHY:
 * Instead of "No data yet" → "This is what you'll see after 30 days"
 * Instead of empty charts → Populated preview with realistic dummy data
 * Instead of blank screens → Visual promise of what's coming
 *
 * FEATURES:
 * - Realistic dummy data for each visualization type
 * - "After X days" messaging based on relationship stage
 * - Subtle "preview" visual treatment (slight blur, badge)
 * - Smooth reveal animation when real data becomes available
 *
 * @module @ferni/teaser-preview
 */

import { DURATION, EASING } from '../config/animation-constants.js';
import { relationshipStageService } from '../services/relationship-stage.service.js';
import { createLogger } from '../utils/logger.js';
import { formatDate, t } from '../i18n/index.js';
import { tp } from '../i18n/plural.js';

const log = createLogger('TeaserPreviewUI');

// ============================================================================
// TYPES
// ============================================================================

export type TeaserType =
  | 'wellbeing'
  | 'patterns'
  | 'trust_insights'
  | 'life_context'
  | 'predictions'
  | 'team_insights'
  | 'memories'
  | 'your_people'
  | 'growth_analytics'
  | 'habits';

export interface TeaserConfig {
  type: TeaserType;
  daysUntilData?: number; // Override automatic calculation
  customMessage?: string;
}

interface TeaserContent {
  title: string;
  message: string;
  daysRequired: number;
  previewHtml: string;
}

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
};

// ============================================================================
// DUMMY DATA - Realistic previews for each visualization
// ============================================================================

const getTeaserContent = (): Record<TeaserType, TeaserContent> => ({
  wellbeing: {
    title: t('teaserPreview.wellbeing.title'),
    message: t('teaserPreview.wellbeing.message'),
    daysRequired: 7,
    previewHtml: `
      <div class="teaser-wellbeing">
        <div class="teaser-score-card">
          <div class="teaser-score-ring">
            <svg viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" fill="none" stroke="var(--color-border)" stroke-width="8"/>
              <circle cx="50" cy="50" r="40" fill="none" stroke="var(--persona-primary)" stroke-width="8" 
                      stroke-dasharray="220" stroke-dashoffset="55" stroke-linecap="round"/>
            </svg>
            <span class="teaser-score-value">7.5</span>
          </div>
          <span class="teaser-score-label">${t('teaserPreview.wellbeing.score')}</span>
        </div>
        <div class="teaser-metrics">
          <div class="teaser-metric">
            <span class="teaser-metric-icon">💪</span>
            <span class="teaser-metric-label">${t('wellbeing.energy')}</span>
            <div class="teaser-metric-bar"><div class="teaser-metric-fill" style="width: 72%"></div></div>
          </div>
          <div class="teaser-metric">
            <span class="teaser-metric-icon">😊</span>
            <span class="teaser-metric-label">${t('wellbeing.mood')}</span>
            <div class="teaser-metric-bar"><div class="teaser-metric-fill" style="width: 85%"></div></div>
          </div>
          <div class="teaser-metric">
            <span class="teaser-metric-icon">🧘</span>
            <span class="teaser-metric-label">${t('accessibility.calm')}</span>
            <div class="teaser-metric-bar"><div class="teaser-metric-fill" style="width: 68%"></div></div>
          </div>
        </div>
        <div class="teaser-trend">
          <svg viewBox="0 0 200 60" class="teaser-trend-chart">
            <path d="M0,45 Q25,50 50,35 T100,30 T150,20 T200,25" fill="none" 
                  stroke="var(--persona-primary)" stroke-width="2" opacity="0.8"/>
            <path d="M0,45 Q25,50 50,35 T100,30 T150,20 T200,25 L200,60 L0,60 Z" 
                  fill="var(--persona-tint)" opacity="0.3"/>
          </svg>
          <span class="teaser-trend-label">${t('teaserPreview.wellbeing.trend')}</span>
        </div>
      </div>
    `,
  },

  patterns: {
    title: t('teaserPreview.patterns.title'),
    message: t('teaserPreview.patterns.message'),
    daysRequired: 14,
    previewHtml: `
      <div class="teaser-patterns">
        <div class="teaser-pattern-card">
          <span class="teaser-pattern-type">${t('accessibility.emotional')}</span>
          <p class="teaser-pattern-insight">${t('teaserPreview.patterns.insightAnxious')}</p>
          <span class="teaser-pattern-frequency">${tp('teaserPreview.patterns.observed', 8)}</span>
        </div>
        <div class="teaser-pattern-card">
          <span class="teaser-pattern-type">${t('teaserPreview.patterns.behavioral')}</span>
          <p class="teaser-pattern-insight">${t('teaserPreview.patterns.insightRoutine')}</p>
          <span class="teaser-pattern-frequency">${tp('teaserPreview.patterns.observed', 5)}</span>
        </div>
        <div class="teaser-pattern-card teaser-pattern-card--faded">
          <span class="teaser-pattern-type">${t('accessibility.success')}</span>
          <p class="teaser-pattern-insight">${t('teaserPreview.patterns.insightReading')}</p>
          <span class="teaser-pattern-frequency">${tp('teaserPreview.patterns.observed', 3)}</span>
        </div>
      </div>
    `,
  },

  trust_insights: {
    title: t('teaserPreview.trust.title'),
    message: t('teaserPreview.trust.message'),
    daysRequired: 7,
    previewHtml: `
      <div class="teaser-trust">
        <div class="teaser-trust-stats">
          <div class="teaser-trust-stat">
            <span class="teaser-trust-stat-value">12</span>
            <span class="teaser-trust-stat-label">${t('teaserPreview.trust.growthMoments')}</span>
          </div>
          <div class="teaser-trust-stat">
            <span class="teaser-trust-stat-value">8</span>
            <span class="teaser-trust-stat-label">${t('teaserPreview.trust.winsCelebrated')}</span>
          </div>
          <div class="teaser-trust-stat">
            <span class="teaser-trust-stat-value">5</span>
            <span class="teaser-trust-stat-label">${t('teaserPreview.trust.boundariesHonored')}</span>
          </div>
        </div>
        <div class="teaser-trust-growth">
          <span class="teaser-trust-growth-title">${t('teaserPreview.trust.howYouveGrown')}</span>
          <div class="teaser-trust-tags">
            <span class="teaser-trust-tag">${t('teaserPreview.trust.tagEmotions')}</span>
            <span class="teaser-trust-tag">${t('teaserPreview.trust.tagBoundaries')}</span>
            <span class="teaser-trust-tag">${t('teaserPreview.trust.tagHelp')}</span>
          </div>
        </div>
      </div>
    `,
  },

  life_context: {
    title: t('teaserPreview.life.title'),
    message: t('teaserPreview.life.message'),
    daysRequired: 14,
    previewHtml: `
      <div class="teaser-life">
        <div class="teaser-life-domains">
          <div class="teaser-life-domain">
            <span class="teaser-life-domain-icon">💼</span>
            <span class="teaser-life-domain-name">${t('yourPeople.groups.work')}</span>
            <div class="teaser-life-domain-level" style="--level: 65%">
              <div class="teaser-life-domain-fill"></div>
            </div>
            <span class="teaser-life-domain-status">${t('teaserPreview.life.moderateStress')}</span>
          </div>
          <div class="teaser-life-domain">
            <span class="teaser-life-domain-icon">❤️</span>
            <span class="teaser-life-domain-name">${t('lifeContext.domains.relationships')}</span>
            <div class="teaser-life-domain-level" style="--level: 82%">
              <div class="teaser-life-domain-fill"></div>
            </div>
            <span class="teaser-life-domain-status">${t('teaserPreview.life.feelingConnected')}</span>
          </div>
          <div class="teaser-life-domain">
            <span class="teaser-life-domain-icon">🏃</span>
            <span class="teaser-life-domain-name">${t('trustDashboard.health')}</span>
            <div class="teaser-life-domain-level" style="--level: 70%">
              <div class="teaser-life-domain-fill"></div>
            </div>
            <span class="teaser-life-domain-status">${t('teaserPreview.life.roomToGrow')}</span>
          </div>
        </div>
        <div class="teaser-life-insight">
          <span class="teaser-life-insight-icon">${ICONS.sparkle}</span>
          <p>${t('teaserPreview.life.insight')}</p>
        </div>
      </div>
    `,
  },

  predictions: {
    title: t('teaserPreview.predictions.title'),
    message: t('teaserPreview.predictions.message'),
    daysRequired: 21,
    previewHtml: `
      <div class="teaser-predictions">
        <div class="teaser-prediction-card teaser-prediction--accurate">
          <span class="teaser-prediction-status">✓ ${t('predictions.accurate')}</span>
          <p class="teaser-prediction-text">${t('teaserPreview.predictions.guessOverwhelmed')}</p>
          <span class="teaser-prediction-result">${t('teaserPreview.predictions.resultStress')}</span>
        </div>
        <div class="teaser-prediction-card teaser-prediction--accurate">
          <span class="teaser-prediction-status">✓ ${t('predictions.accurate')}</span>
          <p class="teaser-prediction-text">${t('teaserPreview.predictions.guessGym')}</p>
          <span class="teaser-prediction-result">${tp('teaserPreview.predictions.skipped', 2)}</span>
        </div>
        <div class="teaser-prediction-card teaser-prediction--pending">
          <span class="teaser-prediction-status">⏳ ${t('predictions.watching')}</span>
          <p class="teaser-prediction-text">${t('teaserPreview.predictions.guessSunday')}</p>
          <span class="teaser-prediction-result">${t('teaserPreview.predictions.resultCheckIn')}</span>
        </div>
        <div class="teaser-prediction-accuracy">
          <span class="teaser-prediction-accuracy-value">78%</span>
          <span class="teaser-prediction-accuracy-label">${t('predictions.accuracy')}</span>
        </div>
      </div>
    `,
  },

  team_insights: {
    title: t('teaserPreview.team.title'),
    message: t('teaserPreview.team.message'),
    daysRequired: 14,
    previewHtml: `
      <div class="teaser-team-insights">
        <div class="teaser-team-insight">
          <div class="teaser-team-avatar teaser-team-avatar--maya"></div>
          <div class="teaser-team-insight-content">
            <span class="teaser-team-name">${t('team.members.maya.name')}</span>
            <p>${t('teaserPreview.team.insightMaya')}</p>
          </div>
        </div>
        <div class="teaser-team-insight">
          <div class="teaser-team-avatar teaser-team-avatar--peter"></div>
          <div class="teaser-team-insight-content">
            <span class="teaser-team-name">${t('team.members.peter.name')}</span>
            <p>${t('teaserPreview.team.insightPeter')}</p>
          </div>
        </div>
        <div class="teaser-team-insight teaser-team-insight--faded">
          <div class="teaser-team-avatar teaser-team-avatar--nayan"></div>
          <div class="teaser-team-insight-content">
            <span class="teaser-team-name">${t('team.members.nayan.name')}</span>
            <p>${t('teaserPreview.team.insightNayan')}</p>
          </div>
        </div>
      </div>
    `,
  },

  memories: {
    title: t('teaserPreview.memories.title'),
    message: t('teaserPreview.memories.message'),
    daysRequired: 7,
    previewHtml: `
      <div class="teaser-memories">
        <div class="teaser-memory-card">
          <span class="teaser-memory-date">${formatDate(new Date(2000, 11, 15), { month: 'short', day: 'numeric' })}</span>
          <span class="teaser-memory-type">${t('accessibility.breakthrough')}</span>
          <p class="teaser-memory-content">${t('teaserPreview.memories.contentPerfectionism')}</p>
          <span class="teaser-memory-persona">${t('logMoment.withContact', { name: t('team.members.ferni.name') })}</span>
        </div>
        <div class="teaser-memory-card">
          <span class="teaser-memory-date">${formatDate(new Date(2000, 11, 12), { month: 'short', day: 'numeric' })}</span>
          <span class="teaser-memory-type">${t('teaserPreview.memories.win')}</span>
          <p class="teaser-memory-content">${t('teaserPreview.memories.contentManager')}</p>
          <span class="teaser-memory-persona">${t('logMoment.withContact', { name: t('team.members.alex.name') })}</span>
        </div>
        <div class="teaser-memory-card teaser-memory-card--faded">
          <span class="teaser-memory-date">${formatDate(new Date(2000, 11, 8), { month: 'short', day: 'numeric' })}</span>
          <span class="teaser-memory-type">${t('memoryThreads.nodeTypes.commitment')}</span>
          <p class="teaser-memory-content">${t('teaserPreview.memories.contentMom')}</p>
          <span class="teaser-memory-persona">${t('logMoment.withContact', { name: t('team.members.ferni.name') })}</span>
        </div>
      </div>
    `,
  },

  your_people: {
    title: t('teaserPreview.people.title'),
    message: t('teaserPreview.people.message'),
    daysRequired: 14,
    previewHtml: `
      <div class="teaser-people">
        <div class="teaser-person-card">
          <div class="teaser-person-avatar">${t('teaserPreview.people.sarah').charAt(0)}</div>
          <div class="teaser-person-info">
            <span class="teaser-person-name">${t('teaserPreview.people.sarah')}</span>
            <span class="teaser-person-relation">${tp('teaserPreview.people.mentioned', 12, { relation: t('addPerson.relationships.friend') })}</span>
            <span class="teaser-person-sentiment teaser-person-sentiment--positive">${t('teaserPreview.people.joy')}</span>
          </div>
        </div>
        <div class="teaser-person-card">
          <div class="teaser-person-avatar">${t('teaserPreview.people.mom').charAt(0)}</div>
          <div class="teaser-person-info">
            <span class="teaser-person-name">${t('teaserPreview.people.mom')}</span>
            <span class="teaser-person-relation">${tp('teaserPreview.people.mentioned', 8, { relation: t('addPerson.relationships.family') })}</span>
            <span class="teaser-person-sentiment teaser-person-sentiment--mixed">${t('teaserPreview.people.complex')}</span>
          </div>
        </div>
        <div class="teaser-person-card teaser-person-card--faded">
          <div class="teaser-person-avatar">${t('teaserPreview.people.david').charAt(0)}</div>
          <div class="teaser-person-info">
            <span class="teaser-person-name">${t('teaserPreview.people.david')}</span>
            <span class="teaser-person-relation">${t('teaserPreview.people.lastMentioned', { relation: t('addPerson.relationships.friend'), when: t('common.daysAgo', { count: 30 }) })}</span>
            <span class="teaser-person-sentiment teaser-person-sentiment--check">${t('teaserPreview.people.reconnect')}</span>
          </div>
        </div>
      </div>
    `,
  },

  growth_analytics: {
    title: t('teaserPreview.growth.title'),
    message: t('teaserPreview.growth.message'),
    daysRequired: 14,
    previewHtml: `
      <div class="teaser-analytics">
        <div class="teaser-analytics-chart">
          <svg viewBox="0 0 300 120" class="teaser-chart">
            <defs>
              <linearGradient id="growthGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color: var(--persona-text); stop-opacity: 0.3"/>
                <stop offset="100%" style="stop-color: var(--persona-text); stop-opacity: 0"/>
              </linearGradient>
            </defs>
            <path d="M0,100 Q50,95 75,80 T150,60 T225,40 T300,30" fill="none" 
                  stroke="var(--persona-primary)" stroke-width="3" stroke-linecap="round"/>
            <path d="M0,100 Q50,95 75,80 T150,60 T225,40 T300,30 L300,120 L0,120 Z" 
                  fill="url(#growthGradient)"/>
          </svg>
          <div class="teaser-chart-labels">
            ${[1, 2, 3, 4].map((n) => `<span>${t('teaserPreview.growth.week', { number: n })}</span>`).join('')}
          </div>
        </div>
        <div class="teaser-analytics-stats">
          <div class="teaser-analytics-stat">
            <span class="teaser-analytics-stat-value">↑ 23%</span>
            <span class="teaser-analytics-stat-label">${t('trustJourney.growthTypes.self_awareness')}</span>
          </div>
          <div class="teaser-analytics-stat">
            <span class="teaser-analytics-stat-value">↑ 18%</span>
            <span class="teaser-analytics-stat-label">${t('teaserPreview.growth.consistency')}</span>
          </div>
          <div class="teaser-analytics-stat">
            <span class="teaser-analytics-stat-value">↑ 31%</span>
            <span class="teaser-analytics-stat-label">${t('teaserPreview.growth.followThrough')}</span>
          </div>
        </div>
      </div>
    `,
  },

  habits: {
    title: t('teaserPreview.habits.title'),
    message: t('teaserPreview.habits.message'),
    daysRequired: 7,
    previewHtml: `
      <div class="teaser-habits">
        <div class="teaser-habit-card">
          <div class="teaser-habit-info">
            <span class="teaser-habit-name">${t('teaserPreview.habits.morningWalk')}</span>
            <span class="teaser-habit-streak">🔥 ${tp('moments.streakTitle', 12)}</span>
          </div>
          <div class="teaser-habit-calendar">
            ${Array.from({ length: 7 }, (_, i) => {
              const filled = i < 5 || i === 6;
              return `<div class="teaser-habit-day ${filled ? 'teaser-habit-day--done' : ''}"></div>`;
            }).join('')}
          </div>
        </div>
        <div class="teaser-habit-card">
          <div class="teaser-habit-info">
            <span class="teaser-habit-name">${t('teaserPreview.habits.readBeforeBed')}</span>
            <span class="teaser-habit-streak">🌱 ${tp('moments.streakTitle', 5)}</span>
          </div>
          <div class="teaser-habit-calendar">
            ${Array.from({ length: 7 }, (_, i) => {
              const filled = i >= 2;
              return `<div class="teaser-habit-day ${filled ? 'teaser-habit-day--done' : ''}"></div>`;
            }).join('')}
          </div>
        </div>
        <div class="teaser-habit-card teaser-habit-card--at-risk">
          <div class="teaser-habit-info">
            <span class="teaser-habit-name">${t('teaserPreview.habits.meditation')}</span>
            <span class="teaser-habit-streak">⚠️ ${t('accessibility.needsAttention')}</span>
          </div>
          <div class="teaser-habit-calendar">
            ${Array.from({ length: 7 }, (_, i) => {
              const filled = i === 0 || i === 1 || i === 5;
              return `<div class="teaser-habit-day ${filled ? 'teaser-habit-day--done' : ''}"></div>`;
            }).join('')}
          </div>
        </div>
      </div>
    `,
  },
});

// ============================================================================
// TEASER PREVIEW CLASS
// ============================================================================

export class TeaserPreviewUI {
  private styleInjected = false;

  /**
   * Create a teaser preview element
   */
  create(config: TeaserConfig): HTMLElement {
    const content = getTeaserContent()[config.type];
    if (!content) {
      log.warn(`Unknown teaser type: ${config.type}`);
      return document.createElement('div');
    }

    const metrics = relationshipStageService.getMetrics();
    const daysToGo = Math.max(0, content.daysRequired - metrics.daysSinceFirstMeeting);
    const isUnlocked = daysToGo === 0;

    const element = document.createElement('div');
    element.className = `teaser-preview teaser-preview--${config.type}`;
    element.setAttribute('role', 'region');
    element.setAttribute('aria-label', t('teaserPreview.ariaLabel', { title: content.title }));

    element.innerHTML = `
      <div class="teaser-header">
        <div class="teaser-badge">
          <span class="teaser-badge-icon">${ICONS.eye}</span>
          <span class="teaser-badge-text">${t('accessibility.preview')}</span>
        </div>
        <h3 class="teaser-title">${content.title}</h3>
        <p class="teaser-message">${config.customMessage || content.message}</p>
        ${!isUnlocked ? `
          <div class="teaser-unlock-hint">
            <span class="teaser-unlock-icon">${ICONS.sparkle}</span>
            <span class="teaser-unlock-text">
              ${daysToGo === 1 ? t('teaserPreview.unlockTomorrow') : tp('teaserPreview.unlockDays', daysToGo)}
            </span>
          </div>
        ` : ''}
      </div>
      <div class="teaser-content ${isUnlocked ? '' : 'teaser-content--preview'}">
        ${content.previewHtml}
      </div>
      <div class="teaser-footer">
        <p class="teaser-cta">${t('predictions.keepTalking')}</p>
      </div>
    `;

    this.injectStyles();
    this.animateIn(element);

    return element;
  }

  /**
   * Show teaser in a container (replaces content)
   */
  showIn(container: HTMLElement, config: TeaserConfig): HTMLElement {
    container.innerHTML = '';
    const teaser = this.create(config);
    container.appendChild(teaser);
    return teaser;
  }

  /**
   * Quick helpers for each type
   */
  wellbeing(): HTMLElement {
    return this.create({ type: 'wellbeing' });
  }

  patterns(): HTMLElement {
    return this.create({ type: 'patterns' });
  }

  trustInsights(): HTMLElement {
    return this.create({ type: 'trust_insights' });
  }

  lifeContext(): HTMLElement {
    return this.create({ type: 'life_context' });
  }

  predictions(): HTMLElement {
    return this.create({ type: 'predictions' });
  }

  teamInsights(): HTMLElement {
    return this.create({ type: 'team_insights' });
  }

  memories(): HTMLElement {
    return this.create({ type: 'memories' });
  }

  yourPeople(): HTMLElement {
    return this.create({ type: 'your_people' });
  }

  growthAnalytics(): HTMLElement {
    return this.create({ type: 'growth_analytics' });
  }

  habits(): HTMLElement {
    return this.create({ type: 'habits' });
  }

  // ============================================================================
  // ANIMATIONS
  // ============================================================================

  private animateIn(element: HTMLElement): void {
    element.style.opacity = '0';
    element.style.transform = 'translateY(10px)';

    requestAnimationFrame(() => {
      element.style.transition = `opacity ${DURATION.SLOW}ms ${EASING.GENTLE}, transform ${DURATION.SLOW}ms ${EASING.GENTLE}`;
      element.style.opacity = '1';
      element.style.transform = 'translateY(0)';
    });

    // Stagger-animate preview cards
    const cards = element.querySelectorAll(
      '.teaser-pattern-card, .teaser-memory-card, .teaser-person-card, .teaser-habit-card, .teaser-team-insight, .teaser-prediction-card'
    );
    cards.forEach((card, i) => {
      const el = card as HTMLElement;
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';

      setTimeout(() => {
        el.style.transition = `opacity ${DURATION.NORMAL}ms ${EASING.SPRING}, transform ${DURATION.NORMAL}ms ${EASING.SPRING}`;
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, DURATION.SLOW + i * 80);
    });
  }

  // ============================================================================
  // STYLES
  // ============================================================================

  private injectStyles(): void {
    if (this.styleInjected || document.getElementById('teaser-preview-styles')) return;
    this.styleInjected = true;

    const style = document.createElement('style');
    style.id = 'teaser-preview-styles';
    style.textContent = `
      /* ============================================
         TEASER PREVIEW SYSTEM
         Forward-looking visualizations
      ============================================ */

      .teaser-preview {
        padding: var(--space-4);
        border-radius: var(--radius-lg, 12px);
        background: var(--color-background-elevated, #FFFDFB);
        border: 1px solid var(--color-border, rgba(0,0,0,0.08));
      }

      .teaser-header {
        text-align: center;
        margin-bottom: var(--space-4);
      }

      .teaser-badge {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        padding: var(--space-1) var(--space-3);
        background: var(--persona-tint, rgba(74, 103, 65, 0.1));
        border-radius: var(--radius-full, 9999px);
        margin-bottom: var(--space-2);
      }

      .teaser-badge-icon {
        width: 14px;
        height: 14px;
        color: var(--persona-primary, #4a6741);
      }

      .teaser-badge-icon svg {
        width: 100%;
        height: 100%;
      }

      .teaser-badge-text {
        font-size: 0.65rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--persona-primary, #4a6741);
      }

      .teaser-title {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
        margin: 0 0 var(--space-1);
      }

      .teaser-message {
        font-size: 0.85rem;
        color: var(--color-text-secondary, #5a4a3a);
        margin: 0;
        line-height: 1.4;
      }

      .teaser-unlock-hint {
        display: inline-flex;
        align-items: center;
        gap: var(--space-1);
        margin-top: var(--space-2);
        padding: var(--space-2) var(--space-3);
        background: var(--color-background-subtle, rgba(0,0,0,0.03));
        border-radius: var(--radius-md, 8px);
      }

      .teaser-unlock-icon {
        width: 14px;
        height: 14px;
        color: var(--color-text-muted, #7a6a5a);
      }

      .teaser-unlock-icon svg {
        width: 100%;
        height: 100%;
      }

      .teaser-unlock-text {
        font-size: 0.75rem;
        color: var(--color-text-muted, #7a6a5a);
      }

      .teaser-content {
        position: relative;
        margin-bottom: var(--space-4);
      }

      .teaser-content--preview {
        position: relative;
      }

      .teaser-content--preview::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
          to bottom,
          transparent 0%,
          transparent 60%,
          var(--color-background-elevated, #FFFDFB) 100%
        );
        pointer-events: none;
        border-radius: var(--radius-md, 8px);
      }

      .teaser-footer {
        text-align: center;
        border-top: 1px solid var(--color-border, rgba(0,0,0,0.05));
        padding-top: var(--space-3);
      }

      .teaser-cta {
        font-size: 0.8rem;
        font-style: italic;
        color: var(--color-text-muted, #7a6a5a);
        margin: 0;
      }

      /* ==================== WELLBEING TEASER ==================== */

      .teaser-wellbeing {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        padding: var(--space-3);
        background: var(--color-background-subtle, rgba(0,0,0,0.02));
        border-radius: var(--radius-md, 8px);
      }

      .teaser-score-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--space-2);
      }

      .teaser-score-ring {
        position: relative;
        width: 80px;
        height: 80px;
      }

      .teaser-score-ring svg {
        transform: rotate(-90deg);
      }

      .teaser-score-value {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--persona-primary, #4a6741);
      }

      .teaser-score-label {
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--color-text-muted, #7a6a5a);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .teaser-metrics {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .teaser-metric {
        display: flex;
        align-items: center;
        gap: var(--space-2);
      }

      .teaser-metric-icon {
        font-size: 1rem;
      }

      .teaser-metric-label {
        font-size: 0.75rem;
        color: var(--color-text-secondary, #5a4a3a);
        width: 50px;
      }

      .teaser-metric-bar {
        flex: 1;
        height: 6px;
        background: var(--color-border, rgba(0,0,0,0.1));
        border-radius: var(--radius-full, 9999px);
        overflow: hidden;
      }

      .teaser-metric-fill {
        height: 100%;
        background: var(--persona-primary, #4a6741);
        border-radius: var(--radius-full, 9999px);
      }

      .teaser-trend {
        text-align: center;
      }

      .teaser-trend-chart {
        width: 100%;
        height: 40px;
      }

      .teaser-trend-label {
        font-size: 0.7rem;
        color: var(--color-text-muted, #7a6a5a);
      }

      /* ==================== PATTERNS TEASER ==================== */

      .teaser-patterns {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .teaser-pattern-card {
        padding: var(--space-3);
        background: var(--color-background-subtle, rgba(0,0,0,0.02));
        border-radius: var(--radius-md, 8px);
        border-left: 3px solid var(--persona-primary, #4a6741);
      }

      .teaser-pattern-card--faded {
        opacity: 0.6;
      }

      .teaser-pattern-type {
        font-size: 0.65rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--color-text-muted, #7a6a5a);
      }

      .teaser-pattern-insight {
        font-size: 0.85rem;
        font-style: italic;
        color: var(--color-text-primary, #2C2520);
        margin: var(--space-1) 0;
        line-height: 1.4;
      }

      .teaser-pattern-frequency {
        font-size: 0.7rem;
        color: var(--color-text-muted, #7a6a5a);
      }

      /* ==================== TRUST INSIGHTS TEASER ==================== */

      .teaser-trust {
        padding: var(--space-3);
        background: var(--color-background-subtle, rgba(0,0,0,0.02));
        border-radius: var(--radius-md, 8px);
      }

      .teaser-trust-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-3);
        margin-bottom: var(--space-4);
      }

      .teaser-trust-stat {
        text-align: center;
      }

      .teaser-trust-stat-value {
        display: block;
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--persona-primary, #4a6741);
      }

      .teaser-trust-stat-label {
        font-size: 0.65rem;
        color: var(--color-text-muted, #7a6a5a);
      }

      .teaser-trust-growth-title {
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--color-text-secondary, #5a4a3a);
        display: block;
        margin-bottom: var(--space-2);
      }

      .teaser-trust-tags {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1);
      }

      .teaser-trust-tag {
        padding: var(--space-1) var(--space-2);
        background: var(--persona-tint, rgba(74, 103, 65, 0.1));
        border-radius: var(--radius-sm, 4px);
        font-size: 0.7rem;
        color: var(--persona-primary, #4a6741);
      }

      /* ==================== LIFE CONTEXT TEASER ==================== */

      .teaser-life {
        padding: var(--space-3);
        background: var(--color-background-subtle, rgba(0,0,0,0.02));
        border-radius: var(--radius-md, 8px);
      }

      .teaser-life-domains {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        margin-bottom: var(--space-3);
      }

      .teaser-life-domain {
        display: grid;
        grid-template-columns: auto 1fr auto;
        align-items: center;
        gap: var(--space-2);
      }

      .teaser-life-domain-icon {
        font-size: 1.25rem;
      }

      .teaser-life-domain-name {
        font-size: 0.8rem;
        font-weight: 500;
        color: var(--color-text-primary, #2C2520);
      }

      .teaser-life-domain-level {
        width: 80px;
        height: 6px;
        background: var(--color-border, rgba(0,0,0,0.1));
        border-radius: var(--radius-full, 9999px);
        overflow: hidden;
      }

      .teaser-life-domain-fill {
        height: 100%;
        width: var(--level);
        background: var(--persona-primary, #4a6741);
        border-radius: var(--radius-full, 9999px);
      }

      .teaser-life-domain-status {
        font-size: 0.7rem;
        color: var(--color-text-muted, #7a6a5a);
        grid-column: 2 / -1;
      }

      .teaser-life-insight {
        display: flex;
        align-items: flex-start;
        gap: var(--space-2);
        padding: var(--space-2);
        background: var(--persona-tint, rgba(74, 103, 65, 0.05));
        border-radius: var(--radius-sm, 4px);
      }

      .teaser-life-insight-icon {
        width: 16px;
        height: 16px;
        color: var(--persona-primary, #4a6741);
        flex-shrink: 0;
      }

      .teaser-life-insight-icon svg {
        width: 100%;
        height: 100%;
      }

      .teaser-life-insight p {
        font-size: 0.8rem;
        font-style: italic;
        color: var(--color-text-secondary, #5a4a3a);
        margin: 0;
        line-height: 1.4;
      }

      /* ==================== PREDICTIONS TEASER ==================== */

      .teaser-predictions {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .teaser-prediction-card {
        padding: var(--space-3);
        background: var(--color-background-subtle, rgba(0,0,0,0.02));
        border-radius: var(--radius-md, 8px);
      }

      .teaser-prediction--accurate {
        border-left: 3px solid var(--persona-primary, #4a6741);
      }

      .teaser-prediction--pending {
        border-left: 3px solid var(--color-text-muted, #7a6a5a);
        opacity: 0.7;
      }

      .teaser-prediction-status {
        font-size: 0.65rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--persona-primary, #4a6741);
      }

      .teaser-prediction--pending .teaser-prediction-status {
        color: var(--color-text-muted, #7a6a5a);
      }

      .teaser-prediction-text {
        font-size: 0.85rem;
        font-style: italic;
        color: var(--color-text-primary, #2C2520);
        margin: var(--space-1) 0;
      }

      .teaser-prediction-result {
        font-size: 0.7rem;
        color: var(--color-text-muted, #7a6a5a);
      }

      .teaser-prediction-accuracy {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: var(--space-3);
        background: var(--persona-tint, rgba(74, 103, 65, 0.1));
        border-radius: var(--radius-md, 8px);
      }

      .teaser-prediction-accuracy-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--persona-primary, #4a6741);
      }

      .teaser-prediction-accuracy-label {
        font-size: 0.7rem;
        color: var(--color-text-muted, #7a6a5a);
      }

      /* ==================== TEAM INSIGHTS TEASER ==================== */

      .teaser-team-insights {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .teaser-team-insight {
        display: flex;
        gap: var(--space-3);
        padding: var(--space-3);
        background: var(--color-background-subtle, rgba(0,0,0,0.02));
        border-radius: var(--radius-md, 8px);
      }

      .teaser-team-insight--faded {
        opacity: 0.5;
      }

      .teaser-team-avatar {
        width: 36px;
        height: 36px;
        border-radius: var(--radius-full, 9999px);
        flex-shrink: 0;
      }

      .teaser-team-avatar--maya { background: var(--color-maya, #a67a6a); }
      .teaser-team-avatar--peter { background: var(--color-peter, #3a6b73); }
      .teaser-team-avatar--nayan { background: var(--color-nayan, #b8956a); }

      .teaser-team-insight-content {
        flex: 1;
        min-width: 0;
      }

      .teaser-team-name {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
        display: block;
        margin-bottom: var(--space-1);
      }

      .teaser-team-insight-content p {
        font-size: 0.8rem;
        color: var(--color-text-secondary, #5a4a3a);
        margin: 0;
        line-height: 1.4;
      }

      /* ==================== MEMORIES TEASER ==================== */

      .teaser-memories {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .teaser-memory-card {
        padding: var(--space-3);
        background: var(--color-background-subtle, rgba(0,0,0,0.02));
        border-radius: var(--radius-md, 8px);
      }

      .teaser-memory-card--faded {
        opacity: 0.5;
      }

      .teaser-memory-date {
        font-size: 0.65rem;
        color: var(--color-text-muted, #7a6a5a);
      }

      .teaser-memory-type {
        font-size: 0.65rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--persona-primary, #4a6741);
        margin-left: var(--space-2);
      }

      .teaser-memory-content {
        font-size: 0.85rem;
        font-style: italic;
        color: var(--color-text-primary, #2C2520);
        margin: var(--space-1) 0;
        line-height: 1.4;
      }

      .teaser-memory-persona {
        font-size: 0.7rem;
        color: var(--color-text-muted, #7a6a5a);
      }

      /* ==================== YOUR PEOPLE TEASER ==================== */

      .teaser-people {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .teaser-person-card {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3);
        background: var(--color-background-subtle, rgba(0,0,0,0.02));
        border-radius: var(--radius-md, 8px);
      }

      .teaser-person-card--faded {
        opacity: 0.5;
      }

      .teaser-person-avatar {
        width: 40px;
        height: 40px;
        border-radius: var(--radius-full, 9999px);
        background: var(--persona-primary, #4a6741);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 1rem;
        flex-shrink: 0;
      }

      .teaser-person-info {
        flex: 1;
        min-width: 0;
      }

      .teaser-person-name {
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--color-text-primary, #2C2520);
        display: block;
      }

      .teaser-person-relation {
        font-size: 0.7rem;
        color: var(--color-text-muted, #7a6a5a);
        display: block;
        margin: var(--space-1) 0;
      }

      .teaser-person-sentiment {
        font-size: 0.7rem;
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-sm, 4px);
        display: inline-block;
      }

      .teaser-person-sentiment--positive {
        background: rgba(74, 103, 65, 0.1);
        color: var(--persona-primary, #4a6741);
      }

      .teaser-person-sentiment--mixed {
        background: rgba(180, 149, 106, 0.15);
        color: #9a7a52;
      }

      .teaser-person-sentiment--check {
        background: rgba(58, 107, 115, 0.1);
        color: var(--color-peter, #3a6b73);
      }

      /* ==================== GROWTH ANALYTICS TEASER ==================== */

      .teaser-analytics {
        padding: var(--space-3);
        background: var(--color-background-subtle, rgba(0,0,0,0.02));
        border-radius: var(--radius-md, 8px);
      }

      .teaser-analytics-chart {
        margin-bottom: var(--space-3);
      }

      .teaser-chart {
        width: 100%;
        height: 80px;
      }

      .teaser-chart-labels {
        display: flex;
        justify-content: space-between;
        font-size: 0.65rem;
        color: var(--color-text-muted, #7a6a5a);
        margin-top: var(--space-1);
      }

      .teaser-analytics-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-2);
      }

      .teaser-analytics-stat {
        text-align: center;
      }

      .teaser-analytics-stat-value {
        display: block;
        font-size: 1rem;
        font-weight: 700;
        color: var(--persona-primary, #4a6741);
      }

      .teaser-analytics-stat-label {
        font-size: 0.65rem;
        color: var(--color-text-muted, #7a6a5a);
      }

      /* ==================== HABITS TEASER ==================== */

      .teaser-habits {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .teaser-habit-card {
        padding: var(--space-3);
        background: var(--color-background-subtle, rgba(0,0,0,0.02));
        border-radius: var(--radius-md, 8px);
      }

      .teaser-habit-card--at-risk {
        border-left: 3px solid var(--color-jordan, #c4856a);
      }

      .teaser-habit-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-2);
      }

      .teaser-habit-name {
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--color-text-primary, #2C2520);
      }

      .teaser-habit-streak {
        font-size: 0.7rem;
        color: var(--color-text-muted, #7a6a5a);
      }

      .teaser-habit-calendar {
        display: flex;
        gap: var(--space-1);
      }

      .teaser-habit-day {
        width: 20px;
        height: 20px;
        border-radius: var(--radius-sm, 4px);
        background: var(--color-border, rgba(0,0,0,0.1));
      }

      .teaser-habit-day--done {
        background: var(--persona-primary, #4a6741);
      }

      /* ==================== RESPONSIVE ==================== */

      @media (max-width: 480px) {
        .teaser-trust-stats {
          grid-template-columns: repeat(2, 1fr);
        }

        .teaser-analytics-stats {
          grid-template-columns: repeat(2, 1fr);
        }

        .teaser-trust-stat:last-child {
          grid-column: 1 / -1;
        }
      }

      /* ==================== REDUCED MOTION ==================== */

      @media (prefers-reduced-motion: reduce) {
        .teaser-preview,
        .teaser-pattern-card,
        .teaser-memory-card,
        .teaser-person-card,
        .teaser-habit-card,
        .teaser-team-insight,
        .teaser-prediction-card {
          transition: none !important;
        }
      }
    `;

    document.head.appendChild(style);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: TeaserPreviewUI | null = null;

export function getTeaserPreviewUI(): TeaserPreviewUI {
  if (!instance) {
    instance = new TeaserPreviewUI();
  }
  return instance;
}

// Convenience export
export const teaserPreview = {
  get ui() {
    return getTeaserPreviewUI();
  },
  wellbeing: () => getTeaserPreviewUI().wellbeing(),
  patterns: () => getTeaserPreviewUI().patterns(),
  trustInsights: () => getTeaserPreviewUI().trustInsights(),
  lifeContext: () => getTeaserPreviewUI().lifeContext(),
  predictions: () => getTeaserPreviewUI().predictions(),
  teamInsights: () => getTeaserPreviewUI().teamInsights(),
  memories: () => getTeaserPreviewUI().memories(),
  yourPeople: () => getTeaserPreviewUI().yourPeople(),
  growthAnalytics: () => getTeaserPreviewUI().growthAnalytics(),
  habits: () => getTeaserPreviewUI().habits(),
};

export default teaserPreview;

