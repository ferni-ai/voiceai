/**
 * Settings Menu UI
 *
 * A comprehensive menu for accessing all app features.
 * Slides in from the right with smooth animations.
 *
 * DESIGN PRINCIPLES:
 *   - Clean, organized navigation
 *   - Quick access to all panels
 *   - Visual indicators for new features
 *   - Locked feature indicators based on relationship stage
 */

import { DURATION, EASING } from '../config/animation-constants.js';
// Relationship stage service - used for feature unlocking and progress display
import { 
  relationshipStageService, 
  STAGE_NAMES,
  UNLOCKABLE_FEATURES,
  type RelationshipStage,
} from '../services/relationship-stage.service.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SettingsMenuItem {
  id: string;
  label: string;
  icon: string;
  badge?: string | number;
  action: () => void;
  section: 'primary' | 'engagement' | 'insights' | 'settings';
}

export interface SettingsMenuUICallbacks {
  onHistoryClick?: () => void;
  onAnalyticsClick?: () => void;
  onCognitiveClick?: () => void;
  onRitualBuilderClick?: () => void;
  onPredictionTrackerClick?: () => void;
  onExportDataClick?: () => void;
  onOnboardingClick?: () => void;
  onThemeToggle?: () => void;
  onRelationshipProgressClick?: () => void;
  onNotificationSettingsClick?: () => void;
  onSpotifyClick?: () => void;
  onTeamHuddleClick?: () => void;
  onTrustJourneyClick?: () => void;
  onMusicDashboardClick?: () => void;
  onPlayGamesClick?: () => void;
  onOutreachScheduleClick?: () => void;
  onContactSettingsClick?: () => void;
  onCalendarSettingsClick?: () => void;
  onVoiceEnrollmentClick?: () => void;
  onClose?: () => void;
}

// ============================================================================
// ICONS
// ============================================================================

const ICONS = {
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  analytics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.54"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.54"/></svg>',
  ritual: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  sparkles: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
  fingerprint: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4"/><path d="M5 19.5C5.5 18 6 15 6 12c0-.7.12-1.37.34-2"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M9 6.8a6 6 0 0 1 9 5.2c0 .47 0 1.17-.02 2"/></svg>',
};

// ============================================================================
// FEATURE LOCK MAPPING - Maps menu actions to unlockable features
// Reserved for future use when relationship stages unlock features
// ============================================================================

const FEATURE_LOCK_MAP: Record<string, string> = {
  'team': 'team-huddle',
  'cognitive': 'deep-insights',
  'ritual': 'custom-rituals',
  'relationship': 'relationship-progress',
};

// ============================================================================
// SETTINGS MENU UI CLASS
// ============================================================================

class SettingsMenuUI {
  private panel: HTMLElement | null = null;
  private trigger: HTMLElement | null = null;
  private callbacks: SettingsMenuUICallbacks = {};
  private styleElement: HTMLStyleElement | null = null;
  private isVisible = false;
  private spotifyLinked = false;
  private spotifyConfigured = false;

  initialize(): void {
    // Check for existing elements (HMR protection)
    if (this.panel && this.trigger) return;
    
    // Clean up any orphaned elements from HMR
    this.cleanupOrphanedElements();
    
    this.injectStyles();
    this.createTrigger();
    this.createPanel();
  }
  
  /**
   * Remove orphaned DOM elements from previous HMR cycles
   */
  private cleanupOrphanedElements(): void {
    // Remove any existing trigger buttons
    document.querySelectorAll('.settings-trigger').forEach(el => el.remove());
    // Remove any existing panels
    document.querySelectorAll('.settings-menu').forEach(el => el.remove());
  }

