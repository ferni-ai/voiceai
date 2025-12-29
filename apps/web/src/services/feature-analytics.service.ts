/**
 * Feature Analytics Service
 *
 * Centralized analytics tracking for all major features:
 * - Digital Twin Profile
 * - Voice Journal
 * - Semantic Memory
 * - Health Dashboard
 * - Mobile Experience
 *
 * Events are sent to Google Analytics and our internal analytics.
 *
 * @module services/feature-analytics.service
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('FeatureAnalytics');

// ============================================================================
// TYPES
// ============================================================================

type FeatureCategory =
  | 'digital_twin'
  | 'voice_journal'
  | 'semantic_memory'
  | 'health_dashboard'
  | 'mobile_experience';

interface AnalyticsEvent {
  category: FeatureCategory;
  action: string;
  label?: string;
  value?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// ANALYTICS ENGINE
// ============================================================================

/**
 * Send event to Google Analytics (GA4)
 */
function sendToGA(event: AnalyticsEvent): void {
  if (typeof window === 'undefined') return;

  // GA4 gtag
  const gtag = (window as unknown as Record<string, unknown>).gtag;
  if (typeof gtag === 'function') {
    gtag('event', event.action, {
      event_category: event.category,
      event_label: event.label,
      value: event.value,
      ...event.metadata,
    });
  }
}

/**
 * Send event to our internal analytics
 */
function sendToInternal(event: AnalyticsEvent): void {
  if (typeof window === 'undefined') return;

  // Fire custom event for internal tracking
  window.dispatchEvent(
    new CustomEvent('ferni:analytics', {
      detail: event,
    })
  );

  log.debug('Analytics event:', event);
}

/**
 * Track an analytics event
 */
function track(event: AnalyticsEvent): void {
  try {
    sendToGA(event);
    sendToInternal(event);
  } catch (error) {
    log.warn({ error }, 'Failed to track event');
  }
}

// ============================================================================
// DIGITAL TWIN EVENTS
// ============================================================================

export const digitalTwinAnalytics = {
  /** User opened the profile wizard */
  profileOpened: () =>
    track({
      category: 'digital_twin',
      action: 'profile_opened',
    }),

  /** User navigated to a specific section */
  sectionViewed: (section: string) =>
    track({
      category: 'digital_twin',
      action: 'section_viewed',
      label: section,
    }),

  /** User completed a section */
  sectionCompleted: (section: string, itemCount: number) =>
    track({
      category: 'digital_twin',
      action: 'section_completed',
      label: section,
      value: itemCount,
    }),

  /** User saved their profile */
  profileSaved: (completionPercentage: number) =>
    track({
      category: 'digital_twin',
      action: 'profile_saved',
      value: completionPercentage,
    }),

  /** User started but didn't finish the wizard */
  profileAbandoned: (lastSection: string, completionPercentage: number) =>
    track({
      category: 'digital_twin',
      action: 'profile_abandoned',
      label: lastSection,
      value: completionPercentage,
    }),

  /** User added a life chapter */
  lifeChapterAdded: () =>
    track({
      category: 'digital_twin',
      action: 'life_chapter_added',
    }),

  /** User added a signature phrase */
  signaturePhraseAdded: () =>
    track({
      category: 'digital_twin',
      action: 'signature_phrase_added',
    }),

  /** User selected a core value */
  valueSelected: (value: string) =>
    track({
      category: 'digital_twin',
      action: 'value_selected',
      label: value,
    }),
};

// ============================================================================
// VOICE JOURNAL EVENTS
// ============================================================================

export const voiceJournalAnalytics = {
  /** User opened the journal */
  journalOpened: () =>
    track({
      category: 'voice_journal',
      action: 'journal_opened',
    }),

  /** User started recording */
  recordingStarted: () =>
    track({
      category: 'voice_journal',
      action: 'recording_started',
    }),

  /** User completed a recording */
  recordingCompleted: (durationSeconds: number) =>
    track({
      category: 'voice_journal',
      action: 'recording_completed',
      value: durationSeconds,
    }),

  /** User selected a mood */
  moodSelected: (mood: string) =>
    track({
      category: 'voice_journal',
      action: 'mood_selected',
      label: mood,
    }),

  /** User created a journal entry */
  entryCreated: (hasAudio: boolean, hasMood: boolean) =>
    track({
      category: 'voice_journal',
      action: 'entry_created',
      metadata: { hasAudio, hasMood },
    }),

  /** User deleted a journal entry */
  entryDeleted: () =>
    track({
      category: 'voice_journal',
      action: 'entry_deleted',
    }),

  /** User viewed insights tab */
  insightsViewed: () =>
    track({
      category: 'voice_journal',
      action: 'insights_viewed',
    }),

  /** User searched entries */
  entriesSearched: (resultCount: number) =>
    track({
      category: 'voice_journal',
      action: 'entries_searched',
      value: resultCount,
    }),

  /** User exported journal */
  journalExported: (format: string) =>
    track({
      category: 'voice_journal',
      action: 'journal_exported',
      label: format,
    }),

  /** User maintained a streak */
  streakMaintained: (streakDays: number) =>
    track({
      category: 'voice_journal',
      action: 'streak_maintained',
      value: streakDays,
    }),

  /** User used a prompt */
  promptUsed: (promptId: string) =>
    track({
      category: 'voice_journal',
      action: 'prompt_used',
      label: promptId,
    }),
};

