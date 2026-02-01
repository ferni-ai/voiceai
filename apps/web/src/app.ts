/**
 * Voice AI Application
 *
 * Main application orchestrator that ties together all services and UI components.
 * A premium experience that rivals Apple and Google.
 */

import type { PersonaId } from './types/persona.js';

// Theme system
import {
  initTheme,
  onThemeChange,
  setPersona as setThemePersona,
  startAmbientCycle,
  toggleTheme,
} from './theme/index.js';
// Theme & Language Settings panel
import { showThemeLanguageSettings } from './ui/theme-language-settings.ui.js';

// State
import {
  appState,
  setAudioState,
  setSelectedPersona,
  setUserName,
  setWrappingUp,
} from './state/app.state.js';

// ============================================================================
// AMBIENT EXPERIENCE MANAGERS
// Better than Apple: Time-aware, relationship-aware, persona-aware theming
// ============================================================================
import { circadianManager } from './services/circadian-manager.js';
import { warmthManager } from './services/warmth-manager.js';
import { personaAura } from './services/persona-aura.js';
import { visualStorytellingService } from './services/visual-storytelling.service.js';

// Services
import { delightService } from './services/delight.service.js';
import { checkAndClaimDemoSession, hasPendingClaim } from './services/demo-claim.service.js';
import { getAuthState, getAuthToken } from './services/firebase-auth.service.js';
import { initializeAuth } from './services/auth-init.service.js';
import { showSignInGate } from './ui/sign-in-gate.ui.js';
import { initGoogleOneTap, cancelOneTap } from './services/google-one-tap.service.js';
import {
  audioService,
  connectionService,
  engagementService,
  handoffService,
  moodService,
  relationshipStageService,
  spotifyService,
} from './services/index.js';
import { detectAndSyncTimezone } from './services/timezone.service.js';
import { getLocation, updateFromBackend as _updateFromBackend } from './services/geolocation.service.js';
// 🌱 Roadmap/Seed Economy - For streak rewards
import { roadmapService } from './services/roadmap.service.js';

// Core UI Components
import { coachUI, initCoachUI } from './ui/coach.ui.js';
import { expressiveEyes, initExpressiveEyes } from './ui/expressive-eyes.ui.js';
import { controlsUI, initControlsUI } from './ui/controls.ui.js';
import { initMessageUI, messageUI } from './ui/message.ui.js';
import {
  getSpotifyLinkStatus,
  initSpotifyUI,
  onSpotifyLinkStateChange,
  triggerSpotifyLinkToggle,
} from './ui/spotify.ui.js';
import { initTeamUI, teamUI } from './ui/team.ui.js';
import { initWaveformUI, waveformUI } from './ui/waveform.ui.js';
// Relationship Management (Your People) - unified contact & gift management
import { initYourPeopleUI as _initYourPeopleUI, openYourPeople } from './ui/your-people.ui.js';
// openAddPerson available via Your People panel
// Group Conversations - Team Roundtables and Conference Calls
import { initGroupConversationUI } from './ui/group-conversation.ui.js';
// Proactive Messages - In-app messages from intelligent outreach
import { initProactiveMessages, refreshProactiveMessages } from './ui/proactive-messages.ui.js';

// Premium UI Features
import { celebrationsUI, initCelebrationsUI as _initCelebrationsUI } from './ui/celebrations.ui.js';
import { easterEggsUI, initEasterEggsUI as _initEasterEggsUI } from './ui/easter-eggs.ui.js';
import { gesturesUI, initGesturesUI } from './ui/gestures.ui.js';
import { initPresenceUI as _initPresenceUI, presenceUI } from './ui/presence.ui.js';
import { initRippleUI as _initRippleUI, rippleUI } from './ui/ripple.ui.js';
import { initSoundUI, soundUI } from './ui/sound.ui.js';
// Ambient Sounds - Background ambience for personalization
import { dispose as disposeAmbientSounds, initAmbientSounds as _initAmbientSounds } from './services/ambient-sounds.service.js';
// Brand Service - Client-side brand validation
import { initBrandService as _initBrandService } from './services/brand-service.js';
import { initStatsUI as _initStatsUI, statsUI } from './ui/stats.ui.js';
// ✨ Micro-Interactions - Premium button & interactive effects
import { initMicroInteractions as _initMicroInteractions, microInteractionsUI } from './ui/micro-interactions.ui.js';
// 📱 Mobile Delights - Magical mobile interactions (tilt, tap-to-look, haptics, etc.)
import { disposeMobileDelights, initMobileDelights as _initMobileDelights } from './ui/mobile-delights.ui.js';
// 📱 Mobile Bottom Sheet - Zen Mode settings access
import { disposeMobileBottomSheet, initMobileBottomSheet as _initMobileBottomSheet } from './ui/mobile-bottom-sheet.ui.js';
// import { keyboardUI, initKeyboardUI } from './ui/keyboard.ui.js'; // Disabled for now
import { avatarFeedback, initAvatarFeedback } from './ui/avatar-feedback.ui.js';
import { connectionQualityUI, initConnectionQualityUI } from './ui/connection-quality.ui.js';
// Disabled: Eye animations removed - keeping just zen blink
// import { initFerniEye } from './ui/ferni-eye.ui.js';
import { greetingUI } from './ui/greeting.ui.js';
import { initMoodUI, moodUI } from './ui/mood.ui.js';
// DISABLED: No skeleton loading - everything visible immediately
// import { initSkeletonUI, skeletonUI } from './ui/skeleton.ui.js';
import { initThinkingUI, thinkingUI } from './ui/thinking.ui.js';
import { initTranscriptUI, transcriptUI } from './ui/transcript.ui.js';
// Marketplace UI
import { openAdminQueue as openMarketplaceAdmin } from './ui/marketplace-admin.ui.js';
import { marketplaceUI, openMarketplace } from './ui/marketplace.ui.js';
import { showIntegrationsSettings, getIntegrationsSettingsUI } from './ui/integrations-settings.ui.js';
import { openDigitalTwinUI } from './ui/digital-twin.ui.js';
import { openChronicle } from './ui/chronicle.ui.js';
import { openCreativeYouDashboard } from './ui/creative-you-dashboard.ui.js';
// 📔 Journal Capture - Auto-capture meaningful moments from conversations
import { initJournalCapture as _initJournalCapture } from './services/journal-capture.service.js';
// Admin UI (legacy - kept for backward compatibility)
import { initAdminDashboard, injectAdminStyles } from './ui/admin.ui.js';
// CLI Authentication (for ferni auth login)
import { initCLIAuth } from './ui/cli-auth.ui.js';
// New Unified Admin Portal
import { initAdminPortal } from './admin/index.js';
// Engagement UI
import { engagementTriggerUI, initEngagementTriggerUI } from './ui/engagement-trigger.ui.js';
import { getEngagementUI, initializeEngagementUI as _initializeEngagementUI } from './ui/engagement.ui.js';
import { getPredictionsUI, initializePredictionsUI as _initializePredictionsUI } from './ui/predictions.ui.js';
import { getInsightsView, initializeInsightsView as _initializeInsightsView } from './ui/insights-view.ui.js';
// Notifications & Celebrations
import { initNotificationsUI, showStreakMilestone } from './ui/notifications.ui.js';
import { celebrateStreak, isStreakMilestone } from './ui/streak-celebrations.ui.js';
// Weather Effects - Seasonal ambient atmosphere (available via dev panel)
import { dispose as disposeWeatherEffects, initWeatherEffects as _initWeatherEffects } from './ui/weather-effects.ui.js';
// Ferni Moments - Character expressions
import { dispose as disposeFerniMoments, initFerniMoments as _initFerniMoments } from './ui/ferni-moments.ui.js';
// Avatar Sidekicks - Expressive side icons (like "hands" holding props)
import { avatarSidekicks as _avatarSidekicks, dispose as disposeSidekicks } from './ui/avatar-sidekicks.ui.js';
// Ferni Milestones - Warm relationship celebrations
import { initFerniMilestones as _initFerniMilestones } from './ui/ferni-milestones.ui.js';
// Unified Indicator - Single smart badge for all avatar indicators
import { disposeUnifiedIndicator, initUnifiedIndicator as _initUnifiedIndicator } from './ui/unified-indicator.ui.js';
// Ferni Expressions - Character-level avatar expressions
import { ferniExpressions, initFerniExpressions as _initFerniExpressions } from './ui/ferni-expressions.ui.js';
// Emotion ↔ Expression Bridge - Auto-maps emotions to expressions
import { enableEmotionExpressionBridge as _enableEmotionExpressionBridge } from './emotion/emotion-expression-bridge.js';
// Logo Expressions - Animated logo that reacts to emotions
import {
  disposeLogoExpressions,
  hookIntoAvatarFeedback as _hookLogoFeedback,
  initLogoExpressions as _initLogoExpressions,
} from './ui/logo-expressions.ui.js';
// Celebration Service - Triggers milestone celebrations
import { initCelebrationService as _initCelebrationService } from './services/celebration.service.js';
// Ferni EQ - Superhuman emotional intelligence ("Better than Human")
import { disposeFerniEQ, initFerniEQ as _initFerniEQ } from './ui/better-than-human.ui.js';
// 🌟 Transcendent Animation Systems - Signature moments that surpass Apple, Google, and Pixar
import { handleMomentTrigger, initTranscendentSystems, destroyTranscendentSystems } from './systems/index.js';
// Humanization Bridge - Connects backend humanization signals to frontend EQ
import { initHumanizationBridge as _initHumanizationBridge, disposeHumanizationBridge } from './services/humanization-bridge.service.js';
// Proactive Outreach UI - "Thinking of You" notifications
import { disposeProactiveOutreachUI as disposeProactiveOutreach, initProactiveOutreachUI as _initProactiveOutreachUI } from './ui/proactive-outreach.ui.js';
// Team Insights UI - Cross-persona intelligence panel
import { disposeTeamInsightsUI, initTeamInsightsUI as _initTeamInsightsUI, teamInsightsUI } from './ui/team-insights.ui.js';
// Cross-Team Notifications - Real-time alerts from team insights
import {
  disposeCrossTeamNotifications,
  initCrossTeamNotifications as _initCrossTeamNotifications,
} from './services/cross-team-notifications.service.js';
// Voice Events - Real-time voice-triggered UI changes (theme, navigation)
import {
  disposeVoiceEvents,
  initVoiceEvents as _initVoiceEvents,
} from './services/voice-events.service.js';
// Avatar Soul - Pixar-quality "Better Than Human" visual animation system
import { avatarSoul as _avatarSoul, disposeAvatarSoul, initAvatarSoul as _initAvatarSoul } from './ui/avatar-soul.ui.js';
// Avatar Lamp - Luxo Jr. level body language animation
import { avatarLamp as _avatarLamp, disposeAvatarLamp, initAvatarLamp as _initAvatarLamp } from './ui/avatar-lamp.ui.js';
// Ambient Life - Makes Ferni feel alive when idle
import { disposeAmbientLife, initAmbientLife as _initAmbientLife } from './ui/ambient-life.ui.js';
// Speech Event Dispatcher - Critical foundation for Ferni EQ
import {
  dispatchAgentSpeechEnd,
  dispatchAgentSpeechStart,
  dispatchThinking,
  dispatchUserSpeechEnd,
  dispatchUserSpeechStart,
  disposeSpeechEventDispatcher,
  initSpeechEventDispatcher as _initSpeechEventDispatcher,
} from './services/speech-event-dispatcher.js';
// I18n - Internationalization and localization
import { initI18n } from './i18n/index.js';
// Mood Context - Time-based persona mood for "Better than Human"
import { disposeMoodContext, initMoodContext as _initMoodContext } from './services/mood-context.service.js';
// Demo data for testing without backend
import {
  disableDemoData,
  enableDemoData,
  getDemoEngagementData,
  getDemoPredictions,
} from './services/engagement-demo-data.js';
// Environment detection
import { shouldUseDemoData } from './utils/environment.js';
import { getApiHeadersAsync, apiPost, apiGet } from './utils/api.js';

// New Feature UIs (v2)
import accentSettingsUI from './ui/accent-settings.ui.js';
import { initAnalyticsDashboardUI } from './ui/analytics-dashboard.ui.js';
import { initCognitiveInsightsUI } from './ui/cognitive-insights.ui.js';
import { initGameBoard, destroyGameBoard } from './ui/game-board.ui.js';
import { getCommandsPanelUI, setCommandsPersonaId } from './ui/commands.ui.js';
import { getSanctuaryUI } from './ui/sanctuary.ui.js';
import { initConversationHistoryUI } from './ui/conversation-history.ui.js';
import { getDataExportUI, initDataExportUI } from './ui/data-export.ui.js';
import { initPredictionTrackerUI } from './ui/prediction-tracker.ui.js';
import { getRitualBuilderUI, initRitualBuilderUI } from './ui/ritual-builder.ui.js';
import { getSettingsMenuUI, initSettingsMenuUI } from './ui/settings-menu.ui.js';
import { initActivityUI, showActivity } from './ui/activity.ui.js';
// New feature UIs - Memory Lane, Knowledge Quiz, Growth Journal, Pattern Insights
import { memoryLaneUI } from './ui/memory-lane.ui.js';
import { openKnowledgeQuiz } from './ui/knowledge-quiz.ui.js';
import { openGrowthJournal } from './ui/growth-journal.ui.js';
import { patternInsightsUI } from './ui/pattern-insights.ui.js';
// Services for feature persistence
import {
  conversationTracker,
  initConversationTracker,
} from './services/conversation-tracker.service.js';
import { dataExportService } from './services/data-export.service.js';
import { initRitualsService, ritualsService } from './services/rituals.service.js';
import { getOnboardingUI, initOnboardingUI, startOnboardingIfNeeded } from './ui/onboarding.ui.js';
import { initPersonaTransitionUI } from './ui/persona-transition.ui.js';
// 🎬 Cameo Roster - Team member pop-in animations in the roster
import { initCameoRoster } from './ui/cameo-roster.ui.js';
import { initRelationshipProgressUI } from './ui/stage-celebration.ui.js';
// Trust Journey is now integrated into journey.ui.ts - no separate init needed
// Music Dashboard UI - "Musical You" insights
import { showGamePicker } from './ui/game-picker.ui.js';
import { musicDashboard } from './ui/music-dashboard.ui.js';
import { initTeamHuddleUI } from './ui/team-huddle.ui.js';
// Team Intro - Meet the team modal for mobile
import { initTeamIntro, showTeamIntro } from './ui/team-intro.ui.js';
// Push Notifications
import { initPushNotifications } from './services/push-notifications.service.js';
import {
  initNotificationSettingsUI,
  showNotificationSettings,
} from './ui/notification-settings.ui.js';
// Outreach Schedule UI
import { openOutreachSchedule } from './ui/outreach-schedule.ui.js';
// Contact Settings UI
import { openContactSettings } from './ui/contact-settings.ui.js';
// Calendar Settings UI
import { openCalendarSettings } from './ui/calendar-settings.ui.js';
// Calendar View UI - Visual schedule display
import { showCalendarView, setCalendarViewCallbacks } from './ui/calendar-view.ui.js';
// Calendar Analytics UI - Insights dashboard
// Calendar analytics is now integrated into calendar-view.ui.ts
// Wearable Settings UI - Connected device management
import { showWearableSettings } from './ui/wearable-settings.ui.js';
// Video Settings UI - Video session controls
import { showVideoSettings } from './ui/video-settings.ui.js';
// LinkedIn Settings UI - Career milestone awareness
import { initLinkedInSettings, showLinkedInSettings } from './ui/linkedin-settings.ui.js';
// Vibe Controller UI - Unified Music, Lights, Temperature control
import { show as showVibeController } from './ui/vibe-controller.ui.js';
// Smart Home Settings UI - Connect Ecobee, Hue, LIFX
import { showSmartHomeSettings } from './ui/smart-home-settings.ui.js';
// Eight Sleep Settings UI - Smart mattress control
import { showEightSleepSettings } from './ui/eight-sleep-settings.ui.js';
// Oura Ring Settings UI - Sleep and readiness tracking
import { showOuraSettings } from './ui/oura-settings.ui.js';
// Apple Health Settings UI - iOS HealthKit sync
import { showAppleHealthSettings } from './ui/apple-health-settings.ui.js';
// LinkedIn connection for career awareness (used as fallback)
import { connectLinkedIn, disconnectLinkedIn, handleLinkedInCallback } from './services/linkedin.service.js';
// Group Coaching UI - Multi-participant sessions
import { showGroupCoaching } from './ui/group-coaching.ui.js';
// Voice Enrollment UI
import { initVoiceEnrollmentUI, showVoiceEnrollmentModal } from './ui/voice-enrollment.ui.js';
// Voice ID Badge
import { initVoiceIdBadge } from './ui/voice-id-badge.ui.js';
// Speaker Change Indicator - Gentle verification when voice changes
import { initSpeakerChangeIndicator } from './ui/speaker-change-indicator.ui.js';
// Household Manager - Multi-user voice household management
import { initHouseholdManager, showHouseholdManager } from './ui/household-manager.ui.js';
import { FamilyIdentities } from './ui/family-identities.ui.js';
// Conversation Memory Browser - Browse past conversations and memories
import { initConversationMemory, showConversationMemory } from './ui/conversation-memory.ui.js';
// Wellbeing Dashboard - "State of Me" visualization
import { initWellbeingDashboard, showWellbeingDashboard } from './ui/wellbeing-dashboard.ui.js';
// Life Context Dashboard - Cross-domain life synthesis (Phase 6)
import { initLifeContextDashboard, showLifeContextDashboard } from './ui/life-context-dashboard.ui.js';
// Service Health - Show degradation status to users
import { initServiceHealthUI } from './ui/service-health.ui.js';
// Monetization UIs - Support Ferni
import { ferniFundUI } from './ui/ferni-fund.ui.js';
import { journeyUI } from './ui/journey.ui.js';
import { futureInsightsUI } from './ui/future-insights.ui.js';
import { supportFerniUI } from './ui/support-ferni.ui.js';
// Garden Widget - Seed Fund community contribution display
// Garden widget removed - using simple menu option instead
import { manageSubscriptionUI } from './ui/manage-subscription.ui.js';
import { personalizeUI } from './ui/personalize.ui.js';
import { referralUI } from './ui/referral.ui.js';
// tipJarUI removed - now using ferniFundUI (Garden metaphor)
// Growth Journey - Celebrates relationship milestones
import { growthJourneyService } from './services/growth-journey.service.js';
// Voice Auth Service
import { getVoiceAuthService } from './services/voice-auth.service.js';
// Toast for notifications (legacy - use moments.whisper() for new code)
import { toast } from './ui/whisper.ui.js';
// Moments System - Unified feedback system (whisper, notice, celebration, milestone)
import { initMomentsSystem, moments } from './ui/moments/index.js';
// Subscription UI - human-centered monetization
import {
  initSubscriptionUI,
  loadStatus as loadSubscriptionStatus,
  showLimitReachedModal,
  showUpgradeModal,
  showUsageIndicator,
} from './ui/subscription.ui.js';
// Cosmetics Service - personalization system
import { initCosmeticsService } from './services/cosmetics.service.js';
// Seeds Economy - earn seeds through engagement
import { initSeedsEconomy } from './services/seeds-economy.service.js';
// Referral Service - network effect seeds system
import { initReferralService, processPendingReferral } from './services/referral.service.js';
// Seeds UI - display balance and toast notifications
import { initSeedsDisplay } from './ui/seeds-display.ui.js';
import { initSeedsToast } from './ui/seeds-toast.ui.js';
// Subscription Badge - subtle status indicator in header
import { initSubscriptionBadge, subscriptionBadgeUI } from './ui/subscription-badge.ui.js';
// Support Ferni - Founders Fund experience
import { initSupportFerniUI } from './ui/support-ferni.ui.js';
// Roadmap Panel - What's Growing feature voting
import { initRoadmapPanelUI } from './ui/roadmap-panel.ui.js';
// Structured logger
import { createLogger } from './utils/logger.js';
const log = createLogger('App');