  setCallbacks(callbacks: SettingsMenuUICallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Update Spotify link state (called by spotify.ui.ts)
   */
  updateSpotifyState(linked: boolean, configured: boolean): void {
    this.spotifyLinked = linked;
    this.spotifyConfigured = configured;
    this.updateSpotifyMenuItem();
  }

  private updateSpotifyMenuItem(): void {
    if (!this.panel) return;
    
    const spotifyItem = this.panel.querySelector('[data-action="spotify"]') as HTMLElement;
    if (!spotifyItem) return;
    
    // Hide if not configured
    if (!this.spotifyConfigured) {
      spotifyItem.style.display = 'none';
      return;
    }
    
    spotifyItem.style.display = 'flex';
    const label = spotifyItem.querySelector('.settings-menu__label');
    if (label) {
      label.textContent = this.spotifyLinked ? 'Spotify Connected' : 'Link Spotify';
    }
    
    // Add/remove linked class for styling
    spotifyItem.classList.toggle('settings-menu__item--active', this.spotifyLinked);
  }

  show(): void {
    this.initialize();
    if (!this.panel) return;

    this.panel.classList.add('settings-menu--visible');
    this.isVisible = true;
    this.trigger?.classList.add('settings-trigger--active');
  }

  hide(): void {
    if (!this.panel) return;

    this.panel.classList.remove('settings-menu--visible');
    this.isVisible = false;
    this.trigger?.classList.remove('settings-trigger--active');
    this.callbacks.onClose?.();
  }

  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  private createTrigger(): void {
    this.trigger = document.createElement('button');
    this.trigger.className = 'settings-trigger';
    this.trigger.setAttribute('aria-label', 'Open settings menu');
    this.trigger.innerHTML = ICONS.menu;

    this.trigger.addEventListener('click', () => this.toggle());

    document.body.appendChild(this.trigger);
  }

  private createPanel(): void {
    this.panel = document.createElement('aside');
    this.panel.className = 'settings-menu';
    this.panel.setAttribute('role', 'navigation');
    this.panel.setAttribute('aria-label', 'Settings menu');

    this.renderContent();

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });

