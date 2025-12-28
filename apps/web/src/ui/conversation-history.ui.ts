/**
 * Conversation History UI
 *
 * A centered floating modal for viewing past conversations.
 * Shows session summaries, insights learned, and mood trends.
 *
 * DESIGN SYSTEM COMPLIANCE:
 * - All colors use CSS variables from tokens.css
 * - All spacing uses --space-* or --ma-* tokens
 * - All animations use DURATION/EASING from animation-constants.ts
 * - Centered floating modal matches Menu/Predictions treatment
 * - Respects prefers-reduced-motion
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING, STAGGER, prefersReducedMotion } from '../config/animation-constants.js';
import { teaserPreview } from './teaser-preview.ui.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ConversationSession {
  id: string;
  date: string;
  personaId: string;
  personaName: string;
  duration: number; // minutes
  messageCount: number;
  mood?: 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'stormy';
  insights: string[];
  highlights: string[];
  topicsDiscussed: string[];
}

export interface ConversationHistoryData {
  sessions: ConversationSession[];
  totalSessions: number;
  totalMinutes: number;
  favoritePersona?: string;
  insightCount: number;
}

export interface ConversationHistoryUICallbacks {
  onClose?: () => void;
  onSessionClick?: (sessionId: string) => void;
  onPersonaClick?: (personaId: string) => void;
}

// ============================================================================
// MOOD ICONS
// ============================================================================

const MOOD_ICONS: Record<string, string> = {
  sunny: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>`,
  'partly-cloudy': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 2v2"/>
    <path d="M12 8a4 4 0 0 1 0 8"/>
    <path d="m4.93 4.93 1.41 1.41"/>
    <path d="M2 12h2"/>
    <path d="m4.93 19.07 1.41-1.41"/>
    <path d="M20 16.2A5 5 0 0 0 17.5 7h-.5A7 7 0 1 0 8.5 19H18a4 4 0 0 0 2-7.8Z"/>
  </svg>`,
  cloudy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
  </svg>`,
  rainy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/>
    <path d="M16 14v6"/>
    <path d="M8 14v6"/>
    <path d="M12 16v6"/>
  </svg>`,
  stormy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/>
    <polyline points="13 11 9 17 15 17 11 23"/>
  </svg>`,
};

// ============================================================================
// CONVERSATION HISTORY UI CLASS
// ============================================================================

class ConversationHistoryUI {
  private panel: HTMLElement | null = null;
  private callbacks: ConversationHistoryUICallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;

  /**
   * Initialize the panel
   */
  initialize(): void {
    if (this.panel) return;

    // HMR protection - clean up orphaned elements
    document.querySelectorAll('.history').forEach(el => el.remove());

    this.injectStyles();
    this.createPanel();
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: ConversationHistoryUICallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Show with data
   */
  show(data: ConversationHistoryData): void {
    this.initialize();
    if (!this.panel) return;

    this.renderContent(data);
    this.panel.classList.add('history--visible');
    this.panel.setAttribute('aria-hidden', 'false');
    this.isVisible = true;

    // Animate sessions in
    if (!prefersReducedMotion()) {
      this.animateSessionsIn();
    }
  }

  /**
   * Hide the panel
   */
  hide(): void {
    if (!this.panel) return;

    this.panel.setAttribute('aria-hidden', 'true');
    this.isVisible = false;
    
    setTimeout(() => {
      this.panel?.classList.remove('history--visible');
    }, prefersReducedMotion() ? 0 : DURATION.NORMAL);
    
    this.callbacks.onClose?.();
  }

  /**
   * Toggle visibility
   */
  toggle(data?: ConversationHistoryData): void {
    if (this.isVisible) {
      this.hide();
    } else if (data) {
      this.show(data);
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private createPanel(): void {
    this.panel = document.createElement('aside');
    this.panel.className = 'history';
    this.panel.setAttribute('role', 'complementary');
    this.panel.setAttribute('aria-label', 'Conversation history');
    this.panel.setAttribute('aria-hidden', 'true');

    document.body.appendChild(this.panel);
    
    // Close on backdrop click
    this.panel.addEventListener('click', (e) => {
      if (e.target === this.panel) {
        this.hide();
      }
    });
    
    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }

  private renderContent(data: ConversationHistoryData): void {
    if (!this.panel) return;

    this.panel.innerHTML = `
      <div class="history__backdrop"></div>
      <div class="history__card">
        <header class="history__header">
          <h2 class="history__title">Your Journey</h2>
          <button class="history__close" aria-label="${t('accessibility.closeHistory')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </header>

        <div class="history__stats">
          <div class="history__stat">
            <span class="history__stat-value">${data.totalSessions}</span>
            <span class="history__stat-label">Sessions</span>
          </div>
          <div class="history__stat">
            <span class="history__stat-value">${this.formatDuration(data.totalMinutes)}</span>
            <span class="history__stat-label">Total Time</span>
          </div>
          <div class="history__stat">
            <span class="history__stat-value">${data.insightCount}</span>
            <span class="history__stat-label">Insights</span>
          </div>
        </div>

        ${data.favoritePersona ? `
          <div class="history__favorite-persona">
            <span class="history__favorite-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
              </svg>
            </span>
            <span class="history__favorite-text">
              <span class="history__favorite-label">Most connected with</span>
              <span class="history__favorite-name">${this.escapeHtml(data.favoritePersona)}</span>
            </span>
          </div>
        ` : ''}

        <div class="history__sessions">
          ${data.sessions.length > 0 
            ? data.sessions.map((s, i) => this.renderSession(s, i, data.favoritePersona)).join('')
            : this.renderEmptyState()
          }
        </div>
      </div>
    `;

    // Bind close button
    const closeBtn = this.panel.querySelector('.history__close');
    closeBtn?.addEventListener('click', () => this.hide());
    
    // Close on backdrop click
    const backdrop = this.panel.querySelector('.history__backdrop');
    backdrop?.addEventListener('click', () => this.hide());

    // Bind session clicks
    this.panel.querySelectorAll('.history__session').forEach((el) => {
      el.addEventListener('click', () => {
        const sessionId = el.getAttribute('data-session');
        if (sessionId) {
          this.callbacks.onSessionClick?.(sessionId);
        }
      });
    });
  }

  private renderSession(session: ConversationSession, index: number, favoritePersona?: string): string {
    const moodIcon = session.mood ? MOOD_ICONS[session.mood] || '' : '';
    const delay = index * STAGGER.NORMAL;
    const date = new Date(session.date);
    const formattedDate = this.formatDate(date);
    const insightPreview = session.insights[0] || 'No insights recorded';
    const isFavorite = favoritePersona && session.personaName.toLowerCase() === favoritePersona.toLowerCase();

    return `
      <article class="history__session ${isFavorite ? 'history__session--favorite' : ''}" data-session="${session.id}" style="--session-delay: ${delay}ms">
        <div class="history__session-header">
          <div class="history__session-persona ${isFavorite ? 'history__session-persona--favorite' : ''}" data-persona="${session.personaId}">
            ${session.personaName.slice(0, 2).toUpperCase()}
            ${isFavorite ? `<span class="history__favorite-badge" title="Your favorite">★</span>` : ''}
          </div>
          <div class="history__session-meta">
            <span class="history__session-name">${session.personaName}</span>
            <span class="history__session-date">${formattedDate}</span>
          </div>
          ${moodIcon ? `<div class="history__session-mood">${moodIcon}</div>` : ''}
        </div>
        <div class="history__session-body">
          <p class="history__session-insight">"${this.escapeHtml(insightPreview)}"</p>
          <div class="history__session-stats">
            <span>${session.duration} min</span>
            <span>·</span>
            <span>${session.messageCount} messages</span>
            ${session.insights.length > 0 ? `<span>·</span><span>${session.insights.length} insights</span>` : ''}
          </div>
        </div>
        ${session.topicsDiscussed.length > 0 ? `
          <div class="history__session-topics">
            ${session.topicsDiscussed.slice(0, 3).map(t => `<span class="history__topic">${this.escapeHtml(t)}</span>`).join('')}
          </div>
        ` : ''}
      </article>
    `;
  }

  private renderEmptyState(): string {
    // Use teaser preview system to show what conversation history WILL look like
    // Shows realistic dummy data to create anticipation
    return teaserPreview.memories().outerHTML;
  }

  private formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }

  private formatDate(date: Date): string {
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  private animateSessionsIn(): void {
    const sessions = this.panel?.querySelectorAll('.history__session');
    sessions?.forEach((el, i) => {
      const htmlEl = el as HTMLElement;
      htmlEl.style.opacity = '0';
      htmlEl.style.transform = 'translateY(12px)';

      setTimeout(() => {
        htmlEl.style.transition = `opacity ${DURATION.SLOW}ms ${EASING.EXPO_OUT}, transform ${DURATION.SLOW}ms ${EASING.SPRING}`;
        htmlEl.style.opacity = '1';
        htmlEl.style.transform = 'translateY(0)';
      }, i * STAGGER.NORMAL + DURATION.NORMAL);
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      /* ========================================================================
         HISTORY PANEL - CENTERED FLOATING MODAL
         Matches Menu/Predictions/Daily Check-in treatment
         ======================================================================== */
      .history {
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

      .history--visible {
        opacity: 1;
        visibility: visible;
      }

      /* Backdrop */
      .history__backdrop {
        position: absolute;
        inset: 0;
        background: rgba(44, 37, 32, 0.75);
      }

      /* Card */
      .history__card {
        position: relative;
        width: 100%;
        max-width: clamp(336px, 90vw, 480px);
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

      .history--visible .history__card {
        transform: translateY(0) scale(1);
        opacity: 1;
      }

      /* ========================================================================
         HEADER
         ======================================================================== */
      .history__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-5, 20px) var(--space-6, 24px);
        border-bottom: 1px solid var(--color-border-subtle);
        flex-shrink: 0;
      }

      .history__title {
        font-family: var(--font-display);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        margin: 0;
      }

      .history__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        padding: 0;
        background: var(--color-background-tertiary);
        border: none;
        border-radius: var(--radius-full);
        color: var(--color-text-secondary);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .history__close:hover {
        background: var(--color-background-secondary);
        color: var(--color-text-primary);
      }

      .history__close svg {
        width: 18px;
        height: 18px;
      }

      /* ========================================================================
         STATS
         ======================================================================== */
      .history__stats {
        display: flex;
        justify-content: space-around;
        padding: var(--space-4, 16px);
        background: var(--color-background-secondary);
        border-bottom: 1px solid var(--color-border-subtle);
        flex-shrink: 0;
      }

      .history__stat {
        text-align: center;
      }

      .history__stat-value {
        display: block;
        font-family: var(--font-display);
        font-size: var(--text-2xl, 1.5rem);
        font-weight: var(--font-weight-bold, 700);
        color: var(--color-text-primary);
      }

      .history__stat-label {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.05em);
      }

      /* ========================================================================
         SESSIONS
         ======================================================================== */
      .history__sessions {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-4, 16px);
      }

      .history__session {
        padding: var(--space-4, 16px);
        margin-bottom: var(--space-3, 12px);
        background: var(--color-background-primary);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-xl, 1.25rem);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .history__session:last-child {
        margin-bottom: 0;
      }

      .history__session:hover {
        border-color: var(--color-border-medium);
        box-shadow: var(--shadow-md);
        transform: translateY(-2px);
      }

      .history__session-header {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        margin-bottom: var(--space-3, 12px);
      }

      .history__session-persona {
        width: 44px;
        height: 44px;
        border-radius: var(--radius-full);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-display);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: white;
        background: var(--persona-primary, var(--color-accent-primary));
      }

      /* Persona colors come from CSS tokens via data-persona attribute */
      /* --persona-primary is set by [data-persona="..."] in tokens.css */

      .history__session-meta {
        flex: 1;
      }

      .history__session-name {
        display: block;
        font-family: var(--font-display);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
      }

      .history__session-date {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted);
      }

      .history__session-mood {
        width: 24px;
        height: 24px;
        color: var(--color-accent-text);
      }

      .history__session-mood svg {
        width: 100%;
        height: 100%;
      }

      .history__session-body {
        margin-bottom: var(--space-3, 12px);
      }

      .history__session-insight {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        font-style: italic;
        color: var(--color-text-secondary);
        line-height: var(--leading-relaxed, 1.625);
        margin: 0 0 var(--space-2, 8px) 0;
      }

      .history__session-stats {
        display: flex;
        gap: var(--space-2, 8px);
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted);
      }

      .history__session-topics {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1, 4px);
      }

      .history__topic {
        padding: var(--space-1, 4px) var(--space-2, 8px);
        font-size: var(--text-xs, 0.75rem);
        background: var(--color-background-tertiary);
        color: var(--color-text-secondary);
        border-radius: var(--radius-full);
      }

      /* ========================================================================
         FAVORITE PERSONA
         ======================================================================== */
      .history__favorite-persona {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        padding: var(--space-3, 12px) var(--space-4, 16px);
        margin: 0 var(--space-4, 16px) var(--space-4, 16px);
        background: linear-gradient(90deg, var(--persona-tint), transparent);
        border-left: 3px solid var(--persona-primary, var(--color-accent-primary));
        border-radius: var(--radius-md);
      }

      .history__favorite-icon {
        width: 24px;
        height: 24px;
        color: var(--color-accent-text);
      }

      .history__favorite-icon svg {
        width: 100%;
        height: 100%;
        fill: var(--persona-primary, var(--color-accent-primary));
        fill-opacity: 0.2;
      }

      .history__favorite-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .history__favorite-label {
        font-family: var(--font-body);
        font-size: var(--text-xs, 0.75rem);
        color: var(--color-text-muted);
      }

      .history__favorite-name {
        font-family: var(--font-display);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-accent-text);
      }

      /* Favorite Session Highlight */
      .history__session--favorite {
        border-color: var(--color-accent-text);
        background: linear-gradient(90deg, var(--persona-tint), var(--color-background-primary));
      }

      .history__session-persona--favorite {
        position: relative;
        box-shadow: 0 0 0 2px var(--persona-primary, var(--color-accent-primary));
      }

      .history__favorite-badge {
        position: absolute;
        bottom: -4px;
        right: -4px;
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--persona-primary, var(--color-accent-primary));
        color: white;
        font-size: 10px;
        border-radius: var(--radius-full);
        box-shadow: var(--shadow-sm);
      }

      /* ========================================================================
         EMPTY STATE
         ======================================================================== */
      .history__empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: var(--space-12, 48px) var(--space-6, 24px);
        text-align: center;
      }

      .history__empty svg {
        width: 48px;
        height: 48px;
        color: var(--color-text-dimmed);
        margin-bottom: var(--space-4, 16px);
      }

      .history__empty p {
        font-family: var(--font-display);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-secondary);
        margin: 0 0 var(--space-2, 8px) 0;
      }

      .history__empty span {
        font-family: var(--font-body);
        font-size: var(--text-sm, 0.875rem);
        color: var(--color-text-muted);
      }

      /* ========================================================================
         DARK THEME (Cedar Night)
         ======================================================================== */
      [data-theme="midnight"] .history__backdrop {
        background: var(--backdrop-heavy);
      }

      [data-theme="midnight"] .history__card {
        background: var(--color-background-elevated);
        border-color: var(--color-border-medium);
      }

      [data-theme="midnight"] .history__title,
      [data-theme="midnight"] .history__stat-value,
      [data-theme="midnight"] .history__session-name {
        color: var(--color-text-primary);
      }

      [data-theme="midnight"] .history__stats {
        background: var(--color-background-secondary);
      }

      [data-theme="midnight"] .history__session {
        background: var(--color-background-secondary);
        border-color: var(--color-border-subtle);
      }

      [data-theme="midnight"] .history__session:hover {
        background: var(--color-background-tertiary);
        border-color: var(--color-border-medium);
      }

      [data-theme="midnight"] .history__session-insight {
        color: var(--color-text-secondary);
      }

      [data-theme="midnight"] .history__topic {
        background: var(--color-background-tertiary);
        color: var(--color-text-secondary);
      }

      [data-theme="midnight"] .history__close {
        background: var(--color-background-tertiary);
        color: var(--color-text-secondary);
      }

      [data-theme="midnight"] .history__close:hover {
        background: var(--color-background-secondary);
        color: var(--color-text-primary);
      }

      /* Dark Theme - Favorite Persona */
      [data-theme="midnight"] .history__favorite-persona {
        background: linear-gradient(90deg, var(--persona-tint), transparent);
        border-left-color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .history__favorite-icon {
        color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .history__favorite-icon svg {
        fill: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .history__favorite-name {
        color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .history__session--favorite {
        background: linear-gradient(90deg, var(--persona-tint), var(--color-background-secondary));
        border-color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .history__session-persona--favorite {
        box-shadow: 0 0 0 2px var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .history__favorite-badge {
        background: var(--color-accent-secondary, #7cb36b);
      }

      /* WCAG AA Compliant Text */
      [data-theme="midnight"] .history__stat-label,
      [data-theme="midnight"] .history__session-date,
      [data-theme="midnight"] .history__session-duration,
      [data-theme="midnight"] .history__empty-hint {
        color: var(--color-text-muted);
      }

      /* ========================================================================
         RESPONSIVE
         ======================================================================== */
      @media (max-width: clamp(336px, 90vw, 480px)) {
        .history {
          padding: var(--space-4, 16px);
        }

        .history__card {
          max-height: 90vh;
          border-radius: var(--radius-xl, 1.25rem);
        }

        .history__stats {
          flex-wrap: wrap;
          gap: var(--space-3, 12px);
        }
      }

      /* ========================================================================
         REDUCED MOTION
         ======================================================================== */
      @media (prefers-reduced-motion: reduce) {
        .history,
        .history__card,
        .history__session {
          animation: none !important;
          transition: opacity ${DURATION.FAST}ms linear !important;
          transform: none !important;
        }
      }
    `;
    document.head.appendChild(this.styleElement);
  }

  /**
   * Cleanup
   */
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

let instance: ConversationHistoryUI | null = null;

export function getConversationHistoryUI(): ConversationHistoryUI {
  if (!instance) {
    instance = new ConversationHistoryUI();
  }
  return instance;
}

export function initConversationHistoryUI(): void {
  getConversationHistoryUI().initialize();
}

export function showConversationHistory(data: ConversationHistoryData): void {
  getConversationHistoryUI().show(data);
}

export function hideConversationHistory(): void {
  getConversationHistoryUI().hide();
}

export default ConversationHistoryUI;
