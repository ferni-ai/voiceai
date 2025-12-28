/**
 * Cognitive Insights UI - "What I've Learned"
 *
 * A centered floating modal showing what the AI has learned about the user.
 * Redesigned to match the Menu/Engagement modal treatment.
 *
 * Design System Compliance:
 * - Uses CSS variables from tokens.css
 * - Uses DURATION/EASING from animation-constants.ts
 * - Uses shared components from engagement-components.ts
 * - Respects prefers-reduced-motion
 * - Centered floating modal with backdrop blur
 *
 * DESIGN PRINCIPLES:
 *   - Transparent about what AI knows
 *   - Non-creepy presentation of learned info
 *   - Ability to edit/delete memories
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING, prefersReducedMotion } from '../config/animation-constants.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
import {
  escapeHtml,
  ICONS,
  injectSharedStyles,
  renderCloseButton,
  STAGGER_DELAYS,
} from './engagement-components.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('CognitiveInsights');

// Track setTimeout calls for memory leak prevention
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

// ============================================================================
// TYPES
// ============================================================================

export interface CognitiveMemory {
  id: string;
  type: 'fact' | 'preference' | 'goal' | 'pattern' | 'relationship';
  content: string;
  confidence: number;
  source: string;
  learnedAt: string;
  personaId?: string;
}

export interface LearningPattern {
  id: string;
  pattern: string;
  frequency: number;
  examples: string[];
  category?:
    | 'timing'
    | 'communication'
    | 'engagement'
    | 'interests'
    | 'emotional'
    | 'relationship'
    | 'voice'
    | 'life'
    | 'goals'
    | 'knowledge'
    | 'preferences'
    | 'boundaries'
    | 'achievements'
    | 'continuity'
    | 'relationships';
}

export interface CognitiveInsightsData {
  memories: CognitiveMemory[];
  patterns: LearningPattern[];
  totalInteractions: number;
  knowledgeScore: number;
  // Superhuman Memory Insights
  superhumanInsights?: SuperhumanInsight[];
  temporalContext?: {
    isSpecialDate: boolean;
    specialDateInfo?: string;
    seasonalPattern?: string;
  };
  topicAbsences?: TopicAbsence[];
}

/**
 * Superhuman memory insight - proactive "better than human" intelligence
 */
export interface SuperhumanInsight {
  id: string;
  type:
    | 'date_reminder'
    | 'growth_celebration'
    | 'inside_joke'
    | 'topic_absence'
    | 'comfort_application';
  priority: 'high' | 'medium' | 'low';
  content: string;
  naturalPhrase: string;
  timing: 'greeting' | 'when_relevant' | 'closing' | 'anytime';
  tone: 'celebratory' | 'gentle' | 'curious' | 'warm' | 'supportive';
  generatedAt: string;
}

/**
 * Topic that has gone quiet
 */
export interface TopicAbsence {
  topic: string;
  lastMentioned: string;
  sessionsSince: number;
  suggestedApproach: 'gentle_check_in' | 'wait_for_them' | 'celebrate_resolution';
  prompt: string;
}

export interface CognitiveInsightsUICallbacks {
  onClose?: () => void;
  onDeleteMemory?: (memoryId: string) => void;
  onEditMemory?: (memoryId: string) => void;
}

// ============================================================================
// MEMORY TYPE ICONS - Using shared icons where possible
// ============================================================================

const MEMORY_ICONS: Record<string, string> = {
  fact: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  preference: ICONS.heart,
  goal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  pattern: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  relationship: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  // Superhuman insight icons
  date_reminder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>`,
  growth_celebration: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
  inside_joke: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  topic_absence: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  comfort_application: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`,
};

// ============================================================================
// HUMANIZED TYPE LABELS
// ============================================================================

const TYPE_LABELS: Record<string, string> = {
  fact: 'Facts about you',
  preference: 'Your preferences',
  goal: 'Your goals',
  pattern: "Patterns I've noticed",
  relationship: 'Connections',
};

// ============================================================================
// COGNITIVE INSIGHTS UI CLASS
// ============================================================================

class CognitiveInsightsUI {
  private panel: HTMLElement | null = null;
  private callbacks: CognitiveInsightsUICallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;

  initialize(): void {
    // HMR protection
    if (this.panel) return;

    // Clean up orphaned elements
    document.querySelectorAll('.cognitive-insights').forEach((el) => el.remove());

    injectSharedStyles();
    this.injectStyles();
    this.createPanel();
  }

