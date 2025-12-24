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

const TEASER_CONTENT: Record<TeaserType, TeaserContent> = {
  wellbeing: {
    title: 'Your Wellbeing Dashboard',
    message: 'Track your energy, mood, and stress patterns over time.',
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
          <span class="teaser-score-label">Wellbeing Score</span>
        </div>
        <div class="teaser-metrics">
          <div class="teaser-metric">
            <span class="teaser-metric-icon">💪</span>
            <span class="teaser-metric-label">Energy</span>
            <div class="teaser-metric-bar"><div class="teaser-metric-fill" style="width: 72%"></div></div>
          </div>
          <div class="teaser-metric">
            <span class="teaser-metric-icon">😊</span>
            <span class="teaser-metric-label">Mood</span>
            <div class="teaser-metric-bar"><div class="teaser-metric-fill" style="width: 85%"></div></div>
          </div>
          <div class="teaser-metric">
            <span class="teaser-metric-icon">🧘</span>
            <span class="teaser-metric-label">Calm</span>
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
          <span class="teaser-trend-label">Trending upward this week</span>
        </div>
      </div>
    `,
  },

  patterns: {
    title: 'Your Patterns',
    message: "I'll notice things about you that you might not see yourself.",
    daysRequired: 14,
    previewHtml: `
      <div class="teaser-patterns">
        <div class="teaser-pattern-card">
          <span class="teaser-pattern-type">Emotional</span>
          <p class="teaser-pattern-insight">"I've noticed you feel anxious on Sunday evenings. It usually passes by Monday afternoon."</p>
          <span class="teaser-pattern-frequency">Observed 8 times</span>
        </div>
        <div class="teaser-pattern-card">
          <span class="teaser-pattern-type">Behavioral</span>
          <p class="teaser-pattern-insight">"When you're stressed about work, you tend to skip your morning routine."</p>
          <span class="teaser-pattern-frequency">Observed 5 times</span>
        </div>
        <div class="teaser-pattern-card teaser-pattern-card--faded">
          <span class="teaser-pattern-type">Success</span>
          <p class="teaser-pattern-insight">"Your best days seem to follow evenings when you read before bed."</p>
          <span class="teaser-pattern-frequency">Observed 3 times</span>
        </div>
      </div>
    `,
  },

  trust_insights: {
    title: 'What I Notice About You',
    message: 'The deeper we talk, the more I understand your growth.',
    daysRequired: 7,
    previewHtml: `
      <div class="teaser-trust">
        <div class="teaser-trust-stats">
          <div class="teaser-trust-stat">
            <span class="teaser-trust-stat-value">12</span>
            <span class="teaser-trust-stat-label">Growth moments</span>
          </div>
          <div class="teaser-trust-stat">
            <span class="teaser-trust-stat-value">8</span>
            <span class="teaser-trust-stat-label">Wins celebrated</span>
          </div>
          <div class="teaser-trust-stat">
            <span class="teaser-trust-stat-value">5</span>
            <span class="teaser-trust-stat-label">Boundaries honored</span>
          </div>
        </div>
        <div class="teaser-trust-growth">
          <span class="teaser-trust-growth-title">How you've grown</span>
          <div class="teaser-trust-tags">
            <span class="teaser-trust-tag">Managing emotions better</span>
            <span class="teaser-trust-tag">Setting boundaries</span>
            <span class="teaser-trust-tag">Asking for help</span>
          </div>
        </div>
      </div>
    `,
  },

  life_context: {
    title: 'Your World',
    message: "I'll understand the context of your life - work, relationships, stress.",
    daysRequired: 14,
    previewHtml: `
      <div class="teaser-life">
        <div class="teaser-life-domains">
          <div class="teaser-life-domain">
            <span class="teaser-life-domain-icon">💼</span>
            <span class="teaser-life-domain-name">Work</span>
            <div class="teaser-life-domain-level" style="--level: 65%">
              <div class="teaser-life-domain-fill"></div>
            </div>
            <span class="teaser-life-domain-status">Moderate stress</span>
          </div>
          <div class="teaser-life-domain">
            <span class="teaser-life-domain-icon">❤️</span>
            <span class="teaser-life-domain-name">Relationships</span>
            <div class="teaser-life-domain-level" style="--level: 82%">
              <div class="teaser-life-domain-fill"></div>
            </div>
            <span class="teaser-life-domain-status">Feeling connected</span>
          </div>
          <div class="teaser-life-domain">
            <span class="teaser-life-domain-icon">🏃</span>
            <span class="teaser-life-domain-name">Health</span>
            <div class="teaser-life-domain-level" style="--level: 70%">
              <div class="teaser-life-domain-fill"></div>
            </div>
            <span class="teaser-life-domain-status">Room to grow</span>
          </div>
        </div>
        <div class="teaser-life-insight">
          <span class="teaser-life-insight-icon">${ICONS.sparkle}</span>
          <p>"Your energy dips mid-week. Wednesday seems to be your hardest day."</p>
        </div>
      </div>
    `,
  },

  predictions: {
    title: 'My Predictions',
    message: "I'll learn to anticipate what you need before you ask.",
    daysRequired: 21,
    previewHtml: `
      <div class="teaser-predictions">
        <div class="teaser-prediction-card teaser-prediction--accurate">
          <span class="teaser-prediction-status">✓ Accurate</span>
          <p class="teaser-prediction-text">"You'd feel overwhelmed this week"</p>
          <span class="teaser-prediction-result">You mentioned stress on Tuesday and Thursday</span>
        </div>
        <div class="teaser-prediction-card teaser-prediction--accurate">
          <span class="teaser-prediction-status">✓ Accurate</span>
          <p class="teaser-prediction-text">"The gym habit would struggle"</p>
          <span class="teaser-prediction-result">You skipped 2 sessions this week</span>
        </div>
        <div class="teaser-prediction-card teaser-prediction--pending">
          <span class="teaser-prediction-status">⏳ Watching</span>
          <p class="teaser-prediction-text">"Sunday evening will feel heavy"</p>
          <span class="teaser-prediction-result">I'll check in with you</span>
        </div>
        <div class="teaser-prediction-accuracy">
          <span class="teaser-prediction-accuracy-value">78%</span>
          <span class="teaser-prediction-accuracy-label">Prediction accuracy</span>
        </div>
      </div>
    `,
  },

  team_insights: {
    title: 'What We Notice',
    message: 'Your whole team shares observations to help you grow.',
    daysRequired: 14,
    previewHtml: `
      <div class="teaser-team-insights">
        <div class="teaser-team-insight">
          <div class="teaser-team-avatar teaser-team-avatar--maya"></div>
          <div class="teaser-team-insight-content">
            <span class="teaser-team-name">Maya</span>
            <p>"Your morning routine streak is connected to better mood scores. Peter noticed it too."</p>
          </div>
        </div>
        <div class="teaser-team-insight">
          <div class="teaser-team-avatar teaser-team-avatar--peter"></div>
          <div class="teaser-team-insight-content">
            <span class="teaser-team-name">Peter</span>
            <p>"Spending on coffee correlates with your stress levels. Jordan might help with alternatives."</p>
          </div>
        </div>
        <div class="teaser-team-insight teaser-team-insight--faded">
          <div class="teaser-team-avatar teaser-team-avatar--nayan"></div>
          <div class="teaser-team-insight-content">
            <span class="teaser-team-name">Nayan</span>
            <p>"This feels like the start of a new chapter..."</p>
          </div>
        </div>
      </div>
    `,
  },

  memories: {
    title: 'Our Memories',
    message: "I'll remember everything - the big moments and the small ones.",
    daysRequired: 7,
    previewHtml: `
      <div class="teaser-memories">
        <div class="teaser-memory-card">
          <span class="teaser-memory-date">Dec 15</span>
          <span class="teaser-memory-type">Breakthrough</span>
          <p class="teaser-memory-content">"You realized your perfectionism was holding you back from starting"</p>
          <span class="teaser-memory-persona">with Ferni</span>
        </div>
        <div class="teaser-memory-card">
          <span class="teaser-memory-date">Dec 12</span>
          <span class="teaser-memory-type">Win</span>
          <p class="teaser-memory-content">"You had that difficult conversation with your manager"</p>
          <span class="teaser-memory-persona">with Alex</span>
        </div>
        <div class="teaser-memory-card teaser-memory-card--faded">
          <span class="teaser-memory-date">Dec 8</span>
          <span class="teaser-memory-type">Commitment</span>
          <p class="teaser-memory-content">"You promised to call your mom every Sunday"</p>
          <span class="teaser-memory-persona">with Ferni</span>
        </div>
      </div>
    `,
  },

  your_people: {
    title: 'Your People',
    message: "I'll remember everyone important to you and how you feel about them.",
    daysRequired: 14,
    previewHtml: `
      <div class="teaser-people">
        <div class="teaser-person-card">
          <div class="teaser-person-avatar">S</div>
          <div class="teaser-person-info">
            <span class="teaser-person-name">Sarah</span>
            <span class="teaser-person-relation">Friend • Mentioned 12 times</span>
            <span class="teaser-person-sentiment teaser-person-sentiment--positive">Brings you joy</span>
          </div>
        </div>
        <div class="teaser-person-card">
          <div class="teaser-person-avatar">M</div>
          <div class="teaser-person-info">
            <span class="teaser-person-name">Mom</span>
            <span class="teaser-person-relation">Family • Mentioned 8 times</span>
            <span class="teaser-person-sentiment teaser-person-sentiment--mixed">Complex feelings</span>
          </div>
        </div>
        <div class="teaser-person-card teaser-person-card--faded">
          <div class="teaser-person-avatar">D</div>
          <div class="teaser-person-info">
            <span class="teaser-person-name">David</span>
            <span class="teaser-person-relation">Friend • Last mentioned: 30 days ago</span>
            <span class="teaser-person-sentiment teaser-person-sentiment--check">Worth reconnecting?</span>
          </div>
        </div>
      </div>
    `,
  },

  growth_analytics: {
    title: "How You're Growing",
    message: 'Visual proof of your progress over time.',
    daysRequired: 14,
    previewHtml: `
      <div class="teaser-analytics">
        <div class="teaser-analytics-chart">
          <svg viewBox="0 0 300 120" class="teaser-chart">
            <defs>
              <linearGradient id="growthGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color: var(--persona-primary); stop-opacity: 0.3"/>
                <stop offset="100%" style="stop-color: var(--persona-primary); stop-opacity: 0"/>
              </linearGradient>
            </defs>
            <path d="M0,100 Q50,95 75,80 T150,60 T225,40 T300,30" fill="none" 
                  stroke="var(--persona-primary)" stroke-width="3" stroke-linecap="round"/>
            <path d="M0,100 Q50,95 75,80 T150,60 T225,40 T300,30 L300,120 L0,120 Z" 
                  fill="url(#growthGradient)"/>
          </svg>
          <div class="teaser-chart-labels">
            <span>Week 1</span>
            <span>Week 2</span>
            <span>Week 3</span>
            <span>Week 4</span>
          </div>
        </div>
        <div class="teaser-analytics-stats">
          <div class="teaser-analytics-stat">
            <span class="teaser-analytics-stat-value">↑ 23%</span>
            <span class="teaser-analytics-stat-label">Self-awareness</span>
          </div>
          <div class="teaser-analytics-stat">
            <span class="teaser-analytics-stat-value">↑ 18%</span>
            <span class="teaser-analytics-stat-label">Consistency</span>
          </div>
          <div class="teaser-analytics-stat">
            <span class="teaser-analytics-stat-value">↑ 31%</span>
            <span class="teaser-analytics-stat-label">Follow-through</span>
          </div>
        </div>
      </div>
    `,
  },

  habits: {
    title: 'Your Habits',
    message: "Track what you're building and watch momentum grow.",
    daysRequired: 7,
    previewHtml: `
      <div class="teaser-habits">
        <div class="teaser-habit-card">
          <div class="teaser-habit-info">
            <span class="teaser-habit-name">Morning walk</span>
            <span class="teaser-habit-streak">🔥 12 day streak</span>
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
            <span class="teaser-habit-name">Read before bed</span>
            <span class="teaser-habit-streak">🌱 5 day streak</span>
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
            <span class="teaser-habit-name">Meditation</span>
            <span class="teaser-habit-streak">⚠️ Needs attention</span>
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
};

// ============================================================================
// TEASER PREVIEW CLASS
// ============================================================================

export class TeaserPreviewUI {
  private styleInjected = false;

  /**
   * Create a teaser preview element
   */
  create(config: TeaserConfig): HTMLElement {
    const content = TEASER_CONTENT[config.type];
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
    element.setAttribute('aria-label', `Preview: ${content.title}`);

    element.innerHTML = `
      <div class="teaser-header">
        <div class="teaser-badge">
          <span class="teaser-badge-icon">${ICONS.eye}</span>
          <span class="teaser-badge-text">Preview</span>
        </div>
        <h3 class="teaser-title">${content.title}</h3>
        <p class="teaser-message">${config.customMessage || content.message}</p>
        ${!isUnlocked ? `
          <div class="teaser-unlock-hint">
            <span class="teaser-unlock-icon">${ICONS.sparkle}</span>
            <span class="teaser-unlock-text">
              ${daysToGo === 1 ? 'Tomorrow this could be real' : `After ${daysToGo} more days, this will be yours`}
            </span>
          </div>
        ` : ''}
      </div>
      <div class="teaser-content ${isUnlocked ? '' : 'teaser-content--preview'}">
        ${content.previewHtml}
      </div>
      <div class="teaser-footer">
        <p class="teaser-cta">Keep talking. We're building something.</p>
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

