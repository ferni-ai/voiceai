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
import { createTimeoutTracker } from '../utils/tracked-timeout.js';
// Relationship stage service - used for feature unlocking and progress display
import {
  relationshipStageService,
  STAGE_NAMES,
  UNLOCKABLE_FEATURES,
  type RelationshipStage,
} from '../services/relationship-stage.service.js';
// Roadmap service - for "What's Growing" experience
import { roadmapService } from '../services/roadmap.service.js';
import { showRoadmapPanel } from './roadmap-panel.ui.js';

// Track setTimeout calls for memory leak prevention
const { trackedTimeout, clearAll: _clearAllTimeouts } = createTimeoutTracker();
// Milestones - for journey progress indicator
// Seeds display for personalization economy
import { renderSeedsSettingsCard } from './seeds-display.ui.js';
// i18n for translations
import { getLocale, setLocale, SUPPORTED_LOCALES, t, type SupportedLocale } from '../i18n/index.js';

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
  onCommandsClick?: () => void;
  onPredictionTrackerClick?: () => void;
  onExportDataClick?: () => void;
  onOnboardingClick?: () => void;
  onThemeToggle?: () => void;
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
  onSubscriptionClick?: () => void;
  onBillingPortalClick?: () => void;
  onHouseholdClick?: () => void;
  onConversationMemoryClick?: () => void;
  onWellbeingClick?: () => void;
  onSupportFerniClick?: () => void;
  onPersonalizeClick?: () => void;
  onYourJourneyClick?: () => void;
  onShareFerniClick?: () => void;
  onAccentSettingsClick?: () => void;
  onWearableSettingsClick?: () => void;
  onVideoSettingsClick?: () => void;
  onGroupCoachingClick?: () => void;
  onMarketplaceAdminClick?: () => void;
  onClose?: () => void;
}

// ============================================================================
// ICONS
// ============================================================================

// ============================================================================
// ICONS - Natural, earthy, on-brand (consistent 1.5px stroke, rounded caps)
// ============================================================================
const ICONS = {
  // Navigation & UI
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="18" x2="20" y2="18"/></svg>',
  chevronRight:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',

  // Journey & Growth (natural metaphors)
  heart:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  sparkles:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"/></svg>',
  seedling:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 22V12"/><path d="M12 12c0-3-2.5-5-6-5 0 3 2 6 6 6Z"/><path d="M12 8c0-3 2.5-5 6-5 0 3-2 6-6 6"/></svg>',
  target:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  trophy:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',

  // Time & Memory (flowing, organic)
  history:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  memory:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="m16.24 16.24 2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="m16.24 7.76 2.83-2.83"/></svg>',
  calendar:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>',

  // Insights & Analytics (gentle, organic shapes)
  analytics:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M7 16c0-4 1-8 4-10s5 2 6 6c1 4 2 4 4 4"/></svg>',
  brain:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 4.5a2.5 2.5 0 0 0-4.96-.44 2.5 2.5 0 0 0-2.96 3.08 3 3 0 0 0 .34 5.58 2.5 2.5 0 0 0 2.96 3.08A2.5 2.5 0 0 0 12 19.5Z"/><path d="M12 4.5a2.5 2.5 0 0 1 4.96-.44 2.5 2.5 0 0 1 2.96 3.08 3 3 0 0 1-.34 5.58 2.5 2.5 0 0 1-2.96 3.08A2.5 2.5 0 0 1 12 19.5Z"/><path d="M12 4.5v15"/></svg>',
  wellbeing:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',

  // Connection & Communication
  team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="5" cy="12" r="2"/></svg>',
  users:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  share:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M20 21H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1Z"/></svg>',

  // Voice & Sound
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
  music:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',

  // Rituals & Practices
  ritual:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 22c-4 0-7-3-7-7 0-2 1-4 2-5 .5-1.5.5-3 0-4 2 1 4 3 4 6 0-3 2-5 4-6-.5 1-.5 2.5 0 4 1 1 2 3 2 5 0 4-3 7-7 7Z"/><path d="M12 22v-3"/></svg>',
  coffee:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>',

  // Settings & Personalization
  theme:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  palette:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="13.5" cy="6.5" r="1.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="1.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="1.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  globe:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',

  // Account (natural, personal)
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>',
  river:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 2c-2 4-6 6-6 10a6 6 0 0 0 12 0c0-4-4-6-6-10Z"/><path d="M12 22v-6"/></svg>',
  scroll:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M19 7V5a2 2 0 0 0-2-2H4"/><path d="M15 11H9"/><path d="M15 7H9"/></svg>',
  contact:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  download:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M8 21h8"/><path d="M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/></svg>',

  // Help & Support
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5" fill="currentColor"/></svg>',
  commands:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m4 17 6-6-6-6"/><path d="M12 19h8"/></svg>',

  // Roadmap features (keeping these for backward compatibility)
  fingerprint:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 11c0 1-.1 2.5-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4"/><path d="M5 19.5C5.5 18 6 15 6 12c0-.7.12-1.37.34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/></svg>',
  household:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  watch:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
  video:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',

  // Legacy aliases (deprecated but kept for compatibility)
  creditCard:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z"/><path d="M1 10h22"/></svg>',
  infinity:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"/></svg>',
};

// ============================================================================
// FEATURE LOCK MAPPING - Maps menu actions to unlockable features
// Progressive disclosure: features unlock as relationship deepens
// ============================================================================