  setCallbacks(callbacks: CognitiveInsightsUICallbacks): void {
    this.callbacks = callbacks;
  }

  show(data: CognitiveInsightsData): void {
    this.initialize();
    if (!this.panel) return;

    this.renderContent(data);
    this.panel.classList.add('cognitive-insights--visible');
    this.isVisible = true;
  }

  hide(): void {
    if (!this.panel) return;

    this.panel.classList.remove('cognitive-insights--visible');
    this.isVisible = false;

    trackedTimeout(
      () => {
        this.callbacks.onClose?.();
      },
      prefersReducedMotion() ? 0 : DURATION.NORMAL
    );
  }

  toggle(data?: CognitiveInsightsData): void {
    if (this.isVisible) {
      this.hide();
    } else if (data) {
      this.show(data);
    }
  }

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'cognitive-insights';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-label', "What I've learned about you");

    this.panel.innerHTML = `
      <div class="cognitive-insights__backdrop"></div>
      <div class="cognitive-insights__card">
        <header class="cognitive-insights__header">
          <h2 class="cognitive-insights__title">What I've Learned</h2>
          ${renderCloseButton('Close')}
        </header>
        <div class="cognitive-insights__content" id="cognitive-content">
          <div class="cognitive-insights__loading">Loading insights...</div>
        </div>
      </div>
    `;

    document.body.appendChild(this.panel);

    // Bind events
    const backdrop = this.panel.querySelector('.cognitive-insights__backdrop');
    backdrop?.addEventListener('click', () => this.hide());