// Modal Coordinator - Prevents popup storms for first-time users
import { initModalCoordinator, modalCoordinator } from './services/modal-coordinator.service.js';

// 🎬 Character-quality Animation Orchestrator
import {
  animatePersonaTransition,
  initAnimationOrchestrator as _initAnimationOrchestrator,
  playCharacterReaction,
} from './ui/animation-orchestrator.ui.js';
// ⚡ GSAP Performance Utilities
import { initGSAP, promoteAllToGPU } from './utils/gsap-animations.js';
// Agent particles disabled for cleaner UI
// import { agentParticlesUI, initAgentParticles } from './ui/agent-particles.ui.js';

// Config
import { getPersona } from './config/personas.js';

// Platform Detection
import { hideSplashScreen, initPlatform, isNative, platform } from './utils/platform.js';

// Magnetic hover effect
import { initMagneticHover } from './ui/magnetic-hover.ui.js';

// 🌟 Soul System - The living presence that makes people fall in love
import { initSoul as _initSoul } from './ui/soul.ui.js';
// 🎬 Narrative Director - Cinematic story beats for connection moments
import { playBeat, updateNarrativeContext } from './narrative/narrative-director.js';
// 🎭 Ritual Engine - Multi-sensory brand moments
import { getRitualEngine as _getRitualEngine, wireRitualEngineToApp as _wireRitualEngineToApp } from './services/ritual-engine.service.js';
// 🧪 Soul test utilities (available as window.testSoul in dev)
// NOTE: Test file imported dynamically to avoid build errors
if (import.meta.env.DEV) {
  void import('./ui/soul.test.js');
}

// 🧪 First-time user testing utilities (available as window.testFirstTimeUser in dev)
// Usage: window.testFirstTimeUser.reset() - Reset to first-time user state
//        window.testFirstTimeUser.simulate(3) - Simulate 3 conversations
//        window.testFirstTimeUser.status() - Get current unlock status
if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).testFirstTimeUser = {
    reset: () => {
      modalCoordinator.resetToFirstTimeUser();
      log.info('Reset to first-time user. Reload the page to test.');
    },
    simulate: (count: number) => {
      modalCoordinator.simulateConversations(count);
      log.info({ count }, 'Simulated conversations. Reload the page to see changes.');
    },
    status: () => {
      const status = modalCoordinator.getFirstTimeUserStatus();
      log.info(
        {
          conversationCount: status.conversationCount,
          isFirstTimeUser: status.isFirstTimeUser,
          unlocked: status.unlockedFeatures,
          locked: status.lockedFeatures,
        },
        'First-Time User Status'
      );
      return status;
    },
  };
}

// 🛠️ Dev Panel - Lazy loaded for performance (17KB gzipped savings)
// Dynamic import: const { initDevPanel } = await import('./ui/dev-panel.ui.js');

// 🎚️ Music Audio Controller - Real-time ducking via Web Audio API
import {
  getMusicAudioController,
  resetMusicAudioController,
} from './services/music-audio.controller.js';

// 🌟 Living Favicon - Ferni's presence in the browser tab

// Panel methods (extracted for file size)
import {
  showAnalyticsDashboard,
  showCognitiveInsights,
  showConversationHistory,
  showDataExport,
  showPredictionTracker,
  showTeamHuddle,
  showYourStoryDashboard,
} from './app/panel-methods.js';

// Data message handlers (extracted for file size)
import {
  handleDataMessage,
  handleEngagementTrigger,
  setShowTeamHuddleCallback,
} from './app/data-message-handlers.js';

// ============================================================================
// APPLICATION CLASS
// ============================================================================

/**
 * Main application class.
 * Coordinates all services and UI components.
 */
class VoiceAIApp {
  private isInitialized = false;
  private audioCleanup: (() => void) | null = null;
  
  // 🎵 Track connection/handoff time to filter out system sounds (stingers)

  // FIX: Track event listeners to prevent memory leaks
  // All document/window event listeners should be added via addTrackedListener()
  // and will be automatically removed in dispose()
  private trackedListeners: Array<{
    target: EventTarget;
    event: string;
    handler: EventListener;
  }> = [];

  /**
   * Add an event listener and track it for cleanup.
   * Use this instead of direct addEventListener to prevent memory leaks.
   */
  private addTrackedListener(
    target: EventTarget,
    event: string,
    handler: EventListener
  ): void {
    target.addEventListener(event, handler);
    this.trackedListeners.push({ target, event, handler });
  }