    document.body.appendChild(this.panel);
  }

  /**
   * Check if a feature is locked based on relationship stage
   */
  private isFeatureLocked(action: string): boolean {
    const featureId = FEATURE_LOCK_MAP[action];
    if (!featureId) return false; // Not a lockable feature
    return !relationshipStageService.isFeatureUnlocked(featureId);
  }

  /**
   * Get the required stage for a locked feature
   */
  private getRequiredStage(action: string): RelationshipStage | null {
    const featureId = FEATURE_LOCK_MAP[action];
    if (!featureId) return null;
    return UNLOCKABLE_FEATURES[featureId] || null;
  }

  /**
   * Render a menu item with optional locked state
   */
  private renderMenuItem(action: string, icon: string, label: string, extraClasses = ''): string {
    const isLocked = this.isFeatureLocked(action);
    const requiredStage = this.getRequiredStage(action);
    const lockedClass = isLocked ? 'settings-menu__item--locked' : '';
    const stageName = requiredStage ? STAGE_NAMES[requiredStage] : '';

    if (isLocked) {
      return `
        <button class="settings-menu__item ${lockedClass} ${extraClasses}" data-action="${action}" data-locked="true">
          <span class="settings-menu__icon">${icon}</span>
          <span class="settings-menu__label-wrap">
            <span class="settings-menu__label">${label}</span>
            <span class="settings-menu__unlock-hint">Unlock at ${stageName}</span>
          </span>
          <span class="settings-menu__lock-icon">${ICONS.lock}</span>
        </button>
      `;
    }

    return `
      <button class="settings-menu__item ${extraClasses}" data-action="${action}">
        <span class="settings-menu__icon">${icon}</span>
        <span class="settings-menu__label">${label}</span>
      </button>
    `;
  }

  private renderContent(): void {
    if (!this.panel) return;

    // Get current relationship stage for progress display
    const currentStage = relationshipStageService.getStage();
    const stageName = STAGE_NAMES[currentStage];
    const progress = relationshipStageService.getProgressToNextStage();

    this.panel.innerHTML = `
      <div class="settings-menu__backdrop"></div>
      <div class="settings-menu__card">
        <header class="settings-menu__header">
          <h2>Menu</h2>
          <button class="settings-menu__close" aria-label="Close menu">${ICONS.close}</button>
        </header>

        <!-- Relationship Stage Banner -->
        <div class="settings-menu__stage-banner">
          <div class="settings-menu__stage-info">
            <span class="settings-menu__stage-label">Your stage</span>
            <span class="settings-menu__stage-name">${stageName}</span>
          </div>
          ${progress.nextStage ? `
            <div class="settings-menu__stage-progress">
              <div class="settings-menu__stage-bar">
                <div class="settings-menu__stage-fill" style="width: ${Math.round(progress.progress * 100)}%"></div>
              </div>
              <span class="settings-menu__stage-next">Next: ${STAGE_NAMES[progress.nextStage]}</span>
            </div>
          ` : `
            <span class="settings-menu__stage-max">Max level!</span>
          `}
        </div>

        <nav class="settings-menu__nav">
          <section class="settings-menu__section">
            <h3>Your Journey</h3>
            ${this.renderMenuItem('relationship', ICONS.heart, 'Journey with Ferni')}
            ${this.renderMenuItem('trust-journey', ICONS.sparkles, 'Trust & Growth')}
            ${this.renderMenuItem('history', ICONS.history, 'Conversation History')}
            ${this.renderMenuItem('analytics', ICONS.analytics, 'Progress Analytics')}
            ${this.renderMenuItem('predictions', ICONS.target, 'Prediction Accuracy')}
          </section>

          <section class="settings-menu__section">
            <h3>Insights</h3>
            ${this.renderMenuItem('cognitive', ICONS.brain, 'What I\'ve Learned')}
            ${this.renderMenuItem('music-dashboard', ICONS.music, 'Musical You')}
            ${this.renderMenuItem('team', ICONS.team, 'Team Huddles')}
          </section>
          
          <section class="settings-menu__section">
            <h3>Fun</h3>
            ${this.renderMenuItem('play-games', ICONS.sparkles, 'Play Music Games')}
          </section>

          <section class="settings-menu__section">
            <h3>Customize</h3>
            <button class="settings-menu__item" data-action="spotify" style="display: none;">
              <span class="settings-menu__icon">${ICONS.music}</span>
              <span class="settings-menu__label">Link Spotify</span>
            </button>
            ${this.renderMenuItem('ritual', ICONS.ritual, 'Create a Practice')}
            ${this.renderMenuItem('theme', ICONS.theme, 'Toggle Theme')}
            ${this.renderMenuItem('notifications', ICONS.bell, 'Notifications')}
            ${this.renderMenuItem('calendar-settings', ICONS.calendar, 'Link Calendar')}
            ${this.renderMenuItem('outreach-schedule', ICONS.calendar, 'Upcoming Check-ins')}
            ${this.renderMenuItem('contact-settings', ICONS.heart, 'Contact Info')}
          </section>

          <section class="settings-menu__section">
            <h3>Security</h3>
            ${this.renderMenuItem('voice-enrollment', ICONS.fingerprint, 'Voice ID')}
          </section>

          <section class="settings-menu__section">
            <h3>Your Data</h3>
            ${this.renderMenuItem('export', ICONS.download, 'Export Data')}
            ${this.renderMenuItem('help', ICONS.help, 'Take the Tour')}
          </section>
        </nav>
      </div>
    `;

    // Bind events - close on backdrop click
    this.panel.querySelector('.settings-menu__backdrop')?.addEventListener('click', () => this.hide());
    this.panel.querySelector('.settings-menu__close')?.addEventListener('click', () => this.hide());

    this.panel.querySelectorAll('.settings-menu__item').forEach(btn => {
      btn.addEventListener('click', () => {
        const htmlBtn = btn as HTMLElement;
        const action = htmlBtn.dataset.action;
        const isLocked = htmlBtn.dataset.locked === 'true';
        
        if (isLocked) {
          // Show a gentle animation indicating it's locked
          htmlBtn.classList.add('settings-menu__item--shake');
          setTimeout(() => htmlBtn.classList.remove('settings-menu__item--shake'), 400);
          return;
        }
        
        this.handleAction(action);
      });
    });
  }

  private handleAction(action: string | undefined): void {
    this.hide();
    
    switch (action) {
      case 'history':
        this.callbacks.onHistoryClick?.();
        break;
      case 'analytics':
        this.callbacks.onAnalyticsClick?.();
        break;
      case 'cognitive':
        this.callbacks.onCognitiveClick?.();
        break;
      case 'ritual':
        this.callbacks.onRitualBuilderClick?.();
        break;
      case 'predictions':
        this.callbacks.onPredictionTrackerClick?.();
        break;
      case 'export':
        this.callbacks.onExportDataClick?.();
        break;
      case 'help':
        this.callbacks.onOnboardingClick?.();
        break;
      case 'theme':
        this.callbacks.onThemeToggle?.();
        break;
      case 'team':
        this.callbacks.onTeamHuddleClick?.();
        break;
      case 'relationship':
        this.callbacks.onRelationshipProgressClick?.();
        break;
      case 'notifications':
        this.callbacks.onNotificationSettingsClick?.();
        break;
      case 'spotify':
        this.callbacks.onSpotifyClick?.();
        break;
      case 'trust-journey':
        this.callbacks.onTrustJourneyClick?.();
        break;
      case 'music-dashboard':
        this.callbacks.onMusicDashboardClick?.();
        break;
      case 'play-games':
        this.callbacks.onPlayGamesClick?.();
        break;
      case 'outreach-schedule':
        this.callbacks.onOutreachScheduleClick?.();
        break;
      case 'contact-settings':
        this.callbacks.onContactSettingsClick?.();
        break;
      case 'calendar-settings':
        this.callbacks.onCalendarSettingsClick?.();
        break;
      case 'voice-enrollment':
        this.callbacks.onVoiceEnrollmentClick?.();
        break;
    }
  }

  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.textContent = `
      /* ========================================================================
         SETTINGS TRIGGER BUTTON
         ======================================================================== */
      .settings-trigger {
        position: fixed;
        top: var(--ma-rest, 21px);
        right: var(--ma-rest, 21px);
        width: 44px;
        height: 44px;
        z-index: var(--z-fixed, 1200);
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-background-elevated, #fffdfb);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.1));
        border-radius: var(--radius-full, 9999px);
        color: var(--color-text-secondary, #5c544a);
        cursor: pointer;
        box-shadow: var(--shadow-md, 0 4px 12px rgba(44, 37, 32, 0.1));
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .settings-trigger:hover {
        background: var(--color-background-secondary, #f5f2ed);
        color: var(--color-text-primary, #2c2520);
        transform: scale(1.05);
      }

      .settings-trigger--active {
        background: var(--color-accent-primary, #2d5a3d);
        color: white;
        border-color: var(--color-accent-primary, #2d5a3d);
      }

      .settings-trigger svg {
        width: 20px;
        height: 20px;
      }

      /* ========================================================================
         SETTINGS MENU - RIGHT-SIDE SLIDE-IN PANEL
         Apple navigation pattern: menu slides in from right, content opens as modals
         ======================================================================== */
      .settings-menu {
        position: fixed;
        inset: 0;
        z-index: var(--z-panel, 1300);
        pointer-events: none;
        visibility: hidden;
      }

      .settings-menu--visible {
        pointer-events: auto;
        visibility: visible;
      }

      /* Backdrop overlay - subtle dim (NO BLUR per user preference) */
      .settings-menu__backdrop {
        position: absolute;
        inset: 0;
        background: var(--backdrop-menu);
        /* Blur removed - user preference for cleaner look */
        opacity: 0;
        transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
      }

      .settings-menu--visible .settings-menu__backdrop {
        opacity: 1;
      }

      /* The actual menu panel - slides in from right */
      .settings-menu__card {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 320px;
        max-width: 85vw;
        background: var(--color-background-elevated, #fffdfb);
        box-shadow: var(--shadow-2xl, -8px 0 32px rgba(44, 37, 32, 0.15));
        /* No border - cleaner look */
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: translateX(100%);
        transition: transform ${DURATION.MODERATE}ms ${EASING.EXPO_OUT};
      }

      .settings-menu--visible .settings-menu__card {
        transform: translateX(0);
      }

      .settings-menu__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-5, 20px) var(--space-6, 24px);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        flex-shrink: 0;
      }

      .settings-menu__header h2 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-xl, 1.25rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0;
      }

      .settings-menu__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        padding: 0;
        background: var(--color-background-tertiary, #ebe6df);
        border: none;
        border-radius: var(--radius-full, 9999px);
        color: var(--color-text-secondary, #5c544a);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .settings-menu__close:hover {
        background: var(--color-background-secondary, #f5f2ed);
        color: var(--color-text-primary, #2c2520);
        transform: scale(1.05);
      }

      .settings-menu__close:active {
        transform: scale(0.95);
      }

      .settings-menu__close svg {
        width: 18px;
        height: 18px;
      }

      /* ========================================================================
         NAVIGATION
         ======================================================================== */
      .settings-menu__nav {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-4, 16px) 0;
      }

      .settings-menu__section {
        padding: 0 var(--space-6, 24px);
        margin-bottom: var(--space-4, 16px);
      }

      .settings-menu__section h3 {
        font-family: var(--font-display);
        font-size: var(--text-xs);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.05em);
        margin: 0 0 var(--space-2) 0;
        padding: var(--space-2) 0;
      }

      .settings-menu__item {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        width: 100%;
        padding: var(--space-3, 12px);
        margin-bottom: var(--space-1, 4px);
        background: transparent;
        border: none;
        border-radius: var(--radius-md, 0.5rem);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
        text-align: left;
      }

      .settings-menu__item:hover {
        background: var(--color-background-secondary, #f5f2ed);
      }

      .settings-menu__item:active {
        background: var(--color-background-tertiary, #ebe6df);
      }

      .settings-menu__icon {
        width: 20px;
        height: 20px;
        color: var(--color-accent-primary, #2d5a3d);
        flex-shrink: 0;
      }

      .settings-menu__icon svg {
        width: 100%;
        height: 100%;
      }

      .settings-menu__label {
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-primary);
      }

      /* Active/Connected state for items like Spotify */
      .settings-menu__item--active {
        background: var(--color-background-secondary, #f5f2ed);
      }

      .settings-menu__item--active .settings-menu__icon {
        color: var(--color-accent-primary, #2d5a3d);
      }

      .settings-menu__item--active .settings-menu__label::after {
        content: ' ✓';
        color: var(--color-accent-primary, #2d5a3d);
        font-weight: var(--font-weight-semibold, 600);
      }

      /* ========================================================================
         LOCKED FEATURE STATE
         ======================================================================== */
      .settings-menu__item--locked {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .settings-menu__item--locked:hover {
        background: transparent;
      }

      .settings-menu__item--locked .settings-menu__icon {
        color: var(--color-text-muted, #756a5e);
      }

      .settings-menu__label-wrap {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .settings-menu__unlock-hint {
        font-family: var(--font-body);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        font-style: italic;
      }

      .settings-menu__lock-icon {
        width: 16px;
        height: 16px;
        color: var(--color-text-muted, #756a5e);
        flex-shrink: 0;
      }

      .settings-menu__lock-icon svg {
        width: 100%;
        height: 100%;
      }

      /* Shake animation for locked items */
      @keyframes menuItemShake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-4px); }
        40% { transform: translateX(4px); }
        60% { transform: translateX(-4px); }
        80% { transform: translateX(4px); }
      }

      .settings-menu__item--shake {
        animation: menuItemShake 0.4s ease;
      }

      /* ========================================================================
         RELATIONSHIP STAGE BANNER
         ======================================================================== */
      .settings-menu__stage-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-4, 16px) var(--space-6, 24px);
        background: linear-gradient(135deg, var(--persona-tint, rgba(74, 103, 65, 0.08)), transparent);
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
      }

      .settings-menu__stage-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .settings-menu__stage-label {
        font-family: var(--font-body);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: var(--tracking-wider, 0.05em);
      }

      .settings-menu__stage-name {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-base, 1rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-accent-text);
      }

      .settings-menu__stage-progress {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
        min-width: 100px;
      }

      .settings-menu__stage-bar {
        width: 100%;
        height: 6px;
        background: var(--color-background-tertiary, #ebe6df);
        border-radius: var(--radius-full, 9999px);
        overflow: hidden;
      }

      .settings-menu__stage-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--persona-secondary, #3d5a35), var(--persona-primary, #4a6741));
        border-radius: var(--radius-full, 9999px);
        transition: width ${DURATION.SLOW}ms ${EASING.STANDARD};
      }

      .settings-menu__stage-next {
        font-family: var(--font-body);
        font-size: var(--text-xs);
        color: var(--color-text-muted);
      }

      .settings-menu__stage-max {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-accent-text);
      }

      /* ========================================================================
         DARK THEME
         ======================================================================== */
      /* Dark Theme - WCAG AA Compliant */
      [data-theme="midnight"] .settings-trigger {
        background: var(--color-background-elevated, #70605a);
        border-color: var(--color-border-subtle, rgba(250, 246, 240, 0.1));
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .settings-trigger:hover {
        background: var(--color-background-secondary, #60504a);
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .settings-menu__backdrop {
        background: var(--backdrop-menu);
      }

      [data-theme="midnight"] .settings-menu__card {
        background: var(--color-background-elevated);
        /* No border - cleaner look */
        box-shadow: var(--shadow-2xl);
      }

      [data-theme="midnight"] .settings-menu__header h2 {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .settings-menu__close {
        background: var(--color-background-tertiary, #685852);
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .settings-menu__close:hover {
        background: var(--color-background-secondary, #60504a);
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .settings-menu__section h3 {
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .settings-menu__item:hover {
        background: var(--color-background-secondary, #60504a);
      }

      [data-theme="midnight"] .settings-menu__label {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .settings-menu__item--active {
        background: var(--color-background-secondary, #60504a);
      }

      [data-theme="midnight"] .settings-menu__item--active .settings-menu__label::after {
        color: var(--color-accent-secondary, #7cb36b);
      }

      /* Dark Theme - Locked Items */
      [data-theme="midnight"] .settings-menu__item--locked {
        opacity: 0.5;
      }

      [data-theme="midnight"] .settings-menu__unlock-hint,
      [data-theme="midnight"] .settings-menu__lock-icon {
        color: var(--color-text-muted, #e8e2da);
      }

      /* Dark Theme - Stage Banner */
      [data-theme="midnight"] .settings-menu__stage-banner {
        background: linear-gradient(135deg, var(--persona-tint), transparent);
      }

      [data-theme="midnight"] .settings-menu__stage-label,
      [data-theme="midnight"] .settings-menu__stage-next {
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .settings-menu__stage-name,
      [data-theme="midnight"] .settings-menu__stage-max {
        color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .settings-menu__stage-bar {
        background: var(--color-background-tertiary, #504540);
      }

      /* ========================================================================
         RESPONSIVE
         ======================================================================== */
      
      /* Tablet (769px - 1024px) - Wider panel for more content */
      @media (min-width: 769px) and (max-width: 1024px) {
        .settings-menu__card {
          width: 380px;
          max-width: 50vw;
        }
      }
      
      /* Large phones / Small tablets (481px - 768px) */
      @media (min-width: 481px) and (max-width: 768px) {
        .settings-menu__card {
          width: 340px;
          max-width: 65vw;
        }
      }
      
      /* Mobile (max 480px) - Full width panel */
      @media (max-width: 480px) {
        .settings-trigger {
          top: var(--ma-breath, 13px);
          right: var(--ma-breath, 13px);
          width: 40px;
          height: 40px;
        }

        .settings-menu__card {
          width: 100%;
          max-width: none;
          border-left: none;
          border-radius: 0;
        }

        .settings-menu__header {
          padding: var(--space-4, 16px);
        }

        .settings-menu__section {
          padding: 0 var(--space-4, 16px);
        }
      }
      
      /* iPhone Pro specific (390-430px) - Full width but with safe areas */
      @media (min-width: 390px) and (max-width: 430px) {
        .settings-menu__card {
          /* Full width for immersive feel on Pro phones */
          width: 100%;
          max-width: none;
          padding-top: env(safe-area-inset-top, 0);
        }
        
        .settings-menu__header {
          padding-top: calc(var(--space-5, 20px) + env(safe-area-inset-top, 0));
        }
      }

      /* ========================================================================
         REDUCED MOTION
         ======================================================================== */
      @media (prefers-reduced-motion: reduce) {
        .settings-menu__backdrop {
          transition: none !important;
        }
        
        .settings-menu__card {
          transition: none !important;
        }
        
        .settings-menu--visible .settings-menu__card {
          transform: translateX(0);
        }
      }
    `;
    document.head.appendChild(this.styleElement);
  }

  destroy(): void {
    this.hide();
    this.panel?.remove();
    this.trigger?.remove();
    this.styleElement?.remove();
    this.panel = null;
    this.trigger = null;
    this.styleElement = null;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: SettingsMenuUI | null = null;

export function getSettingsMenuUI(): SettingsMenuUI {
  if (!instance) {
    instance = new SettingsMenuUI();
  }
  return instance;
}

export function initSettingsMenuUI(callbacks: SettingsMenuUICallbacks): void {
  const ui = getSettingsMenuUI();
  ui.setCallbacks(callbacks);
  ui.initialize();
}

export function showSettingsMenu(): void {
  getSettingsMenuUI().show();
}

export function hideSettingsMenu(): void {
  getSettingsMenuUI().hide();
}

export default SettingsMenuUI;