// ============================================================================
// SEMANTIC MEMORY EVENTS
// ============================================================================

export const semanticMemoryAnalytics = {
  /** User viewed memory browser */
  memoryBrowserOpened: () =>
    track({
      category: 'semantic_memory',
      action: 'memory_browser_opened',
    }),

  /** User searched memories */
  memorySearched: (resultCount: number) =>
    track({
      category: 'semantic_memory',
      action: 'memory_searched',
      value: resultCount,
    }),

  /** Memory was surfaced in conversation */
  memorySurfaced: (memoryType: string) =>
    track({
      category: 'semantic_memory',
      action: 'memory_surfaced',
      label: memoryType,
    }),

  /** User marked memory relevance */
  memoryRelevanceRated: (relevant: boolean) =>
    track({
      category: 'semantic_memory',
      action: 'memory_relevance_rated',
      label: relevant ? 'relevant' : 'not_relevant',
    }),

  /** Insight was generated from memories */
  insightGenerated: (insightType: string) =>
    track({
      category: 'semantic_memory',
      action: 'insight_generated',
      label: insightType,
    }),

  /** User viewed their story dashboard */
  storyDashboardViewed: () =>
    track({
      category: 'semantic_memory',
      action: 'story_dashboard_viewed',
    }),
};

// ============================================================================
// HEALTH DASHBOARD EVENTS
// ============================================================================

export const healthDashboardAnalytics = {
  /** User opened health dashboard */
  dashboardOpened: () =>
    track({
      category: 'health_dashboard',
      action: 'dashboard_opened',
    }),

  /** User connected Apple Health */
  appleHealthConnected: () =>
    track({
      category: 'health_dashboard',
      action: 'apple_health_connected',
    }),

  /** User disconnected Apple Health */
  appleHealthDisconnected: () =>
    track({
      category: 'health_dashboard',
      action: 'apple_health_disconnected',
    }),

  /** Health data synced from iOS */
  healthDataSynced: (dataTypes: string[]) =>
    track({
      category: 'health_dashboard',
      action: 'health_data_synced',
      metadata: { dataTypes },
    }),

  /** User viewed specific health metric */
  metricViewed: (metricType: string) =>
    track({
      category: 'health_dashboard',
      action: 'metric_viewed',
      label: metricType,
    }),

  /** User connected a wearable */
  wearableConnected: (deviceType: string) =>
    track({
      category: 'health_dashboard',
      action: 'wearable_connected',
      label: deviceType,
    }),

  /** Wellbeing dashboard viewed */
  wellbeingViewed: () =>
    track({
      category: 'health_dashboard',
      action: 'wellbeing_viewed',
    }),
};

// ============================================================================
// MOBILE EXPERIENCE EVENTS
// ============================================================================

export const mobileAnalytics = {
  /** User opened mobile bottom sheet */
  bottomSheetOpened: () =>
    track({
      category: 'mobile_experience',
      action: 'bottom_sheet_opened',
    }),

  /** User used a bottom sheet action */
  bottomSheetActionUsed: (actionId: string) =>
    track({
      category: 'mobile_experience',
      action: 'bottom_sheet_action_used',
      label: actionId,
    }),

  /** User installed PWA */
  pwaInstalled: () =>
    track({
      category: 'mobile_experience',
      action: 'pwa_installed',
    }),

  /** User used pull-to-refresh */
  pullToRefreshUsed: () =>
    track({
      category: 'mobile_experience',
      action: 'pull_to_refresh_used',
    }),

  /** User used swipe gesture */
  swipeGestureUsed: (direction: string) =>
    track({
      category: 'mobile_experience',
      action: 'swipe_gesture_used',
      label: direction,
    }),

  /** Mobile session duration */
  mobileSessionEnded: (durationMinutes: number) =>
    track({
      category: 'mobile_experience',
      action: 'mobile_session_ended',
      value: durationMinutes,
    }),
};

// ============================================================================
// QUALITY METRICS
// ============================================================================

export const qualityMetrics = {
  /** User rated feature quality */
  featureRated: (feature: FeatureCategory, rating: number, feedback?: string) =>
    track({
      category: feature,
      action: 'feature_rated',
      value: rating,
      metadata: feedback ? { feedback } : undefined,
    }),

  /** User reported an issue */
  issueReported: (feature: FeatureCategory, issueType: string) =>
    track({
      category: feature,
      action: 'issue_reported',
      label: issueType,
    }),

  /** Feature load time */
  featureLoadTime: (feature: FeatureCategory, loadTimeMs: number) =>
    track({
      category: feature,
      action: 'feature_load_time',
      value: loadTimeMs,
    }),
};

// ============================================================================
// AGGREGATE EXPORT
// ============================================================================

export const featureAnalytics = {
  digitalTwin: digitalTwinAnalytics,
  voiceJournal: voiceJournalAnalytics,
  semanticMemory: semanticMemoryAnalytics,
  healthDashboard: healthDashboardAnalytics,
  mobile: mobileAnalytics,
  quality: qualityMetrics,
};

export default featureAnalytics;
