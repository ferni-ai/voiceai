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

// State
import {
  appState,
  setAudioState,
  setSelectedPersona,
  setUserName,
  setWrappingUp,
} from './state/app.state.js';

// Services
import { delightService } from './services/delight.service.js';
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

// Core UI Components
import { coachUI, initCoachUI } from './ui/coach.ui.js';
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

// Premium UI Features
import { celebrationsUI, initCelebrationsUI } from './ui/celebrations.ui.js';
import { easterEggsUI, initEasterEggsUI } from './ui/easter-eggs.ui.js';
import { gesturesUI, initGesturesUI } from './ui/gestures.ui.js';
import { initPresenceUI, presenceUI } from './ui/presence.ui.js';
import { initRippleUI, rippleUI } from './ui/ripple.ui.js';
import { initSoundUI, soundUI } from './ui/sound.ui.js';
// Ambient Sounds - Background ambience for personalization
import { initAmbientSounds } from './services/ambient-sounds.service.js';
// Brand Service - Client-side brand validation
import { initBrandService } from './services/brand-service.js';
import { initStatsUI, statsUI } from './ui/stats.ui.js';
// ✨ Micro-Interactions - Premium button & interactive effects
import { initMicroInteractions, microInteractionsUI } from './ui/micro-interactions.ui.js';
// 📱 Mobile Delights - Magical mobile interactions (tilt, tap-to-look, haptics, etc.)
import { initMobileDelights } from './ui/mobile-delights.ui.js';
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
import { marketplaceUI } from './ui/marketplace.ui.js';
// Admin UI (legacy - kept for backward compatibility)
import { initAdminDashboard, injectAdminStyles } from './ui/admin.ui.js';
// New Unified Admin Portal
import { initAdminPortal } from './admin/index.js';
// Engagement UI
import { engagementTriggerUI, initEngagementTriggerUI } from './ui/engagement-trigger.ui.js';
import { getEngagementUI, initializeEngagementUI } from './ui/engagement.ui.js';
import { getPredictionsUI, initializePredictionsUI } from './ui/predictions.ui.js';
// Notifications & Celebrations
import { initNotificationsUI, showStreakMilestone } from './ui/notifications.ui.js';
import { celebrateStreak, isStreakMilestone } from './ui/streak-celebrations.ui.js';
// Weather Effects - Seasonal ambient atmosphere (available via dev panel)
import { initWeatherEffects } from './ui/weather-effects.ui.js';
// Ferni Moments - Character expressions
import { initFerniMoments } from './ui/ferni-moments.ui.js';
// Ferni Milestones - Warm relationship celebrations
import { initFerniMilestones } from './ui/ferni-milestones.ui.js';
// Connection Heart - Unified status + relationship indicator near avatar
import { initConnectionHeart } from './ui/connection-heart.ui.js';
// Ferni Expressions - Character-level avatar expressions
import { ferniExpressions, initFerniExpressions } from './ui/ferni-expressions.ui.js';
// Emotion ↔ Expression Bridge - Auto-maps emotions to expressions
import { enableEmotionExpressionBridge } from './emotion/emotion-expression-bridge.js';
// Logo Expressions - Animated logo that reacts to emotions
import {
  hookIntoAvatarFeedback as hookLogoFeedback,
  initLogoExpressions,
} from './ui/logo-expressions.ui.js';
// Celebration Service - Triggers milestone celebrations
import { initCelebrationService } from './services/celebration.service.js';
// Ferni EQ - Superhuman emotional intelligence ("Better than Human")
import { initFerniEQ } from './ui/better-than-human.ui.js';
// Avatar Soul - Pixar-quality "Better Than Human" visual animation system
import { avatarSoul, initAvatarSoul } from './ui/avatar-soul.ui.js';
// Avatar Lamp - Luxo Jr. level body language animation
import { avatarLamp, initAvatarLamp } from './ui/avatar-lamp.ui.js';
// Ambient Life - Makes Ferni feel alive when idle
import { initAmbientLife } from './ui/ambient-life.ui.js';
// Speech Event Dispatcher - Critical foundation for Ferni EQ
import {
  dispatchAgentSpeechEnd,
  dispatchAgentSpeechStart,
  dispatchThinking,
  dispatchUserSpeechEnd,
  dispatchUserSpeechStart,
  initSpeechEventDispatcher,
} from './services/speech-event-dispatcher.js';
// Mood Context - Time-based persona mood for "Better than Human"
import { initMoodContext } from './services/mood-context.service.js';
// Demo data for testing without backend
import {
  disableDemoData,
  enableDemoData,
  getDemoEngagementData,
  getDemoPredictions,
} from './services/engagement-demo-data.js';
// Environment detection
import { shouldUseDemoData } from './utils/environment.js';

