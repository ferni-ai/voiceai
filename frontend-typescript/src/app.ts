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
import { appState, setAudioState, setSelectedPersona, setUserName } from './state/app.state.js';

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
import { initStatsUI, statsUI } from './ui/stats.ui.js';
// ✨ Micro-Interactions - Pixar-quality button & interactive effects
import { initMicroInteractions, microInteractionsUI } from './ui/micro-interactions.ui.js';
// import { keyboardUI, initKeyboardUI } from './ui/keyboard.ui.js'; // Disabled for now
import { avatarFeedback, initAvatarFeedback } from './ui/avatar-feedback.ui.js';
import { connectionQualityUI, initConnectionQualityUI } from './ui/connection-quality.ui.js';
import { initFerniEye } from './ui/ferni-eye.ui.js';
import { greetingUI } from './ui/greeting.ui.js';
import { initMoodUI, moodUI } from './ui/mood.ui.js';
import { initSkeletonUI, skeletonUI } from './ui/skeleton.ui.js';
import { initThinkingUI, thinkingUI } from './ui/thinking.ui.js';
import { initTranscriptUI, transcriptUI } from './ui/transcript.ui.js';
// Marketplace UI
import { marketplaceUI } from './ui/marketplace.ui.js';
// Admin UI
import { initAdminDashboard, injectAdminStyles } from './ui/admin.ui.js';
// Engagement UI
import { engagementTriggerUI, initEngagementTriggerUI } from './ui/engagement-trigger.ui.js';
import { getEngagementUI, initializeEngagementUI } from './ui/engagement.ui.js';
import { getPredictionsUI, initializePredictionsUI } from './ui/predictions.ui.js';
// Notifications & Celebrations
import { initNotificationsUI, showStreakMilestone } from './ui/notifications.ui.js';
import { celebrateStreak, isStreakMilestone } from './ui/streak-celebrations.ui.js';
// Weather Effects - Seasonal ambient atmosphere (available via dev panel)
import { initWeatherEffects } from './ui/weather-effects.ui.js';
// Ferni Moments - Pixar-style character expressions
import { initFerniMoments } from './ui/ferni-moments.ui.js';
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
import { initAnalyticsDashboardUI } from './ui/analytics-dashboard.ui.js';
import { initCognitiveInsightsUI } from './ui/cognitive-insights.ui.js';
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
import {
  initRelationshipProgressUI,
  showProgressPanel as showRelationshipProgress,
} from './ui/relationship-progress.ui.js';
import { initTeamHuddleUI } from './ui/team-huddle.ui.js';
// Push Notifications
import { initPushNotifications } from './services/push-notifications.service.js';
import {
  initNotificationSettingsUI,
  showNotificationSettings,
} from './ui/notification-settings.ui.js';
// Structured logger
import { createLogger } from './utils/logger.js';
const log = createLogger('App');

