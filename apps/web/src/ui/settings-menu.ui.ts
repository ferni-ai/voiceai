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
  getTranslatedStageName,
  UNLOCKABLE_FEATURES,
  type RelationshipStage,
} from '../services/relationship-stage.service.js';
// Team unlock service - for gating marketplace behind full team unlock
import { isFullTeamUnlocked } from '../services/team-unlock.service.js';
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
  onVibeControllerClick?: () => void;
  onEightSleepClick?: () => void;
  onOuraClick?: () => void;
  onAppleHealthClick?: () => void;
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
  onLifeContextClick?: () => void;
  onTeamInsightsClick?: () => void;
  onSupportFerniClick?: () => void;
  onPersonalizeClick?: () => void;
  onYourStoryClick?: () => void;
  onYourYearClick?: () => void;
  onFutureInsightsClick?: () => void;
  onShareFerniClick?: () => void;
  onAccentSettingsClick?: () => void;
  onWearableSettingsClick?: () => void;
  onVideoSettingsClick?: () => void;
  onGroupCoachingClick?: () => void;
  onMarketplaceAdminClick?: () => void;
  onCreativeYouClick?: () => void;
  onDiscoverAgentsClick?: () => void;
  onConnectionsClick?: () => void;
  onContactsClick?: () => void;
  onGiftsClick?: () => void;
  onJournalClick?: () => void;
  onLinkedInClick?: () => void;
  onClose?: () => void;
  // Warm menu callbacks
  onTogetherSessionsClick?: () => void;
  onAllConnectionsClick?: () => void;
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
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',

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
  layers:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 12-8.58 3.91a2 2 0 0 1-1.66 0L2.18 12"/><path d="m22 17-8.58 3.91a2 2 0 0 1-1.66 0L2.18 17"/></svg>',
  lightbulb:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',

  // Connection & Communication
  team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="5" cy="12" r="2"/></svg>',
  users:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  share:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M20 21H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1Z"/></svg>',

  // Voice & Sound
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>',
  thermostat:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M14 4V10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z"/><line x1="12" y1="14" x2="12" y2="10"/></svg>',
  bed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 4v16"/><path d="M22 4v16"/><path d="M2 8h20"/><path d="M2 16h20"/><path d="M6 8v8"/><path d="M18 8v8"/></svg>',
  ring: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/></svg>',
  rooms:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="7" width="8" height="10" rx="1"/><rect x="14" y="7" width="8" height="10" rx="1"/><path d="M10 12h4"/></svg>',
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
  // Contacts & Gifts
  contacts:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M8 6h8"/><path d="M8 10h8"/><path d="M8 14h4"/><circle cx="12" cy="18" r="1"/></svg>',
  gift:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="8" width="18" height="14" rx="2"/><path d="M12 8V22"/><path d="M3 12h18"/><path d="M12 8a4 4 0 0 0-4-4c-1.7 0-3 1.3-3 3 0 1 .4 1.9 1 2.5"/><path d="M12 8a4 4 0 0 1 4-4c1.7 0 3 1.3 3 3 0 1-.4 1.9-1 2.5"/></svg>',

  // Social & Professional
  linkedin:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/></svg>',

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

  // Creative & Discovery
  creative:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
  compass:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
  link:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',

  // Legacy aliases (deprecated but kept for compatibility)
  creditCard:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z"/><path d="M1 10h22"/></svg>',
  infinity:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"/></svg>',

  // Digital Twin / Journal
  journal:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M8 7h6"/><path d="M8 11h8"/></svg>',

  // New icons for restructured menu
  phone:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  concierge:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08v0c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66"/><path d="m18 15-2-2"/><path d="m15 18-2-2"/></svg>',
  insights:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 12h5"/><path d="M17 12h5"/><path d="M12 2v5"/><path d="M12 17v5"/><circle cx="12" cy="12" r="4"/><path d="m4.93 4.93 3.54 3.54"/><path d="m15.54 15.54 3.53 3.53"/><path d="m15.54 8.46 3.53-3.53"/><path d="m4.93 19.07 3.54-3.54"/></svg>',
  plug:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a6 6 0 0 1-6 6v0a6 6 0 0 1-6-6V8Z"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>',
  gamepad:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/></svg>',

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
  'video-call-settings': 'video-sessions',

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
  // New warm structure
  yourPractices: 'first-meeting', // Always visible - habit loop
  understandingYou: 'getting-started', // After 2+ conversations - needs data
  waysToConnect: 'first-meeting', // Always visible - engagement
  yourPeople: 'first-meeting', // Always visible - relationships
  connectedLife: 'first-meeting', // Always visible - integrations
  settings: 'first-meeting', // Always visible - preferences & account
};

// ============================================================================
// PINNED ITEMS STORAGE
// ============================================================================

const PINNED_STORAGE_KEY = 'ferni_menu_pinned';
const EXPANDED_STORAGE_KEY = 'ferni_menu_expanded';

// Default sections to expand (warm, focused structure)
const DEFAULT_EXPANDED_SECTIONS = [
  'yourPractices',
  'understandingYou',
  'waysToConnect',
  'yourPeople',
  'connectedLife',
  'settings'
];

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

function getExpandedSections(): Set<string> {
  try {
    const stored = localStorage.getItem(EXPANDED_STORAGE_KEY);
    // If user has saved preferences, use those; otherwise use defaults
    return stored ? new Set(JSON.parse(stored)) : new Set(DEFAULT_EXPANDED_SECTIONS);
  } catch {
    return new Set(DEFAULT_EXPANDED_SECTIONS);
  }
}

