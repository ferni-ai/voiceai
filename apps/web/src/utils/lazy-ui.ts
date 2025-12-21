/**
 * Lazy UI Module Loader
 * 
 * Provides on-demand loading for non-critical UI modules.
 * These modules are only loaded when the user actually needs them,
 * reducing initial bundle size and improving Time to Interactive (TTI).
 * 
 * ⚡ PERFORMANCE: Modules are loaded once and cached.
 * ⚠️ ERROR HANDLING: Failed loads are logged and re-thrown.
 */

import { createLogger } from './logger.js';

const log = createLogger('LazyUI');

/**
 * Helper to safely load a module with error logging.
 */
async function safeImport<T>(
  name: string, 
  importFn: () => Promise<T>
): Promise<T> {
  try {
    log.debug(`Loading ${name} module...`);
    return await importFn();
  } catch (err) {
    log.error(`Failed to load ${name} module:`, err);
    throw err; // Re-throw to let caller handle
  }
}

// ============================================================================
// CACHED MODULE REFERENCES
// ============================================================================

// Settings & Navigation
let settingsMenuModule: typeof import('../ui/settings-menu.ui.js') | null = null;
let notificationSettingsModule: typeof import('../ui/notification-settings.ui.js') | null = null;

// Feature Panels (opened from settings)
let conversationHistoryModule: typeof import('../ui/conversation-history.ui.js') | null = null;
let analyticsDashboardModule: typeof import('../ui/analytics-dashboard.ui.js') | null = null;
let cognitiveInsightsModule: typeof import('../ui/cognitive-insights.ui.js') | null = null;
let ritualBuilderModule: typeof import('../ui/ritual-builder.ui.js') | null = null;
let predictionTrackerModule: typeof import('../ui/prediction-tracker.ui.js') | null = null;
let dataExportModule: typeof import('../ui/data-export.ui.js') | null = null;
let teamHuddleModule: typeof import('../ui/team-huddle.ui.js') | null = null;
let relationshipProgressModule: typeof import('../ui/stage-celebration.ui.js') | null = null;

// First-time user flows
let onboardingModule: typeof import('../ui/onboarding.ui.js') | null = null;

// Admin & Dev (rarely used)
let adminModule: typeof import('../ui/admin.ui.js') | null = null;
let devPanelModule: typeof import('../ui/dev-panel.ui.js') | null = null;

// ============================================================================
// LAZY LOADERS - Settings & Navigation
// ============================================================================

export async function loadSettingsMenu() {
  if (!settingsMenuModule) {
    settingsMenuModule = await safeImport('settings-menu', 
      () => import('../ui/settings-menu.ui.js'));
  }
  return settingsMenuModule;
}

export async function loadNotificationSettings() {
  if (!notificationSettingsModule) {
    notificationSettingsModule = await safeImport('notification-settings',
      () => import('../ui/notification-settings.ui.js'));
  }
  return notificationSettingsModule;
}

// ============================================================================
// LAZY LOADERS - Feature Panels
// ============================================================================

export async function loadConversationHistory() {
  if (!conversationHistoryModule) {
    conversationHistoryModule = await safeImport('conversation-history',
      () => import('../ui/conversation-history.ui.js'));
  }
  return conversationHistoryModule;
}

export async function loadAnalyticsDashboard() {
  if (!analyticsDashboardModule) {
    analyticsDashboardModule = await safeImport('analytics-dashboard',
      () => import('../ui/analytics-dashboard.ui.js'));
  }
  return analyticsDashboardModule;
}

export async function loadCognitiveInsights() {
  if (!cognitiveInsightsModule) {
    cognitiveInsightsModule = await safeImport('cognitive-insights',
      () => import('../ui/cognitive-insights.ui.js'));
  }
  return cognitiveInsightsModule;
}

export async function loadRitualBuilder() {
  if (!ritualBuilderModule) {
    ritualBuilderModule = await safeImport('ritual-builder',
      () => import('../ui/ritual-builder.ui.js'));
  }
  return ritualBuilderModule;
}

export async function loadPredictionTracker() {
  if (!predictionTrackerModule) {
    predictionTrackerModule = await safeImport('prediction-tracker',
      () => import('../ui/prediction-tracker.ui.js'));
  }
  return predictionTrackerModule;
}

export async function loadDataExport() {
  if (!dataExportModule) {
    dataExportModule = await safeImport('data-export',
      () => import('../ui/data-export.ui.js'));
  }
  return dataExportModule;
}

export async function loadTeamHuddle() {
  if (!teamHuddleModule) {
    teamHuddleModule = await safeImport('team-huddle',
      () => import('../ui/team-huddle.ui.js'));
  }
  return teamHuddleModule;
}

export async function loadRelationshipProgress() {
  if (!relationshipProgressModule) {
    relationshipProgressModule = await safeImport('relationship-progress',
      () => import('../ui/stage-celebration.ui.js'));
  }
  return relationshipProgressModule;
}

// ============================================================================
// LAZY LOADERS - First-time User Flows
// ============================================================================

export async function loadOnboarding() {
  if (!onboardingModule) {
    onboardingModule = await safeImport('onboarding',
      () => import('../ui/onboarding.ui.js'));
  }
  return onboardingModule;
}

// ============================================================================
// LAZY LOADERS - Admin & Dev (rarely used)
// ============================================================================

export async function loadAdmin() {
  if (!adminModule) {
    adminModule = await safeImport('admin',
      () => import('../ui/admin.ui.js'));
  }
  return adminModule;
}

export async function loadDevPanel() {
  if (!devPanelModule) {
    devPanelModule = await safeImport('dev-panel',
      () => import('../ui/dev-panel.ui.js'));
  }
  return devPanelModule;
}

// ============================================================================
// PRELOAD HELPERS - For anticipated user actions
// ============================================================================

/**
 * Preload settings-related modules in the background.
 * Call this after the main UI is interactive.
 */
export function preloadSettingsModules(): void {
  // Use requestIdleCallback if available, otherwise setTimeout
  const schedulePreload = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 1000));
  
  schedulePreload(() => {
    // Preload settings menu (likely to be used)
    void loadSettingsMenu();
    
    // After settings, preload commonly accessed panels
    schedulePreload(() => {
      void loadConversationHistory();
      void loadRelationshipProgress();
    });
  });
}

/**
 * Preload dev tools if in dev mode.
 */
export function preloadDevTools(): void {
  const schedulePreload = window.requestIdleCallback || ((cb: () => void) => setTimeout(cb, 500));
  
  schedulePreload(() => {
    void loadDevPanel();
  });
}