// New Feature UIs (v2)
import accentSettingsUI from './ui/accent-settings.ui.js';
import { initAnalyticsDashboardUI } from './ui/analytics-dashboard.ui.js';
import { initCognitiveInsightsUI } from './ui/cognitive-insights.ui.js';
import { getCommandsPanelUI } from './ui/commands.ui.js';
import { initConversationHistoryUI } from './ui/conversation-history.ui.js';
import { getDataExportUI, initDataExportUI } from './ui/data-export.ui.js';
import { initPredictionTrackerUI } from './ui/prediction-tracker.ui.js';
import { getRitualBuilderUI, initRitualBuilderUI } from './ui/ritual-builder.ui.js';
import { getSettingsMenuUI, initSettingsMenuUI } from './ui/settings-menu.ui.js';
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
import {
  initRelationshipProgressUI,
} from './ui/relationship-progress.ui.js';
// Trust Journey UI - "Better Than Human" relationship visualization
import { initTrustJourneyUI, showTrustJourney } from './ui/trust-journey.ui.js';
// Music Dashboard UI - "Musical You" insights
import { showGamePicker } from './ui/game-picker.ui.js';
import { musicDashboard } from './ui/music-dashboard.ui.js';
import { initTeamHuddleUI } from './ui/team-huddle.ui.js';
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
// Voice Enrollment UI
import { initVoiceEnrollmentUI, showVoiceEnrollmentModal } from './ui/voice-enrollment.ui.js';
// Voice ID Badge
import { initVoiceIdBadge } from './ui/voice-id-badge.ui.js';
// Speaker Change Indicator - Gentle verification when voice changes
import { initSpeakerChangeIndicator } from './ui/speaker-change-indicator.ui.js';
// Household Manager - Multi-user voice household management
import { initHouseholdManager, showHouseholdManager } from './ui/household-manager.ui.js';
// Conversation Memory Browser - Browse past conversations and memories
import { initConversationMemory, showConversationMemory } from './ui/conversation-memory.ui.js';
// Wellbeing Dashboard - "State of Me" visualization
import { initWellbeingDashboard, showWellbeingDashboard } from './ui/wellbeing-dashboard.ui.js';
// Service Health - Show degradation status to users
import { initServiceHealthUI } from './ui/service-health.ui.js';
// Monetization UIs - Support Ferni
import { ferniFundUI } from './ui/ferni-fund.ui.js';
import { journeyUI } from './ui/journey.ui.js';
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
// Toast for notifications
import { toast } from './ui/toast.ui.js';
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
// Seeds UI - display balance and toast notifications
import { initSeedsDisplay } from './ui/seeds-display.ui.js';
import { initSeedsToast } from './ui/seeds-toast.ui.js';
// Subscription Badge - subtle status indicator in header
import { initSubscriptionBadge, subscriptionBadgeUI } from './ui/subscription-badge.ui.js';
// Structured logger
import { createLogger } from './utils/logger.js';
const log = createLogger('App');