function saveExpandedSections(sections: Set<string>): void {
  localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...sections]));
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
  // Load saved preferences or use defaults (all expanded)
  private expandedSections: Set<string> = getExpandedSections();
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
   * Get time-aware greeting for the header
   * Makes the menu feel personal and present
   */
  private getTimeGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 5) return t('menu.greeting.lateNight');
    if (hour < 12) return t('menu.greeting.morning');
    if (hour < 17) return t('menu.greeting.afternoon');
    if (hour < 21) return t('menu.greeting.evening');
    return t('menu.greeting.night');
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

    // Hide marketplace until full team is unlocked - users should know the team first
    if (action === 'discover-agents' && !isFullTeamUnlocked()) {
      return '';
    }

    const isLocked = this.isFeatureLocked(action);
    const isPinned = this.pinnedItems.has(action);
    const lockedClass = isLocked ? 'settings-menu__item--locked' : '';
    const pinnedClass = isPinned ? 'settings-menu__item--pinned' : '';

    if (isLocked) {
      const hint = this.getUnlockHint(action);
      return `
        <button aria-label="${label}" class="settings-menu__item ${lockedClass} ${extraClasses}" data-action="${action}" data-locked="true">
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
      <button aria-label="${label}" class="settings-menu__item ${pinnedClass} ${extraClasses}" data-action="${action}" data-pinnable="true">
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
          <div class="settings-menu__header-content">
            <span class="settings-menu__header-eyebrow">${this.getTimeGreeting()}</span>
            <h2>${t('menu.title')}</h2>
          </div>
          <button class="settings-menu__close" aria-label="${t('accessibility.closeMenu')}">${ICONS.close}</button>
        </header>

        <!-- Relationship Stage Banner (compact) -->
        <div class="settings-menu__stage-banner">
          <div class="settings-menu__stage-info">
            <span class="settings-menu__stage-label">${t('menu.yourStage')}</span>
            <span class="settings-menu__stage-name">${getTranslatedStageName(currentStage)}</span>
          </div>
          ${
            progress.nextStage
              ? `
            <div class="settings-menu__stage-progress">
              <div class="settings-menu__stage-bar">
                <div class="settings-menu__stage-fill" style="width: ${Math.round(progress.progress * 100)}%"></div>
              </div>
              <span class="settings-menu__stage-next">${t('menu.nextStage', { stage: getTranslatedStageName(progress.nextStage) })}</span>
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

          <!-- ============================================================
               WARM MENU STRUCTURE - Human-Centered, Relationship-Focused
               1. Your Practices - The habit loop (core engagement)
               2. Understanding You - All insights in one place
               3. Ways to Connect - Warm engagement activities  
               4. Your People - Relationships & family
               5. Your Connected Life - All integrations (one entry → panel)
               6. Settings - Preferences & account combined
               ============================================================ -->

          <!-- SECTION 1: Your Practices - The habit loop -->
          ${
            this.isSectionVisible('yourPractices')
              ? this.renderCollapsibleSection(
                  'yourPractices',
                  t('menu.sections.yourPractices'),
                  expandedSections.has('yourPractices'),
                  `
            ${this.renderMenuItem('commands', ICONS.commands, t('menu.items.guidedPractices'))}
            ${this.renderMenuItem('ritual', ICONS.ritual, t('menu.items.createPractice'))}
            ${this.renderMenuItem('notifications', ICONS.bell, t('menu.items.notifications'))}
          `
                )
              : ''
          }

          <!-- SECTION 2: Understanding You - All insights consolidated -->
          ${
            this.isSectionVisible('understandingYou')
              ? this.renderCollapsibleSection(
                  'understandingYou',
                  t('menu.sections.understandingYou'),
                  expandedSections.has('understandingYou'),
                  `
            ${this.renderMenuItem('your-story', ICONS.heart, t('menu.items.yourStory') || 'Your Story')}
            ${this.renderMenuItemWithBadge('your-year', ICONS.sparkles, t('menu.items.yourYear') || 'Your Year with Ferni', t('common.new'))}
            ${this.renderMenuItemWithBadge('future-insights', ICONS.sparkles, t('menu.items.whatIllKnow'), t('common.new'))}
            ${this.renderMenuItem('conversation-memory', ICONS.memory, t('menu.items.memoryBrowser'))}
            ${this.renderMenuItem('history', ICONS.history, t('menu.items.conversationHistory'))}
          `
                )
              : ''
          }

          <!-- SECTION 3: Ways to Connect - Warm engagement activities -->
          ${
            this.isSectionVisible('waysToConnect')
              ? this.renderCollapsibleSection(
                  'waysToConnect',
                  t('menu.sections.waysToConnect'),
                  expandedSections.has('waysToConnect'),
                  `
            ${this.renderMenuItemWithBadge('vibe-controller', ICONS.sparkles, t('menu.items.setTheVibe'), t('common.new'))}
            ${this.renderMenuItemWithBadge('journal', ICONS.journal, t('menu.items.journaling'), t('common.new'))}
            ${this.renderMenuItem('play-games', ICONS.sparkles, t('menu.items.playGames'))}
            ${this.renderMenuItemWithBadge('music-dashboard', ICONS.music, t('menu.items.musicalYou'), t('common.updated'))}
            ${this.renderMenuItemWithBadge('creative-you', ICONS.creative, t('menu.items.creativeYou'), t('common.new'))}
            ${this.renderMenuItem('video-call-settings', ICONS.video, t('menu.items.videoSessions'))}
            ${this.renderMenuItem('discover-agents', ICONS.compass, t('menu.items.discoverAgents'))}
            ${this.renderMenuItem('together-sessions', ICONS.users, t('menu.items.togetherSessions'))}
          `
                )
              : ''
          }

          <!-- SECTION 4: Your People - Relationships & family -->
          ${
            this.isSectionVisible('yourPeople')
              ? this.renderCollapsibleSection(
                  'yourPeople',
                  t('menu.sections.yourPeople'),
                  expandedSections.has('yourPeople'),
                  `
            ${this.renderMenuItem('contacts', ICONS.users, t('menu.items.contacts'))}
            ${this.renderMenuItem('household-members', ICONS.home, t('menu.items.householdMembers'))}
          `
                )
              : ''
          }

          <!-- SECTION 5: Your Connected Life - One entry opens tabbed panel -->
          ${
            this.isSectionVisible('connectedLife')
              ? this.renderCollapsibleSection(
                  'connectedLife',
                  t('menu.sections.connectedLife'),
                  expandedSections.has('connectedLife'),
                  `
            ${this.renderMenuItem('all-connections', ICONS.link, t('menu.items.allConnections'))}
          `
                )
              : ''
          }

          <!-- SECTION 6: Settings - Preferences & account combined (UPDATED 2024-12-24 v2) -->
          ${(() => {
            // Debug log removed - use browser DevTools if needed
            return this.isSectionVisible('settings')
              ? this.renderCollapsibleSection(
                  'settings',
                  t('menu.sections.settings'),
                  expandedSections.has('settings'),
                  `
            ${this.renderMenuItem('personal-settings', ICONS.palette, t('menu.items.personalize'))}
            ${this.renderMenuItem('accent-settings', ICONS.globe, t('menu.items.voiceAccent'))}
            ${this.renderMenuItem('theme', ICONS.theme, t('menu.items.themeLanguage'))}
            ${this.renderMenuItem('voice-id-settings', ICONS.fingerprint, t('menu.items.voiceId'))}
            ${this.renderMenuItem('contact-settings', ICONS.contact, t('menu.items.contactInfo'))}
            ${this.renderMenuItem('support-ferni', ICONS.heart, t('menu.items.supportFerniExpanded'))}
            ${this.renderMenuItem('billing', ICONS.creditCard, t('menu.items.accountBilling'))}
            ${this.renderMenuItem('export', ICONS.scroll, t('menu.items.exportData'))}
          `
                )
              : '';
          })()}

          <!-- SECTION: Admin (only visible for admins) -->
          ${this.renderAdminSection(expandedSections)}

          <!-- Bottom Quick Actions -->
          <div class="settings-menu__quick-actions" role="group" aria-label="${t('menu.sections.connect')}">
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
        <button aria-label="${isExpanded ? 'Collapse' : 'Expand'} ${title}" class="settings-menu__section-header" data-section="${id}" aria-expanded="${isExpanded}">
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
      // Warm menu items
      'together-sessions': { icon: ICONS.users, label: t('menu.items.togetherSessions') },
      'all-connections': { icon: ICONS.link, label: t('menu.items.allConnections') },
      // Core items
      'your-story': { icon: ICONS.heart, label: t('menu.items.yourStory') || 'Your Story' },
      'your-year': { icon: ICONS.sparkles, label: t('menu.items.yourYear') || 'Your Year with Ferni' },
      'future-insights': { icon: ICONS.sparkles, label: t('menu.items.whatIllKnow') },
      analytics: { icon: ICONS.analytics, label: t('menu.items.progressAnalytics') },
      predictions: { icon: ICONS.target, label: t('menu.items.predictionAccuracy') },
      cognitive: { icon: ICONS.brain, label: t('menu.items.whatILearned') },
      'conversation-memory': { icon: ICONS.memory, label: t('menu.items.memoryBrowser') },
      wellbeing: { icon: ICONS.wellbeing, label: t('menu.items.wellbeingDashboard') },
      'life-context': { icon: ICONS.layers, label: t('menu.items.lifeContext') },
      'team-insights': { icon: ICONS.lightbulb, label: t('menu.items.teamInsights') },
      history: { icon: ICONS.history, label: t('menu.items.conversationHistory') },
      contacts: { icon: ICONS.users, label: t('menu.items.contacts') },
      'video-call-settings': { icon: ICONS.video, label: t('menu.items.videoSessions') },
      'group-coaching': { icon: ICONS.users, label: t('menu.items.groupCoaching') },
      team: { icon: ICONS.team, label: t('menu.items.teamHuddles') },
      'play-games': { icon: ICONS.sparkles, label: t('menu.items.playGames') },
      'music-dashboard': { icon: ICONS.music, label: t('menu.items.musicalYou') },
      'creative-you': { icon: ICONS.creative, label: t('menu.items.creativeYou') },
      'discover-agents': { icon: ICONS.compass, label: t('menu.items.discoverAgents') },
      journal: { icon: ICONS.journal, label: t('menu.items.journaling') },
      personalize: { icon: ICONS.palette, label: t('menu.items.personalize') },
      'accent-settings': { icon: ICONS.globe, label: t('menu.items.voiceAccent') },
      commands: { icon: ICONS.commands, label: t('menu.items.guidedPractices') },
      ritual: { icon: ICONS.ritual, label: t('menu.items.createPractice') },
      'wearable-settings': { icon: ICONS.watch, label: t('menu.items.wearables') },
      'linkedin-settings': { icon: ICONS.linkedin, label: t('menu.items.linkedin') },
      'calendar-settings': { icon: ICONS.calendar, label: t('menu.items.calendar') },
      notifications: { icon: ICONS.bell, label: t('menu.items.notifications') },
      theme: { icon: ICONS.theme, label: t('menu.items.toggleTheme') },
      'support-ferni': { icon: ICONS.heart, label: t('menu.items.supportFerniExpanded') },
      'voice-enrollment': { icon: ICONS.fingerprint, label: t('menu.items.voiceId') },
      household: { icon: ICONS.users, label: t('menu.items.householdMembers') },
      'contact-settings': { icon: ICONS.contact, label: t('menu.items.contactInfo') },
      export: { icon: ICONS.download, label: t('menu.items.exportData') },
      'share-ferni': { icon: ICONS.share, label: t('menu.items.shareFerni') },
      help: { icon: ICONS.help, label: t('menu.items.takeTour') },
      billing: { icon: ICONS.creditCard, label: t('menu.items.billingPortal') },
    };

    const pinnedItemsHtml = [...this.pinnedItems]
      .filter((action) => menuItems[action] && !this.isFeatureLocked(action))
      .map((action) => {
        const item = menuItems[action];
        return `
          <button aria-label="${item.label}" class="settings-menu__item settings-menu__item--pinned" data-action="${action}" data-pinnable="true">
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
    const stageName = requiredStage ? getTranslatedStageName(requiredStage) : '';

    if (isLocked) {
      return `
        <button aria-label="${label}" class="settings-menu__item ${lockedClass}" data-action="${action}" data-locked="true">
          <span class="settings-menu__icon">${icon}</span>
          <span class="settings-menu__label-wrap">
            <span class="settings-menu__label">${label}</span>
            <span class="settings-menu__unlock-hint">${t('menu.unlockHint', { remaining: stageName })}</span>
          </span>
          <span class="settings-menu__lock-icon">${ICONS.lock}</span>
        </button>
      `;
    }

    return `
      <button aria-label="${label}" class="settings-menu__item" data-action="${action}">
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
        <button aria-label="${this.languageExpanded ? 'Collapse' : 'Expand'} ${t('menu.items.language')}" class="settings-menu__item settings-menu__item--expandable ${expandedClass}" data-action="toggle-language">
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
              <button aria-label="${lang.nativeName}${lang.code === currentLocale ? ' (current)' : ''}"
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
   * Toggle a collapsible section and persist preference
   */
  private toggleSection(sectionId: string): void {
    if (!this.expandedSections) {
      this.expandedSections = getExpandedSections();
    }

    if (this.expandedSections.has(sectionId)) {
      this.expandedSections.delete(sectionId);
    } else {
      this.expandedSections.add(sectionId);
    }

    // Save user's preference
    saveExpandedSections(this.expandedSections);

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
      case 'vibe-controller':
        this.callbacks.onVibeControllerClick?.();
        break;
      case 'eight-sleep-settings':
        this.callbacks.onEightSleepClick?.();
        break;
      case 'oura-settings':
        this.callbacks.onOuraClick?.();
        break;
      case 'apple-health-settings':
        this.callbacks.onAppleHealthClick?.();
        break;
      // trust-journey removed - consolidated into your-story
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
      case 'voice-id-settings':
        this.callbacks.onVoiceEnrollmentClick?.();
        break;
      case 'subscription':
        this.callbacks.onSubscriptionClick?.();
        break;
      case 'billing':
        this.callbacks.onBillingPortalClick?.();
        break;
      case 'household':
      case 'household-members':
        this.callbacks.onHouseholdClick?.();
        break;
      case 'conversation-memory':
        this.callbacks.onConversationMemoryClick?.();
        break;
      case 'wellbeing':
        this.callbacks.onWellbeingClick?.();
        break;
      case 'life-context':
        this.callbacks.onLifeContextClick?.();
        break;
      case 'team-insights':
        this.callbacks.onTeamInsightsClick?.();
        break;
      case 'personalize':
      case 'personal-settings':
        this.callbacks.onPersonalizeClick?.();
        break;
      case 'your-story':
        this.callbacks.onYourStoryClick?.();
        break;
      case 'your-year':
        this.callbacks.onYourYearClick?.();
        break;
      case 'future-insights':
        this.callbacks.onFutureInsightsClick?.();
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
      case 'linkedin-settings':
        this.callbacks.onLinkedInClick?.();
        break;
      case 'video-call-settings':
      case 'video-settings':
        this.callbacks.onVideoSettingsClick?.();
        break;
      case 'group-coaching':
        this.callbacks.onGroupCoachingClick?.();
        break;
      case 'marketplace-admin':
        this.callbacks.onMarketplaceAdminClick?.();
        break;
      case 'creative-you':
        this.callbacks.onCreativeYouClick?.();
        break;
      case 'discover-agents':
        this.callbacks.onDiscoverAgentsClick?.();
        break;
      case 'journal':
        this.callbacks.onJournalClick?.();
        break;
      case 'connections':
        this.callbacks.onConnectionsClick?.();
        break;
      case 'contacts':
        this.callbacks.onContactsClick?.();
        break;
      case 'gifts':
        this.callbacks.onGiftsClick?.();
        break;
      case 'whats-growing':
        // Open roadmap panel with overview (no specific feature)
        showRoadmapPanel();
        break;
      // Warm menu actions
      case 'together-sessions':
        this.callbacks.onTogetherSessionsClick?.();
        break;
      case 'all-connections':
        this.callbacks.onAllConnectionsClick?.();
        break;
      // Quick Add actions
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

      /* ========================================================================
         HEADER - Premium warm styling with persona awareness
         ======================================================================== */
      .settings-menu__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-5, 20px) var(--space-6, 24px);
        background: linear-gradient(180deg, 
          var(--color-background-elevated, #fffdfb) 0%,
          var(--color-background-primary, #f5f1e8) 100%
        );
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        flex-shrink: 0;
        position: relative;
        overflow: hidden;
      }

      /* Subtle persona glow in header */
      .settings-menu__header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, 
          transparent 0%,
          var(--persona-primary, #4a6741) 50%,
          transparent 100%
        );
        opacity: 0.6;
      }

      .settings-menu__header-content {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .settings-menu__header-eyebrow {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--persona-primary, #4a6741);
        opacity: 0.85;
      }

      .settings-menu__header h2 {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-lg, 1.125rem);
        font-weight: var(--font-weight-semibold, 600);
        color: var(--color-text-primary, #2c2520);
        margin: 0;
        letter-spacing: -0.01em;
      }

      .settings-menu__close {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 38px;
        height: 38px;
        padding: 0;
        background: var(--color-background-secondary, #f5f2ed);
        border: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.06));
        border-radius: var(--radius-full, 9999px);
        color: var(--color-text-muted, #756a5e);
        cursor: pointer;
        transition: 
          background ${DURATION.FAST}ms ${EASING.STANDARD},
          color ${DURATION.FAST}ms ${EASING.STANDARD},
          transform ${DURATION.FAST}ms ${EASING.SPRING},
          box-shadow ${DURATION.FAST}ms ${EASING.STANDARD};
        box-shadow: 0 1px 3px rgba(44, 37, 32, 0.04);
      }

      .settings-menu__close:hover {
        background: var(--color-background-tertiary, #ebe6df);
        color: var(--color-text-primary, #2c2520);
        transform: scale(1.08);
        box-shadow: 0 2px 8px rgba(44, 37, 32, 0.08);
      }

      .settings-menu__close:active {
        transform: scale(0.92);
        box-shadow: none;
      }

      .settings-menu__close:focus-visible {
        outline: 2px solid var(--persona-primary, #4a6741);
        outline-offset: 2px;
      }

      .settings-menu__close svg {
        width: 16px;
        height: 16px;
        stroke-width: 2;
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

      /* ========================================================================
         COLLAPSIBLE SECTIONS - Premium accordion styling
         ======================================================================== */
      .settings-menu__section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: var(--space-3, 12px) var(--space-3, 12px);
        background: transparent;
        border: none;
        border-radius: var(--radius-lg, 12px);
        cursor: pointer;
        transition: 
          background ${DURATION.FAST}ms ${EASING.STANDARD},
          transform ${DURATION.FAST}ms ${EASING.SPRING};
        position: relative;
      }

      .settings-menu__section-header::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: var(--space-3, 12px);
        right: var(--space-3, 12px);
        height: 1px;
        background: var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        opacity: 0;
        transition: opacity ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .settings-menu__section--expanded .settings-menu__section-header::after {
        opacity: 1;
      }

      .settings-menu__section-header:hover {
        background: var(--color-background-secondary, rgba(0, 0, 0, 0.02));
      }

      .settings-menu__section-header:active {
        transform: scale(0.995);
      }

      .settings-menu__section-header:focus-visible {
        outline: none;
        box-shadow: inset 0 0 0 2px var(--persona-primary, #4a6741);
      }

      .settings-menu__section-header h3 {
        font-family: var(--font-display);
        font-size: 13px;
        font-weight: 600;
        color: var(--color-text-primary);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin: 0;
        transition: color ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .settings-menu__section--expanded .settings-menu__section-header h3 {
        color: var(--persona-primary, #4a6741);
      }

      .settings-menu__section-chevron {
        width: 18px;
        height: 18px;
        color: var(--color-text-muted);
        background: var(--color-background-tertiary, rgba(0, 0, 0, 0.03));
        border-radius: var(--radius-full, 9999px);
        padding: 3px;
        transition: 
          transform ${DURATION.NORMAL}ms ${EASING.SPRING},
          background ${DURATION.FAST}ms ${EASING.STANDARD},
          color ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .settings-menu__section-chevron svg {
        width: 100%;
        height: 100%;
      }

      .settings-menu__section--expanded .settings-menu__section-chevron {
        transform: rotate(90deg);
        background: var(--persona-tint, rgba(74, 103, 65, 0.12));
        color: var(--persona-primary, #4a6741);
      }

      .settings-menu__section-header:hover .settings-menu__section-chevron {
        background: var(--color-background-tertiary, rgba(0, 0, 0, 0.05));
      }

      /* Section Content - collapsible with stagger */
      .settings-menu__section-content {
        display: grid;
        grid-template-rows: 0fr;
        transition: grid-template-rows ${DURATION.MODERATE}ms ${EASING.EXPO_OUT};
        overflow: hidden;
      }

      .settings-menu__section--expanded .settings-menu__section-content {
        grid-template-rows: 1fr;
      }

      .settings-menu__section-content > * {
        overflow: hidden;
      }

      /* Staggered reveal animation for items inside sections */
      .settings-menu__section-content .settings-menu__item {
        opacity: 0;
        transform: translateX(-8px);
        transition: 
          opacity ${DURATION.NORMAL}ms ${EASING.EXPO_OUT},
          transform ${DURATION.NORMAL}ms ${EASING.EXPO_OUT},
          background ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .settings-menu__section--expanded .settings-menu__section-content .settings-menu__item {
        opacity: 1;
        transform: translateX(0);
      }

      /* Stagger delays for first 8 items */
      .settings-menu__section--expanded .settings-menu__section-content .settings-menu__item:nth-child(1) { transition-delay: 30ms; }
      .settings-menu__section--expanded .settings-menu__section-content .settings-menu__item:nth-child(2) { transition-delay: 60ms; }
      .settings-menu__section--expanded .settings-menu__section-content .settings-menu__item:nth-child(3) { transition-delay: 90ms; }
      .settings-menu__section--expanded .settings-menu__section-content .settings-menu__item:nth-child(4) { transition-delay: 120ms; }
      .settings-menu__section--expanded .settings-menu__section-content .settings-menu__item:nth-child(5) { transition-delay: 150ms; }
      .settings-menu__section--expanded .settings-menu__section-content .settings-menu__item:nth-child(6) { transition-delay: 180ms; }
      .settings-menu__section--expanded .settings-menu__section-content .settings-menu__item:nth-child(7) { transition-delay: 210ms; }
      .settings-menu__section--expanded .settings-menu__section-content .settings-menu__item:nth-child(8) { transition-delay: 240ms; }

      /* For subgroups, apply stagger to their children */
      .settings-menu__subgroup .settings-menu__item {
        transition-delay: inherit;
      }

      .settings-menu__section--expanded .settings-menu__subgroup:nth-child(1) .settings-menu__item { transition-delay: 30ms; }
      .settings-menu__section--expanded .settings-menu__subgroup:nth-child(2) .settings-menu__item { transition-delay: 80ms; }
      .settings-menu__section--expanded .settings-menu__subgroup:nth-child(3) .settings-menu__item { transition-delay: 130ms; }

      /* ========================================================================
         SUBGROUPS - Organized life domains within Connections section
         Clean, minimal grouping without heavy visual weight
         ======================================================================== */
      .settings-menu__subgroup {
        margin-bottom: var(--space-3, 12px);
        padding: var(--space-2, 8px) 0;
      }

      .settings-menu__subgroup:last-child {
        margin-bottom: 0;
      }

      /* Subgroup header with icon and label */
      .settings-menu__subgroup-header {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        padding: var(--space-1, 4px) var(--space-3, 12px) var(--space-2, 8px);
        margin-bottom: var(--space-1, 4px);
      }

      .settings-menu__subgroup-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        color: var(--color-text-muted, #756a5e);
        opacity: 0.5;
      }

      .settings-menu__subgroup-icon svg {
        width: 14px;
        height: 14px;
      }

      .settings-menu__subgroup-label {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--color-text-muted, #756a5e);
        opacity: 0.7;
      }

      /* Subgroup items get slightly smaller styling */
      .settings-menu__subgroup .settings-menu__item {
        padding: var(--space-2, 8px) var(--space-3, 12px);
        min-height: 44px;
      }

      .settings-menu__subgroup .settings-menu__icon {
        width: 32px;
        height: 32px;
      }

      .settings-menu__subgroup .settings-menu__icon svg {
        width: 16px;
        height: 16px;
      }

      /* Divider between subgroups */
      .settings-menu__subgroup + .settings-menu__subgroup {
        border-top: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.04));
        padding-top: var(--space-3, 12px);
        margin-top: var(--space-2, 8px);
      }

      /* ========================================================================
         QUICK ACTIONS FOOTER - Warm, inviting bottom section
         ======================================================================== */
      .settings-menu__quick-actions {
        padding: var(--space-5, 20px) var(--space-4, 16px);
        margin-top: var(--space-3, 12px);
        background: linear-gradient(180deg, 
          transparent 0%,
          var(--color-background-secondary, rgba(0, 0, 0, 0.015)) 100%
        );
        border-top: 1px solid var(--color-border-subtle, rgba(0, 0, 0, 0.04));
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      /* Quick action items are smaller, more subtle */
      .settings-menu__quick-actions .settings-menu__item {
        padding: var(--space-2, 8px) var(--space-3, 12px);
        min-height: 40px;
      }

      .settings-menu__quick-actions .settings-menu__icon {
        width: 28px;
        height: 28px;
        background: transparent;
      }

      .settings-menu__quick-actions .settings-menu__icon svg {
        width: 16px;
        height: 16px;
      }

      .settings-menu__quick-actions .settings-menu__item:hover .settings-menu__icon {
        background: var(--persona-tint, rgba(74, 103, 65, 0.1));
        color: var(--persona-primary, #4a6741);
      }

      .settings-menu__quick-actions .settings-menu__label {
        font-size: 13px;
        color: var(--color-text-secondary);
      }

      .settings-menu__quick-actions .settings-menu__item:hover .settings-menu__label {
        color: var(--color-text-primary);
      }

      /* Badge for NEW/UPDATED items - Premium pill styling */
      .settings-menu__badge {
        padding: 3px 10px;
        background: linear-gradient(135deg, 
          var(--persona-primary, #4a6741) 0%,
          var(--persona-secondary, #3d5a35) 100%
        );
        color: white;
        font-family: var(--font-body, Inter, sans-serif);
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        border-radius: var(--radius-full, 9999px);
        margin-left: auto;
        box-shadow: 0 2px 4px rgba(74, 103, 65, 0.25);
        animation: badgePulse 2s ease-in-out infinite;
      }

      @keyframes badgePulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.85; }
      }

      .settings-menu__item:hover .settings-menu__badge {
        animation: none;
        transform: scale(1.05);
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
        transition: 
          background ${DURATION.FAST}ms ${EASING.STANDARD},
          transform ${DURATION.FAST}ms ${EASING.SPRING},
          box-shadow ${DURATION.NORMAL}ms ${EASING.STANDARD};
        text-align: left;
        position: relative;
        min-height: 48px; /* Premium touch target */
      }

      /* Subtle hover glow for premium feel */
      .settings-menu__item::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: linear-gradient(135deg, var(--persona-tint, rgba(74, 103, 65, 0.06)), transparent);
        opacity: 0;
        transition: opacity ${DURATION.NORMAL}ms ${EASING.STANDARD};
        pointer-events: none;
      }

      .settings-menu__item:hover {
        background: var(--color-background-secondary, #f5f2ed);
        transform: translateX(2px);
      }

      .settings-menu__item:hover::before {
        opacity: 1;
      }

      .settings-menu__item:active {
        background: var(--color-background-tertiary, #ebe6df);
        transform: scale(0.98) translateX(0);
      }

      .settings-menu__item:focus-visible {
        outline: none;
        box-shadow: inset 0 0 0 2px var(--persona-primary, #4a6741);
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
        border-color: var(--persona-text);
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

      /* Icon container - Premium Apple-style treatment */
      .settings-menu__icon {
        width: 36px;
        height: 36px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--persona-tint, rgba(74, 103, 65, 0.08));
        border-radius: var(--radius-md, 8px);
        color: var(--persona-primary, #4a6741);
        transition: 
          background ${DURATION.FAST}ms ${EASING.STANDARD},
          color ${DURATION.FAST}ms ${EASING.STANDARD},
          transform ${DURATION.NORMAL}ms ${EASING.SPRING};
      }

      .settings-menu__icon svg {
        width: 18px;
        height: 18px;
      }

      .settings-menu__item:hover .settings-menu__icon {
        background: var(--persona-primary, #4a6741);
        color: white;
        transform: scale(1.05);
      }

      .settings-menu__item:active .settings-menu__icon {
        transform: scale(0.95);
      }

      .settings-menu__label {
        font-family: var(--font-body, Inter, sans-serif);
        font-size: 14px;
        font-weight: 500;
        color: var(--color-text-primary, #2c2520);
        flex: 1;
        letter-spacing: -0.005em;
        transition: color ${DURATION.FAST}ms ${EASING.STANDARD};
      }

      .settings-menu__item:hover .settings-menu__label {
        color: var(--color-text-primary, #2c2520);
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
         RELATIONSHIP STAGE BANNER - Inspiring journey visualization
         ======================================================================== */
      .settings-menu__stage-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-4, 16px);
        padding: var(--space-5, 20px) var(--space-6, 24px);
        background: linear-gradient(135deg, 
          var(--persona-tint, rgba(74, 103, 65, 0.1)) 0%,
          transparent 60%
        );
        border-bottom: 1px solid var(--color-border-subtle, rgba(44, 37, 32, 0.05));
        position: relative;
        overflow: hidden;
      }

      /* Subtle decorative elements */
      .settings-menu__stage-banner::before {
        content: '';
        position: absolute;
        top: -50%;
        right: -20%;
        width: 180px;
        height: 180px;
        background: radial-gradient(circle, var(--persona-tint, rgba(74, 103, 65, 0.06)) 0%, transparent 70%);
        pointer-events: none;
      }

      .settings-menu__stage-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
        z-index: 1;
      }

      .settings-menu__stage-label {
        font-family: var(--font-body);
        font-size: 10px;
        font-weight: 600;
        color: var(--color-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }

      .settings-menu__stage-name {
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-lg, 1.125rem);
        font-weight: 700;
        color: var(--persona-primary, #4a6741);
        letter-spacing: -0.01em;
      }

      .settings-menu__stage-progress {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
        min-width: 120px;
        z-index: 1;
      }

      .settings-menu__stage-bar {
        width: 100%;
        height: 8px;
        background: var(--color-background-tertiary, #ebe6df);
        border-radius: var(--radius-full, 9999px);
        overflow: hidden;
        box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.06);
      }

      .settings-menu__stage-fill {
        height: 100%;
        background: linear-gradient(90deg, 
          var(--persona-secondary, #3d5a35) 0%,
          var(--persona-primary, #4a6741) 100%
        );
        border-radius: var(--radius-full, 9999px);
        transition: width ${DURATION.MODERATE}ms ${EASING.EXPO_OUT};
        position: relative;
      }

      /* Animated shimmer on progress bar */
      .settings-menu__stage-fill::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(90deg, 
          transparent 0%,
          rgba(255, 255, 255, 0.3) 50%,
          transparent 100%
        );
        animation: progressShimmer 2s ease-in-out infinite;
      }

      @keyframes progressShimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(200%); }
      }

      .settings-menu__stage-next {
        font-family: var(--font-body);
        font-size: 11px;
        font-weight: 500;
        color: var(--color-text-secondary);
      }

      .settings-menu__stage-max {
        display: flex;
        align-items: center;
        gap: var(--space-2, 8px);
        font-family: var(--font-display, 'Plus Jakarta Sans', sans-serif);
        font-size: var(--text-sm, 0.875rem);
        font-weight: 600;
        color: var(--persona-primary, #4a6741);
      }

      .settings-menu__stage-max::before {
        content: '✦';
        font-size: 10px;
        opacity: 0.7;
      }

      /* ========================================================================
         DARK THEME (CEDAR NIGHT) - WCAG AA Compliant Premium Styling
         ======================================================================== */
      
      /* Trigger button */
      [data-theme="midnight"] .settings-trigger {
        background: var(--color-background-elevated, #70605a);
        border-color: var(--color-border-subtle, rgba(250, 246, 240, 0.1));
        color: var(--color-text-secondary, #f0ebe4);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      }

      [data-theme="midnight"] .settings-trigger:hover {
        background: var(--color-background-secondary, #60504a);
        color: var(--color-text-primary, #faf6f0);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
      }

      /* Menu panel */
      [data-theme="midnight"] .settings-menu__backdrop {
        background: var(--backdrop-menu);
      }

      [data-theme="midnight"] .settings-menu__card {
        background: var(--color-background-elevated, #70605a);
        box-shadow: -8px 0 40px rgba(0, 0, 0, 0.4);
      }

      /* Header */
      [data-theme="midnight"] .settings-menu__header {
        background: linear-gradient(180deg, 
          var(--color-background-elevated, #70605a) 0%,
          var(--color-background-primary, #60504a) 100%
        );
        border-bottom-color: var(--color-border-subtle, rgba(255, 255, 255, 0.06));
      }

      [data-theme="midnight"] .settings-menu__header::before {
        background: linear-gradient(90deg, 
          transparent 0%,
          var(--color-accent-secondary, #7cb36b) 50%,
          transparent 100%
        );
      }

      [data-theme="midnight"] .settings-menu__header-eyebrow {
        color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .settings-menu__header h2 {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .settings-menu__close {
        background: var(--color-background-tertiary, #685852);
        border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.08));
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .settings-menu__close:hover {
        background: var(--color-background-secondary, #60504a);
        color: var(--color-text-primary, #faf6f0);
      }

      /* Menu items */
      [data-theme="midnight"] .settings-menu__item:hover {
        background: var(--color-background-secondary, rgba(255, 255, 255, 0.05));
      }

      [data-theme="midnight"] .settings-menu__item::before {
        background: linear-gradient(135deg, var(--persona-tint, rgba(124, 179, 107, 0.08)), transparent);
      }

      [data-theme="midnight"] .settings-menu__icon {
        background: var(--persona-tint, rgba(124, 179, 107, 0.12));
        color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .settings-menu__item:hover .settings-menu__icon {
        background: var(--color-accent-secondary, #7cb36b);
        color: var(--color-background-primary, #50403a);
      }

      [data-theme="midnight"] .settings-menu__label {
        color: var(--color-text-primary, #faf6f0);
      }

      /* Section headers */
      [data-theme="midnight"] .settings-menu__section-header:hover {
        background: var(--color-background-secondary, rgba(255, 255, 255, 0.03));
      }

      [data-theme="midnight"] .settings-menu__section-header::after {
        background: var(--color-border-subtle, rgba(255, 255, 255, 0.06));
      }

      [data-theme="midnight"] .settings-menu__section-header h3 {
        color: var(--color-text-secondary, #f0ebe4);
      }

      [data-theme="midnight"] .settings-menu__section--expanded .settings-menu__section-header h3 {
        color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .settings-menu__section-chevron {
        background: var(--color-background-tertiary, rgba(255, 255, 255, 0.05));
        color: var(--color-text-muted, #e8e2da);
      }

      [data-theme="midnight"] .settings-menu__section--expanded .settings-menu__section-chevron {
        background: var(--persona-tint, rgba(124, 179, 107, 0.15));
        color: var(--color-accent-secondary, #7cb36b);
      }

      /* Subgroups */
      [data-theme="midnight"] .settings-menu__subgroup-icon {
        color: var(--color-text-muted, #ddd6cc);
      }

      [data-theme="midnight"] .settings-menu__subgroup-label {
        color: var(--color-text-muted, #ddd6cc);
      }

      [data-theme="midnight"] .settings-menu__subgroup + .settings-menu__subgroup {
        border-top-color: rgba(255, 255, 255, 0.06);
      }

      /* Stage Banner */
      [data-theme="midnight"] .settings-menu__stage-banner {
        background: linear-gradient(135deg, 
          var(--persona-tint, rgba(124, 179, 107, 0.12)) 0%,
          transparent 60%
        );
        border-bottom-color: var(--color-border-subtle, rgba(255, 255, 255, 0.06));
      }

      [data-theme="midnight"] .settings-menu__stage-banner::before {
        background: radial-gradient(circle, var(--persona-tint, rgba(124, 179, 107, 0.08)) 0%, transparent 70%);
      }

      [data-theme="midnight"] .settings-menu__stage-label {
        color: var(--color-text-muted, #ddd6cc);
      }

      [data-theme="midnight"] .settings-menu__stage-name {
        color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .settings-menu__stage-bar {
        background: var(--color-background-tertiary, rgba(255, 255, 255, 0.08));
      }

      [data-theme="midnight"] .settings-menu__stage-fill {
        background: linear-gradient(90deg, 
          var(--persona-secondary, #5a8a4a) 0%,
          var(--color-accent-secondary, #7cb36b) 100%
        );
      }

      [data-theme="midnight"] .settings-menu__stage-next {
        color: var(--color-text-muted, #ddd6cc);
      }

      [data-theme="midnight"] .settings-menu__stage-max {
        color: var(--color-accent-secondary, #7cb36b);
      }

      /* Badges */
      [data-theme="midnight"] .settings-menu__badge {
        background: linear-gradient(135deg, 
          var(--persona-primary, #5a8a4a) 0%,
          var(--color-accent-secondary, #7cb36b) 100%
        );
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      }

      /* Quick Actions */
      [data-theme="midnight"] .settings-menu__quick-actions {
        background: linear-gradient(180deg, 
          transparent 0%,
          var(--color-background-secondary, rgba(255, 255, 255, 0.02)) 100%
        );
        border-top-color: var(--color-border-subtle, rgba(255, 255, 255, 0.06));
      }

      [data-theme="midnight"] .settings-menu__quick-actions .settings-menu__icon {
        background: transparent;
      }

      [data-theme="midnight"] .settings-menu__quick-actions .settings-menu__item:hover .settings-menu__icon {
        background: var(--persona-tint, rgba(124, 179, 107, 0.12));
        color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .settings-menu__quick-actions .settings-menu__label {
        color: var(--color-text-secondary, #e8e2da);
      }

      [data-theme="midnight"] .settings-menu__quick-actions .settings-menu__item:hover .settings-menu__label {
        color: var(--color-text-primary, #faf6f0);
      }

      /* Pinned items */
      [data-theme="midnight"] .settings-menu__section--pinned {
        background: linear-gradient(135deg, var(--persona-tint, rgba(124, 179, 107, 0.08)), transparent);
      }

      [data-theme="midnight"] .settings-menu__item--pinned {
        background: var(--color-background-secondary, rgba(255, 255, 255, 0.03));
        border-color: var(--color-border-subtle, rgba(255, 255, 255, 0.08));
      }

      [data-theme="midnight"] .settings-menu__item--pinned:hover {
        border-color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .settings-menu__unpin-btn {
        color: var(--color-text-muted, #e8e2da);
      }

      /* Locked items */
      [data-theme="midnight"] .settings-menu__item--locked {
        opacity: 0.5;
      }

      [data-theme="midnight"] .settings-menu__unlock-hint,
      [data-theme="midnight"] .settings-menu__lock-icon {
        color: var(--color-text-muted, #ddd6cc);
      }

      /* Active items */
      [data-theme="midnight"] .settings-menu__item--active {
        background: var(--color-background-secondary, rgba(255, 255, 255, 0.05));
      }

      [data-theme="midnight"] .settings-menu__item--active .settings-menu__label::after {
        color: var(--color-accent-secondary, #7cb36b);
      }

      /* Language Selector */
      [data-theme="midnight"] .settings-menu__language-current {
        color: var(--color-text-secondary, #e8e2da);
      }

      [data-theme="midnight"] .settings-menu__language-option {
        color: var(--color-text-primary, #faf6f0);
      }

      [data-theme="midnight"] .settings-menu__language-option:hover {
        background: var(--color-background-secondary, rgba(255, 255, 255, 0.05));
      }

      [data-theme="midnight"] .settings-menu__language-option--active {
        background: var(--color-background-secondary, rgba(255, 255, 255, 0.05));
      }

      [data-theme="midnight"] .settings-menu__language-check {
        color: var(--color-accent-secondary, #7cb36b);
      }

      /* Roadmap items */
      [data-theme="midnight"] .settings-menu__item--roadmap {
        background: linear-gradient(135deg, var(--persona-tint, rgba(124, 179, 107, 0.08)), transparent);
        border-color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .settings-menu__item--roadmap:hover {
        background: linear-gradient(135deg, var(--persona-tint, rgba(124, 179, 107, 0.12)), transparent);
      }

      [data-theme="midnight"] .settings-menu__item--roadmap .settings-menu__icon {
        color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .settings-menu__roadmap-hint {
        color: var(--color-accent-secondary, #7cb36b);
      }

      [data-theme="midnight"] .settings-menu__roadmap-badge {
        background: linear-gradient(135deg, var(--persona-primary, #5a8a4a), var(--color-accent-secondary, #7cb36b));
      }

      /* ========================================================================
         RESPONSIVE
         ======================================================================== */
      
      /* Tablet (769px - 1024px) - Wider panel for more content */
      @media (min-width: clamp(538px, 90vw, 769px)) and (max-width: min(1024px, 100%)) {
        .settings-menu__card {
          width: min(380px, 100%);
          max-width: 50vw;
        }
      }
      
      /* Large phones / Small tablets (481px - 768px) */
      @media (min-width: clamp(337px, 90vw, 481px)) and (max-width: clamp(538px, 90vw, 768px)) {
        .settings-menu__card {
          width: min(340px, 100%);
          max-width: 65vw;
        }
      }

      /* Hide top-right settings trigger on mobile - bottom sheet provides access */
      @media (max-width: 768px) {
        .settings-trigger {
          display: none !important;
        }
      }
      
      /* Mobile (max 480px) - Full width panel */
      @media (max-width: clamp(336px, 90vw, 480px)) {
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
      @media (min-width: min(390px, 100%)) and (max-width: clamp(301px, 90vw, 430px)) {
        .settings-menu__card {
          width: 100%;
          max-width: none;
        }
      }
      
      /* iOS Safari specific fixes using @supports */
      @supports (-webkit-touch-callout: none) {
        @media (max-width: clamp(336px, 90vw, 480px)) {
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
