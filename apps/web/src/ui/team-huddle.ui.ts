/**
 * Team Huddle UI
 *
 * A brand-aligned panel for multi-persona check-ins.
 * Shows when the team wants to discuss the user's progress together.
 *
 * DESIGN PRINCIPLES:
 *   - Zen aesthetic: Calm, supportive team energy
 *   - Golden ratio spacing throughout
 *   - Pixar-style staggered animations for participant reveals
 *   - Each persona has their signature color accent
 */

import { t } from '../i18n/index.js';
import { DURATION, EASING, STAGGER, prefersReducedMotion } from '../config/animation-constants.js';
import { createTimeoutTracker } from '../utils/tracked-timeout.js';

// ============================================================================
// TYPES
// ============================================================================

// Track setTimeout calls for memory leak prevention
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();

export interface TeamHuddleParticipant {
  personaId: string;
  name: string;
  initials: string;
  comment: string;
  avatarColor: string;
}

export interface TeamHuddleData {
  id: string;
  title: string;
  intro: string;
  participants: TeamHuddleParticipant[];
  outro: string;
  scheduledAt: string;
  type: 'weekly' | 'milestone' | 'special';
}

export interface TeamHuddleUICallbacks {
  onClose?: () => void;
  onParticipantClick?: (personaId: string) => void;
}

// ============================================================================
// PERSONA COLORS (from design system)
// ============================================================================

// Persona colors from design-system/tokens/colors.json (source of truth)
// Pattern: bg = secondary, border = primary
const PERSONA_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  ferni: {
    bg: 'var(--persona-ferni-secondary, #3d5a35)',
    text: 'var(--color-text-inverse, #faf8f5)',
    border: 'var(--persona-ferni-primary, #4a6741)',
  },
  'alex-chen': {
    bg: 'var(--persona-alex-secondary, #4a5a73)',
    text: 'var(--color-text-inverse, #faf8f5)',
    border: 'var(--persona-alex-primary, #5a6b8a)',
  },
  'maya-santos': {
    bg: 'var(--persona-maya-secondary, #8a635a)',
    text: 'var(--color-text-inverse, #faf8f5)',
    border: 'var(--persona-maya-primary, #a67a6a)',
  },
  'jordan-taylor': {
    bg: 'var(--persona-jordan-secondary, #a86d55)',
    text: 'var(--color-text-inverse, #faf8f5)',
    border: 'var(--persona-jordan-primary, #c4856a)',
  },
  'nayan-patel': {
    bg: 'var(--persona-nayan-secondary, #9a7a52)',
    text: 'var(--color-text-inverse, #faf8f5)',
    border: 'var(--persona-nayan-primary, #b8956a)',
  },
  'peter-john': {
    bg: 'var(--persona-peter-secondary, #2d5359)',
    text: 'var(--color-text-inverse, #faf8f5)',
    border: 'var(--persona-peter-primary, #3a6b73)',
  },
};

// ============================================================================
// TEAM HUDDLE UI CLASS
// ============================================================================

class TeamHuddleUI {
  private panel: HTMLElement | null = null;
  private wrapper: HTMLElement | null = null;
  private callbacks: TeamHuddleUICallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;
  private currentData: TeamHuddleData | null = null;