const FEATURE_LOCK_MAP: Record<string, string> = {
  // Getting Started stage (2+ conversations)
  ritual: 'custom-rituals',
  analytics: 'progress-analytics',

  // Building Trust stage (7+ convos, 3+ days)
  team: 'team-huddle',
  'conversation-memory': 'memory-browser',
  wellbeing: 'wellbeing-dashboard',
  predictions: 'prediction-accuracy',
  'group-coaching': 'group-coaching',
  'video-settings': 'video-sessions',

  // Established stage (20+ convos, 14+ days)
  cognitive: 'deep-insights',
  history: 'conversation-history',
};

// ============================================================================
// STAGE-BASED SECTION VISIBILITY
// Progressive disclosure: show sections as relationship deepens
// ============================================================================

type SectionVisibility = Record<string, RelationshipStage>;

const SECTION_VISIBILITY: SectionVisibility = {
  connect: 'first-meeting', // Always visible
  personalize: 'first-meeting', // Always visible
  account: 'first-meeting', // Always visible
  grow: 'getting-started', // After 2+ conversations
  remember: 'building-trust', // After building trust
};

// ============================================================================
// PINNED ITEMS STORAGE
// ============================================================================

const PINNED_STORAGE_KEY = 'ferni_menu_pinned';

function getPinnedItems(): Set<string> {
  try {
    const stored = localStorage.getItem(PINNED_STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function savePinnedItems(items: Set<string>): void {
  localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify([...items]));
}

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
  private expandedSections: Set<string> = new Set(['connect', 'personalize']);
  private pinnedItems: Set<string> = getPinnedItems();
  private languageExpanded = false;

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
    document.querySelectorAll('.settings-trigger').forEach((el) => el.remove());
    // Remove any existing panels
    document.querySelectorAll('.settings-menu').forEach((el) => el.remove());
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
      label.textContent = this.spotifyLinked
        ? t('menu.items.spotifyConnected')
        : t('menu.items.linkSpotify');
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
    
    // Reset language dropdown state when menu closes
    this.languageExpanded = false;
    
    this.callbacks.onClose?.();
  }

  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * iOS Safari compatibility: Add both click and touchend events
   * iOS sometimes doesn't fire click events properly on dynamically created elements
   */
  private addTapListener(
    element: Element | null,
    handler: (e: Event) => void,
    options?: { stopPropagation?: boolean }
  ): void {
    if (!element) return;

    // Standard click event
    element.addEventListener('click', handler);

    // iOS Safari: touchend as backup (handles taps that don't trigger click)
    element.addEventListener('touchend', (e: Event) => {
      const touch = e as TouchEvent;
      // Only handle single-finger taps
      if (touch.touches && touch.touches.length > 0) return;

      // Prevent double-firing with click
      e.preventDefault();

      if (options?.stopPropagation) {
        e.stopPropagation();
      }

      handler(e);
    }, { passive: false });
  }

  private createTrigger(): void {
    this.trigger = document.createElement('button');
    this.trigger.className = 'settings-trigger';
    this.trigger.setAttribute('aria-label', t('accessibility.openSettings'));
    this.trigger.innerHTML = ICONS.menu;

    // iOS Safari: Use tap listener for better touch handling
    this.addTapListener(this.trigger, () => this.toggle());

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
   * Get unlock progress hint for a feature
   */
  private getUnlockHint(action: string): string {
    const featureId = FEATURE_LOCK_MAP[action];
    if (!featureId) return '';
    const progress = relationshipStageService.getFeatureUnlockProgress(featureId);
    return progress.hint || t('menu.keepChatting');
  }

  /**
   * Check if a section should be visible based on relationship stage
   */
  private isSectionVisible(sectionId: string): boolean {
    const requiredStage = SECTION_VISIBILITY[sectionId];
    if (!requiredStage) return true;

    const stageOrder: RelationshipStage[] = [
      'first-meeting',
      'getting-started',
      'building-trust',
      'established',
      'deep-partnership',
    ];
    const currentStage = relationshipStageService.getStage();
    const currentIndex = stageOrder.indexOf(currentStage);
    const requiredIndex = stageOrder.indexOf(requiredStage);

    return currentIndex >= requiredIndex;
  }

  /**
   * Toggle pinned state for an item
   */
  private togglePinned(action: string): void {
    if (this.pinnedItems.has(action)) {
      this.pinnedItems.delete(action);
    } else {
      this.pinnedItems.add(action);
    }
    savePinnedItems(this.pinnedItems);
    this.renderContent();
  }

  /**
   * Render a menu item with optional locked state or progress hint
   * Roadmap features are hidden from the menu - they only appear in the Roadmap Panel
   */
  private renderMenuItem(action: string, icon: string, label: string, extraClasses = ''): string {
    // Hide roadmap items from the menu - they live in "What's Growing" panel
    if (roadmapService.isRoadmapFeature(action)) {
      return '';
    }

    const isLocked = this.isFeatureLocked(action);
    const isPinned = this.pinnedItems.has(action);
    const lockedClass = isLocked ? 'settings-menu__item--locked' : '';
    const pinnedClass = isPinned ? 'settings-menu__item--pinned' : '';

    if (isLocked) {
      const hint = this.getUnlockHint(action);
      return `
        <button class="settings-menu__item ${lockedClass} ${extraClasses}" data-action="${action}" data-locked="true">
          <span class="settings-menu__icon">${icon}</span>
          <span class="settings-menu__label-wrap">
            <span class="settings-menu__label">${label}</span>
            <span class="settings-menu__unlock-hint">${hint}</span>
          </span>
          <span class="settings-menu__lock-icon">${ICONS.lock}</span>
        </button>
      `;
    }

    return `
      <button class="settings-menu__item ${pinnedClass} ${extraClasses}" data-action="${action}" data-pinnable="true">
        <span class="settings-menu__icon">${icon}</span>
        <span class="settings-menu__label">${label}</span>
      </button>
    `;
  }

  private renderContent(): void {
    if (!this.panel) return;

    // Get current relationship stage for progress display
    const currentStage = relationshipStageService.getStage();
    const progress = relationshipStageService.getProgressToNextStage();

    // Track which sections are expanded
    const expandedSections = this.expandedSections || new Set(['connect', 'personalize']);
    this.expandedSections = expandedSections;

    // Render pinned items section if any
    const pinnedItemsHtml = this.renderPinnedItems();

    this.panel.innerHTML = `
      <div class="settings-menu__backdrop"></div>
      <div class="settings-menu__card">
        <header class="settings-menu__header">
          <h2>${t('menu.title')}</h2>
          <button class="settings-menu__close" aria-label="${t('accessibility.closeMenu')}">${ICONS.close}</button>
        </header>

        <!-- Relationship Stage Banner (compact) -->
        <div class="settings-menu__stage-banner">
          <div class="settings-menu__stage-info">
            <span class="settings-menu__stage-label">${t('menu.yourStage')}</span>
            <span class="settings-menu__stage-name">${STAGE_NAMES[currentStage]}</span>
          </div>
          ${
            progress.nextStage
              ? `
            <div class="settings-menu__stage-progress">
              <div class="settings-menu__stage-bar">
                <div class="settings-menu__stage-fill" style="width: ${Math.round(progress.progress * 100)}%"></div>
              </div>
              <span class="settings-menu__stage-next">${t('menu.nextStage', { stage: STAGE_NAMES[progress.nextStage] })}</span>
            </div>
          `
              : `
            <span class="settings-menu__stage-max">${t('menu.maxLevel')}</span>
          `
          }
        </div>

        <!-- Seeds Balance Card -->
        ${renderSeedsSettingsCard()}

        <nav class="settings-menu__nav">
          <!-- PINNED ITEMS (Quick Access) -->
          ${pinnedItemsHtml}

          <!-- SECTION: Connect - Ways to engage -->
          ${
            this.isSectionVisible('connect')
              ? this.renderCollapsibleSection(
                  'connect',
                  t('menu.sections.connect'),
                  expandedSections.has('connect'),
                  `
            ${this.renderMenuItem('play-games', ICONS.sparkles, t('menu.items.playGames'))}
            ${this.renderMenuItem('music-dashboard', ICONS.music, t('menu.items.musicalYou'))}
            ${this.renderMenuItem('video-settings', ICONS.video, t('menu.items.videoSessions'))}
            ${this.renderMenuItem('group-coaching', ICONS.users, t('menu.items.groupCoaching'))}
            ${this.renderMenuItem('team', ICONS.team, t('menu.items.teamHuddles'))}
          `
                )
              : ''
          }

          <!-- SECTION: Grow - Progress & insights (unlocks at getting-started) -->
          ${
            this.isSectionVisible('grow')
              ? this.renderCollapsibleSection(
                  'grow',
                  t('menu.sections.grow'),
                  expandedSections.has('grow'),
                  `
            ${this.renderMenuItem('your-journey', ICONS.heart, t('menu.items.yourJourney'))}
            ${this.renderMenuItem('trust-journey', ICONS.sparkles, t('menu.items.trustDetails'))}
            ${this.renderMenuItem('analytics', ICONS.analytics, t('menu.items.progressAnalytics'))}
            ${this.renderMenuItem('predictions', ICONS.target, t('menu.items.predictionAccuracy'))}
            ${this.renderMenuItem('cognitive', ICONS.brain, t('menu.items.whatILearned'))}
            ${this.renderMenuItem('wellbeing', ICONS.wellbeing, t('menu.items.wellbeingDashboard'))}
          `
                )
              : ''
          }

          <!-- SECTION: Remember - Memories & history (unlocks at building-trust) -->
          ${
            this.isSectionVisible('remember')
              ? this.renderCollapsibleSection(
                  'remember',
                  t('menu.sections.remember'),
                  expandedSections.has('remember'),
                  `
            ${this.renderMenuItem('conversation-memory', ICONS.memory, t('menu.items.memoryBrowser'))}
            ${this.renderMenuItem('history', ICONS.history, t('menu.items.conversationHistory'))}
          `
                )
              : ''
          }

          <!-- SECTION: Make It Yours - Personalization -->
          ${
            this.isSectionVisible('personalize')
              ? this.renderCollapsibleSection(
                  'personalize',
                  t('menu.sections.personalize'),
                  expandedSections.has('personalize'),
                  `
            ${this.renderMenuItem('personalize', ICONS.palette, t('menu.items.personalize'))}
            ${this.renderMenuItem('accent-settings', ICONS.globe, t('menu.items.voiceAccent'))}
            ${this.renderMenuItem('commands', ICONS.commands, t('menu.items.guidedPractices'))}
            ${this.renderMenuItem('ritual', ICONS.ritual, t('menu.items.createPractice'))}
            ${this.renderMenuItemWithBadge('wearable-settings', ICONS.watch, t('menu.items.healthFitness'), t('common.new'))}
            ${this.renderMenuItem('calendar-settings', ICONS.calendar, t('menu.items.calendar'))}
            ${this.renderMenuItem('notifications', ICONS.bell, t('menu.items.notifications'))}
            ${this.renderMenuItem('theme', ICONS.theme, t('menu.items.toggleTheme'))}
            ${this.renderLanguageSelector()}
            <button class="settings-menu__item" data-action="spotify" style="display: none;">
              <span class="settings-menu__icon">${ICONS.music}</span>
              <span class="settings-menu__label">${t('menu.items.linkSpotify')}</span>
            </button>
          `
                )
              : ''
          }

          <!-- SECTION: Account -->
          ${
            this.isSectionVisible('account')
              ? this.renderCollapsibleSection(
                  'account',
                  t('menu.sections.account'),
                  expandedSections.has('account'),
                  `
            ${this.renderMenuItem('support-ferni', ICONS.heart, t('menu.items.supportFerniExpanded'))}
            ${this.renderMenuItem('contact-settings', ICONS.contact, t('menu.items.contactInfo'))}
            ${this.renderMenuItem('export', ICONS.scroll, t('menu.items.exportData'))}
          `
                )
              : ''
          }

          <!-- SECTION: Admin (only visible for admins) -->
          ${this.renderAdminSection(expandedSections)}

          <!-- Bottom Quick Actions -->
          <div class="settings-menu__quick-actions">
            ${this.renderMenuItem('whats-growing', ICONS.seedling, t('menu.items.whatsGrowing'))}
            ${this.renderMenuItem('share-ferni', ICONS.share, t('menu.items.shareFerni'))}
            ${this.renderMenuItem('help', ICONS.help, t('menu.items.takeTour'))}
          </div>
        </nav>
      </div>
    `;

    // Bind events - close on backdrop click (iOS Safari compatible)
    this.addTapListener(
      this.panel.querySelector('.settings-menu__backdrop'),
      () => this.hide()
    );
    this.addTapListener(
      this.panel.querySelector('.settings-menu__close'),
      () => this.hide()
    );

    // Bind collapsible section toggle events (iOS Safari compatible)
    this.panel.querySelectorAll('.settings-menu__section-header').forEach((header) => {
      this.addTapListener(header, () => {
        const sectionId = (header as HTMLElement).dataset.section;
        if (sectionId) {
          this.toggleSection(sectionId);
        }
      });
    });

    // Menu item tap handlers (iOS Safari compatible)
    this.panel.querySelectorAll('.settings-menu__item').forEach((btn) => {
      this.addTapListener(btn, (e) => {
        const target = e.target as HTMLElement;
        // Don't trigger main action if clicking unpin button
        if (target.closest('.settings-menu__unpin-btn')) return;

        const htmlBtn = btn as HTMLElement;
        const action = htmlBtn.dataset.action;
        const isLocked = htmlBtn.dataset.locked === 'true';
        const isRoadmap = htmlBtn.dataset.roadmap === 'true';

        // Roadmap features open the inspiring "What's Growing" panel
        if (isRoadmap && action) {
          this.hide();
          showRoadmapPanel(action);
          return;
        }

        if (isLocked) {
          // Show a gentle animation indicating it's locked
          htmlBtn.classList.add('settings-menu__item--shake');
          trackedTimeout(() => htmlBtn.classList.remove('settings-menu__item--shake'), 400);
          return;
        }

        this.handleAction(action);
      });

      // Right-click to pin/unpin (desktop only, no iOS equivalent needed)
      btn.addEventListener('contextmenu', (e) => {
        const htmlBtn = btn as HTMLElement;
        const action = htmlBtn.dataset.action;
        const isPinnable = htmlBtn.dataset.pinnable === 'true';

        if (isPinnable && action) {
          e.preventDefault();
          this.togglePinned(action);
        }
      });
    });

    // Handle unpin button clicks (iOS Safari compatible)
    this.panel.querySelectorAll('.settings-menu__unpin-btn').forEach((btn) => {
      this.addTapListener(btn, (e) => {
        e.stopPropagation();
        const action = (btn as HTMLElement).dataset.unpin;
        if (action) {
          this.togglePinned(action);
        }
      }, { stopPropagation: true });
    });

    // Bind language selector events
    this.bindLanguageSelectorEvents();
  }

  /**
   * Bind events for the language selector dropdown
   * iOS Safari compatible using tap listeners
   */
  private bindLanguageSelectorEvents(): void {
    if (!this.panel) return;

    // Toggle language dropdown (iOS Safari compatible)
    const toggleBtn = this.panel.querySelector('[data-action="toggle-language"]');

    if (toggleBtn) {
      this.addTapListener(toggleBtn, (e) => {
        e.stopPropagation();
        this.languageExpanded = !this.languageExpanded;
        // Re-render just the language selector
        const selector = this.panel?.querySelector('.settings-menu__language-selector');
        if (selector) {
          selector.outerHTML = this.renderLanguageSelector();
          // Rebind events for the new elements
          this.bindLanguageSelectorEvents();
        }
      }, { stopPropagation: true });
    }

    // Handle language selection (only if expanded) - iOS Safari compatible
    if (this.languageExpanded) {
      this.panel.querySelectorAll('[data-action="set-language"]').forEach((btn) => {
        this.addTapListener(btn, async (e) => {
          e.stopPropagation();
          const htmlBtn = btn as HTMLElement;
          const locale = htmlBtn.dataset.locale as SupportedLocale;

          if (locale) {
            await setLocale(locale);
            this.languageExpanded = false; // Collapse after selection
            // Re-render the entire menu to reflect language change
            this.renderContent();
          }
        }, { stopPropagation: true });
      });
    }
  }

  /**
   * Render a collapsible section with header and expandable content
   */
  private renderCollapsibleSection(
    id: string,
    title: string,
    isExpanded: boolean,
    content: string
  ): string {
    return `
      <section class="settings-menu__section ${isExpanded ? 'settings-menu__section--expanded' : ''}">
        <button class="settings-menu__section-header" data-section="${id}" aria-expanded="${isExpanded}">
          <h3>${title}</h3>
          <span class="settings-menu__section-chevron">${ICONS.chevronRight}</span>
        </button>
        <div class="settings-menu__section-content">
          ${content}
        </div>
      </section>
    `;
  }

  /**
   * Render pinned items section (Quick Access)
   */
  private renderPinnedItems(): string {
    if (this.pinnedItems.size === 0) return '';

    // Map of all menu items for quick lookup
    const menuItems: Record<string, { icon: string; label: string }> = {
      'your-journey': { icon: ICONS.heart, label: t('menu.items.yourJourney') },
      'trust-journey': { icon: ICONS.sparkles, label: t('menu.items.trustDetails') },
      analytics: { icon: ICONS.analytics, label: t('menu.items.progressAnalytics') },
      predictions: { icon: ICONS.target, label: t('menu.items.predictionAccuracy') },
      cognitive: { icon: ICONS.brain, label: t('menu.items.whatILearned') },
      'conversation-memory': { icon: ICONS.memory, label: t('menu.items.memoryBrowser') },
      wellbeing: { icon: ICONS.wellbeing, label: t('menu.items.wellbeingDashboard') },
      history: { icon: ICONS.history, label: t('menu.items.conversationHistory') },
      'video-settings': { icon: ICONS.video, label: t('menu.items.videoSessions') },
      'group-coaching': { icon: ICONS.users, label: t('menu.items.groupCoaching') },
      team: { icon: ICONS.team, label: t('menu.items.teamHuddles') },
      'play-games': { icon: ICONS.sparkles, label: t('menu.items.playGames') },
      'music-dashboard': { icon: ICONS.music, label: t('menu.items.musicalYou') },
      personalize: { icon: ICONS.palette, label: t('menu.items.personalize') },
      'accent-settings': { icon: ICONS.globe, label: t('menu.items.voiceAccent') },
      commands: { icon: ICONS.commands, label: t('menu.items.guidedPractices') },
      ritual: { icon: ICONS.ritual, label: t('menu.items.createPractice') },
      'wearable-settings': { icon: ICONS.watch, label: t('menu.items.healthFitness') },
      'calendar-settings': { icon: ICONS.calendar, label: t('menu.items.calendar') },
      notifications: { icon: ICONS.bell, label: t('menu.items.notifications') },
      theme: { icon: ICONS.theme, label: t('menu.items.toggleTheme') },
      'support-ferni': { icon: ICONS.heart, label: t('menu.items.supportFerniExpanded') },
      'voice-enrollment': { icon: ICONS.fingerprint, label: t('menu.items.voiceId') },
      household: { icon: ICONS.household, label: t('menu.items.householdMembers') },
      'contact-settings': { icon: ICONS.heart, label: t('menu.items.contactInfo') },
      export: { icon: ICONS.download, label: t('menu.items.exportData') },
      'share-ferni': { icon: ICONS.share, label: t('menu.items.shareFerni') },
      help: { icon: ICONS.help, label: t('menu.items.takeTour') },
    };

    const pinnedItemsHtml = [...this.pinnedItems]
      .filter((action) => menuItems[action] && !this.isFeatureLocked(action))
      .map((action) => {
        const item = menuItems[action];
        return `
          <button class="settings-menu__item settings-menu__item--pinned" data-action="${action}" data-pinnable="true">
            <span class="settings-menu__icon">${item.icon}</span>
            <span class="settings-menu__label">${item.label}</span>
            <button class="settings-menu__unpin-btn" data-unpin="${action}" aria-label="${t('menu.unpinItem')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </button>
        `;
      })
      .join('');

    if (!pinnedItemsHtml) return '';

    return `
      <section class="settings-menu__section settings-menu__section--pinned settings-menu__section--expanded">
        <div class="settings-menu__section-header settings-menu__section-header--static">
          <h3>${t('menu.sections.pinned')}</h3>
        </div>
        <div class="settings-menu__section-content">
          ${pinnedItemsHtml}
        </div>
      </section>
    `;
  }

  /**
   * Render admin section (only visible when admin mode is enabled)
   */
  private renderAdminSection(expandedSections: Set<string>): string {
    // Check if admin mode is enabled via localStorage
    const isAdmin = localStorage.getItem('ferni_admin_id');
    if (!isAdmin) return '';

    return this.renderCollapsibleSection(
      'admin',
      t('menu.sections.admin'),
      expandedSections.has('admin'),
      `
      ${this.renderMenuItemWithBadge('marketplace-admin', ICONS.analytics, 'Marketplace Queue', 'ADMIN')}
      `
    );
  }

  /**
   * Render a menu item with a badge (NEW, count, etc.)
   */
  private renderMenuItemWithBadge(
    action: string,
    icon: string,
    label: string,
    badge: string
  ): string {
    const isLocked = this.isFeatureLocked(action);
    const requiredStage = this.getRequiredStage(action);
    const lockedClass = isLocked ? 'settings-menu__item--locked' : '';
    const stageName = requiredStage ? STAGE_NAMES[requiredStage] : '';

    if (isLocked) {
      return `
        <button class="settings-menu__item ${lockedClass}" data-action="${action}" data-locked="true">
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
      <button class="settings-menu__item" data-action="${action}">
        <span class="settings-menu__icon">${icon}</span>
        <span class="settings-menu__label">${label}</span>
        <span class="settings-menu__badge">${badge}</span>
      </button>
    `;
  }

  /**
   * Render the language selector with current language and dropdown
   */
  private renderLanguageSelector(): string {
    const currentLocale = getLocale();
    const currentLang = SUPPORTED_LOCALES.find((l) => l.code === currentLocale);

    const expandedClass = this.languageExpanded ? 'settings-menu__item--expanded' : '';

    return `
      <div class="settings-menu__language-selector">
        <button class="settings-menu__item settings-menu__item--expandable ${expandedClass}" data-action="toggle-language">
          <span class="settings-menu__icon">${ICONS.globe}</span>
          <span class="settings-menu__label">${t('menu.items.language')}</span>
          <span class="settings-menu__language-current">
            <span class="settings-menu__language-flag">${currentLang?.flag || ''}</span>
            <span class="settings-menu__language-name">${currentLang?.nativeName || currentLocale}</span>
          </span>
          <span class="settings-menu__chevron">${ICONS.chevronRight}</span>
        </button>
        ${
          this.languageExpanded
            ? `
          <div class="settings-menu__language-list-inner">
            ${SUPPORTED_LOCALES.map(
              (lang) => `
              <button
                class="settings-menu__language-option ${lang.code === currentLocale ? 'settings-menu__language-option--active' : ''}"
                data-action="set-language"
                data-locale="${lang.code}"
              >
                <span class="settings-menu__language-flag">${lang.flag}</span>
                <span class="settings-menu__language-name">${lang.nativeName}</span>
                ${lang.code === currentLocale ? '<span class="settings-menu__language-check">✓</span>' : ''}
              </button>
            `
            ).join('')}
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  /**
   * Toggle a collapsible section
   */
  private toggleSection(sectionId: string): void {
    if (!this.expandedSections) {
      this.expandedSections = new Set(['journey', 'insights']);
    }

    if (this.expandedSections.has(sectionId)) {
      this.expandedSections.delete(sectionId);
    } else {
      this.expandedSections.add(sectionId);
    }

    // Re-render content to update UI
    this.renderContent();
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
      case 'commands':
        this.callbacks.onCommandsClick?.();
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
      case 'subscription':
        this.callbacks.onSubscriptionClick?.();
        break;
      case 'billing':
        this.callbacks.onBillingPortalClick?.();
        break;
      case 'household':
        this.callbacks.onHouseholdClick?.();
        break;
      case 'conversation-memory':
        this.callbacks.onConversationMemoryClick?.();
        break;
      case 'wellbeing':
        this.callbacks.onWellbeingClick?.();
        break;
      case 'personalize':
        this.callbacks.onPersonalizeClick?.();
        break;
      case 'your-journey':
        this.callbacks.onYourJourneyClick?.();
        break;
      case 'share-ferni':
        this.callbacks.onShareFerniClick?.();
        break;
      case 'support-ferni':
        this.callbacks.onSupportFerniClick?.();
        break;
      case 'accent-settings':
        this.callbacks.onAccentSettingsClick?.();
        break;
      case 'wearable-settings':
        this.callbacks.onWearableSettingsClick?.();
        break;
      case 'video-settings':
        this.callbacks.onVideoSettingsClick?.();
        break;
      case 'group-coaching':
        this.callbacks.onGroupCoachingClick?.();
        break;
      case 'marketplace-admin':
        this.callbacks.onMarketplaceAdminClick?.();
        break;
      case 'whats-growing':
        // Open roadmap panel with overview (no specific feature)
        showRoadmapPanel();
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

      /* The actual menu panel - slides in from right
         Uses responsive --panel-width token from design system */
      .settings-menu__card {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: var(--panel-width, 360px);
        max-width: var(--panel-max-width, 85vw);
        background: var(--color-background-elevated, #fffdfb);
        box-shadow: var(--shadow-2xl, -8px 0 32px rgba(44, 37, 32, 0.15));
        /* No border - cleaner look */
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: translateX(100%);
        transition: transform ${DURATION.MODERATE}ms ${EASING.EXPO_OUT};
        /* Safe area support for notched devices */
        padding-top: var(--safe-top, env(safe-area-inset-top, 0px));
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
        padding: 0 var(--space-4, 16px);
        margin-bottom: var(--space-2, 8px);
      }

      /* Collapsible Section Header */
      .settings-menu__section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: var(--space-3, 12px) var(--space-2, 8px);
        background: transparent;
        border: none;
        border-radius: var(--radius-md, 8px);
        cursor: pointer;
        transition: background ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .settings-menu__section-header:hover {
        background: var(--color-background-secondary, rgba(0, 0, 0, 0.03));
      }

      .settings-menu__section-header h3 {
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary);
        text-transform: none;
        letter-spacing: normal;
        margin: 0;
      }

      .settings-menu__section-chevron {
        width: 16px;
        height: 16px;
        color: var(--color-text-muted);
        transition: transform ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .settings-menu__section-chevron svg {
        width: 100%;
        height: 100%;
      }

      .settings-menu__section--expanded .settings-menu__section-chevron {
        transform: rotate(90deg);
      }

      /* Section Content - collapsible */
      .settings-menu__section-content {
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows ${DURATION.NORMAL}ms ${EASING.STANDARD};
        overflow: hidden;
      }

      .settings-menu__section--expanded .settings-menu__section-content {
        grid-template-rows: 1fr;
      }

      .settings-menu__section-content > * {
        overflow: hidden;
      }

      /* Quick Actions at bottom */
      .settings-menu__quick-actions {
        padding: var(--space-4, 16px) var(--space-4, 16px);
        margin-top: var(--space-2, 8px);
        border-top: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.06));
      }

      /* Badge for NEW items */
      .settings-menu__badge {
        padding: 2px 8px;
        background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
        color: white;
        font-size: 0.65rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-radius: var(--radius-full, 9999px);
        margin-left: auto;
      }

      .settings-menu__item {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        width: 100%;
        padding: var(--space-3, 12px) var(--space-4, 16px);
        margin-bottom: 2px;
        background: transparent;
        border: none;
        border-radius: var(--radius-lg, 12px);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
        text-align: left;
        position: relative;
        min-height: 44px; /* Consistent touch target */
      }

      .settings-menu__item:hover {
        background: var(--color-background-secondary, #f5f2ed);
      }

      .settings-menu__item:active {
        background: var(--color-background-tertiary, #ebe6df);
        transform: scale(0.98);
      }

      /* ========================================================================
         PINNED ITEMS
         ======================================================================== */
      .settings-menu__section--pinned {
        background: linear-gradient(135deg, var(--persona-tint), transparent);
        border-radius: var(--radius-lg);
        margin: 0 var(--space-2) var(--space-2);
        padding: var(--space-2) var(--space-2) !important;
      }

      .settings-menu__section-header--static {
        cursor: default;
        padding: var(--space-2);
      }

      .settings-menu__section-header--static:hover {
        background: transparent;
      }

      .settings-menu__section--pinned .settings-menu__section-chevron {
        display: none;
      }

      .settings-menu__item--pinned {
        background: var(--color-background-elevated);
        border: 1px solid var(--color-border-subtle);
        margin-bottom: var(--space-1);
      }

      .settings-menu__item--pinned:hover {
        border-color: var(--persona-primary);
      }

      .settings-menu__unpin-btn {
        position: absolute;
        right: var(--space-2);
        top: 50%;
        transform: translateY(-50%);
        width: 20px;
        height: 20px;
        padding: 0;
        background: transparent;
        border: none;
        border-radius: var(--radius-full);
        color: var(--color-text-muted);
        cursor: pointer;
        opacity: 0;
        transition: opacity ${DURATION.FAST}ms ${EASING.STANDARD},
                    color ${DURATION.FAST}ms ${EASING.STANDARD};
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .settings-menu__item--pinned:hover .settings-menu__unpin-btn {
        opacity: 1;
      }

      .settings-menu__unpin-btn:hover {
        color: var(--color-destructive);
      }

      .settings-menu__icon {
        width: 22px;
        height: 22px;
        color: var(--persona-primary, #4a6741);
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .settings-menu__icon svg {
        width: 100%;
        height: 100%;
      }

      .settings-menu__item:hover .settings-menu__icon {
        color: var(--persona-secondary, #3d5a35);
      }

      .settings-menu__label {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: var(--font-weight-medium, 500);
        color: var(--color-text-primary, #2c2520);
        flex: 1;
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
         LANGUAGE SELECTOR
         ======================================================================== */
      .settings-menu__language-selector {
        position: relative;
      }

      .settings-menu__item--expandable {
        justify-content: flex-start;
      }

      .settings-menu__language-current {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        margin-left: auto;
        color: var(--color-text-secondary);
        font-size: var(--text-sm);
      }

      .settings-menu__language-flag {
        font-size: 1.1em;
      }

      .settings-menu__language-name {
        font-family: var(--font-body);
      }

      .settings-menu__chevron {
        width: 16px;
        height: 16px;
        color: var(--color-text-muted);
        transition: transform ${DURATION.FAST}ms ${EASING.STANDARD};
        flex-shrink: 0;
      }

      .settings-menu__chevron svg {
        width: 100%;
        height: 100%;
      }

      .settings-menu__item--expanded .settings-menu__chevron {
        transform: rotate(90deg);
      }

      /* Language selector - wrapper stays collapsed by default */
      .settings-menu__language-selector {
        position: relative;
      }
      
      /* Language list - only shows when explicitly rendered (via JS) */
      .settings-menu__language-list-inner {
        overflow: hidden;
        padding-left: var(--space-4, 16px);
        padding-top: var(--space-2, 8px);
        animation: slideDown ${DURATION.NORMAL}ms ${EASING.STANDARD};
        /* Ensure proper display */
        display: block;
      }

      @keyframes slideDown {
        from {
          opacity: 0;
          transform: translateY(-8px);
          max-height: 0;
        }
        to {
          opacity: 1;
          transform: translateY(0);
          max-height: 500px;
        }
      }

      .settings-menu__language-option {
        display: flex;
        align-items: center;
        gap: var(--space-3, 12px);
        width: 100%;
        padding: var(--space-2, 8px) var(--space-4, 16px);
        margin-bottom: 2px;
        background: transparent;
        border: none;
        border-radius: var(--radius-md, 0.5rem);
        cursor: pointer;
        transition: all ${DURATION.FAST}ms ${EASING.STANDARD};
        text-align: left;
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--color-text-primary);
      }

      .settings-menu__language-option:hover {
        background: var(--color-background-secondary, #f5f2ed);
      }

      .settings-menu__language-option--active {
        background: var(--color-background-secondary, #f5f2ed);
      }

      .settings-menu__language-option--active .settings-menu__language-name {
        font-weight: var(--font-weight-medium, 500);
      }

      .settings-menu__language-check {
        margin-left: auto;
        color: var(--color-accent-primary, #2d5a3d);
        font-weight: var(--font-weight-semibold, 600);
      }

      /* RTL support for language selector */
      [dir="rtl"] .settings-menu__language-list-inner {
        padding-left: 0;
        padding-right: var(--space-4, 16px);
      }

      [dir="rtl"] .settings-menu__language-selector {
        text-align: right;
      }

      [dir="rtl"] .settings-menu__language-current {
        margin-left: 0;
        margin-right: auto;
      }

      [dir="rtl"] .settings-menu__language-check {
        margin-left: 0;
        margin-right: auto;
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

      /* ========================================================================
         ROADMAP FEATURE STATE (Coming Soon / What's Growing)
         ======================================================================== */
      .settings-menu__item--roadmap {
        background: linear-gradient(135deg, var(--persona-tint, rgba(74, 103, 65, 0.06)), transparent);
        border: 1px dashed var(--persona-primary, #4a6741);
        border-radius: var(--radius-md, 8px);
        cursor: pointer;
        position: relative;
        overflow: hidden;
      }

      .settings-menu__item--roadmap::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, transparent, var(--persona-tint, rgba(74, 103, 65, 0.03)));
        opacity: 0;
        transition: opacity ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .settings-menu__item--roadmap:hover {
        background: linear-gradient(135deg, var(--persona-tint, rgba(74, 103, 65, 0.1)), transparent);
        border-style: solid;
      }

      .settings-menu__item--roadmap:hover::before {
        opacity: 1;
      }

      .settings-menu__item--roadmap .settings-menu__icon {
        color: var(--persona-primary, #4a6741);
      }

      .settings-menu__roadmap-hint {
        font-family: var(--font-body);
        font-size: var(--text-xs);
        color: var(--persona-primary, #4a6741);
        font-weight: var(--font-weight-medium, 500);
      }

      .settings-menu__roadmap-badge {
        padding: 2px 8px;
        background: linear-gradient(135deg, var(--persona-primary, #4a6741), var(--persona-secondary, #3d5a35));
        color: white;
        font-size: 0.6rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-radius: var(--radius-full, 9999px);
        flex-shrink: 0;
      }

      /* Dark theme roadmap styles */
      [data-theme="midnight"] .settings-menu__item--roadmap {
        background: linear-gradient(135deg, var(--persona-tint, rgba(124, 179, 107, 0.1)), transparent);
        border-color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .settings-menu__item--roadmap:hover {
        background: linear-gradient(135deg, var(--persona-tint, rgba(124, 179, 107, 0.15)), transparent);
      }

      [data-theme="midnight"] .settings-menu__item--roadmap .settings-menu__icon {
        color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .settings-menu__roadmap-hint {
        color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .settings-menu__roadmap-badge {
        background: linear-gradient(135deg, var(--persona-primary, #5a7a51), var(--persona-secondary, #4a6a41));
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

      /* Dark Theme - Collapsible Sections */
      [data-theme="midnight"] .settings-menu__section-header:hover {
        background: var(--color-background-secondary, rgba(255, 255, 255, 0.05));
      }

      [data-theme="midnight"] .settings-menu__section-header h3 {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .settings-menu__section-chevron {
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .settings-menu__quick-actions {
        border-top-color: var(--color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      [data-theme="midnight"] .settings-menu__badge {
        background: linear-gradient(135deg, var(--persona-primary, #5a7a51), var(--persona-secondary, #4a6a41));
      }

      /* Dark Theme - Language Selector */
      [data-theme="midnight"] .settings-menu__language-current {
        color: var(--color-text-secondary, #e8e2da);
      }

      [data-theme="midnight"] .settings-menu__language-option {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .settings-menu__language-option:hover {
        background: var(--color-background-secondary, #60504a);
      }

      [data-theme="midnight"] .settings-menu__language-option--active {
        background: var(--color-background-secondary, #60504a);
      }

      [data-theme="midnight"] .settings-menu__language-check {
        color: var(--color-accent-secondary, #7cb36b);
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
          /* Position respecting safe areas on notched devices */
          top: calc(var(--ma-breath, 13px) + env(safe-area-inset-top, 0px));
          right: calc(var(--ma-breath, 13px) + env(safe-area-inset-right, 0px));
          width: 40px;
          height: 40px;
        }

        .settings-menu__card {
          width: 100%;
          max-width: none;
          border-left: none;
          border-radius: 0;
          /* iOS Safari: Use dvh for proper viewport handling */
          height: 100vh;
          height: 100dvh;
          /* NO padding on card - let children handle safe areas to avoid doubling */
        }
        
        .settings-menu__nav {
          /* iOS Safari: Smooth momentum scrolling */
          -webkit-overflow-scrolling: touch;
          /* Prevent overscroll bounce from affecting layout */
          overscroll-behavior: contain;
          /* Safe area padding for home indicator */
          padding-bottom: calc(var(--space-6, 24px) + env(safe-area-inset-bottom, 0));
          /* Safe area padding for left/right edges (landscape) */
          padding-left: env(safe-area-inset-left, 0);
          padding-right: env(safe-area-inset-right, 0);
        }

        .settings-menu__header {
          /* ONLY location for top safe area padding */
          padding: var(--space-4, 16px);
          padding-top: calc(var(--space-4, 16px) + env(safe-area-inset-top, 0));
          padding-left: calc(var(--space-4, 16px) + env(safe-area-inset-left, 0));
          padding-right: calc(var(--space-4, 16px) + env(safe-area-inset-right, 0));
        }

        .settings-menu__section {
          padding: 0 calc(var(--space-4, 16px) + env(safe-area-inset-left, 0));
          padding-right: calc(var(--space-4, 16px) + env(safe-area-inset-right, 0));
        }
        
        /* iOS Safari: Fix touch targets being too small */
        .settings-menu__item {
          min-height: 48px;
          -webkit-tap-highlight-color: transparent;
        }
        
        /* Close button: NO extra margin - already handled by header padding */
        .settings-menu__close {
          margin-top: 0;
        }
        
        /* Language list: Ensure proper display */
        .settings-menu__language-list-inner {
          max-height: 300px;
          overflow-y: auto;
        }
      }
      
      /* iPhone Pro specific (390-430px) - Same as mobile */
      @media (min-width: 390px) and (max-width: 430px) {
        .settings-menu__card {
          width: 100%;
          max-width: none;
        }
      }
      
      /* iOS Safari specific fixes using @supports */
      @supports (-webkit-touch-callout: none) {
        @media (max-width: 480px) {
          /* iOS Safari only on mobile */
          .settings-menu__card {
            /* Use -webkit-fill-available for iOS Safari */
            height: -webkit-fill-available;
          }
          
          .settings-menu__nav {
            /* Ensure momentum scrolling on iOS */
            -webkit-overflow-scrolling: touch;
          }
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