// 🎬 Character-quality Animation Orchestrator
import {
  animatePersonaTransition,
  initAnimationOrchestrator,
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
import { initSoul } from './ui/soul.ui.js';
// 🧪 Soul test utilities (available as window.testSoul in dev)
// NOTE: Test file imported dynamically to avoid build errors
if (import.meta.env.DEV) {
  void import('./ui/soul.test.js');
}

// 🛠️ Dev Panel - Lazy loaded for performance (17KB gzipped savings)
// Dynamic import: const { initDevPanel } = await import('./ui/dev-panel.ui.js');

// 🎚️ Music Audio Controller - Real-time ducking via Web Audio API
import {
  getMusicAudioController,
  resetMusicAudioController,
} from './services/music-audio.controller.js';

// 🌟 Living Favicon - Ferni's presence in the browser tab
import { initFaviconManager } from './ui/favicon-manager.ui.js';

// Panel methods (extracted for file size)
import {
  showAnalyticsDashboard,
  showCognitiveInsights,
  showConversationHistory,
  showDataExport,
  showPredictionTracker,
  showTeamHuddle,
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

  /**
   * Initialize the application.
   * Must be called after DOM is ready.
   */
  initialize(): void {
    if (this.isInitialized) {
      log.warn('App already initialized');
      return;
    }

    // Check for admin route
    if (window.location.pathname === '/admin') {
      void this.initializeAdmin();
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

      // Show engagement triggers (with slight delay for visual flow)
      setTimeout(() => engagementTriggerUI.show(), 500);

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

      // Record conversation for engagement tracking
      greetingUI.recordConversation();

      // 🎭 Track relationship progression for dynamic Ferni subtitle
      relationshipStageService.recordConversation();

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

    // Reset wrap-up state (conversation is over)
    setWrappingUp(false);

    // Update delight state
    delightService.onDisconnect();

    // Clear mood state (persona back to neutral)
    moodService.clearMood();
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
        <a href="/" style="position: fixed; top: 1rem; left: 1rem; color: #4a6741; text-decoration: none; font-size: 0.875rem; z-index: 1000;">
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

    // Start ambient warmth cycle (WALL-E style time-aware lighting)
    startAmbientCycle();

    // Initialize magnetic hover effect (WALL-E curiosity)
    initMagneticHover();

    // Wire up theme toggle button
    const toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        toggleTheme();
      });

      // Add keyboard shortcut (T) for theme toggle
      document.addEventListener('keydown', (e) => {
        if (e.key === 't' || e.key === 'T') {
          // Don't toggle if user is typing in an input
          if (
            document.activeElement?.tagName !== 'INPUT' &&
            document.activeElement?.tagName !== 'TEXTAREA'
          ) {
            toggleTheme();
          }
        }
      });
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
  private initializeServices(): void {
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
  }

  /**
   * Safe UI initialization wrapper - catches errors so one module doesn't break the app.
   */
  private safeInit(name: string, initFn: () => void): void {
    try {
      initFn();
    } catch (error) {
      log.error(`Failed to initialize ${name}:`, error);
      // Continue loading other modules
    }
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

    // Core UI - Initialize in order of dependency (these are critical)
    this.safeInit('MessageUI', () => initMessageUI());
    this.safeInit('WaveformUI', () => initWaveformUI());
    this.safeInit('CoachUI', () => initCoachUI());
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

    // Premium Features - Initialize all the delightful extras (non-critical)
    this.safeInit('SoundUI', () => initSoundUI());
    this.safeInit('AmbientSounds', () => initAmbientSounds()); // Personalization sound packs
    this.safeInit('BrandService', () => initBrandService()); // Brand validation preload
    this.safeInit('CelebrationsUI', () => initCelebrationsUI());
    this.safeInit('StatsUI', () => initStatsUI());
    this.safeInit('PresenceUI', () => initPresenceUI());
    this.safeInit('RippleUI', () => initRippleUI());
    this.safeInit('MicroInteractionsUI', () => initMicroInteractions()); // ✨ Premium button effects
    this.safeInit('TranscriptUI', () => initTranscriptUI());
    this.safeInit('ThinkingUI', () => initThinkingUI());
    this.safeInit('ConnectionQualityUI', () => initConnectionQualityUI());
    this.safeInit('EasterEggsUI', () => initEasterEggsUI());
    this.safeInit('MoodUI', () => initMoodUI());
    this.safeInit('AvatarFeedback', () => initAvatarFeedback()); // ✨ For music dancing!
    // 📱 Mobile Delights - Tilt parallax, tap-to-look, haptics, pull-to-connect, immersive mode
    this.safeInit('MobileDelights', () =>
      initMobileDelights({
        onConnectRequest: () => {
          // Trigger connection when user pulls down on avatar
          if (appState.get('connection') === 'disconnected') {
            void this.connect();
          }
        },

        onPersonaSwipe: (direction) => {
          // Integrated with gestures - persona switching handled there
          const persona =
            direction === 'left' ? gesturesUI.getNextPersona() : gesturesUI.getPreviousPersona();
          this.selectPersona(persona);
          soundUI.play('switch');
        },
      })
    );
    // Disabled: Eye peek-throughs removed - keeping just the zen blink
    // this.safeInit('FerniEye', () => initFerniEye());
    // 🌨️ Weather Effects - Seasonal ambient atmosphere (snow, rain, leaves, fireflies)
    // Available via dev panel - not auto-started to keep things subtle
    this.safeInit('WeatherEffects', () => {
      initWeatherEffects();
      // Weather can be triggered from dev panel or contextually - not always on
    });
    // 🎭 Ferni Moments - Character expressions with time-of-day awareness
    this.safeInit('FerniMoments', () => {
      initFerniMoments();
      // Auto-aware of time-of-day, moments triggered contextually
    });

    // 🎉 Ferni Milestones - Warm relationship celebrations
    this.safeInit('FerniMilestones', () => {
      initFerniMilestones();
      // Tracks conversation streaks, team connections, sweet moments
    });

    // 💚 Connection Heart - Status + relationship indicator near avatar
    this.safeInit('ConnectionHeart', () => {
      initConnectionHeart();
    });
    // 🎬 Ferni Expressions - Character-level eye expressions & reactions
    this.safeInit('FerniExpressions', () => {
      initFerniExpressions();
      // Creates lid overlay for eye expressions, sparkles, dramatic morphs
    });

    // 🔗 Emotion ↔ Expression Bridge - Auto-triggers expressions on emotion changes
    this.safeInit('EmotionExpressionBridge', () => {
      enableEmotionExpressionBridge();
      // Automatically maps emotion state changes to ferni expressions
    });

    // 🎨 Logo Expressions - Animated logo that reacts to emotions
    this.safeInit('LogoExpressions', () => {
      initLogoExpressions();
      hookLogoFeedback();
      // Logo will react to avatar emotion events
    });

    // 🎉 Celebration Service - Triggers milestone celebrations
    this.safeInit('CelebrationService', () => {
      initCelebrationService();
      // Now you can call: celebrationService.smallWin(), .bigWin(), etc.
    });

    // 🎤 Speech Event Dispatcher - Foundation for Ferni EQ (MUST be before FerniEQ)
    this.safeInit('SpeechEventDispatcher', () => {
      initSpeechEventDispatcher();
      // Dispatches: ferni:user-speech-start/end/pause, ferni:agent-speech-start/end
    });

    // 🚀 Ferni EQ - Superhuman emotional intelligence ("Better than Human")
    this.safeInit('FerniEQ', () => {
      initFerniEQ();
      // Micro-expressions, breath sync, active listening, concern detection

      // Set up gentle check-in handler for significant concern detection
      document.addEventListener('ferni:gentle-checkin', ((e: CustomEvent) => {
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

    // ✨ Avatar Soul - Pixar-quality "Better Than Human" visual animations
    this.safeInit('AvatarSoul', () => {
      initAvatarSoul();
      // Glow bleeding, anticipation shimmer, memory spark, comfort pulse
      // Energy matching, relationship warmth, growth celebration, protective mode

      // Wire up to track conversation interactions for relationship warmth
      document.addEventListener('ferni:conversation-turn', () => {
        avatarSoul.recordInteraction(0.5);
      });
    });

    // 🎬 Avatar Lamp - Luxo Jr. level body language (bounce, tilt, nod, etc.)
    this.safeInit('AvatarLamp', () => {
      initAvatarLamp();
      // Breathing idle animation, bouncing, tilting, nodding
      // Perk up, shrink, shake - pure body language expression

      // Expose to window for dev panel testing
      if (typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>).__avatarLamp = avatarLamp;
      }
    });

    // 🌿 Ambient Life - Makes Ferni feel alive when idle
    this.safeInit('AmbientLife', () => {
      initAmbientLife();
      // Random blinks, glances, stretches, warmth pulses
      // Creates presence even when not in conversation
    });

    // 🌅 Mood Context - Time-based persona mood
    this.safeInit('MoodContext', () => {
      initMoodContext();
      // Applies CSS classes: mood-early-morning, mood-morning, etc.
      // Sets energy modifier for animations
      // Handles special dates like tsunami anniversary
    });

    // 🎬 Animation Orchestrator - Character-quality coordinated animations
    this.safeInit('AnimationOrchestrator', () => initAnimationOrchestrator());

    // 🌟 Soul System - Living presence with logo expressions, persona magic
    this.safeInit('Soul', () => {
      void initSoul({
        showFirstLaunch: false, // Already handled in initialize()
        enablePersonaMagic: true,
      });
    });

    // 🌟 Living Favicon - Ferni's presence in the browser tab
    this.safeInit('FaviconManager', () => initFaviconManager());

    // 🛠️ Dev Panel - Developer testing tools (lazy loaded for 17KB gzipped savings)
    this.safeInit('DevPanel', async () => {
      const { initDevPanel } = await import('./ui/dev-panel.ui.js');
      initDevPanel();
    });

    // 📊 Engagement UI - Daily practice, streaks, predictions
    this.safeInit('EngagementUI', () => initializeEngagementUI());
    this.safeInit('PredictionsUI', () => {
      initializePredictionsUI();
      // Wire up prediction resolution callback
      getPredictionsUI().setOnResolutionSubmit(async (predictionId, actualValue) => {
        try {
          const userId = localStorage.getItem('ferni_user_id');
          const headers: HeadersInit = { 'Content-Type': 'application/json' };
          if (userId) {
            headers['X-User-ID'] = userId;
          }

          const response = await fetch(`/api/predictions/${predictionId}/actuals`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ userId, actuals: { result: actualValue } }),
          });
          if (!response.ok) throw new Error('Failed to save');

          // Refresh predictions data
          const refreshResponse = await fetch(
            `/api/predictions${userId ? `?userId=${userId}` : ''}`,
            {
              headers: userId ? { 'X-User-ID': userId } : {},
            }
          );
          if (refreshResponse.ok) {
            const data = await refreshResponse.json();
            const predictions = data.predictions || [];
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
              accuracy: data.stats?.averageAccuracy || null,
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
        onEngagementClick: () => getEngagementUI().toggle(),
        onPredictionsClick: () => getPredictionsUI().toggle(),
      })
    );

    // 🔔 Notifications UI - Proactive engagement notifications
    this.safeInit('NotificationsUI', () => initNotificationsUI());

    // 🆕 New Feature UIs (v2)
    this.safeInit('ConversationHistoryUI', () => initConversationHistoryUI());
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
    this.safeInit('RelationshipProgressUI', () => initRelationshipProgressUI());
    this.safeInit('TrustJourneyUI', () => initTrustJourneyUI());

    // 🌱 Progressive Relationship Features - All quick wins in one init
    // Stage celebrations, trust signal cards, persona intros, feature hints, progress indicator
    this.safeInit('ProgressiveFeatures', () => {
      // Import dynamically to avoid circular deps
      import('./services/progressive-features.service.js').then(({ initProgressiveFeatures }) => {
        initProgressiveFeatures();
      });
    });

    // 💰 Subscription UI - Human-centered monetization
    // Philosophy: "Limits feel like natural breaks, not walls."
    this.safeInit('SubscriptionUI', () => initSubscriptionUI());

    // 💰 Subscription Badge - Subtle status indicator in header
    this.safeInit('SubscriptionBadge', () => initSubscriptionBadge());

    // 🎨 Cosmetics Service - Personalization system (themes, skins, sounds)
    this.safeInit('CosmeticsService', () => initCosmeticsService());

    // 🌱 Seeds Economy - Earn seeds through natural engagement
    this.safeInit('SeedsEconomy', () => initSeedsEconomy());

    // 🌱 Seeds UI - Display balance and toast notifications
    this.safeInit('SeedsDisplay', () => initSeedsDisplay());
    this.safeInit('SeedsToast', () => initSeedsToast());

    // 🌱 Growth Journey - Celebrate milestones as relationship deepens
    this.safeInit('GrowthJourney', () => {
      growthJourneyService.init();

      // Listen for new milestones to celebrate
      document.addEventListener('ferni:milestone-celebrated', ((e: CustomEvent) => {
        const { milestone } = e.detail;
        // Celebrate with warmth, not gamification
        presenceUI.bounce();
        soundUI.play('success');
        celebrationsUI.warmthGlow({ intensity: 'warm' });
        messageUI.show(milestone.title, 'success', 3000);
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

    // 🏥 Service Health - Show degradation status to users
    this.safeInit('ServiceHealthUI', () => initServiceHealthUI());

    // 📋 Settings Menu - Central navigation hub
    this.safeInit('SettingsMenuUI', () => {
      initSettingsMenuUI({
        onHistoryClick: () => void showConversationHistory(),
        onAnalyticsClick: () => void showAnalyticsDashboard(),
        onCognitiveClick: () => void showCognitiveInsights(),
        onRitualBuilderClick: () => getRitualBuilderUI().show(),
        onCommandsClick: () => void getCommandsPanelUI().show(),
        onPredictionTrackerClick: () => void showPredictionTracker(),
        onExportDataClick: () => void showDataExport(),
        onOnboardingClick: () => getOnboardingUI().start(),
        onThemeToggle: () => toggleTheme(),
        onNotificationSettingsClick: () => showNotificationSettings(),
        onSpotifyClick: () => void triggerSpotifyLinkToggle(),
        onTeamHuddleClick: () => showTeamHuddle(),
        onTrustJourneyClick: () => void showTrustJourney(),
        onMusicDashboardClick: () => void musicDashboard.show(),
        onPlayGamesClick: () => showGamePicker(),
        onOutreachScheduleClick: () => void openOutreachSchedule(),
        onContactSettingsClick: () => void openContactSettings(),
        onCalendarSettingsClick: () => void openCalendarSettings(),
        onVoiceEnrollmentClick: () => void showVoiceEnrollmentModal(),
        onSubscriptionClick: () => showUpgradeModal(),
        onBillingPortalClick: () => void this.openBillingPortal(),
        onHouseholdClick: () => void showHouseholdManager(),
        onConversationMemoryClick: () => void showConversationMemory(),
        onWellbeingClick: () => void showWellbeingDashboard(),
        onSupportFerniClick: () => {
          const userId = appState.get('deviceId');
          if (userId) {
            void ferniFundUI.open(userId);
          }
        },
        onPersonalizeClick: () => personalizeUI.open(),
        onYourJourneyClick: () => journeyUI.open(),
        onShareFerniClick: () => referralUI.open(),
        onAccentSettingsClick: () => accentSettingsUI.open(),
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

    // 📬 Listen for push notification navigation events
    window.addEventListener('ferni:open-engagement', () => {
      getEngagementUI().show();
    });
    window.addEventListener('ferni:open-predictions', () => {
      getPredictionsUI().show();
    });
    window.addEventListener('ferni:open-team-huddle', () => {
      showTeamHuddle();
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

    // 📊 Dev Panel modal event listeners
    window.addEventListener('ferni:open-analytics', () => {
      void showAnalyticsDashboard();
    });
    window.addEventListener('ferni:open-history', () => {
      void showConversationHistory();
    });
    window.addEventListener('ferni:open-insights', () => {
      void showCognitiveInsights();
    });
    window.addEventListener('ferni:start-tour', () => {
      getOnboardingUI().start();
    });
    window.addEventListener('ferni:open-daily-practice', () => {
      // Daily check-in uses engagement UI rituals
      getEngagementUI().show();
    });
    window.addEventListener('ferni:open-marketplace', () => {
      void marketplaceUI.open();
    });

    // 🌱 Garden Widget - Plant seed flow integration
    window.addEventListener('ferni:open-plant-seed', ((e: CustomEvent) => {
      const detail = e.detail as { type: 'one-time' | 'monthly' } | undefined;
      const userId = appState.get('deviceId');
      if (userId) {
        // Open Ferni Fund modal - user can choose contribution type
        log.debug('Plant seed requested', { type: detail?.type });
        void ferniFundUI.open(userId);
      }
    }) as EventListener);

    // 💬 Dev Panel transcript injection
    window.addEventListener('ferni:transcript', ((e: CustomEvent) => {
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
    window.addEventListener('ferni:connection-quality', ((e: CustomEvent) => {
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
    window.addEventListener('ferni:streak-milestone', ((e: CustomEvent) => {
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
    window.addEventListener('ferni:request-connect', () => {
      if (appState.get('connection') === 'disconnected') {
        void this.connect();
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
      marketplaceBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent team roster from handling this
        void marketplaceUI.open();
      });
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

    // Play sound
    soundUI.play('switch');

    // If connected, request handoff
    if (appState.get('connection') === 'connected') {
      this.requestHandoff(personaId);
    }
  }

  /**
   * Show personalized welcome message and track engagement.
   */
  private showWelcome(): void {
    // Record visit
    greetingUI.recordVisit();

    // Get personalized greeting
    const greeting = greetingUI.getGreeting();

    // Show greeting as helper text
    messageUI.setHelper(greeting);

    // Check for streak milestone
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

    // Show streak badge if streak >= 3
    const streak = greetingUI.getStreak();
    if (streak >= 3) {
      this.showStreakBadge(streak);
    }

    // Ambient particles removed - keeping UI clean and human
    // Weather effects available via dev panel when contextually appropriate

    // 🆕 Auto-start onboarding for first-time users (after a short delay)
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
            toast.warning('Voice profile quality low. Go to Settings → Voice ID to re-enroll.');
          } else {
            // Low severity - just informational
            toast.info('Voice profile could be improved. Re-enroll in Settings → Voice ID.');
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
   */
  private showStreakBadge(streak: number): void {
    // Check if badge already exists
    if (document.getElementById('streakBadge')) return;

    const badge = document.createElement('div');
    badge.id = 'streakBadge';
    badge.className = 'streak-badge';
    badge.innerHTML = `
      <span class="streak-count">${streak}</span>
      <span class="streak-label">day streak</span>
    `;

    document.body.appendChild(badge);

    // Animate in after a delay
    setTimeout(() => {
      badge.classList.add('visible');
    }, 1000);
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
      toast.error('Please connect first to manage your subscription.');
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
   */
  private requestHandoff(targetPersonaId: PersonaId): void {
    const room = connectionService.getRoom();
    if (!room?.localParticipant) return;

    const message = JSON.stringify({
      type: 'handoff_request',
      target: targetPersonaId,
      timestamp: Date.now(),
    });

    room.localParticipant
      .publishData(new TextEncoder().encode(message), { reliable: true })
      .catch((err) => log.error('Handoff request failed:', err));
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
        soundUI.play('success');

        // 🎬 Expression: Excited greeting expression
        ferniExpressions.heldPose('happy', 400);
      },

      onAgentDisconnected: () => {
        messageUI.show('See you next time!', 'info', 2000);
        presenceUI.setSpeaking(false);

        // 🎬 Expression: Warm farewell expression (soft, lingering)
        ferniExpressions.setExpression('empathetic', 400, 2000);
      },

      onDataMessage: (message) => {
        handleDataMessage(message);
        statsUI.incrementMessages();
      },

      onAudioTrack: (audioElement, _participantId, mediaStreamTrack) => {
        // Enable audio visualization using the MediaStreamTrack (works better for WebRTC)
        // Falls back to audio element if track not available
        void this.attachAudioVisualization(audioElement, mediaStreamTrack);
        setAudioState('speaking');
        // Set speaking state directly - don't rely only on volume detection
        waveformUI.setSpeaking(true);
        presenceUI.setSpeaking(true);
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
        setAudioState('listening');
        // Now we're listening for user input
        waveformUI.setListening(true);

        // 🎚️ Unduck music when agent stops speaking
        getMusicAudioController().unduckForAgent();

        // 🚀 Ferni EQ: Dispatch agent speech end
        dispatchAgentSpeechEnd();
      },

      // 🎚️ Music track detected - attach for ducking control
      onMusicTrack: (audioElement, trackId) => {
        log.info('🎚️ Music track detected, attaching for ducking', { trackId });
        void (async () => {
          try {
            const controller = getMusicAudioController();
            await controller.initialize();
            await controller.attachMusicTrack(audioElement, trackId);
          } catch (err) {
            log.warn('Failed to attach music track for ducking', err);
          }
        })();
      },

      // 🎚️ Music track ended
      onMusicTrackEnd: (trackId) => {
        log.debug('🎚️ Music track ended', { trackId });
        // Controller handles cleanup automatically via the returned cleanup function
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
    handoffService.onHandoffFailed((error, targetPersona) => {
      log.error('onHandoffFailed:', { error, targetPersona });
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
    // Clean up previous
    if (this.audioCleanup) {
      this.audioCleanup();
    }

    const volumeCallback = (volume: number) => {
      waveformUI.setVolume(volume);
      coachUI.setVolume(volume);
    };

    // Prefer MediaStreamTrack - works better for WebRTC streams
    if (mediaStreamTrack) {
      this.audioCleanup = await audioService.attachVisualization(mediaStreamTrack, volumeCallback);
    } else {
      this.audioCleanup = audioService.attachAudioElementVisualization(
        audioElement,
        volumeCallback
      );
    }
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