  /**
   * Initialize the team huddle panel
   */
  initialize(): void {
    if (this.panel) return;

    // HMR protection - clean up orphaned elements
    document.querySelectorAll('.team-huddle').forEach(el => el.remove());

    this.injectStyles();
    this.createPanel();
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: TeamHuddleUICallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Show team huddle with data
   */
  show(data: TeamHuddleData): void {
    this.initialize();
    if (!this.panel || !this.wrapper) return;

    this.currentData = data;
    this.renderContent(data);

    // Show panel
    this.panel.classList.add('team-huddle--visible');
    this.isVisible = true;

    // Animate participants in with stagger
    if (!prefersReducedMotion()) {
      this.animateParticipantsIn();
    }
  }

  /**
   * Hide the panel
   */
  hide(): void {
    if (!this.panel) return;

    this.panel.classList.remove('team-huddle--visible');
    this.isVisible = false;
    this.callbacks.onClose?.();
  }

  /**
   * Toggle visibility
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else if (this.currentData) {
      this.show(this.currentData);
    }
  }

  /**
   * Check if visible
   */
  getIsVisible(): boolean {
    return this.isVisible;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private createPanel(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'team-huddle';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-label', 'Team Huddle');
    this.panel.setAttribute('aria-modal', 'true');

    this.wrapper = document.createElement('div');
    this.wrapper.className = 'team-huddle__wrapper';
    this.panel.appendChild(this.wrapper);

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

    document.body.appendChild(this.panel);
  }

  private renderContent(data: TeamHuddleData): void {
    if (!this.wrapper) return;

    const typeIcon = this.getTypeIcon(data.type);
    const typeLabel = this.getTypeLabel(data.type);

    this.wrapper.innerHTML = `
      <header class="team-huddle__header">
        <div class="team-huddle__type">
          ${typeIcon}
          <span>${typeLabel}</span>
        </div>
        <button class="team-huddle__close" aria-label="${t('accessibility.closeHuddle')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </header>

      <div class="team-huddle__intro">
        <p>${this.escapeHtml(data.intro)}</p>
      </div>

      <div class="team-huddle__participants">
        ${data.participants.map((p, i) => this.renderParticipant(p, i)).join('')}
      </div>

      <div class="team-huddle__outro">
        <p>${this.escapeHtml(data.outro)}</p>
      </div>

      <div class="team-huddle__avatars">
        ${data.participants.map(p => this.renderAvatar(p)).join('')}
      </div>
    `;

    // Bind close button
    const closeBtn = this.wrapper.querySelector('.team-huddle__close');
    closeBtn?.addEventListener('click', () => this.hide());

    // Bind participant clicks
    this.wrapper.querySelectorAll('.team-huddle__participant').forEach((el) => {
      el.addEventListener('click', () => {
        const personaId = el.getAttribute('data-persona');
        if (personaId) {
          this.callbacks.onParticipantClick?.(personaId);
        }
      });
    });
  }

  private renderParticipant(participant: TeamHuddleParticipant, index: number): string {
    const colors = PERSONA_COLORS[participant.personaId] ?? PERSONA_COLORS['ferni'] ?? { bg: '#3d5a35', text: '#faf8f5', border: '#4a6741' };
    const delay = index * STAGGER.RELAXED;
    const personaIcon = this.getPersonaIcon(participant.personaId);

    return `
      <div class="team-huddle__participant" 
           data-persona="${participant.personaId}"
           style="--participant-delay: ${delay}ms; --participant-color: ${colors.bg}; --participant-border: ${colors.border}">
        <div class="team-huddle__participant-avatar" style="background: linear-gradient(135deg, ${colors.bg}, ${colors.border})">
          <span class="team-huddle__participant-initials">${participant.initials}</span>
          <span class="team-huddle__participant-icon">${personaIcon}</span>
        </div>
        <div class="team-huddle__participant-content">
          <div class="team-huddle__participant-name">${this.escapeHtml(participant.name)}</div>
          <div class="team-huddle__participant-comment">"${this.escapeHtml(participant.comment)}"</div>
        </div>
      </div>
    `;
  }

  /**
   * Get a small icon for each persona's specialty (Lucide-style SVG)
   */
  private getPersonaIcon(personaId: string): string {
    const icons: Record<string, string> = {
      ferni: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
      'maya-santos': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
      'peter-john': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>`,
      'alex-chen': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
      'jordan-taylor': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
      'nayan-patel': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
    };
    return icons[personaId] || icons.ferni;
  }

  private renderAvatar(participant: TeamHuddleParticipant): string {
    const colors = PERSONA_COLORS[participant.personaId] ?? PERSONA_COLORS['ferni'] ?? { bg: '#3d5a35', text: '#faf8f5', border: '#4a6741' };
    return `
      <div class="team-huddle__mini-avatar" 
           style="background: ${colors.bg}"
           title="${participant.name}">
        ${participant.initials}
      </div>
    `;
  }

  private getTypeIcon(type: TeamHuddleData['type']): string {
    const icons = {
      weekly: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>`,
      milestone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>`,
      special: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>`,
    };
    return icons[type] || icons.weekly;
  }

  private getTypeLabel(type: TeamHuddleData['type']): string {
    const labels = {
      weekly: 'Weekly Check-in',
      milestone: 'Milestone Celebration',
      special: 'Special Moment',
    };
    return labels[type] || 'Team Huddle';
  }

  private animateParticipantsIn(): void {
    const participants = this.wrapper?.querySelectorAll('.team-huddle__participant');
    participants?.forEach((el, i) => {
      const htmlEl = el as HTMLElement;
      htmlEl.style.opacity = '0';
      htmlEl.style.transform = 'translateY(20px)';

      trackedTimeout(() => {
        htmlEl.style.transition = `opacity ${DURATION.SLOW}ms ${EASING.EXPO_OUT}, transform ${DURATION.SLOW}ms ${EASING.SPRING}`;
        htmlEl.style.opacity = '1';
        htmlEl.style.transform = 'translateY(0)';
      }, i * STAGGER.RELAXED + DURATION.NORMAL);
    });
  }

  /**
   * Strip SSML markup from text (e.g., <break time="200ms"/>)
   * SSML is for speech synthesis, not display
   */
  private stripSSML(text: string): string {
    return text
      // Remove <break> tags with any attributes
      .replace(/<break[^>]*\/?>/gi, '')
      // Remove other common SSML tags
      .replace(/<\/?(?:speak|voice|prosody|emphasis|say-as|audio|p|s)[^>]*>/gi, '')
      // Clean up multiple spaces left behind
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  /**
   * Escape HTML to prevent XSS, and strip SSML for display
   */
  private escapeHtml(text: string): string {
    // First strip SSML, then escape HTML
    const cleanText = this.stripSSML(text);
    const div = document.createElement('div');
    div.textContent = cleanText;
    return div.innerHTML;
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      /* ========================================================================
         TEAM HUDDLE OVERLAY
         ======================================================================== */
      .team-huddle {
        position: fixed;
        inset: 0;
        z-index: var(--z-modal, 1400);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--ma-rest, 21px);
        background: var(--backdrop-page);
        backdrop-filter: blur(var(--glass-blur-thick, 24px));
        opacity: 0;
        visibility: hidden;
        transition: opacity ${DURATION.SLOW}ms ${EASING.STANDARD}, visibility ${DURATION.SLOW}ms;
      }

      .team-huddle--visible {
        opacity: 1;
        visibility: visible;
      }

      /* ========================================================================
         HUDDLE WRAPPER
         ======================================================================== */
      .team-huddle__wrapper {
        width: 100%;
        max-width: clamp(364px, 90vw, 520px);
        max-height: 80vh;
        overflow-y: auto;
        background: var(--glass-thick-bg, rgba(255, 255, 255, 0.12));
      backdrop-filter: blur(var(--glass-blur-thick, 24px));
      -webkit-backdrop-filter: blur(var(--glass-blur-thick, 24px));
      border: 1px solid var(--glass-thick-border, rgba(255, 255, 255, 0.14));
      
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        border-radius: var(--radius-xl, 20px);
        box-shadow: var(--glass-shadow-thick, 0 8px 12px rgba(0, 0, 0, 0.10), 0 16px 32px rgba(0, 0, 0, 0.08));
        transform: scale(0.95) translateY(20px);
        transition: transform ${DURATION.MODERATE}ms ${EASING.SPRING};
      }

      .team-huddle--visible .team-huddle__wrapper {
        transform: scale(1) translateY(0);
      }

      /* ========================================================================
         HEADER
         ======================================================================== */
      .team-huddle__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--ma-rest, 21px) var(--ma-silence, 34px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .team-huddle__type {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-accent-primary, #2d5a3d);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .team-huddle__type svg {
        width: 18px;
        height: 18px;
      }

      .team-huddle__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        padding: 0;
        background: var(--color-background-tertiary, #ebe6df);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        border-radius: var(--radius-full, 9999px);
        color: var(--color-text-secondary, #5c544a);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .team-huddle__close:hover {
        background: var(--color-background-secondary, #f5f2ed);
        color: var(--color-text-primary, #2c2520);
        transform: scale(1.05);
      }

      .team-huddle__close svg {
        width: 16px;
        height: 16px;
      }

      /* ========================================================================
         INTRO & OUTRO
         ======================================================================== */
      .team-huddle__intro,
      .team-huddle__outro {
        padding: var(--ma-breath, 13px) var(--ma-silence, 34px);
      }

      .team-huddle__intro p,
      .team-huddle__outro p {
        font-family: var(--font-body);
        font-size: var(--text-base);
        line-height: var(--leading-normal, 1.6);
        color: var(--color-text-secondary);
        margin: 0;
      }

      .team-huddle__outro {
        border-top: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: 0 0 var(--radius-xl, 1.5rem) var(--radius-xl, 1.5rem);
      }

      /* ========================================================================
         PARTICIPANTS
         ======================================================================== */
      .team-huddle__participants {
        padding: var(--ma-breath, 13px) var(--ma-silence, 34px);
        display: flex;
        flex-direction: column;
        gap: var(--ma-breath, 13px);
      }

      .team-huddle__participant {
        display: flex;
        gap: var(--ma-breath, 13px);
        padding: var(--ma-breath, 13px);
        background: var(--color-background-secondary, #f5f2ed);
        border-radius: var(--radius-lg, 0.75rem);
        border-left: 3px solid var(--participant-color, var(--color-accent-primary));
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .team-huddle__participant:hover {
        background: var(--color-background-tertiary, #ebe6df);
        transform: translateX(4px);
      }

      .team-huddle__participant-avatar {
        flex-shrink: 0;
        position: relative;
        width: 52px;
        height: 52px;
        border-radius: var(--radius-full, 9999px);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-inverse, #faf8f5);
        box-shadow: 
          0 2px 8px rgba(44, 37, 32, 0.15),
          inset 0 1px 0 rgba(255, 255, 255, 0.1);
        border: 2px solid var(--participant-border, rgba(255, 255, 255, 0.2));
      }

      .team-huddle__participant-initials {
        z-index: var(--z-docked);
      }

      .team-huddle__participant-icon {
        position: absolute;
        bottom: -2px;
        right: -2px;
        width: 20px;
        height: 20px;
        padding: 3px;
        background: var(--color-background-elevated, #fffdfb);
        border-radius: var(--radius-full, 9999px);
        box-shadow: 0 1px 3px rgba(44, 37, 32, 0.15);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .team-huddle__participant-icon svg {
        width: 12px;
        height: 12px;
        color: var(--participant-color, var(--color-accent-primary));
      }

      .team-huddle__participant-content {
        flex: 1;
        min-width: 0;
      }

      .team-huddle__participant-name {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin-bottom: var(--space-1, 4px);
      }

      .team-huddle__participant-comment {
        font-family: var(--font-primary, 'Inter', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-style: italic;
        color: var(--color-text-secondary, #5c544a);
        line-height: 1.5;
      }

      /* ========================================================================
         MINI AVATARS (bottom summary)
         ======================================================================== */
      .team-huddle__avatars {
        display: flex;
        justify-content: center;
        gap: calc(var(--space-2, 8px) * -1);
        padding: var(--ma-breath, 13px);
        padding-top: 0;
      }

      .team-huddle__mini-avatar {
        width: 36px;
        height: 36px;
        border-radius: var(--radius-full, 9999px);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: 11px;
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-inverse, #faf8f5);
        border: 3px solid var(--color-background-elevated, #fffdfb);
        margin-left: -10px;
        box-shadow: 0 2px 6px rgba(44, 37, 32, 0.12);
        transition: transform ${DURATION.FAST}ms ${EASING.SPRING};
      }

      .team-huddle__mini-avatar:first-child {
        margin-left: 0;
      }

      .team-huddle__mini-avatar:hover {
        transform: scale(1.1) translateY(-2px);
        z-index: var(--z-docked);
      }

      /* ========================================================================
         DARK THEME
         ======================================================================== */
      [data-theme="midnight"] .team-huddle {
        background: var(--backdrop-page);
      }

      [data-theme="midnight"] .team-huddle__wrapper {
        background: var(--color-background-elevated, #70605a);
        box-shadow: var(--shadow-2xl, 0 24px 48px rgba(0, 0, 0, 0.3));
      }

      [data-theme="midnight"] .team-huddle__intro p,
      [data-theme="midnight"] .team-huddle__outro p {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .team-huddle__participant {
        background: var(--color-background-secondary, #60504a);
      }

      [data-theme="midnight"] .team-huddle__participant:hover {
        background: var(--color-background-tertiary, #685852);
      }

      [data-theme="midnight"] .team-huddle__participant-name {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .team-huddle__participant-comment {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .team-huddle__outro {
        background: var(--color-background-secondary, #60504a);
      }

      [data-theme="midnight"] .team-huddle__close {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .team-huddle__close:hover {
        background: var(--color-background-secondary, #60504a);
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .team-huddle__participant-icon {
        background: var(--color-background-tertiary, #685852);
      }

      [data-theme="midnight"] .team-huddle__mini-avatar {
        border-color: var(--color-background-elevated, #70605a);
      }

      /* WCAG AA Compliant Text */
      [data-theme="midnight"] .team-huddle__participant-role,
      [data-theme="midnight"] .team-huddle__hint {
        color: var(--color-text-muted, #e8e2da);
      }

      /* ========================================================================
         REDUCED MOTION
         ======================================================================== */
      @media (prefers-reduced-motion: reduce) {
        .team-huddle,
        .team-huddle__wrapper,
        .team-huddle__participant {
          transition: opacity ${DURATION.FAST}ms linear;
        }

        .team-huddle--visible .team-huddle__wrapper {
          transform: none;
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
    this.wrapper = null;
    this.styleElement = null;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: TeamHuddleUI | null = null;

export function getTeamHuddleUI(): TeamHuddleUI {
  if (!instance) {
    instance = new TeamHuddleUI();
  }
  return instance;
}

export function initTeamHuddleUI(): void {
  getTeamHuddleUI().initialize();
}

export function showTeamHuddle(data: TeamHuddleData): void {
  getTeamHuddleUI().show(data);
}

export function hideTeamHuddle(): void {
  getTeamHuddleUI().hide();
}

export default TeamHuddleUI;