  /**
   * Initialize the application.
   * Must be called after DOM is ready.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      log.warn('App already initialized');
      return;
    }

    // Initialize crash reporter FIRST for comprehensive error capture
    try {
      const { initCrashReporter } = await import('./services/crash-reporter.service.js');
      void initCrashReporter();
    } catch (e) {
      log.warn('Failed to initialize crash reporter:', e);
    }

    // Initialize disconnect diagnostics for detailed mic drop analysis
    try {
      const { initDisconnectDiagnostics, flushStoredDiagnostics } = await import('./services/disconnect-diagnostics.service.js');
      void initDisconnectDiagnostics();
      // Flush any diagnostics stored from previous session
      void flushStoredDiagnostics();
    } catch (e) {
      log.warn('Failed to initialize disconnect diagnostics:', e);
    }

    // Initialize offline service (service worker, sync queue)
    try {
      const { initOfflineService } = await import('./services/offline.service.js');
      void initOfflineService();
    } catch (e) {
      log.warn('Failed to initialize offline service:', e);
    }

    // Check for admin route
    if (window.location.pathname === '/admin') {
      void this.initializeAdmin();
      return;
    }

    // Check for CLI authentication route
    if (window.location.pathname === '/cli-auth') {
      initCLIAuth();
      return;
    }

    // DISABLED: No skeleton loading - everything visible immediately
    // initSkeletonUI();

    // Add app-loaded class immediately so everything is visible
    document.body.classList.add('app-loaded');

    try {
      // Skip intro - take users straight to the app
      // The awakening can still be triggered manually if needed

      // Initialize platform detection (Electron/iOS/Web)
      void initPlatform();
      log.info('Running on:', platform());

      // Initialize theme system first (affects all UI)
      this.initializeTheme();

      // Initialize i18n (internationalization) - must await before UI init
      await initI18n();

      // Check authentication - require sign-in before proceeding
      // This matches iOS behavior where users must sign in with Apple/Google
      // IMPORTANT: Must await auth initialization to restore any existing session
      const authState = await initializeAuth();
      if (!authState.isAuthenticated) {
        log.info('User not authenticated, showing sign-in gate');
        await showSignInGate();
        log.info('User signed in, continuing app initialization');
      } else {
        log.info('User already authenticated', { uid: authState.uid?.slice(0, 8) });
      }

      // Initialize visual storytelling service (fetches user's ambient preferences)
      // This integrates sleep patterns, relationship metrics, and milestones
      if (authState.uid) {
        visualStorytellingService.init(authState.uid).catch(err => {
          log.warn({ error: err }, 'Failed to initialize visual storytelling service');
        });
      }

      // Initialize services (non-blocking)
      this.initializeServices();

      // Initialize UI components
      this.initializeUI();

      // Set up service callbacks
      this.setupServiceCallbacks();

      // Prompt for user name if needed
      this.promptForUserName();

      this.isInitialized = true;

      // Hide native splash screen on iOS/Android
      if (isNative()) {
        void hideSplashScreen(300);
      }

      // Mark entrance complete immediately (no animations to wait for)
      const avatarContainerEl = document.querySelector('.avatar-container');
      avatarContainerEl?.classList.add('entrance-complete');

      const rosterContainer = document.querySelector('.entrance-roster');
      rosterContainer?.classList.add('entrance-complete');

      // Also mark persona name as entrance-complete to ensure it stays visible
      // after persona transitions (fixes opacity: 0 stuck state bug)
      const personaNameEl = document.querySelector('.entrance-name');
      personaNameEl?.classList.add('entrance-complete');

      // CRITICAL FIX: CSS animations with fill:forwards override even !important rules.
      // We must wait for animations to finish, then cancel them and commit final styles.
      // Animation delay is 250ms + 400ms duration = 650ms total
      setTimeout(() => {
        const nameEl = document.querySelector('.entrance-name') as HTMLElement;
        if (nameEl) {
          // Cancel the CSS animation and force final styles
          nameEl.getAnimations().forEach(a => a.cancel());
          nameEl.style.setProperty('opacity', '1', 'important');
          nameEl.style.setProperty('transform', 'none', 'important');
        }
        const subtitleEl = document.querySelector('.entrance-subtitle') as HTMLElement;
        if (subtitleEl) {
          subtitleEl.getAnimations().forEach(a => a.cancel());
          subtitleEl.style.setProperty('opacity', '1', 'important');
          subtitleEl.style.setProperty('transform', 'none', 'important');
        }
      }, 700); // 250ms delay + 400ms duration + 50ms buffer

      // Signal entrance complete to avatar feedback system
      avatarFeedback.setEntranceComplete();
    } catch (error) {
      log.error('Initialization failed:', error);
      messageUI.show('Having trouble starting up. Try refreshing?', 'error');
    }
  }

  /**
   * Connect to the AI coach with timeout handling.
   *
   * Philosophy: Gating should feel like natural breaks, not walls.
   * We check subscription limits but present them warmly.
   */
  async connect(): Promise<void> {
    // Cancel One-Tap if showing - never interrupt voice connection
    cancelOneTap();

    const persona = appState.get('selectedPersona');

    // Check subscription limits FIRST (before any audio context setup)
    // This ensures we don't waste user's permission tap if they're at limit
    const subscriptionCheck = await this.checkSubscriptionBeforeConnect();
    if (!subscriptionCheck.allowed) {
      return; // Modal already shown by checkSubscriptionBeforeConnect
    }

    // Show gentle reminder if approaching limit (but still allow)
    if (subscriptionCheck.approaching && subscriptionCheck.remaining !== null) {
      // Don't block - just show a subtle indicator after connecting
      setTimeout(() => {
        showUsageIndicator();
        // Also show a warm toast message
        const remaining = subscriptionCheck.remaining;
        if (remaining !== null) {
          if (remaining <= 1) {
            toast.info("This is your last conversation this month. Let's make it count.");
          } else if (remaining <= 2) {
            toast.info(`${remaining} conversations left. I'm here whenever you need me.`);
          }
        }
      }, 3000);
    }

    // Show immediate feedback - user tapped the button
    messageUI.show('Getting ready...', 'info', 30000);

    // iOS CRITICAL: Create and resume AudioContext FIRST in user gesture
    // This must happen synchronously at the start of the click handler
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        const tempCtx = new AudioCtx();
        await tempCtx.resume();
      }
    } catch (e) {
      log.debug('AudioContext pre-init:', e);
    }

    // Play connect sound (soundUI only - has debouncing for mobile)
    try {
      soundUI.play('connect');
    } catch (e) {
      log.debug('Sound play failed (OK on iOS):', e);
    }

    // Show thinking indicator with connection progress
    thinkingUI.show('Connecting');
    thinkingUI.showProgress(0); // Step 0: Authenticating
    waveformUI.setThinking(true);

    // Resume audio context (required after user interaction)
    try {
      await audioService.resumeContext();
    } catch (e) {
      log.debug('Audio resume failed:', e);
    }

    // Step 1: Joining room
    thinkingUI.showProgress(1);

    // Connect to LiveKit with timeout
    const CONNECTION_TIMEOUT = 30000; // 30 seconds
    let success = false;

    try {
      // Step 2: Connecting audio
      thinkingUI.showProgress(2);
      messageUI.show('Almost there...', 'info', 30000);

      const connectionPromise = connectionService.connect();
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), CONNECTION_TIMEOUT);
      });

      success = await Promise.race([connectionPromise, timeoutPromise]);
    } catch (error) {
      log.error('Connection failed:', error);
      thinkingUI.hideProgress();
      thinkingUI.hide();
      waveformUI.setThinking(false);

      // Human-friendly error messages (not robotic!)
      let errorMessage = "Hmm, couldn't connect. Let's try that again.";
      if (error instanceof Error) {
        if (error.message === 'Connection timeout') {
          errorMessage = 'Taking longer than usual... check your internet connection?';
        } else if (error.message.includes('permission') || error.message.includes('Permission')) {
          errorMessage = "I'll need microphone access to hear you. Mind enabling it?";
        } else if (error.message.includes('network') || error.message.includes('Network')) {
          errorMessage = 'Having trouble reaching the server. Is your internet working?';
        } else {
          errorMessage = 'Something went wrong on our end. Try again in a moment?';
        }
      }

      messageUI.show(errorMessage, 'error');
      soundUI.play('disconnect');

      // Error recovery animation - shake the connect button
      const connectBtn = document.getElementById('connectBtn');
      if (connectBtn) {
        connectBtn.classList.remove('error-shake');
        void connectBtn.offsetWidth; // Force reflow
        connectBtn.classList.add('error-shake');
        setTimeout(() => connectBtn.classList.remove('error-shake'), 400);
      }

      // Pulse the message for attention
      const messageContainer = document.getElementById('messageContainer');
      if (messageContainer) {
        messageContainer.classList.add('error-pulse');
        setTimeout(() => messageContainer.classList.remove('error-pulse'), 3000);
      }
      return;
    }

    // Step 3: Ready! Hide thinking indicator
    thinkingUI.showProgress(3);
    setTimeout(() => {
      thinkingUI.hideProgress();
      thinkingUI.hide();
    }, 300);
    waveformUI.setThinking(false);

    if (success) {
      // Start waveform and set persona
      waveformUI.start();
      waveformUI.setPersona(persona.id);
      avatarFeedback.setPersona(persona.id);

      // Particles disabled for cleaner professional look
      // void agentParticlesUI.start(persona.id);

      // Update all UI systems
      presenceUI.setConnected(true);
      // keyboardUI.setConnected(true);

      // Connection quality indicator disabled for clean UI
      // connectionQualityUI.show();
      // connectionQualityUI.setQuality('good');

      // Start session stats
      statsUI.startSession();
      statsUI.setPersona(persona.name);

      // Update gesture system
      gesturesUI.setCurrentPersona(persona.id);

      // Show engagement triggers ONLY for returning users
      // First conversation should be pure - just Ferni, nothing else
      if (modalCoordinator.hasMinimumConversations(1)) {
        setTimeout(() => engagementTriggerUI.show(), 500);
      }

      // Show success message
      messageUI.show(`Connected to ${persona.name}!`, 'success', 2000);

      // 📝 Start tracking this conversation for history
      conversationTracker.startSession(persona.id, persona.name);

      // Celebrate the connection! 🎉
      delightService.celebrateConnection();
      delightService.haptic('medium');

      // First connection gets extra celebration
      // Minimal, zen aesthetic - no celebration effects on connection
      try {
        if (!localStorage.getItem('voiceai_first_connection')) {
          localStorage.setItem('voiceai_first_connection', 'true');
          // First connection noted silently
        }
      } catch {
        // Private browsing - continue without celebration
      }

      // Check microphone permission and show helpful message if denied
      void this.checkMicrophoneStatus();

      // 🎉 Dispatch conversation start event for all systems to track
      // This is the SINGLE SOURCE OF TRUTH for conversation tracking
      // All services listen to this event - no direct recordConversation() calls needed
      window.dispatchEvent(new CustomEvent('ferni:conversation-start'));

      // Check conversation milestones - zen aesthetic, no visual effects
      const convCount = greetingUI.getConversationCount();
      if ([5, 10, 25, 50, 100].includes(convCount)) {
        setTimeout(() => {
          const message = greetingUI.getMilestoneMessage('conversations', convCount);
          messageUI.show(message, 'success', 4000);
        }, 5000);
      }
    } else {
      messageUI.show("Couldn't connect this time. Want to try again?", 'error');
      soundUI.play('disconnect');
    }
  }

  /**
   * Disconnect from the AI coach.
   *
   * If we're in wrap-up mode (agent said goodbye), performs a warm ceremony:
   * 1. Play warm goodbye sound
   * 2. Avatar settling animation
   * 3. Brief pause to appreciate the moment
   * 4. Then graceful disconnect
   *
   * Otherwise, performs immediate disconnect with standard sound.
   */
  async disconnect(): Promise<void> {
    const isWrappingUp = appState.get('isWrappingUp');

    // 🌅 GOODBYE CEREMONY - When agent has said goodbye, make it magical
    if (isWrappingUp) {
      await this.performGoodbyeCeremony();
    } else {
      // Standard disconnect (abrupt end - user didn't say goodbye)
      await this.performStandardDisconnect();
    }
  }

  /**
   * 🌅 Perform the magical goodbye ceremony.
   *
   * This is the "Better than Human" moment - making goodbye feel meaningful.
   * Per sonic identity: "That was meaningful" feeling.
   */
  private async performGoodbyeCeremony(): Promise<void> {
    log.info('🌅 Beginning goodbye ceremony');

    // Step 1: Update button to show ceremony is happening
    controlsUI.showClosingState();

    // Step 2: Play warm goodbye sound (resolving chord progression)
    // This sound is 2s and sets the emotional tone
    soundUI.play('goodbye');

    // Step 3: Gentle haptic for the farewell moment
    delightService.haptic('medium');

    // Step 4: Avatar settling animation - peaceful close
    // This runs alongside the sound for 1.5s
    const settlingPromise = presenceUI.settling();

    // Step 5: Wait for both sound and animation
    // Sound is ~2s, settling is ~1.5s - we wait for settling then add a pause
    await settlingPromise;

    // Step 6: Brief pause to appreciate the moment (the goodbye "hangs")
    await new Promise((resolve) => setTimeout(resolve, 400));

    // Step 7: Satisfying phone "click" at the moment of disconnect
    // Like gently placing down a receiver - tactile finality
    soundUI.play('hangup');
    delightService.haptic('light'); // Subtle haptic for the click

    // Step 8: Now perform the actual disconnect (gracefully)
    await this.performStandardDisconnect(true); // true = skip disconnect sound

    // Step 9: 💰 Show conversation cost transparency ("tip jar")
    // Give the user a moment to settle, then show the cost card
    setTimeout(async () => {
      try {
        const { showConversationCost } = await import('./ui/conversation-cost.ui.js');
        await showConversationCost();
      } catch (e) {
        log.debug('Cost display skipped', { error: String(e) });
      }
    }, 800);

    log.info('🌅 Goodbye ceremony complete');
  }

  /**
   * Standard disconnect sequence.
   *
   * @param skipSound - If true, doesn't play disconnect sound (ceremony already played goodbye)
   */
  private async performStandardDisconnect(skipSound = false): Promise<void> {
    // Stop waveform visualization
    waveformUI.stop();

    // Clean up audio visualization
    if (this.audioCleanup) {
      this.audioCleanup();
      this.audioCleanup = null;
    }

    // Update all UI systems
    presenceUI.setConnected(false);
    presenceUI.setSpeaking(false);
    presenceUI.setListening(false);
    // keyboardUI.setConnected(false);
    connectionQualityUI.hide();
    transcriptUI.hide();
    engagementTriggerUI.hide();

    // Clean up game board UI
    destroyGameBoard();

    // End session stats - get duration before ending
    const sessionStats = statsUI.getStats();
    const durationMinutes = sessionStats.startTime
      ? Math.round((Date.now() - sessionStats.startTime) / 60000)
      : 0;

    statsUI.endSession();

    // 🎉 Dispatch conversation end event for milestones tracking
    window.dispatchEvent(
      new CustomEvent('ferni:conversation-end', {
        detail: { durationMinutes },
      })
    );

    // 📊 Track conversation count for progressive feature unlocking
    // This gates popups/celebrations until user has had 2+ conversations
    modalCoordinator.incrementConversationCount();

    // 📝 End conversation tracking and persist
    await conversationTracker.endSession();

    // 💰 Record conversation usage for subscription tracking
    await this.recordConversationUsage();

    // Pause Spotify if playing
    await spotifyService.pause();

    // Disconnect from LiveKit
    await connectionService.disconnect();

    // FIX BUG: Reset handoff service to clear stuck transition states
    handoffService.resetSession();

    // Play disconnect sound (unless ceremony already played goodbye sound)
    if (!skipSound) {
      soundUI.play('disconnect');
    }

    // Reset audio state
    setAudioState('idle');
    expressiveEyes.setVoiceState('idle'); // 👀 Eyes return to idle breathing

    // Reset wrap-up state (conversation is over)
    setWrappingUp(false);

    // Update delight state
    delightService.onDisconnect();

    // Clear mood state (persona back to neutral)
    moodService.clearMood();

    // Refresh proactive messages (conversation may have triggered new outreach)
    refreshProactiveMessages();
  }

  /**
   * Toggle microphone mute.
   */
  toggleMute(): void {
    const room = connectionService.getRoom();
    if (!room) return;

    const currentMuted = appState.get('isMuted');
    const newMuted = !currentMuted;

    // Toggle local audio track
    void room.localParticipant?.setMicrophoneEnabled(!newMuted);
    appState.set('isMuted', newMuted);

    messageUI.show(newMuted ? "I'll wait quietly" : "I'm listening", 'info', 1500);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Initialize admin dashboard (alternate route).
   * Uses the new unified Admin Portal for centralized management.
   */
  private async initializeAdmin(): Promise<void> {
    log.info('Initializing Admin Portal...');

    // Check for legacy admin route (backwards compatibility)
    const useLegacyAdmin = window.location.search.includes('legacy');

    if (useLegacyAdmin) {
      // Legacy admin dashboard (for backward compatibility)
      const appContent = document.getElementById('app') || document.body;
      // Set body to allow scrolling for admin dashboard
      document.body.style.overflow = 'auto';
      document.body.style.height = 'auto';
      appContent.innerHTML = `
        <div id="adminDashboard" style="min-height: 100vh; background: #0d0d1a; color: #fff; overflow-y: auto; padding-bottom: 2rem;"></div>
        <a href="/" style="position: fixed; top: 1rem; left: 1rem; color: #4a6741; text-decoration: none; font-size: 0.875rem; z-index: var(--z-dropdown);">
          ← Back to App
        </a>
      `;
      injectAdminStyles();
      await initAdminDashboard();
    } else {
      // New unified Admin Portal
      await initAdminPortal();
    }

    this.isInitialized = true;
  }

  /**
   * Initialize the theme system.
   * Sets up theme from localStorage/system preference and wires up toggle button.
   */
  private initializeTheme(): void {
    // Initialize theme from stored preference or system
    initTheme();

    // ========================================================================
    // AMBIENT EXPERIENCE SYSTEM (Better than Apple/Google)
    // Layered theming: Circadian (time) + Warmth (relationship) + Persona
    // ========================================================================
    
    // 1. Circadian: Time-aware theming (dawn warmth, midday clarity, night intimacy)
    circadianManager.injectStyles();
    circadianManager.init();

    // 2. Warmth: Relationship-based visual evolution (deepens as bond grows)
    warmthManager.injectStyles();
    warmthManager.init();

    // 3. Persona Aura: Ambient glow reflecting the active team member
    personaAura.injectStyles();
    personaAura.init();

    // Start ambient warmth cycle (WALL-E style time-aware lighting)
    startAmbientCycle();

    // Initialize magnetic hover effect (WALL-E curiosity)
    initMagneticHover();

    // Wire up theme toggle button
    const toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) {
      this.addTrackedListener(toggleBtn, 'click', () => {
        toggleTheme();
      });

      // Add keyboard shortcut (T) for theme toggle
      this.addTrackedListener(document, 'keydown', ((e: KeyboardEvent) => {
        if (e.key === 't' || e.key === 'T') {
          // Don't toggle if user is typing in an input
          if (
            document.activeElement?.tagName !== 'INPUT' &&
            document.activeElement?.tagName !== 'TEXTAREA'
          ) {
            toggleTheme();
          }
        }
      }) as EventListener);
    }

    // Listen for theme changes (for analytics or other systems)
    onThemeChange((_newTheme) => {
      // Reserved for future analytics/telemetry
    });

    // Set initial persona theme
    const persona = appState.get('selectedPersona');
    if (persona?.id) {
      this.updatePersonaTheme(persona.id);
    }
  }

  /**
   * Update the persona theme colors.
   */
  private updatePersonaTheme(personaId: PersonaId): void {
    // Use canonical persona IDs (CSS selectors now use these)
    const validIds = [
      'ferni',
      'peter-john',
      'alex-chen',
      'maya-santos',
      'jordan-taylor',
      'nayan-patel',
    ];
    const themePersona = validIds.includes(personaId) ? personaId : 'ferni';
    setThemePersona(themePersona as Parameters<typeof setThemePersona>[0]);
  }

  /**
   * Initialize all services.
   * IMPORTANT: Services should NOT block UI initialization, especially on iOS.
   */
  private async initializeServices(): Promise<void> {
    // Initialize modal coordinator FIRST - gates all popups for first-time users
    // Philosophy: "First conversation IS the onboarding"
    initModalCoordinator();

    // 🆔 CRITICAL: Ensure user profile exists early for Better Than Human memory
    // This creates the Firestore profile on first visit so we can start remembering immediately
    this.ensureProfileExists();

    // Initialize audio service (non-blocking - loads sounds in background)
    try {
      audioService.initialize();
    } catch (err) {
      log.warn('Audio service init failed:', err);
      // Continue anyway - sounds are nice but not critical
    }

    // Initialize mood service (connects humanizing system to UI)
    moodService.init();

    // Detect and sync user timezone (non-blocking)
    // Ensures outreach calls & notifications respect quiet hours
    void detectAndSyncTimezone()
      .then((tz) => {
        log.debug('Timezone detected:', tz);
      })
      .catch((err) => {
        log.warn('Timezone detection failed:', err);
        // Continue anyway - default timezone will be used
      });

    // 📍 "Better than Human" - Initialize location awareness (non-blocking)
    // Gets best-known location from localStorage/timezone - no permission prompt
    void getLocation()
      .then((loc) => {
        if (loc.city) {
          log.debug({ city: loc.city, source: loc.source }, '📍 Location loaded');
        } else {
          log.debug({ source: loc.source }, '📍 Location: no city yet (will detect from IP on connect)');
        }
      })
      .catch((err) => {
        log.debug('Location init skipped:', err);
      });

    // Initialize Spotify silently in the background
    // iTunes is the default for everyone, so no need to show Spotify status
    void spotifyService
      .initialize()
      .then((_success) => {
        // Spotify integration ready (or fell back to iTunes)
      })
      .catch((_err) => {
        // No error shown - iTunes is the default anyway
      });

    // 🎯 "Better than human" - Check for demo session to claim
    // If user came from landing page demo, claim their conversation
    if (hasPendingClaim()) {
      log.info('Pending demo claim detected - processing...');
      void checkAndClaimDemoSession(getAuthToken)
        .then((result) => {
          if (result.success && !result.alreadyClaimed) {
            // Show warm acknowledgment
            const conversation = result.conversation;
            if (conversation && conversation.highlights && conversation.highlights.length > 0) {
              toast.success('Welcome back! I remember our conversation.');
            } else {
              toast.success("Welcome! So glad you're here.");
            }
            log.info('Demo session claimed successfully');
          } else if (result.success && result.alreadyClaimed) {
            log.debug('Demo session was already claimed');
          }
        })
        .catch((err) => {
          log.warn('Demo claim failed:', err);
          // No error shown to user - not critical
        });
    }

    // 🔐 Google One-Tap Sign-In - Gentle prompt for anonymous users
    // Shows after 8 seconds, respects dismissals with progressive cooldown
    initGoogleOneTap();

    // 🧠 Better Than Human: Voice ↔ App Sync
    // Track user activity in the app so voice agent knows context
    try {
      const { initAppContextTracking } = await import('./services/app-context-tracking.service.js');
      initAppContextTracking();
      log.debug('App context tracking initialized');
    } catch (err) {
      log.warn('App context tracking init failed:', err);
      // Non-critical - continue without it
    }
  }

  /**
   * Ensure user profile exists in Firestore (early creation for Better Than Human memory)
   * This creates the profile on first visit, BEFORE voice connection, so we can:
   * 1. Start tracking identity immediately
   * 2. Sync onboarding state across devices
   * 3. Remember the user's name from wherever they enter it
   */
  private async ensureProfileExists(): Promise<void> {
    try {
      const { apiPost } = await import('./utils/api.js');
      const { getDeviceId, getUserName } = await import('./state/app.state.js');

      const deviceId = getDeviceId();
      const userName = getUserName();

      // Call the profile endpoint to ensure profile exists
      const response = await apiPost<{ success: boolean; profile: unknown }>('/api/user/profile', {
        deviceId,
        name: userName || undefined, // Don't send null
      });

      if (response.ok && response.data) {
        log.info('Profile ensured:', {
          hasName: !!response.data.profile && typeof response.data.profile === 'object' && 'name' in response.data.profile,
          deviceLinked: !!deviceId,
        });
      }
    } catch (err) {
      // Non-critical - profile will be created on voice connection
      log.debug('Early profile creation skipped:', err);
    }
  }

  /**
   * Safe UI initialization wrapper - catches errors so one module doesn't break the app.
   * Supports both sync and async init functions.
   */
  private safeInit(name: string, initFn: () => void | Promise<void>): void {
    try {
      const result = initFn();
      // Handle async functions - fire and forget but log errors
      if (result instanceof Promise) {
        result.catch((error) => {
          log.error(`Failed to initialize ${name} (async):`, error);
        });
      }
    } catch (error) {
      log.error(`Failed to initialize ${name}:`, error);
      // Continue loading other modules
    }
  }

  /**
   * Deferred initialization - loads module after a delay to not block first render.
   * Use for non-critical features that can load after the UI is visible.
   */
  private deferredInit(name: string, delayMs: number, initFn: () => Promise<void>): void {
    setTimeout(() => {
      initFn().catch((error) => {
        log.error(`Failed to initialize ${name} (deferred):`, error);
      });
    }, delayMs);
  }

  /**
   * Initialize all UI components.
   */
  private initializeUI(): void {
    // ⚡ Initialize GSAP for GPU-accelerated animations
    this.safeInit('GSAP', () => {
      initGSAP();
      // Promote frequently animated elements to GPU layers
      // NOTE: #coachAvatar removed - causes visible box bug in Safari
      // GSAP's force3D config (set in initGSAP) handles GPU acceleration
      promoteAllToGPU('.waveform-bar, .btn');
    });

    // System UI - Critical system-level UI components
    this.safeInit('OfflineBanner', async () => {
      const { initOfflineBanner } = await import('./ui/offline-banner.ui.js');
      initOfflineBanner();
    });

    // Core UI - Initialize in order of dependency (these are critical)
    this.safeInit('MessageUI', () => initMessageUI());
    this.safeInit('WaveformUI', () => initWaveformUI());
    this.safeInit('CoachUI', () => initCoachUI());
    this.safeInit('ExpressiveEyes', () => initExpressiveEyes()); // 👀 Pixar-style eye expressions
    this.safeInit('TeamUI', () => initTeamUI());
    this.safeInit('SpotifyUI', () => initSpotifyUI());
    this.safeInit('ControlsUI', () =>
      initControlsUI({
        onConnect: () => {
          void this.connect();
        },
        onDisconnect: () => {
          void this.disconnect();
        },
        onMuteToggle: () => this.toggleMute(),
      })
    );

    // =========================================================================
    // DEFERRED LOADING - Premium features loaded after first paint
    // This significantly speeds up initial page load time
    // =========================================================================
    
    // Essential extras - load after 100ms (needed early but not for first paint)
    this.deferredInit('SoundUI', 100, async () => {
      initSoundUI();
    });
    this.deferredInit('TranscriptUI', 100, async () => {
      initTranscriptUI();
    });
    this.deferredInit('ThinkingUI', 100, async () => {
      initThinkingUI();
    });
    this.deferredInit('ConnectionQualityUI', 100, async () => {
      initConnectionQualityUI();
    });
    this.deferredInit('MoodUI', 100, async () => {
      initMoodUI();
    });
    this.deferredInit('AvatarFeedback', 100, async () => {
      initAvatarFeedback();
    });

    // Premium features - load after 300ms (nice to have)
    this.deferredInit('AmbientSounds', 300, async () => {
      const { initAmbientSounds } = await import('./services/ambient-sounds.service.js');
      initAmbientSounds();
    });
    this.deferredInit('BrandService', 300, async () => {
      const { initBrandService } = await import('./services/brand-service.js');
      initBrandService();
    });
    this.deferredInit('CelebrationsUI', 300, async () => {
      const { initCelebrationsUI } = await import('./ui/celebrations.ui.js');
      initCelebrationsUI();
    });
    // 📊 Contextual Feedback - avatar-attached feedback during natural pauses
    this.deferredInit('ContextualFeedbackUI', 300, async () => {
      const { initContextualFeedbackUI } = await import('./ui/contextual-feedback.ui.js');
      initContextualFeedbackUI();
    });
    // 📊 Feedback Insights Panel - user reflection on conversation patterns
    this.deferredInit('FeedbackInsightsPanel', 300, async () => {
      const { initFeedbackInsightsPanel } = await import('./ui/feedback-insights-panel.ui.js');
      initFeedbackInsightsPanel();
    });
    // 📜 Music History - slide-out drawer showing recently played tracks
    this.deferredInit('MusicHistoryUI', 300, async () => {
      const { initMusicHistoryUI } = await import('./ui/music-history.ui.js');
      initMusicHistoryUI();
    });
    // 🔖 Bookmark - double-tap avatar to save moments
    this.deferredInit('BookmarkUI', 300, async () => {
      const { initBookmarkUI } = await import('./ui/bookmark.ui.js');
      initBookmarkUI();
    });
    // 🔥 Streak - DISABLED: Now consolidated into Connection Heart indicator
    // The connection heart shows both streak (top-left fire badge) and milestones (bottom-right)
    // Opening Journey modal shows full stats including streak, milestones, and relationship stage
    // this.deferredInit('StreakUI', 300, async () => {
    //   const { initStreakUI } = await import('./ui/streak.ui.js');
    //   initStreakUI();
    // });
    this.deferredInit('StatsUI', 300, async () => {
      const { initStatsUI } = await import('./ui/stats.ui.js');
      initStatsUI();
    });
    this.deferredInit('PresenceUI', 300, async () => {
      const { initPresenceUI } = await import('./ui/presence.ui.js');
      initPresenceUI();
    });
    this.deferredInit('RippleUI', 300, async () => {
      const { initRippleUI } = await import('./ui/ripple.ui.js');
      initRippleUI();
    });
    this.deferredInit('MicroInteractionsUI', 300, async () => {
      const { initMicroInteractions } = await import('./ui/micro-interactions.ui.js');
      initMicroInteractions();
    });
    this.deferredInit('EasterEggsUI', 500, async () => {
      const { initEasterEggsUI } = await import('./ui/easter-eggs.ui.js');
      initEasterEggsUI();
    });
    // 🎂 Ferni Birthday - special celebration on June 15
    this.deferredInit('FerniBirthdayUI', 500, async () => {
      const { initFerniBirthdayUI } = await import('./ui/ferni-birthday.ui.js');
      initFerniBirthdayUI();
    });
    // 🎨 Mood Backgrounds - subtle color shifts based on emotional mood
    this.deferredInit('MoodBackgroundsUI', 200, async () => {
      const { initMoodBackgroundsUI } = await import('./ui/mood-backgrounds.ui.js');
      initMoodBackgroundsUI();
    });
    // 👆 Avatar Tap Reactions - tap avatar for laugh/wink reactions
    this.deferredInit('AvatarTapReactionsUI', 400, async () => {
      const { initAvatarTapReactionsUI } = await import('./ui/avatar-tap-reactions.ui.js');
      initAvatarTapReactionsUI();
    });
    // 😴 Sleep Mode - gentle resting animation when idle
    this.deferredInit('SleepModeUI', 1000, async () => {
      const { initSleepModeUI } = await import('./ui/sleep-mode.ui.js');
      initSleepModeUI();
    });
    // 📸 Memory Lane - "On This Day" memories and highlights
    this.deferredInit('MemoryLaneUI', 500, async () => {
      const { initMemoryLaneUI } = await import('./ui/memory-lane.ui.js');
      initMemoryLaneUI();
    });
    // 📊 Pattern Insights - behavioral patterns visualization
    this.deferredInit('PatternInsightsUI', 600, async () => {
      const { initPatternInsightsUI } = await import('./ui/pattern-insights.ui.js');
      initPatternInsightsUI();
    });
    // 💭 Check-in Badge - shows when Ferni is thinking of you
    this.deferredInit('CheckinBadgeUI', 700, async () => {
      const { initCheckinBadgeUI } = await import('./ui/checkin-badge.ui.js');
      initCheckinBadgeUI();

      // Listen for check-in acknowledgment to start conversation with context
      // FIX: Use tracked listener to prevent memory leak
      this.addTrackedListener(window, 'ferni:checkin-acknowledged', ((event: CustomEvent<{ checkinId: string; message: string; type: string }>) => {
        const { message, type } = event.detail;
        log.info({ type, message: message.slice(0, 50) }, '💭 Check-in acknowledged, starting conversation');

        // Store check-in context in sessionStorage for the conversation to pick up
        if (message) {
          try {
            sessionStorage.setItem('ferni_checkin_context', JSON.stringify({ message, type }));
          } catch {
            // Ignore storage errors
          }
        }

        // Start the connection if not already connected
        if (!connectionService.isConnected()) {
          void this.connect();
        }
      }) as EventListener);
    });
    // 🧠 Knowledge Quiz - "How Well Do You Know Me?" game
    this.deferredInit('KnowledgeQuizUI', 800, async () => {
      const { initKnowledgeQuizUI } = await import('./ui/knowledge-quiz.ui.js');
      initKnowledgeQuizUI();
    });
    // 📔 Growth Journal - auto-generated reflections on your journey
    this.deferredInit('GrowthJournalUI', 900, async () => {
      const { initGrowthJournalUI } = await import('./ui/growth-journal.ui.js');
      initGrowthJournalUI();
    });

    // Relationship features - load after 400ms
    this.deferredInit('YourPeopleUI', 400, async () => {
      const { initYourPeopleUI } = await import('./ui/your-people.ui.js');
      initYourPeopleUI();
    });
    
    // 📱 Mobile features - load after 200ms on mobile only
    if (window.innerWidth <= 768) {
      this.deferredInit('MobileDelights', 200, async () => {
        const { initMobileDelights } = await import('./ui/mobile-delights.ui.js');
        const { gesturesUI } = await import('./ui/gestures.ui.js');
        initMobileDelights({
          onConnectRequest: () => {
            if (appState.get('connection') === 'disconnected') {
              void this.connect();
            }
          },
          onPersonaSwipe: (direction) => {
            const persona =
              direction === 'left' ? gesturesUI.getNextPersona() : gesturesUI.getPreviousPersona();
            this.selectPersona(persona);
            soundUI.play('switch');
          },
        });
      });
      this.deferredInit('MobileBottomSheet', 200, async () => {
        const { initMobileBottomSheet } = await import('./ui/mobile-bottom-sheet.ui.js');
        initMobileBottomSheet();
      });
    }

    // 🌨️ Weather Effects - load after 1 second (purely decorative)
    this.deferredInit('WeatherEffects', 1000, async () => {
      const { initWeatherEffects } = await import('./ui/weather-effects.ui.js');
      initWeatherEffects();
    });
    
    // 🎭 Ferni Moments - load after 500ms
    this.deferredInit('FerniMoments', 500, async () => {
      const { initFerniMoments } = await import('./ui/ferni-moments.ui.js');
      initFerniMoments();
    });
    
    // 🤲 Avatar Sidekicks - load after 550ms (expressive side icons)
    this.deferredInit('AvatarSidekicks', 550, async () => {
      const { avatarSidekicks } = await import('./ui/avatar-sidekicks.ui.js');
      avatarSidekicks.init();
    });

    // 🎉 Ferni Milestones - load after 600ms
    this.deferredInit('FerniMilestones', 600, async () => {
      const { initFerniMilestones } = await import('./ui/ferni-milestones.ui.js');
      initFerniMilestones();
    });

    // 💚 Unified Indicator - load after 200ms (single smart avatar badge)
    this.deferredInit('UnifiedIndicator', 200, async () => {
      const { initUnifiedIndicator } = await import('./ui/unified-indicator.ui.js');
      initUnifiedIndicator();
    });
    
    // 🎬 Ferni Expressions - load after 300ms
    this.deferredInit('FerniExpressions', 300, async () => {
      const { initFerniExpressions } = await import('./ui/ferni-expressions.ui.js');
      initFerniExpressions();
    });

    // 🔗 Emotion ↔ Expression Bridge - load after 400ms
    this.deferredInit('EmotionExpressionBridge', 400, async () => {
      const { enableEmotionExpressionBridge } = await import('./emotion/emotion-expression-bridge.js');
      enableEmotionExpressionBridge();
    });

    // 🎨 Logo Expressions - load after 400ms
    this.deferredInit('LogoExpressions', 400, async () => {
      const { initLogoExpressions, hookIntoAvatarFeedback } = await import('./ui/logo-expressions.ui.js');
      initLogoExpressions();
      hookIntoAvatarFeedback();
    });

    // 🎉 Celebration Service - load after 600ms
    this.deferredInit('CelebrationService', 600, async () => {
      const { initCelebrationService } = await import('./services/celebration.service.js');
      initCelebrationService();
    });

    // 🎤 Speech Event Dispatcher - load after 300ms (needed before FerniEQ)
    this.deferredInit('SpeechEventDispatcher', 300, async () => {
      const { initSpeechEventDispatcher } = await import('./services/speech-event-dispatcher.js');
      initSpeechEventDispatcher();
    });

    // 🚀 Ferni EQ - load after 500ms (depends on SpeechEventDispatcher)
    this.deferredInit('FerniEQ', 500, async () => {
      const { initFerniEQ } = await import('./ui/better-than-human.ui.js');
      const { initHumanizationBridge } = await import('./services/humanization-bridge.service.js');
      const { initProactiveOutreachUI } = await import('./ui/proactive-outreach.ui.js');
      const { initTeamInsightsUI } = await import('./ui/team-insights.ui.js');
      const { initCrossTeamNotifications } = await import('./services/cross-team-notifications.service.js');
      const { initVoiceEvents } = await import('./services/voice-events.service.js');

      initFerniEQ();
      initHumanizationBridge();
      initProactiveOutreachUI();
      initTeamInsightsUI();

      // 🌟 Transcendent Animation Systems - Initialize signature moments
      // This must come after FerniEQ and HumanizationBridge
      const { initTranscendentSystems: initTS } = await import('./systems/index.js');
      initTS();

      // Initialize cross-team notifications with userId if available
      const userId = appState.get('deviceId');
      if (userId) {
        initCrossTeamNotifications(userId);
        initVoiceEvents(userId);
      }

      // Set up gentle check-in handler for significant concern detection
      this.addTrackedListener(document, 'ferni:gentle-checkin', ((e: CustomEvent) => {
        const { level, triggers } = e.detail || {};
        log.info('🚀 Ferni EQ gentle check-in triggered', { level, triggers });

        // Show visual acknowledgment that Ferni noticed
        avatarFeedback.react('empathy');

        // Optional: Show a subtle message to indicate Ferni cares
        // We don't want to be intrusive, just present
        if (level === 'significant') {
          messageUI.show("I'm here with you.", 'info', 3000);
        }
      }) as EventListener);
    });

    // ✨ Avatar Soul - load after 600ms
    this.deferredInit('AvatarSoul', 600, async () => {
      const { initAvatarSoul, avatarSoul } = await import('./ui/avatar-soul.ui.js');
      initAvatarSoul();
      this.addTrackedListener(document, 'ferni:conversation-turn', () => {
        avatarSoul.recordInteraction(0.5);
      });
    });

    // 🎬 Avatar Lamp - load after 700ms
    this.deferredInit('AvatarLamp', 700, async () => {
      const { initAvatarLamp, avatarLamp } = await import('./ui/avatar-lamp.ui.js');
      initAvatarLamp();
      if (typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>).__avatarLamp = avatarLamp;
      }
    });

    // 🌿 Ambient Life - load after 800ms
    this.deferredInit('AmbientLife', 800, async () => {
      const { initAmbientLife } = await import('./ui/ambient-life.ui.js');
      initAmbientLife();
    });

    // 🌅 Mood Context - load after 400ms
    this.deferredInit('MoodContext', 400, async () => {
      const { initMoodContext } = await import('./services/mood-context.service.js');
      initMoodContext();
    });

    // 🎬 Animation Orchestrator - load after 500ms
    this.deferredInit('AnimationOrchestrator', 500, async () => {
      const { initAnimationOrchestrator } = await import('./ui/animation-orchestrator.ui.js');
      initAnimationOrchestrator();
    });

    // 🌟 Soul System - load after 600ms
    this.deferredInit('Soul', 600, async () => {
      const { initSoul } = await import('./ui/soul.ui.js');
      void initSoul({
        showFirstLaunch: false,
        enablePersonaMagic: true,
      });
    });

    // 🎭 Ritual Engine - load after 700ms
    this.deferredInit('RitualEngine', 700, async () => {
      const { wireRitualEngineToApp, getRitualEngine } = await import('./services/ritual-engine.service.js');
      wireRitualEngineToApp();
      void getRitualEngine().initialize();
    });

    // 🛠️ Dev Panel - load after 1 second
    this.deferredInit('DevPanel', 1000, async () => {
      const { initDevPanel } = await import('./ui/dev-panel.ui.js');
      initDevPanel();
    });

    // 🔍 Debug Panels - load after 1.5 seconds
    this.deferredInit('DebugPanels', 1500, async () => {
      const [{ initInsightsDebugPanel }, { initTriggerDebugPanel }] = await Promise.all([
        import('./ui/insights-debug-panel.ui.js'),
        import('./ui/trigger-debug-panel.ui.js'),
      ]);
      initInsightsDebugPanel();
      initTriggerDebugPanel();
    });

    // 📔 Journaling - load after 800ms
    this.deferredInit('Journaling', 800, async () => {
      const [{ initJournalingShortcut }, { initJournalCapture }] = await Promise.all([
        import('./ui/digital-twin.ui.js'),
        import('./services/journal-capture.service.js'),
      ]);
      initJournalingShortcut();
      initJournalCapture();
    });

    // 📊 Engagement UI - load after 500ms
    this.deferredInit('EngagementUI', 500, async () => {
      const [{ initializeEngagementUI }, { initializeInsightsView }, { initializePredictionsUI }] = await Promise.all([
        import('./ui/engagement.ui.js'),
        import('./ui/insights-view.ui.js'),
        import('./ui/predictions.ui.js'),
      ]);
      initializeEngagementUI();
      initializeInsightsView();
      initializePredictionsUI();
      // Wire up prediction resolution callback
      getPredictionsUI().setOnResolutionSubmit(async (predictionId, actualValue) => {
        try {
          // Use apiPost for proper Firebase auth
          const postResponse = await apiPost(`/api/predictions/${predictionId}/actuals`, {
            actuals: { result: actualValue },
          });
          if (!postResponse.ok) throw new Error('Failed to save');

          // Refresh predictions data using apiGet
          const refreshResponse = await apiGet<{ predictions: Record<string, unknown>[]; stats?: { averageAccuracy?: number } }>('/api/predictions');
          if (refreshResponse.ok && refreshResponse.data) {
            const predictions = refreshResponse.data.predictions || [];
            getPredictionsUI().update({
              predictions: predictions.map((p: Record<string, unknown>) => ({
                id: p.id as string,
                category: 'overall',
                question: `Week of ${p.weekOf}`,
                userPrediction: 50,
                actualOutcome: p.accuracy as number | undefined,
                status: p.completedAt ? ('resolved' as const) : ('pending' as const),
                createdAt: p.createdAt as string,
              })),
              accuracy: refreshResponse.data.stats?.averageAccuracy || null,
              totalResolved: predictions.filter((p: Record<string, unknown>) => p.completedAt)
                .length,
              currentStreak: 0,
            });
          }

          messageUI.show('Result recorded! Nice work tracking your predictions.', 'success', 3000);
        } catch (err) {
          log.error('Failed to save prediction result', err);
          throw err;
        }
      });
    });
    this.safeInit('EngagementTriggerUI', () =>
      initEngagementTriggerUI({
        // Show InsightsView ("What I'm Noticing") - the relationship-focused daily check-in
        onEngagementClick: () => getInsightsView().toggle(),
        onPredictionsClick: () => getPredictionsUI().toggle(),
        onInsightsClick: () => teamInsightsUI.toggle(),
      })
    );

    // 🔔 Notifications UI - Proactive engagement notifications
    this.safeInit('NotificationsUI', () => initNotificationsUI());

    // 🆕 New Feature UIs (v2)
    this.safeInit('ConversationHistoryUI', () => initConversationHistoryUI());
    this.safeInit('ActivityUI', () => initActivityUI());
    this.safeInit('AnalyticsDashboardUI', () => initAnalyticsDashboardUI());
    this.safeInit('CognitiveInsightsUI', () => initCognitiveInsightsUI());

    // 🔥 Ritual Builder - with persistence callbacks
    this.safeInit('RitualsService', () => initRitualsService());

    // 📝 Conversation Tracker - for history persistence
    this.safeInit('ConversationTracker', () => initConversationTracker());
    this.safeInit('RitualBuilderUI', () => {
      initRitualBuilderUI();
      getRitualBuilderUI().setCallbacks({
        onSave: async (ritual) => {
          const saved = await ritualsService.createRitual(ritual);
          messageUI.show(`"${saved.name}" created! You've got this.`, 'success', 4000);
          log.info('Ritual created via builder', { id: saved.id, name: saved.name });
        },
        onClose: () => log.debug('Ritual builder closed'),
      });
    });

    // 🎯 Commands Panel - for starting predefined practices
    this.safeInit('CommandsPanelUI', () => {
      getCommandsPanelUI().initialize();
      getCommandsPanelUI().setCallbacks({
        onCommandSelected: async (command, renderedPrompt) => {
          log.info('Practice selected', { id: command.id, name: command.name });

          // Check if connected to agent
          const { connectionService } = await import('./services/connection.service.js');
          const roomState = connectionService.getRoomState();
          const room = connectionService.getRoom();

          if (!roomState.isConnected || !room?.localParticipant) {
            messageUI.show('Connect to Ferni first to start a practice', 'info', 3000);
            return;
          }

          // Send practice start request via data channel
          const message = JSON.stringify({
            type: 'practice_start_request',
            commandId: command.id,
            commandName: command.name,
            prompt: renderedPrompt,
            timestamp: Date.now(),
          });

          try {
            await room.localParticipant.publishData(new TextEncoder().encode(message), {
              reliable: true,
            });
            messageUI.show(`Starting "${command.name}"...`, 'success', 2500);
          } catch (err) {
            log.error('Failed to start practice', err);
            messageUI.show("Couldn't start practice. Try asking Ferni directly!", 'error', 4000);
          }
        },
        onClose: () => log.debug('Commands panel closed'),
      });
    });

    this.safeInit('PredictionTrackerUI', () => initPredictionTrackerUI());

    // 📦 Data Export - with actual export/delete functionality
    this.safeInit('DataExportUI', () => {
      initDataExportUI();
      getDataExportUI().setCallbacks({
        onExport: async (format, categories) => {
          try {
            messageUI.show('Preparing your data...', 'info', 2000);
            await dataExportService.exportData(format, categories);
            messageUI.show('Your data has been downloaded!', 'success', 4000);
          } catch (err) {
            log.error('Export failed', err);
            messageUI.show("Hmm, couldn't export your data. Mind trying again?", 'error', 4000);
          }
        },
        onDeleteData: async () => {
          try {
            await dataExportService.deleteAllData();
            messageUI.show('Your data has been removed. Fresh start!', 'info', 4000);
            // Optionally reload to reset state
            setTimeout(() => window.location.reload(), 2000);
          } catch (err) {
            log.error('Deletion failed', err);
            messageUI.show("Couldn't delete your data right now. Try again?", 'error', 4000);
          }
        },
        onClose: () => log.debug('Data export closed'),
      });
    });
    this.safeInit('OnboardingUI', () => initOnboardingUI());
    this.safeInit('PersonaTransitionUI', () => initPersonaTransitionUI());
    // 🎬 Cameo Roster - Team member pop-in/out in the roster
    this.safeInit('CameoRoster', () => initCameoRoster());
    this.safeInit('TeamHuddleUI', () => initTeamHuddleUI());
    // Team Intro - "Meet the Team" modal (used by mobile bottom sheet)
    this.safeInit('TeamIntro', () => initTeamIntro());
    this.safeInit('RelationshipProgressUI', () => initRelationshipProgressUI());
    // 🎙️ Group Conversations - Team Roundtables and Conference Calls with external people
    this.safeInit('GroupConversationUI', () => initGroupConversationUI());
    // 🎮 Game Board - Visual game state display for voice games
    this.safeInit('GameBoardUI', () => initGameBoard());
    // Proactive Messages - In-app messages from intelligent outreach
    this.deferredInit('ProactiveMessagesUI', 500, async () => {
      initProactiveMessages();
    });
    
    // 📋 While You Were Away - Background agent results notification
    this.deferredInit('WhileYouWereAwayUI', 600, async () => {
      const { whileYouWereAwayUI } = await import('./ui/while-you-were-away.ui.js');
      whileYouWereAwayUI.init();
    });
    
    // 🏠 Ferni Hub - Your Day with Ferni (non-voice UI for background results)
    this.deferredInit('FerniHubUI', 700, async () => {
      const { ferniHubUI } = await import('./ui/ferni-hub.ui.js');
      ferniHubUI.init();
    });
    
    // Trust Journey is now integrated into journey.ui.ts - no separate init needed

    // 🌱 Progressive Relationship Features - All quick wins in one init
    // Stage celebrations, trust signal cards, persona intros, feature hints, progress indicator
    this.safeInit('ProgressiveFeatures', () => {
      // Import dynamically to avoid circular deps
      void import('./services/progressive-features.service.js').then(({ initProgressiveFeatures }) => {
        void initProgressiveFeatures();
      });
    });

    // 💰 Subscription UI - Human-centered monetization
    // Philosophy: "Limits feel like natural breaks, not walls."
    this.safeInit('SubscriptionUI', () => initSubscriptionUI());

    // 💚 Support Ferni / Founders Fund - Community-driven support
    this.safeInit('SupportFerniUI', () => initSupportFerniUI());

    // 🌱 Roadmap Panel - "What's Growing" feature voting
    this.safeInit('RoadmapPanelUI', () => initRoadmapPanelUI());

    // 💰 Subscription Badge - Subtle status indicator in header
    this.safeInit('SubscriptionBadge', () => initSubscriptionBadge());

    // 🎨 Cosmetics Service - Personalization system (themes, skins, sounds)
    this.safeInit('CosmeticsService', () => initCosmeticsService());

    // 🌱 Seeds Economy - Earn seeds through natural engagement
    this.safeInit('SeedsEconomy', () => initSeedsEconomy());

    // 🤝 Referral Service - Network effect seeds (check URL for ?ref= param)
    this.safeInit('ReferralService', () => initReferralService());

    // 🌱 Seeds UI - Display balance and toast notifications
    this.safeInit('SeedsDisplay', () => initSeedsDisplay());
    this.safeInit('SeedsToast', () => initSeedsToast());

    // 🎯 Moments System - Unified feedback (whisper, notice, celebration, milestone)
    this.deferredInit('MomentsSystem', 500, async () => {
      await initMomentsSystem();
    });

    // 🌱 Growth Journey - Celebrate milestones as relationship deepens
    this.safeInit('GrowthJourney', () => {
      growthJourneyService.init();

      // Listen for new milestones to celebrate
      this.addTrackedListener(document, 'ferni:milestone-celebrated', ((e: CustomEvent) => {
        const { milestone } = e.detail;
        // Celebrate with warmth, not gamification
        presenceUI.bounce();
        soundUI.play('success');
        celebrationsUI.warmthGlow({ intensity: 'warm' });
        messageUI.show(milestone.title, 'success', 3000);
      }) as EventListener);
    });

    // 📍 Location Prompt - "Better than Human" location awareness
    // Listen for contextual location requests (e.g., when weather is mentioned)
    this.safeInit('LocationPrompt', () => {
      this.addTrackedListener(window, 'ferni:request-location', ((e: Event) => {
        const customEvent = e as CustomEvent;
        const { context } = customEvent.detail || {};
        log.debug({ context }, '📍 Location request received');

        (async () => {
          try {
            const { requestLocationWithWarmPrompt } = await import('./ui/location-prompt.ui.js');
            const result = await requestLocationWithWarmPrompt(context || 'personalization');
            
            if (result.success && result.location?.city) {
              log.info({ city: result.location.city }, '📍 Location obtained');
              // Optionally notify the app that location is now available
              window.dispatchEvent(new CustomEvent('ferni:location-updated', {
                detail: { location: result.location }
              }));
            }
          } catch (err) {
            log.debug('📍 Location prompt dismissed or failed:', err);
          }
        })();
      }) as EventListener);
    });

    // 🔊 Voice Enrollment UI - Learn user's voice
    this.safeInit('VoiceEnrollmentUI', () => initVoiceEnrollmentUI());

    // 🎤 Voice ID Badge - Show enrollment status on avatar
    this.safeInit('VoiceIdBadge', () => initVoiceIdBadge());

    // 👥 Speaker Change Indicator - Gentle verification when voice changes
    this.safeInit('SpeakerChangeIndicator', () => initSpeakerChangeIndicator());

    // 🏠 Household Manager - Multi-user voice household management
    this.safeInit('HouseholdManager', () => initHouseholdManager());

    // 💭 Conversation Memory - Browse past conversations and memories
    this.safeInit('ConversationMemory', () => initConversationMemory());

    // 🌈 Wellbeing Dashboard - "State of Me" visualization
    this.safeInit('WellbeingDashboard', () => initWellbeingDashboard());

    // 📊 Life Context Dashboard - Cross-domain synthesis (Phase 6)
    this.safeInit('LifeContextDashboard', () => initLifeContextDashboard());

    // 🏥 Service Health - Show degradation status to users
    this.safeInit('ServiceHealthUI', () => initServiceHealthUI());

    // 📋 Settings Menu - Central navigation hub
    this.safeInit('SettingsMenuUI', () => {
      initSettingsMenuUI({
        onHistoryClick: () => void showConversationHistory(),
        onAnalyticsClick: () => void showAnalyticsDashboard(),
        onCognitiveClick: () => void showCognitiveInsights(),
        onRitualBuilderClick: () => getRitualBuilderUI().show(),
        onCommandsClick: () => void getSanctuaryUI().open(),
        onPredictionTrackerClick: () => void showPredictionTracker(),
        onExportDataClick: () => void showDataExport(),
        onOnboardingClick: () => getOnboardingUI().start(),
        onThemeToggle: () => showThemeLanguageSettings(),
        onNotificationSettingsClick: () => showNotificationSettings(),
        onSleepSettingsClick: () => void import('./ui/sleep-settings.ui.js').then(m => m.show()),
        onSpotifyClick: () => void triggerSpotifyLinkToggle(),
        onTeamHuddleClick: () => showTeamHuddle(),
        onTeamObservationsClick: () => void import('./ui/team-observations-panel.ui.js').then(m => m.show()),
        // Trust Journey is now integrated into the unified Journey modal
        onTrustJourneyClick: () => journeyUI.open(),
        onMusicDashboardClick: () => void musicDashboard.show(),
        onPlayGamesClick: () => showGamePicker(),
        onOutreachScheduleClick: () => void openOutreachSchedule(),
        onContactSettingsClick: () => void openContactSettings(),
        onCalendarSettingsClick: () => {
          // Show calendar view (has connect button for disconnected users)
          setCalendarViewCallbacks({
            onConnectCalendar: () => {
              // Redirect to Google OAuth flow
              const userId = appState.get('deviceId') || 'anonymous';
              window.location.href = `/auth/google/calendar?userId=${userId}`;
            },
          });
          void showCalendarView();
        },
        onVoiceEnrollmentClick: () => void showVoiceEnrollmentModal(),
        onSubscriptionClick: () => void supportFerniUI.open(),
        onBillingPortalClick: () => void this.openBillingPortal(),
        onHouseholdClick: () => void showHouseholdManager(),
        onFamilyCallersClick: () => void FamilyIdentities.show(),
        onConversationMemoryClick: () => void showConversationMemory(),
        onWellbeingClick: () => void showWellbeingDashboard(),
        onLifeContextClick: () => void showLifeContextDashboard(),
        onTeamInsightsClick: () => teamInsightsUI.toggle(),
        onSupportFerniClick: () => void supportFerniUI.open(),
        onPersonalizeClick: () => personalizeUI.open(),
        onYourStoryClick: () => void showYourStoryDashboard(),
        onActivityClick: () => showActivity(),
        onYourYearClick: () => {
          // Open "Your Year with Ferni" visualization
          log.debug('YourYear callback triggered, starting import');
          import('./ui/your-year-with-ferni.ui.js')
            .then(({ openYourYearWithFerni }) => {
              log.debug('YourYear module loaded, opening');
              const userId = localStorage.getItem('ferni_user_id') || 'anonymous';
              return openYourYearWithFerni(userId);
            })
            .then(() => {
              log.debug('YourYear opened successfully');
            })
            .catch((err) => {
              log.error({ error: String(err) }, 'YourYear error');
            });
        },
        onFutureInsightsClick: () => futureInsightsUI.open(),
        onDeepInsightsClick: () => {
          // Open the Semantic Intelligence Panel (8-tab dashboard showing all superhuman insights)
          import('./ui/semantic-intelligence-panel.ui.js').then(({ showSemanticIntelligencePanel }) => {
            showSemanticIntelligencePanel();
          });
        },
        onShareFerniClick: () => referralUI.open(),
        onAccentSettingsClick: () => accentSettingsUI.open(),
        onWearableSettingsClick: () => void showWearableSettings(),
        onLinkedInClick: () => {
          initLinkedInSettings();
          showLinkedInSettings();
        },
        onVibeControllerClick: () => void showVibeController(),
        onSmartHomeClick: () => void showSmartHomeSettings(),
        onEightSleepClick: () => void showEightSleepSettings(),
        onOuraClick: () => void showOuraSettings(),
        onAppleHealthClick: () => void showAppleHealthSettings(),
        onVideoSettingsClick: () => void showVideoSettings(),
        onGroupCoachingClick: () => void showGroupCoaching(),
        onMarketplaceAdminClick: () => {
          // Admin panel requires admin session
          const adminId = localStorage.getItem('ferni_admin_id');
          if (adminId) {
            void openMarketplaceAdmin({ id: adminId, name: 'Admin' });
          }
        },
        onCreativeYouClick: () => {
          const userId = appState.get('deviceId') || 'anonymous';
          void openCreativeYouDashboard(userId);
        },
        onDiscoverAgentsClick: () => void openMarketplace(),
        onJournalClick: () => void openChronicle(),
        onHubClick: () => {
          // Open Ferni Hub - "Your Day with Ferni"
          void import('./ui/ferni-hub.ui.js').then(({ show }) => {
            void show();
          });
        },
        onWhatIDoForYouClick: () => {
          // Open "What I Do For You" - Ferni's care routines
          void import('./ui/ferni-care/index.js').then(({ showFerniCareDashboard }) => {
            showFerniCareDashboard();
          });
        },
        onConnectionsClick: () => void showIntegrationsSettings(),
        onContactsClick: () => void openYourPeople(),
        onGiftsClick: () => void openYourPeople(), // Gifts now integrated into relationship cards
        // Warm menu callbacks
        onTogetherSessionsClick: () => void showGroupCoaching(), // Combines group coaching + team huddles
        onAllConnectionsClick: () => {
          // Open the Connected Life panel (consolidates all integrations)
          void import('./ui/connected-life.ui.js').then(({ showConnectedLife }) => {
            void showConnectedLife({
              onConnectAppleHealth: () => void showAppleHealthSettings(),
              onConnectOura: () => void showOuraSettings(),
              onConnectEightSleep: () => void showEightSleepSettings(),
              onConnectWearables: () => void showWearableSettings(),
              onConnectCalendar: () => void openCalendarSettings(),
              onConnectLinkedIn: () => {
                void initLinkedInSettings();
                void showLinkedInSettings();
              },
              onConnectSpotify: () => void triggerSpotifyLinkToggle(),
              onConnectEcobee: () => void showVibeController(), // Ecobee is in Vibe Controller
              onOpenVibeController: () => void showVibeController(),
            });
          });
        },
        // New feature callbacks
        onMemoryLaneClick: () => void memoryLaneUI.open(),
        onPatternInsightsClick: () => {
          // Show pattern insights in a modal container
          const container = document.querySelector('.app-shell') as HTMLElement | null;
          if (container) {
            void patternInsightsUI.show(container);
          }
        },
        onConversationInsightsClick: async () => {
          // Show feedback insights panel (how conversations are resonating)
          const { openFeedbackInsightsPanel } = await import('./ui/feedback-insights-panel.ui.js');
          const userId = appState.get('firebaseUid');
          if (userId) {
            void openFeedbackInsightsPanel(userId);
          }
        },
        onKnowledgeQuizClick: () => void openKnowledgeQuiz(),
        onGrowthJournalClick: () => void openGrowthJournal(),
      });

      // Wire up Spotify state changes to menu
      onSpotifyLinkStateChange((linked, configured) => {
        getSettingsMenuUI().updateSpotifyState(linked, configured);
      });

      // Initialize menu with current Spotify state
      const spotifyStatus = getSpotifyLinkStatus();
      getSettingsMenuUI().updateSpotifyState(spotifyStatus.linked, spotifyStatus.configured);
    });

    // 🔔 Push Notifications
    this.safeInit('NotificationSettingsUI', () => initNotificationSettingsUI());
    this.safeInit('PushNotifications', () => void initPushNotifications());

    // 🔗 Integrations Settings - "Better than Human" connections (LinkedIn, Calendar, Health)
    this.safeInit('IntegrationsSettingsUI', () => {
      getIntegrationsSettingsUI().initialize();
      getIntegrationsSettingsUI().setCallbacks({
        onConnectLinkedIn: () => {
          void connectLinkedIn();
        },
        onDisconnectLinkedIn: () => {
          void disconnectLinkedIn();
        },
        onConnectCalendar: () => {
          const userId = appState.get('deviceId') || 'anonymous';
          window.location.href = `/auth/google/calendar?userId=${userId}`;
        },
        onConnectBiometrics: async (platform) => {
          const userId = appState.get('deviceId') || 'anonymous';
          log.info('Connect biometrics requested', { platform, userId });
          
          // Import biometrics service dynamically to avoid circular deps
          const { connectBiometrics, isPlatformAvailable, getPlatformConfig } = await import(
            './services/biometrics.service.js'
          );
          
          // Type assertion - the callback provides a string but we know it's a valid platform
          type BiometricsPlatform = Parameters<typeof connectBiometrics>[0];
          const typedPlatform = platform as BiometricsPlatform;
          
          // Check if platform is available
          if (!isPlatformAvailable(typedPlatform)) {
            const config = getPlatformConfig(typedPlatform);
            messageUI.show(
              config?.name 
                ? `${config.name} isn't available on this device` 
                : 'Platform not available',
              'warning',
              3000
            );
            return;
          }
          
          // Initiate OAuth connection
          const result = await connectBiometrics(typedPlatform, userId);
          
          if (!result.success && result.error) {
            messageUI.show(result.error, 'error', 4000);
          }
        },
        onConnectBanking: async () => {
          const userId = appState.get('deviceId') || 'anonymous';
          log.info('Connect banking requested', { userId });
          
          // Import banking service dynamically to avoid circular deps
          const { connectBanking } = await import('./services/banking.service.js');
          
          // Initiate Plaid Link flow
          const result = await connectBanking(userId);
          
          if (result.success) {
            messageUI.show('Bank connected!', 'success', 2500);
          } else if (result.error && result.error !== 'User cancelled') {
            messageUI.show(result.error, 'error', 4000);
          }
        },
      });
    });

    // 📬 Listen for push notification navigation events
    this.addTrackedListener(window, 'ferni:open-engagement', () => {
      // Open InsightsView ("What I'm Noticing") - the relationship-focused view
      void getInsightsView().show();
    });
    this.addTrackedListener(window, 'ferni:open-predictions', () => {
      void getPredictionsUI().show();
    });
    this.addTrackedListener(window, 'ferni:open-team-huddle', () => {
      void showTeamHuddle();
    });

    // 🎤 Voice-Activated Navigation - Handle panel open events from voice commands
    // These are triggered by the ui-navigation tool domain via show_view events
    this.addTrackedListener(window, 'ferni:open-your-story', () => {
      void showYourStoryDashboard();
    });
    this.addTrackedListener(window, 'ferni:open-memory-lane', () => {
      void memoryLaneUI.open();
    });
    this.addTrackedListener(window, 'ferni:open-history', () => {
      void showConversationHistory();
    });
    this.addTrackedListener(window, 'ferni:open-patterns', () => {
      const container = document.querySelector('.app-shell') as HTMLElement | null;
      if (container) {
        void patternInsightsUI.show(container);
      }
    });
    this.addTrackedListener(window, 'ferni:open-quiz', () => {
      void openKnowledgeQuiz();
    });
    this.addTrackedListener(window, 'ferni:open-music', () => {
      void musicDashboard.show();
    });
    this.addTrackedListener(window, 'ferni:open-calendar', () => {
      setCalendarViewCallbacks({
        onConnectCalendar: () => {
          const userId = appState.get('deviceId') || 'anonymous';
          window.location.href = `/auth/google/calendar?userId=${userId}`;
        },
      });
      void showCalendarView();
    });
    this.addTrackedListener(window, 'ferni:open-contacts', () => {
      void openYourPeople();
    });
    this.addTrackedListener(window, 'ferni:open-journal', () => {
      void openChronicle();
    });
    this.addTrackedListener(window, 'ferni:open-year-with-ferni', () => {
      import('./ui/your-year-with-ferni.ui.js')
        .then(({ openYourYearWithFerni }) => {
          const userId = localStorage.getItem('ferni_user_id') || 'anonymous';
          return openYourYearWithFerni(userId);
        })
        .catch((err) => {
          log.error({ error: String(err) }, 'Failed to open Your Year with Ferni');
        });
    });
    this.addTrackedListener(window, 'ferni:open-settings', () => {
      getSettingsMenuUI().show();
    });
    this.addTrackedListener(window, 'ferni:open-practices', () => {
      void getSanctuaryUI().open();
    });
    this.addTrackedListener(window, 'ferni:open-household', () => {
      void showHouseholdManager();
    });
    this.addTrackedListener(window, 'ferni:open-voice-id', () => {
      void showVoiceEnrollmentModal();
    });
    this.addTrackedListener(window, 'ferni:open-notifications', () => {
      showNotificationSettings();
    });
    this.addTrackedListener(window, 'ferni:close-panel', () => {
      // Close any open modal by dispatching escape key event
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    // 🔄 Persona Switch - connects dispatched events to actual handoff
    // Multiple UI components dispatch this event (team-unlock-celebration, command-palette, etc.)
    // but it wasn't triggering the voice agent handoff - this fixes that!
    this.addTrackedListener(window, 'ferni:switch-persona', ((e: CustomEvent) => {
      const personaId = e.detail?.personaId || e.detail?.persona;
      if (personaId) {
        log.info({ personaId }, '🔄 ferni:switch-persona event received, triggering selectPersona');
        this.selectPersona(personaId as PersonaId);
      }
    }) as EventListener);
    // 🎙️ Group Conversations - imported UI opens team roundtable or adds participant
    this.addTrackedListener(window, 'ferni:start-roundtable', ((e: CustomEvent) => {
      // Import dynamically to avoid circular deps
      void import('./ui/group-conversation.ui.js').then((m) => {
        void m.showTeamSelector(e.detail?.preselected);
      });
    }) as EventListener);
    this.addTrackedListener(window, 'ferni:add-call-participant', () => {
      void import('./ui/group-conversation.ui.js').then((m) => {
        void m.showAddParticipant({
          onAdd: (phoneNumber, name, relationship) => {
            log.info({ phoneNumber, name, relationship }, 'Adding participant to call');
            // TODO: Implement actual participant addition via connection service
          },
          onCancel: () => {
            log.debug('Add participant cancelled');
          },
        });
      });
    });

    // 🌱 Handle garden payment result routes (Stripe redirects here)
    const gardenPathname = window.location.pathname;
    if (gardenPathname === '/garden/success') {
      // Show thank you message for successful payment
      // Wait a moment for UI to initialize
      setTimeout(() => {
        ferniFundUI.showThankYou({
          conversationsSponsored: 1,
          message: 'Thank you for planting a seed!',
        });
        // Clean up the URL without reload
        window.history.replaceState({}, '', '/');
      }, 500);
    } else if (gardenPathname === '/garden/cancel') {
      // Payment was cancelled - just redirect to home
      window.history.replaceState({}, '', '/');
    }

    // 🌱 Handle ?garden=true query param from landing page CTA
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('garden') === 'true') {
      // Wait for UI to initialize, then open Ferni Fund modal
      setTimeout(() => {
        const userId = appState.get('deviceId');
        if (userId) {
          void ferniFundUI.open(userId);
        }
        // Clean up the URL without reload
        window.history.replaceState({}, '', window.location.pathname);
      }, 800);
    }

    // 📅 Handle Calendar OAuth callback
    const calendarStatus = urlParams.get('calendar');
    const calendarResult = urlParams.get('status');
    const calendarError = urlParams.get('calendar_error');
    if (calendarStatus && calendarResult === 'connected') {
      setTimeout(() => {
        const providerName = calendarStatus === 'google' ? 'Google Calendar' : 
                             calendarStatus === 'apple' ? 'Apple Calendar' : 
                             calendarStatus === 'outlook' ? 'Outlook Calendar' : 'Calendar';
        toast.success(`${providerName} connected!`);
        // Clean up the URL without reload
        window.history.replaceState({}, '', window.location.pathname);
      }, 500);
    } else if (calendarError) {
      setTimeout(() => {
        toast.error("Couldn't connect calendar. Try again?");
        // Clean up the URL without reload
        window.history.replaceState({}, '', window.location.pathname);
      }, 500);
    }

    // 💼 Handle LinkedIn OAuth callback
    handleLinkedInCallback();

    // 📊 Dev Panel modal event listeners
    this.addTrackedListener(window, 'ferni:open-analytics', () => {
      void showAnalyticsDashboard();
    });
    this.addTrackedListener(window, 'ferni:open-history', () => {
      void showConversationHistory();
    });
    this.addTrackedListener(window, 'ferni:open-insights', () => {
      void showCognitiveInsights();
    });
    this.addTrackedListener(window, 'ferni:start-tour', () => {
      getOnboardingUI().start();
    });
    this.addTrackedListener(window, 'ferni:open-daily-practice', () => {
      // Daily check-in - open the relationship-focused InsightsView
      void getInsightsView().show();
    });
    this.addTrackedListener(window, 'ferni:open-sanctuary', () => {
      // The Sanctuary - immersive guided practices experience
      void getSanctuaryUI().open();
    });
    this.addTrackedListener(window, 'ferni:start-practice', async (e: Event) => {
      // Practice started from Sanctuary
      const customEvent = e as CustomEvent<{
        practiceId: string;
        prompt: string;
        practice: { id: string; name: string };
      }>;
      const { practice, prompt } = customEvent.detail;
      log.info('Practice started from Sanctuary', { id: practice.id, name: practice.name });

      // Check if connected to agent
      const { connectionService } = await import('./services/connection.service.js');
      const roomState = connectionService.getRoomState();
      const room = connectionService.getRoom();

      if (!roomState.isConnected || !room?.localParticipant) {
        messageUI.show('Connect to Ferni first to start a practice', 'info', 3000);
        return;
      }

      // Send practice start request via data channel
      const message = JSON.stringify({
        type: 'practice_start_request',
        commandId: practice.id,
        commandName: practice.name,
        prompt,
        timestamp: Date.now(),
      });

      try {
        await room.localParticipant.publishData(new TextEncoder().encode(message), {
          reliable: true,
        });
        messageUI.show(`Starting "${practice.name}"...`, 'success', 2500);
      } catch (err) {
        log.error('Failed to start practice from Sanctuary', err);
        messageUI.show("Couldn't start practice. Try asking Ferni directly!", 'error', 4000);
      }
    });
    this.addTrackedListener(window, 'ferni:open-marketplace', () => {
      void marketplaceUI.open();
    });

    // 📱 Mobile Bottom Sheet - Quick action event handlers
    this.addTrackedListener(window, 'ferni:open-settings', () => {
      void getSettingsMenuUI().show();
    });
    this.addTrackedListener(window, 'ferni:open-team', () => {
      void showTeamIntro();
    });
    this.addTrackedListener(window, 'ferni:open-music', () => {
      void musicDashboard.show();
    });
    this.addTrackedListener(window, 'ferni:open-calendar', () => {
      void showCalendarView();
    });
    this.addTrackedListener(window, 'ferni:open-people', () => {
      openYourPeople();
    });

    // 🌱 Garden Widget - Plant seed flow integration
    this.addTrackedListener(window, 'ferni:open-plant-seed', ((e: CustomEvent) => {
      const detail = e.detail as { type: 'one-time' | 'monthly' } | undefined;
      const userId = appState.get('deviceId');
      if (userId) {
        // Open Ferni Fund modal - user can choose contribution type
        log.debug('Plant seed requested', { type: detail?.type });
        void ferniFundUI.open(userId);
      }
    }) as EventListener);

    // 💬 Dev Panel transcript injection
    this.addTrackedListener(window, 'ferni:transcript', ((e: CustomEvent) => {
      const { type, text, isFinal } = e.detail;
      // transcriptUI.show() handles both user and agent messages
      // User messages are typically interim, agent messages are final
      if (type === 'user') {
        transcriptUI.updateInterim(text);
      } else if (type === 'agent') {
        transcriptUI.show(text, isFinal ?? true);
      }
    }) as EventListener);

    // 📶 Dev Panel connection quality simulation
    this.addTrackedListener(window, 'ferni:connection-quality', ((e: CustomEvent) => {
      const { quality } = e.detail;
      // Map dev panel values to ConnectionQuality type
      const qualityMap: Record<string, 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected'> = {
        excellent: 'excellent',
        good: 'good',
        poor: 'poor',
        offline: 'disconnected', // Map 'offline' to 'disconnected'
      };
      const mappedQuality = qualityMap[quality] ?? 'good';
      connectionQualityUI.setQuality(mappedQuality);
      connectionQualityUI.show();
    }) as EventListener);

    // 🎊 Dev Panel streak milestone simulation
    this.addTrackedListener(window, 'ferni:streak-milestone', ((e: CustomEvent) => {
      const { days, intensity } = e.detail;
      // Show streak notification UI
      showStreakMilestone('Daily Check-in', days, 'ferni');
      // Also trigger celebration animation if high enough
      if (intensity === 'large' || intensity === 'epic') {
        celebrateStreak(days, 'ferni');
      }
    }) as EventListener);

    // Set up team huddle callback for data message handlers
    setShowTeamHuddleCallback(() => showTeamHuddle());

    // 📊 Load engagement data (API first, demo fallback in dev)
    void this.loadEngagementData();

    // 🔊 Check for voice profile re-enrollment needs
    void this.checkVoiceReEnrollment();
    // Agent particles disabled for cleaner professional UI
    // this.safeInit('AgentParticlesUI', () => void initAgentParticles());

    // 💚 Connection Heart - Listen for connect requests
    this.addTrackedListener(window, 'ferni:request-connect', () => {
      if (appState.get('connection') === 'disconnected') {
        void this.connect();
      }
    });

    // ⌨️ Keyboard Shortcuts - Global hotkeys for power users
    this.addTrackedListener(window, 'ferni:toggle-mute', () => {
      if (appState.get('connection') === 'connected') {
        this.toggleMute();
      }
    });

    this.addTrackedListener(window, 'ferni:toggle-call', () => {
      const connectionState = appState.get('connection');
      if (connectionState === 'connected') {
        void this.disconnect();
      } else if (connectionState === 'disconnected') {
        void this.connect();
      }
    });

    this.addTrackedListener(window, 'ferni:escape', () => {
      // First check if any modal is open (they have their own escape handlers)
      const openModal = document.querySelector('[role="dialog"][aria-modal="true"]');
      if (openModal) {
        // Let the modal handle escape itself
        return;
      }
      // If connected and no modal, end the call
      if (appState.get('connection') === 'connected') {
        void this.disconnect();
      }
    });

    // 🌅 Conversation End - Auto-disconnect after agent says goodbye
    this.addTrackedListener(window, 'ferni:conversation-end-disconnect', (e) => {
      if (appState.get('connection') === 'connected') {
        const detail = (e as CustomEvent<{ agentInitiated?: boolean; exitType?: string }>).detail;

        // 📞 Agent-initiated disconnect - show tactile button press
        if (detail?.agentInitiated) {
          log.info('🛑 Agent-initiated disconnect', { exitType: detail.exitType });
          controlsUI.showAgentHangupState();
        }

        void this.disconnect();
      }
    });

    // Show personalized greeting and track visit
    this.showWelcome();

    // Keyboard shortcuts with app callbacks (disabled for now)
    // initKeyboardUI({
    //   onConnect: () => { void this.connect(); },
    //   onDisconnect: () => { void this.disconnect(); },
    //   onSelectPersona: (personaId: PersonaId) => { this.selectPersona(personaId); },
    // });

    // Gesture support for mobile with swipe navigation
    initGesturesUI({
      onSwipeLeft: () => {
        const next = gesturesUI.getNextPersona();
        this.selectPersona(next);
        soundUI.play('switch');
      },
      onSwipeRight: () => {
        const prev = gesturesUI.getPreviousPersona();
        this.selectPersona(prev);
        soundUI.play('switch');
      },
      onLongPress: (_element) => {
        // Could show context menu in the future
      },
      onPullDown: () => {
        // Pull-to-refresh: Show feedback and reload data from backend
        log.debug('Pull-to-refresh triggered');
        // Show subtle feedback
        messageUI.show('Refreshing...', 'info');
        // Try to sync with backend
        void relationshipStageService
          .loadFromBackend()
          .then((synced) => {
            if (synced) {
              messageUI.show('Synced with cloud', 'success');
            } else {
              messageUI.show("You're up to date", 'success');
            }
          })
          .catch(() => {
            messageUI.show("Couldn't sync", 'info');
          });
      },
      onMenuClose: () => {
        // Swipe-to-close settings menu
        const settingsMenu = getSettingsMenuUI();
        if (settingsMenu) {
          settingsMenu.hide();
        }
      },
    });

    // Marketplace button - opens agent marketplace modal
    const marketplaceBtn = document.getElementById('marketplaceBtn');
    if (marketplaceBtn) {
      this.addTrackedListener(marketplaceBtn, 'click', ((e: MouseEvent) => {
        e.stopPropagation(); // Prevent team roster from handling this
        void marketplaceUI.open();
      }) as EventListener);
    }
  }

  /**
   * Select a persona (for keyboard shortcuts and gestures).
   * Now with character-quality transition animations!
   */
  selectPersona(personaId: PersonaId): void {
    const currentPersona = appState.get('selectedPersona');
    const persona = getPersona(personaId);

    // 🎬 Animate the transition with animation principles
    void animatePersonaTransition(currentPersona.id, personaId);

    // Update state
    setSelectedPersona(personaId);

    // Update theme persona colors
    this.updatePersonaTheme(personaId);

    // Update UI
    coachUI.updatePersona(persona);
    waveformUI.setPersona(personaId);
    teamUI.setActive(personaId);
    gesturesUI.setCurrentPersona(personaId);
    statsUI.setPersona(persona.name);
    thinkingUI.setPersona(personaId); // Persona-specific thinking messages
    avatarFeedback.setPersona(personaId); // Persona-specific idle behaviors
    setCommandsPersonaId(personaId); // Update guided practices for new persona
    getSanctuaryUI().setPersonaId(personaId); // Update sanctuary for new persona

    // Play sound
    soundUI.play('switch');

    // If connected, request handoff
    if (appState.get('connection') === 'connected') {
      this.requestHandoff(personaId);
    }
  }

  /**
   * Show personalized welcome message and track engagement.
   * FIRST CONVERSATION IS ONBOARDING - keep it simple for new users.
   */
  private showWelcome(): void {
    // Record visit
    greetingUI.recordVisit();

    // Get personalized greeting - but only show for returning users
    // First-time users get a clean, simple experience
    if (modalCoordinator.hasMinimumConversations(1)) {
      const greeting = greetingUI.getGreeting();
      messageUI.setHelper(greeting);

      // 🌟 Transcendent: Recognition moment for returning users
      // This creates the powerful "I see you, I remember you" moment
      handleMomentTrigger('recognition');

      // Check for streak milestone - only for returning users
      const streakMilestone = greetingUI.checkStreakMilestone();
      if (streakMilestone) {
        // Celebrate streak milestone - warm acknowledgement
        setTimeout(() => {
          const message = greetingUI.getMilestoneMessage('streak', streakMilestone);
          messageUI.show(message, 'success', 4000);
          celebrationsUI.warmthGlow({ intensity: 'warm' });
          soundUI.play('success');
        }, 2000);
      }

      // Show streak badge if streak >= 3 - DISABLED: Now shown in Connection Heart
      // Streak is visible on the heart indicator (fire badge) and in Journey modal
      // const streak = greetingUI.getStreak();
      // if (streak >= 3) {
      //   this.showStreakBadge(streak);
      // }
    }

    // Ambient particles removed - keeping UI clean and human
    // Weather effects available via dev panel when contextually appropriate

    // 🆕 Auto-start onboarding for returning users only (gated in onboarding.ui.ts)
    setTimeout(() => {
      startOnboardingIfNeeded();
    }, 1500);
  }

  /**
   * Load engagement data - tries API first, falls back to demo in development.
   *
   * BEHAVIOR:
   * - Always tries API first (using X-User-Id header for auth)
   * - In development: Falls back to demo data if API fails/returns empty
   * - In production: Shows empty state if API fails (no demo data)
   */
  private async loadEngagementData(): Promise<void> {
    const userId = localStorage.getItem('ferni_user_id');

    // Try API first
    if (userId) {
      try {
        const data = await engagementService.fetchEngagementData(userId);
        if (data && (data.ritualStreaks.length > 0 || data.weatherHistory.length > 0)) {
          log.info('Loaded engagement data from API', {
            streaks: data.ritualStreaks.length,
            weather: data.weatherHistory.length,
          });
          getEngagementUI().update(data);

          // Update badges from real data
          const dueCount = data.ritualStreaks.filter((s) => s.dueToday).length;
          engagementTriggerUI.updateBadges({ ritualsdue: dueCount });

          disableDemoData();
          return;
        }
      } catch (err) {
        log.warn('Failed to load engagement data from API', err);
      }
    }

    // Fall back to demo data in development only
    if (shouldUseDemoData()) {
      log.debug('No API data available - loading demo data (development mode)');
      enableDemoData();

      const demoData = getDemoEngagementData();
      getEngagementUI().update(demoData);

      const dueCount = demoData.ritualStreaks.filter((s) => s.dueToday).length;
      engagementTriggerUI.updateBadges({ ritualsdue: dueCount });

      const demoPredictions = getDemoPredictions();
      const pendingCount = demoPredictions.filter((p) => p.status === 'pending').length;
      engagementTriggerUI.updateBadges({ predictionsReady: pendingCount });

      getPredictionsUI().update({
        predictions: demoPredictions,
        accuracy: 78,
        totalResolved: demoPredictions.filter((p) => p.status === 'resolved').length,
        currentStreak: 4,
      });
    } else {
      log.info('No engagement data available - showing empty state');
      disableDemoData();
    }
  }

  /**
   * Check if user needs to re-enroll their voice profile.
   * Shows a toast if quality is low, pointing to Settings > Voice ID.
   */
  private async checkVoiceReEnrollment(): Promise<void> {
    try {
      const voiceAuth = getVoiceAuthService();
      const result = await voiceAuth.checkReEnrollmentNeeded();

      if (result.needed && result.message) {
        // Delay the toast to not overwhelm on startup
        setTimeout(() => {
          if (result.severity === 'high') {
            // High severity - show warning
            toast.warning("Your voice profile needs a refresh. Head to Settings → Voice ID.");
          } else {
            // Low severity - just informational
            toast.info("Voice profile could be sharper. Try Settings → Voice ID.");
          }
        }, 5000); // Wait 5 seconds after app loads
      }
    } catch (error) {
      // Silently fail - not critical
      log.debug('Voice re-enrollment check skipped:', error);
    }
  }

  /**
   * Show streak badge.
   * @deprecated DISABLED: Streak now consolidated into Connection Heart indicator.
   * The heart shows a fire badge (top-left) with streak count.
   * Journey modal shows full stats when user taps the heart.
   */
  private showStreakBadge(_streak: number): void {
    // DISABLED - streak now shown in Connection Heart
    // The connection heart shows both streak and milestones
    // return;

    // Legacy code kept for reference:
    // Check if badge already exists
    // if (document.getElementById('streakBadge')) return;
    // const badge = document.createElement('div');
    // badge.id = 'streakBadge';
    // badge.className = 'streak-badge';
    // badge.innerHTML = `
    //   <span class="streak-count">${streak}</span>
    //   <span class="streak-label">day streak</span>
    // `;
    // document.body.appendChild(badge);
    // setTimeout(() => badge.classList.add('visible'), 1000);
  }

  /**
   * Open the subscription management modal.
   * Handles both Stripe and Apple subscriptions with appropriate actions:
   * - Stripe: Opens billing portal for payment/cancellation
   * - Apple: Shows instructions (must cancel through iOS Settings)
   */
  private async openBillingPortal(): Promise<void> {
    const deviceId = appState.get('deviceId');
    if (!deviceId) {
      toast.error("Connect first, then we can manage that.");
      return;
    }

    // Open the unified subscription management modal
    await manageSubscriptionUI.open(deviceId, {
      onUpgrade: () => showUpgradeModal(),
      onClose: () => log.debug('Subscription management closed'),
    });
  }

  /**
   * Record conversation usage for subscription tracking.
   * Called after each conversation ends.
   */
  private async recordConversationUsage(): Promise<void> {
    const deviceId = appState.get('deviceId');
    if (!deviceId) return;

    // Calculate session duration from stats
    const stats = statsUI.getStats();
    const startTime = stats?.startTime;
    const durationMs = startTime ? Date.now() - startTime : 0;
    const minutesTalked = Math.max(1, Math.round(durationMs / 60000));

    // 🤝 Process any pending referral on first/early conversation
    // This ensures referrer gets credit after new user completes a meaningful conversation
    const convCount = modalCoordinator.getConversationCount();
    if (convCount <= 2) {
      const referralResult = processPendingReferral();
      if (referralResult.processed) {
        log.info({ bonus: referralResult.bonusAwarded }, 'Referral bonus applied');
        // Show toast after a short delay so it doesn't conflict with conversation end UI
        setTimeout(() => {
          toast.success(`+${referralResult.bonusAwarded} seeds from your friend!`);
        }, 1500);
      }
    }

    try {
      const response = await fetch('/usage/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: deviceId,
          minutesTalked,
        }),
      });

      if (response.ok) {
        log.debug('Conversation usage recorded');
        // Refresh subscription badge to show updated count
        void subscriptionBadgeUI.refresh();
      }
    } catch (error) {
      // Silent fail - don't interrupt user experience for tracking
      log.warn('Failed to record conversation usage:', error);
    }
  }

  /**
   * Check subscription status before connecting.
   *
   * Philosophy: "Limits feel like natural breaks, not walls."
   * - At limit → Show warm modal, block connection
   * - Approaching limit → Allow, but track for subtle reminder
   * - OK → Proceed normally
   */
  private async checkSubscriptionBeforeConnect(): Promise<{
    allowed: boolean;
    approaching: boolean;
    remaining: number | null;
  }> {
    try {
      // Load fresh status
      const status = await loadSubscriptionStatus();

      if (!status) {
        // No status = assume OK (new user or Stripe not configured)
        return { allowed: true, approaching: false, remaining: null };
      }

      // Check if at limit - canStartConversation is nested in usage
      const canStart = status.usage?.canStartConversation ?? status.canStartConversation ?? true;
      if (!canStart) {
        // Show the warm limit modal
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        nextMonth.setDate(1);

        showLimitReachedModal(
          status.usage?.statusMessage ||
            status.upgradePrompt ||
            "We've reached our monthly limit. I'd love to keep talking...",
          nextMonth.toISOString()
        );

        return { allowed: false, approaching: false, remaining: 0 };
      }

      // Check if approaching limit (80%+ used) - check nested structure
      const approaching = status.usage?.approachingLimit ?? status.approaching ?? false;
      const remaining =
        status.usage?.conversationsRemaining ?? status.conversationsRemaining ?? null;

      return { allowed: true, approaching, remaining };
    } catch (error) {
      log.warn('Could not check subscription status:', error);
      // On error, allow connection (fail open for better UX)
      return { allowed: true, approaching: false, remaining: null };
    }
  }

  /**
   * Check microphone permission and show helpful message if denied.
   */
  private checkMicrophoneStatus(): void {
    try {
      // Check if we have an audio track enabled
      const room = connectionService.getRoom();
      const localParticipant = room?.localParticipant;

      if (localParticipant) {
        const audioTracks = localParticipant.getTrackPublications() as Array<{
          kind?: string;
          track?: unknown;
        }>;
        const hasAudio = audioTracks.some((pub) => pub.kind === 'audio' && pub.track);

        if (!hasAudio) {
          // Mic permission was likely denied - show subtle prompt
          setTimeout(() => {
            messageUI.show("I'd love to hear your voice - enable mic access?", 'info', 4000);
          }, 3000);
        }
      }
    } catch {
      // Ignore errors in permission check
    }
  }

  /**
   * Request handoff to a different persona while connected.
   * FIX BUG: Now routes through handoffService for proper rate limiting,
   * validation, retry logic, and state management.
   */
  private requestHandoff(targetPersonaId: PersonaId): void {
    // Use handoffService for proper rate limiting, validation, and retry logic
    void handoffService.sendHandoffRequest(targetPersonaId, {
      onFailure: (error) => {
        log.error('Handoff request failed:', error);
        // Don't show toast here - handoffService already handles feedback
      },
    });
  }

  /**
   * Set up callbacks for service events.
   */
  private setupServiceCallbacks(): void {
    // Connection service callbacks
    connectionService.setCallbacks({
      onStateChange: (state) => {
        // Update presence and waveform based on connection state
        if (state === 'connecting') {
          thinkingUI.show('Connecting');
          waveformUI.setThinking(true);
          // 🚀 Ferni EQ: Dispatch thinking state
          dispatchThinking(true);
        } else if (state === 'connected') {
          thinkingUI.hide();
          waveformUI.setThinking(false);
          // 🚀 Ferni EQ: Dispatch thinking state
          dispatchThinking(false);
        } else if (state === 'disconnected') {
          presenceUI.setConnected(false);
          connectionQualityUI.hide();
          waveformUI.stop();
          // agentParticlesUI.stop();
        }
      },

      onAgentConnected: () => {
        const persona = appState.get('activePersona');
        messageUI.show(`${persona.name} joined`, 'success', 2000);

        // Avatar reaction
        presenceUI.bounce();

        // 🎵 Play dramatic entrance sound when Ferni joins
        soundUI.play('enter');

        // 🎬 Expression: Excited greeting expression
        ferniExpressions.heldPose('happy', 400);

        // 🎭 NARRATIVE MAGIC: Trigger the full connection sequence!
        // This orchestrates: glow pulse, haptics, celebration visual, ritual audio
        const isFirstConnection = !localStorage.getItem('voiceai_has_connected');
        if (isFirstConnection) {
          localStorage.setItem('voiceai_has_connected', 'true');
        }

        // Update narrative context with current persona
        updateNarrativeContext({
          personaId: persona.id as
            | 'ferni'
            | 'jack'
            | 'peter'
            | 'alex'
            | 'maya'
            | 'jordan'
            | 'nayan',
          totalConversations: isFirstConnection ? 0 : 1,
        });

        // Play the appropriate story beat
        // first_launch: Full welcome with ritual, haptics, glow
        // connected: Standard connection celebration
        void playBeat(isFirstConnection ? 'first_launch' : 'connected');

        // 🎭 Dispatch ferni:connected for Ritual Engine and other listeners
        document.dispatchEvent(new CustomEvent('ferni:connected'));
      },

      onAgentDisconnected: () => {
        messageUI.show('See you next time!', 'info', 2000);
        presenceUI.setSpeaking(false);

        // 🎬 Expression: Warm farewell expression (soft, lingering)
        ferniExpressions.setExpression('empathetic', 400, 2000);

        // 🎭 Dispatch ferni:disconnected for Ritual Engine
        document.dispatchEvent(new CustomEvent('ferni:disconnected'));
      },

      onDataMessage: (message) => {
        handleDataMessage(message);
        statsUI.incrementMessages();
      },

      onAudioTrack: (audioElement, _participantId, mediaStreamTrack) => {
        // Enable audio visualization using the MediaStreamTrack (works better for WebRTC)
        // Falls back to audio element if track not available
        log.info('🎙️ onAudioTrack called - attaching visualization', {
          hasMediaStreamTrack: !!mediaStreamTrack,
          trackId: mediaStreamTrack?.id,
          trackReadyState: mediaStreamTrack?.readyState,
        });
        void this.attachAudioVisualization(audioElement, mediaStreamTrack);
        setAudioState('speaking');
        // Set speaking state directly - don't rely only on volume detection
        waveformUI.setSpeaking(true);
        presenceUI.setSpeaking(true);
        expressiveEyes.setVoiceState('speaking'); // 👀 Pixar eyes react to speaking
        // Agent is speaking, so we're not in listening mode
        waveformUI.setListening(false);

        // 🎚️ Duck music when agent is speaking
        getMusicAudioController().duckForAgent();

        // 🚀 Ferni EQ: Dispatch agent speech start
        dispatchAgentSpeechStart();
      },

      onAudioTrackEnd: (_participantId) => {
        // Agent stopped speaking
        waveformUI.setSpeaking(false);
        presenceUI.setSpeaking(false);
        expressiveEyes.setVoiceState('listening'); // 👀 Eyes widen attentively
        setAudioState('listening');
        // Now we're listening for user input
        waveformUI.setListening(true);

        // 🎚️ Unduck music when agent stops speaking
        getMusicAudioController().unduckForAgent();

        // 🚀 Ferni EQ: Dispatch agent speech end
        dispatchAgentSpeechEnd();
      },

      // 🎚️ Music track detected - attach for ducking control
      // NOTE: Now Playing UI is shown by handleMusic() when music_state message arrives,
      // NOT here. This callback ONLY handles Web Audio attachment for ducking.
      onMusicTrack: (audioElement, trackId) => {
        log.info('🎚️ Music track detected - attaching Web Audio for ducking', { trackId });

        const isExpectingMusic = connectionService.isExpectingMusic();

        // 🎚️ Attach ducking control AND start visualization
        void (async () => {
          try {
            const controller = getMusicAudioController();
            await controller.initialize();
            await controller.attachMusicTrack(audioElement, trackId);
            
            // 🎚️ DIAGNOSTIC: Log ducking readiness after attachment
            const diagnostics = controller.getDuckingDiagnostics();
            if (diagnostics.hasTrack && diagnostics.hasGainNode) {
              log.info('🎚️ ✅ Music ducking READY', { trackId, ...diagnostics });
            } else {
              log.error('🎚️ ❌ Music ducking FAILED - track attachment did not succeed', { 
                trackId, 
                ...diagnostics,
                hint: 'Ducking will NOT work! Check for Web Audio API errors.',
              });
            }

            // 🎵 Start visualization loop to drive waveform with actual music audio
            // This makes the waveform respond to real music levels instead of canned animation
            if (isExpectingMusic) {
              controller.startVisualization((volume) => {
                // Route music volume to waveform for reactive visualization
                waveformUI.setVolume(volume);
              });
              log.info('🎵 Music visualization started', { trackId });
            }
          } catch (err) {
            log.error('🎚️ ❌ Failed to attach music track for ducking - DUCKING WILL NOT WORK', err);
          }
        })();
      },

      // 🎚️ Music track ended - hide Now Playing UI
      onMusicTrackEnd: (trackId) => {
        log.info('🎚️ Music track ended', { trackId });

        // 🎵 Stop music visualization loop
        getMusicAudioController().stopVisualization();

        // Controller handles cleanup automatically via the returned cleanup function

        // 🎵 Hide Now Playing UI when music track ends
        void (async () => {
          try {
            const { nowPlayingUI } = await import('./ui/now-playing.ui.js');
            const { waveformUI } = await import('./ui/waveform.ui.js');

            log.info('🎵 Hiding Now Playing UI - music track ended');
            nowPlayingUI.updateState('stopped');
            nowPlayingUI.hide();
            waveformUI.setMusicPlaying(false);

            // Stop avatar dancing
            avatarFeedback.stopDancing();
            expressiveEyes.stopDancing(); // 👀 Eyes stop grooving
          } catch (err) {
            log.warn('Failed to hide Now Playing UI on track end', err);
          }
        })();
      },

      onLocalMicActive: (isActive) => {
        // When user's mic is active, show listening state
        waveformUI.setListening(isActive);
        presenceUI.setListening(isActive);

        // 🎚️ Duck/unduck music when user is speaking
        const controller = getMusicAudioController();
        if (isActive) {
          controller.duckForUser();
          // 🚀 Ferni EQ: Dispatch user speech start
          dispatchUserSpeechStart();
        } else {
          controller.unduckForUser();
          // 🚀 Ferni EQ: Dispatch user speech end
          dispatchUserSpeechEnd();
        }
      },

      // Connection quality monitoring disabled for clean UI
      // onConnectionQuality: (latencyMs) => {
      //   connectionQualityUI.updateFromLatency(latencyMs);
      // },

      onError: (error) => {
        log.error('Connection error:', error);
        messageUI.show('Something went wrong. Let me reconnect...', 'error');
        thinkingUI.hide();
        waveformUI.setThinking(false);
      },
    });

    // Handoff service callbacks

    // When handoff starts - show transitioning state
    // FIX BUG: Store timeout ID for cleanup
    let handoffUITimeout: ReturnType<typeof setTimeout> | null = null;

    handoffService.onHandoffStart((toPersona, _fromPersona) => {
      log.debug('onHandoffStart:', { toPersona });

      // Show shimmer effect on waveform
      waveformUI.setTransitioning(true);

      // 🎬 Expression: Curious "thinking" expression during handoff
      ferniExpressions.contemplation(1500);

      // Show handoff progress indicator
      const handoffProgress = document.getElementById('handoffProgress');
      const handoffTargetName = document.getElementById('handoffTargetName');
      if (handoffProgress && handoffTargetName) {
        const persona = getPersona(toPersona);
        handoffTargetName.textContent = persona.name;
        handoffProgress.classList.remove('hidden');
        log.debug('Showing handoff progress for', persona.name);
      } else {
        log.warn('handoffProgress element not found!');
      }

      // FIX BUG: Safety timeout - force hide UI after 20 seconds max
      if (handoffUITimeout) clearTimeout(handoffUITimeout);
      handoffUITimeout = setTimeout(() => {
        log.warn('Safety timeout - forcing handoff UI cleanup');
        waveformUI.setTransitioning(false);
        const progress = document.getElementById('handoffProgress');
        if (progress) progress.classList.add('hidden');
        thinkingUI.hide();
      }, 20000);
    });

    // When handoff completes - agent is ready to speak
    handoffService.onHandoffComplete((toPersona) => {
      log.debug('onHandoffComplete:', { toPersona });

      // FIX BUG: Clear safety timeout
      if (handoffUITimeout) {
        clearTimeout(handoffUITimeout);
        handoffUITimeout = null;
      }

      // End shimmer, return to normal
      waveformUI.setTransitioning(false);

      // 🎬 Expression: New persona arrives with excited greeting
      ferniExpressions.heldPose('happy', 500);

      // Hide handoff progress indicator
      const handoffProgress = document.getElementById('handoffProgress');
      if (handoffProgress) {
        handoffProgress.classList.add('hidden');
        log.debug('Hiding handoff progress');
      }
      // Also make sure thinking is hidden
      thinkingUI.hide();
    });

    // When handoff fails - hide indicator and show error
    // FIX AUDIT GAP #1: Now receives rollbackTo to restore waveform/avatar persona
    handoffService.onHandoffFailed((error, targetPersona, rollbackTo) => {
      log.error('onHandoffFailed:', { error, targetPersona, rollbackTo });
      // FIX BUG: Clear safety timeout
      if (handoffUITimeout) {
        clearTimeout(handoffUITimeout);
        handoffUITimeout = null;
      }

      waveformUI.setTransitioning(false);

      // FIX AUDIT GAP #1: Restore waveform and other UI to rollback persona
      if (rollbackTo) {
        log.info('Restoring UI systems to rollback persona:', rollbackTo);
        waveformUI.setPersona(rollbackTo);
        gesturesUI.setCurrentPersona(rollbackTo);
        this.updatePersonaTheme(rollbackTo);
      }

      const handoffProgress = document.getElementById('handoffProgress');
      if (handoffProgress) {
        handoffProgress.classList.add('hidden');
      }
      thinkingUI.hide();
      messageUI.show("Couldn't reach them right now. I'm still here though!", 'error', 3000);
    });

    // When handoff is cancelled - hide indicator
    handoffService.onHandoffCancelled((targetPersona, reason) => {
      log.info('onHandoffCancelled:', { targetPersona, reason });
      // FIX BUG: Clear safety timeout
      if (handoffUITimeout) {
        clearTimeout(handoffUITimeout);
        handoffUITimeout = null;
      }

      waveformUI.setTransitioning(false);

      const handoffProgress = document.getElementById('handoffProgress');
      if (handoffProgress) {
        handoffProgress.classList.add('hidden');
      }
      thinkingUI.hide();
    });

    // FIX AUDIT GAP #3: Subscribe to handoff progress for waveform visual feedback
    // This provides visual progress indication on the waveform/avatar even when team roster is hidden
    handoffService.onHandoffProgress((targetPersona, elapsedMs, timeoutMs) => {
      log.debug('onHandoffProgress:', { targetPersona, elapsedMs, timeoutMs });

      // Calculate progress percentage (0-100)
      const progress = Math.min(100, Math.round((elapsedMs / timeoutMs) * 100));

      // Update waveform with progress indication
      // The waveform shimmer intensity can vary based on progress
      if (progress > 50) {
        // After halfway, intensify the shimmer to show progress
        // (waveformUI already handles transitioning state, but this adds visual variety)
        log.debug('Handoff progress:', `${progress}%`);
      }

      // Update the handoff progress element if present
      const handoffProgress = document.getElementById('handoffProgress');
      if (handoffProgress) {
        // Add a data attribute for CSS-based progress visualization
        handoffProgress.setAttribute('data-progress', String(progress));
      }
    });

    // Main handoff callback (plays sounds, updates UI)
    handoffService.onHandoff((handoff) => {
      log.debug('onHandoff:', { toPersona: handoff.toPersona, fromPersona: handoff.fromPersona });

      // Get the NEW persona directly from the handoff, not from state
      const newPersona = getPersona(handoff.toPersona);
      const enhanced = handoff as { entrancePhrase?: string; isFirstMeeting?: boolean };

      // FIX BUG: Clean up any stuck transition UI state
      // This handles legacy single-message handoffs that don't have separate start/complete
      waveformUI.setTransitioning(false);
      const handoffProgress = document.getElementById('handoffProgress');
      if (handoffProgress) {
        handoffProgress.classList.add('hidden');
      }
      // Also hide thinking indicator in case it's stuck
      thinkingUI.hide();

      // 🎬 Character-style celebration on handoff
      const avatarContainer = document.querySelector('.avatar-container');
      if (avatarContainer instanceof HTMLElement) {
        void playCharacterReaction(avatarContainer, 'joy', newPersona.id);
      }
      coachUI.flash();

      // Update theme persona colors
      this.updatePersonaTheme(newPersona.id);

      // Update all UI systems
      waveformUI.setPersona(newPersona.id);
      gesturesUI.setCurrentPersona(newPersona.id);
      statsUI.setPersona(newPersona.name);
      setCommandsPersonaId(newPersona.id); // Update guided practices for new persona
      getSanctuaryUI().setPersonaId(newPersona.id); // Update sanctuary for new persona
      // Particles disabled for cleaner look
      // void agentParticlesUI.setPersona(newPersona.id);

      // Play switch sound
      soundUI.play('switch');

      // Show entrance phrase or welcome message
      if (enhanced.isFirstMeeting && enhanced.entrancePhrase) {
        // First time meeting - warm welcome
        messageUI.show(enhanced.entrancePhrase, 'success', 3000);
        celebrationsUI.connectionWarmth();
      } else {
        // Returning - show shorter message
        messageUI.show(`${newPersona.name} is back!`, 'success', 2000);
      }

      // Update waveform colors to match persona
      if (newPersona.colors) {
        waveformUI.setEmotion('neutral', 0.7);
      }
    });

    // Spotify state changes
    spotifyService.onStateChange((state, trackInfo) => {
      if (state === 'playing' && trackInfo) {
        messageUI.show(`Now playing: ${trackInfo.name}`, 'info', 3000);
      }
    });

    // Engagement service callbacks
    engagementService.setCallbacks({
      onEngagementUpdate: (data) => {
        // Update the engagement UI panel
        getEngagementUI().update(data);

        // Update badge count for due rituals
        const dueCount = data.ritualStreaks.filter((s) => s.dueToday).length;
        engagementTriggerUI.updateBadges({ ritualsdue: dueCount });

        // Check for streak at risk (streak > 3 days and due today)
        const atRisk = data.ritualStreaks.some((s) => s.currentStreak >= 3 && s.dueToday);
        if (atRisk) {
          engagementTriggerUI.updateBadges({ streakAtRisk: true });
        }
      },

      onEngagementTrigger: (trigger) => {
        // Handle engagement triggers from the agent
        handleEngagementTrigger(trigger);
      },

      onPredictionsUpdate: (predictions) => {
        // Update predictions UI
        const readyCount = predictions.filter((p) => p.status === 'resolved').length;
        engagementTriggerUI.updateBadges({ predictionsReady: readyCount > 0 ? readyCount : 0 });

        // Update predictions panel
        // Calculate prediction streak: consecutive accurate predictions (within 15% of actual)
        const resolved = predictions
          .filter((p) => p.status === 'resolved' && p.actualOutcome !== undefined)
          .sort(
            (a, b) => new Date(b.resolvedAt || 0).getTime() - new Date(a.resolvedAt || 0).getTime()
          );

        let predictionStreak = 0;
        for (const p of resolved) {
          const error = Math.abs(p.userPrediction - (p.actualOutcome ?? 0));
          if (error <= 15) {
            predictionStreak++;
          } else {
            break; // Streak broken
          }
        }

        getPredictionsUI().update({
          predictions,
          accuracy: engagementService.calculateAccuracy(),
          totalResolved: predictions.filter((p) => p.status === 'resolved').length,
          currentStreak: predictionStreak,
        });
      },

      onStreakMilestone: (streak) => {
        // Celebrate streak milestones with brand-aligned animations
        if (isStreakMilestone(streak.count)) {
          // Play character-style particle celebration
          celebrateStreak(streak.count, streak.personaId);

          // Show notification
          showStreakMilestone(streak.ritualName, streak.count, streak.personaId);
        }

        // Always show warmth glow and haptic feedback
        celebrationsUI.warmthGlow({ intensity: streak.count >= 30 ? 'intense' : 'warm' });
        delightService.haptic(streak.count >= 7 ? 'heavy' : 'medium');
        presenceUI.bounce();

        // 🌱 Check for seed rewards at streak milestones (7-day: 5 seeds, 30-day: 15 seeds)
        void roadmapService.checkStreakReward(streak.count).then((result) => {
          if (result.awarded && result.seedsAwarded) {
            // Show seed reward notification
            const msg = result.message || `You earned ${result.seedsAwarded} seeds!`;
            messageUI.show(msg, 'success', 4000);
          }
        });
      },
    });
  }

  /**
   * Attach audio visualization to an audio element or track.
   * Uses MediaStreamTrack for better WebRTC support, falls back to audio element.
   */
  private async attachAudioVisualization(
    audioElement: HTMLAudioElement,
    mediaStreamTrack?: MediaStreamTrack
  ): Promise<void> {
    log.info('🎚️ attachAudioVisualization called', {
      hasMediaStreamTrack: !!mediaStreamTrack,
      trackId: mediaStreamTrack?.id,
      trackReadyState: mediaStreamTrack?.readyState,
      hadPreviousCleanup: !!this.audioCleanup,
    });

    // Clean up previous
    if (this.audioCleanup) {
      log.debug('🧹 Cleaning up previous audio visualization');
      this.audioCleanup();
    }

    const volumeCallback = (volume: number) => {
      waveformUI.setVolume(volume);
      coachUI.setVolume(volume);
      // 🔊 Bass speaker effect - avatar pulses with voice
      presenceUI.setVoiceVolume(volume);
    };

    // Prefer MediaStreamTrack - works better for WebRTC streams
    if (mediaStreamTrack) {
      log.debug('📡 Using MediaStreamTrack for visualization');
      this.audioCleanup = await audioService.attachVisualization(mediaStreamTrack, volumeCallback);
    } else {
      log.debug('📻 Using audio element for visualization');
      this.audioCleanup = audioService.attachAudioElementVisualization(
        audioElement,
        volumeCallback
      );
    }
    log.info('✅ Audio visualization attached successfully');
  }

  /**
   * Prompt for user name if not set.
   */
  private promptForUserName(): void {
    const currentName = appState.get('userName');
    if (currentName) return;

    // For now, use a default name
    // In production, you'd show a modal or use the name input
    const defaultName = 'User';
    setUserName(defaultName);
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    // Clean up audio
    if (this.audioCleanup) {
      this.audioCleanup();
      this.audioCleanup = null;
    }

    // Dispose services
    audioService.dispose();
    spotifyService.dispose();

    // 🎚️ Clean up music audio controller
    resetMusicAudioController();

    // Disconnect if connected
    void connectionService.disconnect();

    // Dispose core UI components
    teamUI.dispose();
    messageUI.dispose();
    controlsUI.dispose();
    waveformUI.dispose();
    coachUI.dispose();

    // Dispose premium UI features
    soundUI.dispose();
    gesturesUI.dispose();
    celebrationsUI.dispose();
    statsUI.dispose();
    presenceUI.dispose();
    rippleUI.dispose();
    easterEggsUI.dispose();
    microInteractionsUI.dispose(); // ✨ Clean up premium button effects
    // keyboardUI.dispose();
    transcriptUI.dispose();
    thinkingUI.dispose();
    connectionQualityUI.dispose();
    moodUI.dispose();
    avatarFeedback.dispose();

    // FIX BUG: Dispose additional UI modules that were previously not cleaned up
    // This prevents memory leaks from event listeners and timers
    disposeAmbientSounds();
    disposeMobileDelights();
    disposeMobileBottomSheet();
    disposeFerniMoments();
    disposeSidekicks();
    disposeUnifiedIndicator();
    disposeLogoExpressions();
    disposeFerniEQ();
    destroyTranscendentSystems();
    disposeHumanizationBridge();
    disposeProactiveOutreach();
    disposeTeamInsightsUI();
    disposeCrossTeamNotifications();
    disposeVoiceEvents();

    // 🔍 Insights Debug Panel cleanup
    import('./ui/insights-debug-panel.ui.js')
      .then(({ disposeInsightsDebugPanel }) => disposeInsightsDebugPanel())
      .catch(() => { /* ignore if not loaded */ });
    disposeAvatarSoul();
    disposeAvatarLamp();
    disposeAmbientLife();
    disposeSpeechEventDispatcher();
    disposeMoodContext();
    disposeWeatherEffects();
    ferniExpressions.dispose();
    
    // Dispose ambient experience managers
    circadianManager.dispose();
    warmthManager.dispose();
    personaAura.dispose();
    visualStorytellingService.dispose();

    // FIX: Clean up all tracked event listeners to prevent memory leaks
    for (const { target, event, handler } of this.trackedListeners) {
      target.removeEventListener(event, handler);
    }
    log.debug(`Cleaned up ${this.trackedListeners.length} tracked event listeners`);
    this.trackedListeners = [];

    this.isInitialized = false;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Singleton application instance.
 */
export const app = new VoiceAIApp();

// ============================================================================
// AUTO-INITIALIZE ON DOM READY
// ============================================================================

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      void app.initialize();
    });
  } else {
    // DOM already ready
    void app.initialize();
  }
}