// 🎬 Pixar-quality Animation Orchestrator
import {
  animatePersonaTransition,
  initAnimationOrchestrator,
  playPixarReaction,
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
import { hasSeenAwakening, initSoul, showFerniAwakens } from './ui/soul.ui.js';
// 🧪 Soul test utilities (available as window.testSoul in dev)
import './ui/soul.test.js';

// 🛠️ Dev Panel - Testing & validation tools
import { initDevPanel } from './ui/dev-panel.ui.js';

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

    // Show loading skeleton while initializing
    initSkeletonUI();

    try {
      // 🌟 FIRST: Show Ferni Awakens for first-time users
      // This creates the magical first impression before anything else
      if (!hasSeenAwakening()) {
        void this.showFirstLaunchExperience();
        return; // Awakening will call initialize() again when complete
      }

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

      // Hide skeleton after a brief delay for smooth transition
      requestAnimationFrame(() => {
        setTimeout(() => {
          skeletonUI.hide();

          // Hide native splash screen on iOS/Android
          if (isNative()) {
            void hideSplashScreen(300);
          }

          // Trigger entrance animations
          document.body.classList.add('app-loaded');

          // CRITICAL: Lock visibility after entrance animations complete.
          // The avatar is our "WALL-E" and must NEVER disappear!
          // The team roster must ALWAYS be clickable!
          // Entrance animations: avatar 700ms, roster up to 1030ms (730ms delay + 300ms anim)
          setTimeout(() => {
            const avatarContainerEl = document.querySelector('.avatar-container');
            avatarContainerEl?.classList.add('entrance-complete');

            const rosterContainer = document.querySelector('.entrance-roster');
            rosterContainer?.classList.add('entrance-complete');

            // 🎬 FIX: Signal entrance complete to avatar feedback system
            // This unlocks idle behaviors AFTER entrance animations finish
            // Prevents animation contention that caused jarring on startup
            avatarFeedback.setEntranceComplete();
          }, 1100); // Buffer after all animations complete
        }, 100);
      });
    } catch (error) {
      log.error('Initialization failed:', error);
      skeletonUI.hide();
      messageUI.show('Having trouble starting up. Try refreshing?', 'error');
    }
  }

  /**
   * Connect to the AI advisor with timeout handling.
   */
  async connect(): Promise<void> {
    const persona = appState.get('selectedPersona');

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
   * Disconnect from the AI advisor.
   */
  async disconnect(): Promise<void> {
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

    // End session stats
    statsUI.endSession();

    // 📝 End conversation tracking and persist
    await conversationTracker.endSession();

    // Pause Spotify if playing
    await spotifyService.pause();

    // Disconnect from LiveKit
    await connectionService.disconnect();

    // FIX BUG: Reset handoff service to clear stuck transition states
    handoffService.resetSession();

    // Play disconnect sound (soundUI only - has debouncing for mobile)
    soundUI.play('disconnect');

    // Reset audio state
    setAudioState('idle');

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
   */
  private async initializeAdmin(): Promise<void> {
    log.info('Initializing Admin Dashboard...');

    // Clear the main app content and show admin container
    const appContent = document.getElementById('app') || document.body;
    appContent.innerHTML = `
      <div id="adminDashboard" style="min-height: 100vh; background: #0d0d1a; color: #fff;"></div>
      <a href="/" style="position: fixed; top: 1rem; left: 1rem; color: #4a6741; text-decoration: none; font-size: 0.875rem;">
        ← Back to App
      </a>
    `;

    // Inject admin styles
    injectAdminStyles();

    // Initialize the admin dashboard
    await initAdminDashboard();

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
      // GSAP's force3D handles GPU acceleration for avatar animations
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
    this.safeInit('CelebrationsUI', () => initCelebrationsUI());
    this.safeInit('StatsUI', () => initStatsUI());
    this.safeInit('PresenceUI', () => initPresenceUI());
    this.safeInit('RippleUI', () => initRippleUI());
    this.safeInit('MicroInteractionsUI', () => initMicroInteractions()); // ✨ Pixar button effects
    this.safeInit('TranscriptUI', () => initTranscriptUI());
    this.safeInit('ThinkingUI', () => initThinkingUI());
    this.safeInit('ConnectionQualityUI', () => initConnectionQualityUI());
    this.safeInit('EasterEggsUI', () => initEasterEggsUI());
    this.safeInit('MoodUI', () => initMoodUI());
    this.safeInit('AvatarFeedback', () => initAvatarFeedback()); // ✨ For music dancing!
    this.safeInit('FerniEye', () => initFerniEye()); // 👁️ Pixar-style eye peek-throughs!
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
    // 🎬 Animation Orchestrator - Pixar-quality coordinated animations
    this.safeInit('AnimationOrchestrator', () => initAnimationOrchestrator());

    // 🌟 Soul System - Living presence with eye tracking, logo expressions, persona magic
    this.safeInit('Soul', () => {
      void initSoul({
        showFirstLaunch: false, // Already handled in initialize()
        enableEyeTracking: true,
        enablePersonaMagic: true,
      });
    });

    // 🛠️ Dev Panel - Developer testing tools (only in dev mode)
    this.safeInit('DevPanel', () => initDevPanel());

    // 📊 Engagement UI - Daily practice, streaks, predictions
    this.safeInit('EngagementUI', () => initializeEngagementUI());
    this.safeInit('PredictionsUI', () => {
      initializePredictionsUI();
      // Wire up prediction resolution callback
      getPredictionsUI().setOnResolutionSubmit(async (predictionId, actualValue) => {
        try {
          const response = await fetch(`/api/predictions/${predictionId}/actuals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actuals: { result: actualValue } }),
          });
          if (!response.ok) throw new Error('Failed to save');

          // Refresh predictions data
          const refreshResponse = await fetch('/api/predictions');
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
    this.safeInit('TeamHuddleUI', () => initTeamHuddleUI());
    this.safeInit('RelationshipProgressUI', () => initRelationshipProgressUI());

    // 📋 Settings Menu - Central navigation hub
    this.safeInit('SettingsMenuUI', () => {
      initSettingsMenuUI({
        onHistoryClick: () => void showConversationHistory(),
        onAnalyticsClick: () => void showAnalyticsDashboard(),
        onCognitiveClick: () => void showCognitiveInsights(),
        onRitualBuilderClick: () => getRitualBuilderUI().show(),
        onPredictionTrackerClick: () => void showPredictionTracker(),
        onExportDataClick: () => void showDataExport(),
        onOnboardingClick: () => getOnboardingUI().start(),
        onThemeToggle: () => toggleTheme(),
        onRelationshipProgressClick: () => showRelationshipProgress(),
        onNotificationSettingsClick: () => showNotificationSettings(),
        onSpotifyClick: () => void triggerSpotifyLinkToggle(),
        onTeamHuddleClick: () => showTeamHuddle(),
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

    // 📊 Load demo data for testing (when not connected to backend)
    this.loadDemoEngagementData();
    // Agent particles disabled for cleaner professional UI
    // this.safeInit('AgentParticlesUI', () => void initAgentParticles());

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
   * Now with Pixar-quality transition animations!
   */
  selectPersona(personaId: PersonaId): void {
    const currentPersona = appState.get('selectedPersona');
    const persona = getPersona(personaId);

    // 🎬 Animate the transition with Pixar principles
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
   * Show the magical first-launch experience for new users.
   * This creates an emotional moment before they see the app.
   */
  private async showFirstLaunchExperience(): Promise<void> {
    log.info('🌅 Starting first launch experience');

    // Hide the skeleton for the awakening
    skeletonUI.hide();

    // Show the cinematic awakening
    await showFerniAwakens();

    log.info('✨ First launch experience complete, resuming initialization');

    // Now continue with normal initialization
    // Reset initialized flag so we can continue
    this.isInitialized = false;
    this.initialize();
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
   * Load engagement data - uses demo data in development, real data in production.
   *
   * PRODUCTION BEHAVIOR:
   * - In development: Loads demo data for UI testing
   * - In production: Skips demo data, waits for real data from backend
   */
  private loadDemoEngagementData(): void {
    // Only load demo data in development or when explicitly enabled
    if (!shouldUseDemoData()) {
      log.info('Production mode - skipping demo data, will use real backend data');
      disableDemoData();
      return;
    }

    // Enable demo data mode
    enableDemoData();

    // Load demo data into engagement panel
    const demoData = getDemoEngagementData();
    getEngagementUI().update(demoData);

    // Update badge counts from demo data
    const dueCount = demoData.ritualStreaks.filter((s) => s.dueToday).length;
    engagementTriggerUI.updateBadges({ ritualsdue: dueCount });

    // Load demo predictions
    const demoPredictions = getDemoPredictions();
    const pendingCount = demoPredictions.filter((p) => p.status === 'pending').length;
    engagementTriggerUI.updateBadges({ predictionsReady: pendingCount });

    getPredictionsUI().update({
      predictions: demoPredictions,
      accuracy: 78, // From demo data
      totalResolved: demoPredictions.filter((p) => p.status === 'resolved').length,
      currentStreak: 4,
    });

    log.debug('Demo engagement data loaded (development mode)');
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
        } else if (state === 'connected') {
          thinkingUI.hide();
          waveformUI.setThinking(false);
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
      },

      onAgentDisconnected: () => {
        messageUI.show('See you next time!', 'info', 2000);
        presenceUI.setSpeaking(false);
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
      },

      onAudioTrackEnd: (_participantId) => {
        // Agent stopped speaking
        waveformUI.setSpeaking(false);
        presenceUI.setSpeaking(false);
        setAudioState('listening');
        // Now we're listening for user input
        waveformUI.setListening(true);
      },

      onLocalMicActive: (isActive) => {
        // When user's mic is active, show listening state
        waveformUI.setListening(isActive);
        presenceUI.setListening(isActive);
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

      // 🎬 Pixar-style celebration on handoff
      const avatarContainer = document.querySelector('.avatar-container');
      if (avatarContainer instanceof HTMLElement) {
        void playPixarReaction(avatarContainer, 'joy', newPersona.id);
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
          // Play Pixar-style particle celebration
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
    microInteractionsUI.dispose(); // ✨ Clean up Pixar button effects
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