    const closeBtn = this.panel.querySelector('.engagement-close-btn');
    closeBtn?.addEventListener('click', () => this.hide());

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }

  private renderContent(data: CognitiveInsightsData): void {
    const content = this.panel?.querySelector('#cognitive-content');
    if (!content) return;

    const groupedMemories = this.groupMemoriesByType(data.memories);

    content.innerHTML = `
      <!-- Understanding Score -->
      <div class="cognitive-insights__score">
        <div class="cognitive-insights__score-ring" style="--progress: ${data.knowledgeScore}">
          <span>${data.knowledgeScore}%</span>
        </div>
        <div class="cognitive-insights__score-info">
          <span class="cognitive-insights__score-label">Understanding</span>
          <span class="cognitive-insights__score-detail">${data.totalInteractions} conversations</span>
        </div>
      </div>

      <!-- Memory Sections -->
      <div class="cognitive-insights__sections">
        ${Object.entries(groupedMemories)
          .map(([type, memories]) => this.renderMemorySection(type, memories))
          .join('')}
      </div>

      ${
        data.superhumanInsights && data.superhumanInsights.length > 0
          ? `
        <!-- Superhuman Insights - Proactive Memory -->
        <div class="cognitive-insights__superhuman">
          <div class="cognitive-insights__superhuman-header">
            <span class="cognitive-insights__superhuman-icon">${MEMORY_ICONS['growth_celebration']}</span>
            <h3 class="cognitive-insights__superhuman-title">Things I Want to Remember</h3>
            <span class="cognitive-insights__superhuman-badge">Proactive</span>
          </div>
          <p class="cognitive-insights__superhuman-intro">
            Here are some things I'm keeping in mind for our next conversation:
          </p>
          <div class="cognitive-insights__superhuman-list">
            ${data.superhumanInsights.map((insight) => this.renderSuperhumanInsight(insight)).join('')}
          </div>
        </div>
      `
          : ''
      }

      ${
        data.patterns.length > 0
          ? `
        <!-- Patterns -->
        <div class="cognitive-insights__patterns">
          <div class="cognitive-insights__patterns-header">
            <span class="cognitive-insights__patterns-icon">${MEMORY_ICONS['pattern']}</span>
            <h3 class="cognitive-insights__patterns-title">Patterns I've Noticed</h3>
          </div>
          <p class="cognitive-insights__patterns-intro">
            Based on our conversations, here are some things I've observed about you:
          </p>
          ${this.renderPatternsByCategory(data.patterns)}
        </div>
      `
          : `
        <!-- Empty Patterns with encouragement -->
        <div class="cognitive-insights__patterns cognitive-insights__patterns--empty">
          <div class="cognitive-insights__patterns-header">
            <span class="cognitive-insights__patterns-icon">${MEMORY_ICONS['pattern']}</span>
            <h3 class="cognitive-insights__patterns-title">Patterns I've Noticed</h3>
          </div>
          <div class="cognitive-insights__patterns-empty">
            <p>As we continue talking, I'll start to notice patterns in what matters to you.</p>
            <span class="cognitive-insights__patterns-hint">Keep sharing - the best insights come over time.</span>
          </div>
        </div>
      `
      }
    `;

    // Bind delete buttons
    content.querySelectorAll('.cognitive-insights__memory-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.id;
        if (id) this.callbacks.onDeleteMemory?.(id);
      });
    });
  }

  private groupMemoriesByType(memories: CognitiveMemory[]): Record<string, CognitiveMemory[]> {
    const result: Record<string, CognitiveMemory[]> = {};
    for (const mem of memories) {
      const arr = result[mem.type];
      if (!arr) {
        result[mem.type] = [mem];
      } else {
        arr.push(mem);
      }
    }
    return result;
  }

  private renderMemorySection(type: string, memories: CognitiveMemory[]): string {
    const icon = MEMORY_ICONS[type] || MEMORY_ICONS['fact'];
    const title = TYPE_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1) + 's';

    return `
      <section class="cognitive-insights__section">
        <div class="cognitive-insights__section-header">
          <span class="cognitive-insights__section-icon">${icon}</span>
          <h3>${escapeHtml(title)}</h3>
          <span class="cognitive-insights__section-count">${memories.length}</span>
        </div>
        <ul class="cognitive-insights__memories">
          ${memories.map((m, i) => this.renderMemory(m, i)).join('')}
        </ul>
      </section>
    `;
  }

  private renderMemory(memory: CognitiveMemory, index: number): string {
    const confidence = Math.round(memory.confidence * 100);
    const date = new Date(memory.learnedAt);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const delay = index * STAGGER_DELAYS.MICRO;

    return `
      <li class="cognitive-insights__memory" style="animation-delay: ${delay}ms">
        <div class="cognitive-insights__memory-content">
          <p>${escapeHtml(memory.content)}</p>
          <div class="cognitive-insights__memory-meta">
            <span>${dateStr}</span>
            <span class="cognitive-insights__memory-confidence">
              ${confidence}% sure
            </span>
          </div>
        </div>
        <button class="cognitive-insights__memory-delete" data-id="${escapeHtml(memory.id)}" aria-label="${t('accessibility.forgetThis')}">
          ${ICONS.close}
        </button>
      </li>
    `;
  }

  private renderPattern(pattern: LearningPattern): string {
    // Confidence indicator based on frequency
    const confidence = pattern.frequency >= 5 ? 'high' : pattern.frequency >= 3 ? 'medium' : 'low';
    const confidenceLabel =
      pattern.frequency >= 5
        ? 'Strong pattern'
        : pattern.frequency >= 3
          ? 'Emerging pattern'
          : 'Early observation';

    return `
      <div class="cognitive-insights__pattern cognitive-insights__pattern--${confidence}">
        <div class="cognitive-insights__pattern-content">
          <p class="cognitive-insights__pattern-text">${escapeHtml(pattern.pattern)}</p>
          ${
            pattern.examples.length > 0
              ? `
            <div class="cognitive-insights__pattern-examples">
              ${pattern.examples
                .slice(0, 2)
                .map(
                  (ex) => `
                <span class="cognitive-insights__pattern-example">"${escapeHtml(ex)}"</span>
              `
                )
                .join('')}
            </div>
          `
              : ''
          }
        </div>
        <div class="cognitive-insights__pattern-meta">
          <span class="cognitive-insights__pattern-confidence">${confidenceLabel}</span>
          <span class="cognitive-insights__pattern-freq">Observed ${pattern.frequency}x</span>
        </div>
      </div>
    `;
  }

  /**
   * Render a superhuman memory insight
   */
  private renderSuperhumanInsight(insight: SuperhumanInsight): string {
    const icon = MEMORY_ICONS[insight.type] || MEMORY_ICONS['growth_celebration'];
    const priorityClass =
      insight.priority === 'high'
        ? 'superhuman-insight--high'
        : insight.priority === 'medium'
          ? 'superhuman-insight--medium'
          : '';

    const typeLabels: Record<string, string> = {
      date_reminder: 'Important Date',
      growth_celebration: 'Growth Moment',
      inside_joke: 'Shared Memory',
      topic_absence: 'Check-in',
      comfort_application: 'How to Help',
    };

    // Use SVG icons instead of emojis (brand-compliant)
    const toneIcons: Record<string, string> = {
      celebratory: ICONS.sparkles,
      gentle: ICONS.heart,
      curious: ICONS.questionMark,
      warm: ICONS.sprout,
      supportive: ICONS.flexBicep,
    };

    return `
      <div class="cognitive-insights__superhuman-insight ${priorityClass}">
        <div class="cognitive-insights__superhuman-insight-icon">
          ${icon}
        </div>
        <div class="cognitive-insights__superhuman-insight-content">
          <div class="cognitive-insights__superhuman-insight-header">
            <span class="cognitive-insights__superhuman-insight-type">${typeLabels[insight.type] || insight.type}</span>
            <span class="cognitive-insights__superhuman-insight-tone">${toneIcons[insight.tone] || ''}</span>
          </div>
          <p class="cognitive-insights__superhuman-insight-phrase">${escapeHtml(insight.naturalPhrase)}</p>
        </div>
      </div>
    `;
  }

  private renderPatternsByCategory(patterns: LearningPattern[]): string {
    // Category configuration
    const CATEGORY_CONFIG: Record<string, { label: string; icon: string; order: number }> = {
      relationship: {
        label: 'Our Relationship',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
        order: 1,
      },
      communication: {
        label: 'How You Communicate',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
        order: 2,
      },
      interests: {
        label: 'What Excites You',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
        order: 3,
      },
      engagement: {
        label: 'How You Engage',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
        order: 4,
      },
      timing: {
        label: "When You're Around",
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        order: 5,
      },
      goals: {
        label: "What You're Working Toward",
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
        order: 6,
      },
      achievements: {
        label: "What You've Accomplished",
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
        order: 7,
      },
      voice: {
        label: 'How You Speak',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
        order: 8,
      },
      life: {
        label: 'Where You Are in Life',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
        order: 9,
      },
      boundaries: {
        label: "What I'm Mindful Of",
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        order: 10,
      },
      emotional: {
        label: 'How You Feel',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
        order: 11,
      },
      knowledge: {
        label: 'What You Know',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
        order: 12,
      },
      preferences: {
        label: 'What You Prefer',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        order: 13,
      },
      continuity: {
        label: "What We're Continuing",
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
        order: 14,
      },
      relationships: {
        label: 'People in Your Life',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        order: 15,
      },
    };

    // Group patterns by category
    const grouped: Record<string, LearningPattern[]> = {};
    const uncategorized: LearningPattern[] = [];

    for (const pattern of patterns) {
      const cat = pattern.category || 'general';
      if (CATEGORY_CONFIG[cat]) {
        const arr = grouped[cat];
        if (!arr) {
          grouped[cat] = [pattern];
        } else {
          arr.push(pattern);
        }
      } else {
        uncategorized.push(pattern);
      }
    }

    // Sort categories by order
    const sortedCategories = Object.entries(grouped).sort((a, b) => {
      const orderA = CATEGORY_CONFIG[a[0]]?.order || 99;
      const orderB = CATEGORY_CONFIG[b[0]]?.order || 99;
      return orderA - orderB;
    });

    // Render grouped patterns
    let html = '<div class="cognitive-insights__patterns-grouped">';

    for (const [category, categoryPatterns] of sortedCategories) {
      const config = CATEGORY_CONFIG[category];
      if (!config) continue;

      html += `
        <div class="cognitive-insights__pattern-category">
          <div class="cognitive-insights__pattern-category-header">
            <span class="cognitive-insights__pattern-category-icon">${config.icon}</span>
            <h4 class="cognitive-insights__pattern-category-title">${escapeHtml(config.label)}</h4>
          </div>
          <div class="cognitive-insights__patterns-list">
            ${categoryPatterns.map((p) => this.renderPattern(p)).join('')}
          </div>
        </div>
      `;
    }

    // Render uncategorized if any
    if (uncategorized.length > 0) {
      html += `
        <div class="cognitive-insights__pattern-category">
          <div class="cognitive-insights__pattern-category-header">
            <span class="cognitive-insights__pattern-category-icon">${MEMORY_ICONS['pattern']}</span>
            <h4 class="cognitive-insights__pattern-category-title">Other Observations</h4>
          </div>
          <div class="cognitive-insights__patterns-list">
            ${uncategorized.map((p) => this.renderPattern(p)).join('')}
          </div>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  private injectStyles(): void {
    const styleId = 'cognitive-insights-styles';
    if (document.getElementById(styleId)) return;

    this.styleElement = document.createElement('style');
    this.styleElement.id = styleId;
    this.styleElement.textContent = `
      /* ========================================
         COGNITIVE INSIGHTS - CENTERED FLOATING MODAL
         Matches Menu/Engagement treatment
         ======================================== */

      .cognitive-insights {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 1400);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--ma-silence, 34px);
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD},
                    visibility ${DURATION.NORMAL}ms ${EASING.STANDARD};
      }

      .cognitive-insights--visible {
        opacity: 1;
        visibility: visible;
      }

      /* Backdrop */
      .cognitive-insights__backdrop {
        position: absolute;
        inset: 0;
        background: rgba(44, 37, 32, 0.75);
      }

      /* Card */
      .cognitive-insights__card {
        position: relative;
        width: 100%;
        max-width: clamp(308px, 90vw, 440px);
        max-height: 80vh;
        background: var(--color-bg-elevated, #FFFDFB);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.08));
        border-radius: var(--radius-xl, 20px);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: translateY(20px) scale(0.95);
        opacity: 0;
        transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING},
                    opacity ${DURATION.MODERATE}ms ${EASING.STANDARD};
      }

      .cognitive-insights--visible .cognitive-insights__card {
        transform: translateY(0) scale(1);
        opacity: 1;
      }

      /* Header */
      .cognitive-insights__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-5, 20px) var(--space-6, 24px);
        border-bottom: 1px solid var(--color-border-subtle);
        flex-shrink: 0;
      }

      .cognitive-insights__title {
        font-family: var(--font-display);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0;
      }

      /* Content */
      .cognitive-insights__content {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-5, 20px);
        display: flex;
        flex-direction: column;
        gap: var(--space-5, 20px);
      }

      /* Score Ring */
      .cognitive-insights__score {
        display: flex;
        align-items: center;
        gap: var(--space-4, 16px);
        padding: var(--space-4, 16px);
        background: var(--color-background-secondary);
        border-radius: var(--radius-xl, 1.25rem);
      }

      .cognitive-insights__score-ring {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: conic-gradient(
          var(--persona-primary, var(--color-accent-primary)) calc(var(--progress, 0) * 1%),
          var(--color-border-medium) calc(var(--progress, 0) * 1%)
        );
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        flex-shrink: 0;
      }

      .cognitive-insights__score-ring::before {
        content: '';
        position: absolute;
        inset: 6px;
        background: var(--color-background-secondary);
        border-radius: 50%;
      }

      .cognitive-insights__score-ring span {
        position: relative;
        font-family: var(--font-display);
        font-size: var(--text-base);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-text-primary);
      }

      .cognitive-insights__score-info {
        flex: 1;
      }

      .cognitive-insights__score-label {
        display: block;
        font-family: var(--font-display);
        font-size: var(--text-base);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
      }

      .cognitive-insights__score-detail {
        font-size: var(--text-sm);
        color: var(--color-text-muted);
      }

      /* Memory Sections */
      .cognitive-insights__sections {
        display: flex;
        flex-direction: column;
        gap: var(--space-4, 16px);
      }

      .cognitive-insights__section {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .cognitive-insights__section-header {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
      }

      .cognitive-insights__section-icon {
        width: 18px;
        height: 18px;
        color: var(--color-accent-text);
      }

      .cognitive-insights__section-icon svg {
        width: 100%;
        height: 100%;
      }

      .cognitive-insights__section h3 {
        flex: 1;
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0;
      }

      .cognitive-insights__section-count {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        background: var(--color-background-tertiary);
        padding: 2px var(--space-2, 8px);
        border-radius: var(--radius-full);
      }

      /* Memory List */
      .cognitive-insights__memories {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .cognitive-insights__memory {
        display: flex;
        gap: var(--space-2, 8px);
        padding: var(--space-3, 12px);
        background: var(--color-background-elevated);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-lg, 1rem);
        animation: memorySlideIn ${DURATION.MODERATE}ms ${EASING.SPRING} forwards;
        opacity: 0;
        transform: translateX(-10px);
      }

      @keyframes memorySlideIn {
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }

      .cognitive-insights__memory-content {
        flex: 1;
        min-width: 0;
      }

      .cognitive-insights__memory-content p {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-1, 4px) 0;
        line-height: var(--leading-relaxed);
      }

      .cognitive-insights__memory-meta {
        display: flex;
        gap: var(--space-3, 12px);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }

      .cognitive-insights__memory-confidence {
        color: var(--color-accent-text);
      }

      .cognitive-insights__memory-delete {
        width: 28px;
        height: 28px;
        padding: 0;
        background: transparent;
        border: none;
        border-radius: var(--radius-full);
        color: var(--color-text-dimmed);
        cursor: pointer;
        opacity: 0;
        transition: opacity ${DURATION.FAST}ms ${EASING.STANDARD},
                    color ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .cognitive-insights__memory:hover .cognitive-insights__memory-delete {
        opacity: 1;
      }

      .cognitive-insights__memory-delete:hover {
        color: var(--color-semantic-error);
      }

      .cognitive-insights__memory-delete svg {
        width: 16px;
        height: 16px;
      }

      /* Patterns */
      /* ========================================
       * SUPERHUMAN INSIGHTS SECTION
       * "Better than human" proactive memory
       * ======================================== */
      
      .cognitive-insights__superhuman {
        padding: var(--space-4, 16px);
        background: linear-gradient(135deg, var(--persona-tint, rgba(74, 103, 65, 0.1)), var(--color-background-secondary));
        border-radius: var(--radius-xl, 1.25rem);
        border: 1px solid var(--persona-primary, #4a6741);
        margin-bottom: var(--space-4, 16px);
      }

      .cognitive-insights__superhuman-header {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-2, 8px);
      }

      .cognitive-insights__superhuman-icon {
        width: 20px;
        height: 20px;
        color: var(--persona-primary, #4a6741);
      }

      .cognitive-insights__superhuman-icon svg {
        width: 100%;
        height: 100%;
      }

      .cognitive-insights__superhuman-title {
        font-size: var(--text-base);
        font-weight: 600;
        color: var(--color-text-primary);
        margin: 0;
        flex: 1;
      }

      .cognitive-insights__superhuman-badge {
        font-size: var(--text-xs);
        font-weight: 500;
        padding: var(--space-1, 4px) var(--space-2, 8px);
        background: var(--persona-primary, #4a6741);
        color: white;
        border-radius: var(--radius-full, 9999px);
      }

      .cognitive-insights__superhuman-intro {
        font-size: var(--text-sm);
        color: var(--color-text-muted);
        margin: 0 0 var(--space-3, 12px) 0;
        font-style: italic;
      }

      .cognitive-insights__superhuman-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .cognitive-insights__superhuman-insight {
        display: flex;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px);
        background: var(--color-background-elevated);
        border-radius: var(--radius-lg, 1rem);
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .cognitive-insights__superhuman-insight:hover {
        transform: translateX(4px);
      }

      .cognitive-insights__superhuman-insight--high {
        border-left: 3px solid var(--persona-primary, #4a6741);
        background: linear-gradient(90deg, var(--persona-tint), var(--color-background-elevated));
      }

      .cognitive-insights__superhuman-insight--medium {
        border-left: 3px solid var(--color-text-muted);
      }

      .cognitive-insights__superhuman-insight-icon {
        width: 24px;
        height: 24px;
        color: var(--persona-primary, #4a6741);
        flex-shrink: 0;
      }

      .cognitive-insights__superhuman-insight-icon svg {
        width: 100%;
        height: 100%;
      }

      .cognitive-insights__superhuman-insight-content {
        flex: 1;
        min-width: 0;
      }

      .cognitive-insights__superhuman-insight-header {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-1, 4px);
      }

      .cognitive-insights__superhuman-insight-type {
        font-size: var(--text-xs);
        font-weight: 500;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .cognitive-insights__superhuman-insight-tone {
        display: inline-flex;
        width: 16px;
        height: 16px;
        color: var(--persona-primary, #4a6741);
      }

      .cognitive-insights__superhuman-insight-tone svg {
        width: 100%;
        height: 100%;
      }

      .cognitive-insights__superhuman-insight-phrase {
        font-size: var(--text-sm);
        color: var(--color-text-primary);
        margin: 0;
        line-height: 1.5;
      }

      /* Dark theme for superhuman section */
      [data-theme="midnight"] .cognitive-insights__superhuman {
        background: linear-gradient(135deg, var(--persona-tint, rgba(74, 103, 65, 0.2)), var(--color-background-tertiary));
      }

      [data-theme="midnight"] .cognitive-insights__superhuman-insight {
        background: var(--color-background-secondary);
      }

      [data-theme="midnight"] .cognitive-insights__superhuman-insight--high {
        background: linear-gradient(90deg, var(--persona-tint), var(--color-background-secondary));
      }

      .cognitive-insights__patterns {
        padding: var(--space-4, 16px);
        background: var(--color-background-secondary);
        border-radius: var(--radius-xl, 1.25rem);
      }

      .cognitive-insights__patterns-header {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-2, 8px);
      }

      .cognitive-insights__patterns-icon {
        width: 20px;
        height: 20px;
        color: var(--color-accent-text);
      }

      .cognitive-insights__patterns-icon svg {
        width: 100%;
        height: 100%;
      }

      .cognitive-insights__patterns-title {
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0;
      }

      .cognitive-insights__patterns-intro {
        font-size: var(--text-sm);
        color: var(--color-text-muted);
        margin: 0 0 var(--space-3, 12px) 0;
        font-style: italic;
      }

      .cognitive-insights__patterns-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2, 8px);
      }

      .cognitive-insights__pattern {
        padding: var(--space-3, 12px);
        background: var(--color-background-elevated);
        border-radius: var(--radius-lg, 1rem);
        border-left: 3px solid var(--color-text-muted);
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .cognitive-insights__pattern:hover {
        transform: translateX(4px);
      }

      .cognitive-insights__pattern--high {
        border-left-color: var(--color-accent-text);
        background: linear-gradient(90deg, var(--persona-tint), var(--color-background-elevated));
      }

      .cognitive-insights__pattern--medium {
        border-left-color: var(--color-semantic-warning, #c49a6c);
      }

      .cognitive-insights__pattern--low {
        border-left-color: var(--color-text-dimmed);
      }

      .cognitive-insights__pattern-content {
        margin-bottom: var(--space-2, 8px);
      }

      .cognitive-insights__pattern-text {
        font-size: var(--text-sm);
        color: var(--color-text-primary);
        margin: 0;
        line-height: var(--leading-relaxed);
      }

      .cognitive-insights__pattern-examples {
        display: flex;
        flex-direction: column;
        gap: var(--space-1, 4px);
        margin-top: var(--space-2, 8px);
        padding-left: var(--space-3, 12px);
        border-left: 1px solid var(--color-border-subtle);
      }

      .cognitive-insights__pattern-example {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        font-style: italic;
      }

      .cognitive-insights__pattern-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .cognitive-insights__pattern-confidence {
        font-size: var(--text-xs);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-accent-text);
      }

      .cognitive-insights__pattern--medium .cognitive-insights__pattern-confidence {
        color: var(--color-semantic-warning, #c49a6c);
      }

      .cognitive-insights__pattern--low .cognitive-insights__pattern-confidence {
        color: var(--color-text-muted);
      }

      .cognitive-insights__pattern-freq {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }

      /* Pattern Category Grouping */
      .cognitive-insights__patterns-grouped {
        display: flex;
        flex-direction: column;
        gap: var(--space-5, 20px);
      }

      .cognitive-insights__pattern-category {
        background: var(--color-background-elevated);
        border-radius: var(--radius-xl, 1.25rem);
        padding: var(--space-4, 16px);
        border: 1px solid var(--color-border-subtle);
      }

      .cognitive-insights__pattern-category-header {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        margin-bottom: var(--space-3, 12px);
        padding-bottom: var(--space-2, 8px);
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .cognitive-insights__pattern-category-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        color: var(--color-accent-text);
      }

      .cognitive-insights__pattern-category-icon svg {
        width: 18px;
        height: 18px;
      }

      .cognitive-insights__pattern-category-title {
        font-size: var(--text-sm);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0;
        letter-spacing: 0.02em;
      }

      /* Empty Patterns State */
      .cognitive-insights__patterns--empty {
        text-align: center;
      }

      .cognitive-insights__patterns-empty {
        padding: var(--space-4, 16px) 0;
      }

      .cognitive-insights__patterns-empty p {
        font-size: var(--text-sm);
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-2, 8px) 0;
      }

      .cognitive-insights__patterns-hint {
        font-size: var(--text-xs);
        color: var(--color-accent-text);
        font-style: italic;
      }

      /* Loading State */
      .cognitive-insights__loading {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-8, 32px);
        color: var(--color-text-muted);
        font-size: var(--text-sm);
      }

      /* Dark Theme */
      [data-theme="midnight"] .cognitive-insights__backdrop {
        background: var(--backdrop-heavy);
      }

      [data-theme="midnight"] .cognitive-insights__card {
        background: var(--color-background-elevated);
        border-color: var(--color-border-medium);
      }

      [data-theme="midnight"] .cognitive-insights__score,
      [data-theme="midnight"] .cognitive-insights__patterns {
        background: var(--color-background-tertiary);
      }

      [data-theme="midnight"] .cognitive-insights__score-ring::before {
        background: var(--color-background-tertiary);
      }

      [data-theme="midnight"] .cognitive-insights__memory {
        background: var(--color-background-secondary);
        border-color: var(--color-border-subtle);
      }

      /* Dark Theme - Patterns */
      [data-theme="midnight"] .cognitive-insights__pattern {
        background: var(--color-background-secondary);
      }

      [data-theme="midnight"] .cognitive-insights__pattern--high {
        background: linear-gradient(90deg, var(--persona-tint), var(--color-background-secondary));
      }

      [data-theme="midnight"] .cognitive-insights__pattern-text {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .cognitive-insights__patterns-intro,
      [data-theme="midnight"] .cognitive-insights__patterns-empty p {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .cognitive-insights__pattern-confidence {
        color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .cognitive-insights__pattern--medium .cognitive-insights__pattern-confidence {
        color: var(--color-semantic-warning, #c49a6c);
      }

      [data-theme="midnight"] .cognitive-insights__patterns-hint {
        color: var(--color-accent-secondary, #7cb36b);
      }

      /* Responsive */
      @media (max-width: clamp(336px, 90vw, 480px)) {
        .cognitive-insights {
          padding: var(--space-4, 16px);
        }

        .cognitive-insights__card {
          max-height: 90vh;
          border-radius: var(--radius-xl, 1.25rem);
        }

        .cognitive-insights__header {
          padding: var(--space-4, 16px);
        }

        .cognitive-insights__content {
          padding: var(--space-4, 16px);
        }
      }

      /* Reduced Motion */
      @media (prefers-reduced-motion: reduce) {
        .cognitive-insights,
        .cognitive-insights__card,
        .cognitive-insights__memory {
          animation: none !important;
          transition: opacity ${DURATION.FAST}ms linear !important;
          transform: none !important;
        }
      }
    `;
    document.head.appendChild(this.styleElement);
  }

  destroy(): void {
    this.hide();
    this.panel?.remove();
    this.styleElement?.remove();
    this.panel = null;
    this.styleElement = null;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: CognitiveInsightsUI | null = null;

export function getCognitiveInsightsUI(): CognitiveInsightsUI {
  if (!instance) instance = new CognitiveInsightsUI();
  return instance;
}

export function initCognitiveInsightsUI(): void {
  getCognitiveInsightsUI().initialize();
}

export function showCognitiveInsights(data: CognitiveInsightsData): void {
  getCognitiveInsightsUI().show(data);
}

export function hideCognitiveInsights(): void {
  getCognitiveInsightsUI().hide();
}

/**
 * Fetch superhuman insights from the API
 * Returns insights for the current user's proactive memory features
 */
export async function fetchSuperhumanInsights(): Promise<{
  insights: SuperhumanInsight[];
  temporalContext: { isSpecialDate: boolean; specialDateInfo?: string; seasonalPattern?: string };
  topicAbsences: TopicAbsence[];
} | null> {
  try {
    const response = await fetch('/api/cognitive/superhuman-insights', {
      credentials: 'include',
    });

    if (!response.ok) {
      log.warn('Failed to fetch superhuman insights:', response.status);
      return null;
    }

    const data = await response.json();
    return {
      insights: data.insights || [],
      temporalContext: data.temporalContext || { isSpecialDate: false },
      topicAbsences: data.topicAbsences || [],
    };
  } catch (error) {
    log.warn('Error fetching superhuman insights:', error);
    return null;
  }
}

/**
 * Load cognitive insights with superhuman data included
 */
export async function loadCognitiveInsightsWithSuperhuman(
  baseData: CognitiveInsightsData
): Promise<CognitiveInsightsData> {
  const superhuman = await fetchSuperhumanInsights();

  if (superhuman) {
    return {
      ...baseData,
      superhumanInsights: superhuman.insights,
      temporalContext: superhuman.temporalContext,
      topicAbsences: superhuman.topicAbsences,
    };
  }

  return baseData;
}

export default CognitiveInsightsUI;
