/**
 * Deferred UI Initialization
 *
 * Premium and decorative features loaded after first paint, each on
 * its own delay. Dynamic imports keep them in lazy chunks.
 */

import { appState } from '../state/app.state.js';
import { devPanelMayEnable } from '../ui/dev-panel-gate.js';
import { connectionService } from '../services/index.js';
import { messageUI } from '../ui/message.ui.js';
import { initSoundUI, soundUI } from '../ui/sound.ui.js';
import { avatarFeedback, initAvatarFeedback } from '../ui/avatar-feedback.ui.js';
import { initConnectionQualityUI } from '../ui/connection-quality.ui.js';
import { initMoodUI } from '../ui/mood.ui.js';
import { initThinkingUI } from '../ui/thinking.ui.js';
import { initTranscriptUI } from '../ui/transcript.ui.js';
import { addTrackedListener, deferredInit } from './init-helpers.js';
import type { AppHost } from './app-host.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('App');

/**
 * Schedule the deferred feature modules.
 */
export function initDeferredUI(host: AppHost): void {
  // =========================================================================
  // DEFERRED LOADING - Premium features loaded after first paint
  // This significantly speeds up initial page load time
  // =========================================================================

  // Essential extras - load after 100ms (needed early but not for first paint)
  deferredInit('SoundUI', 100, async () => {
    initSoundUI();
  });
  deferredInit('TranscriptUI', 100, async () => {
    initTranscriptUI();
  });
  deferredInit('ThinkingUI', 100, async () => {
    initThinkingUI();
  });
  deferredInit('ConnectionQualityUI', 100, async () => {
    initConnectionQualityUI();
  });
  deferredInit('MoodUI', 100, async () => {
    initMoodUI();
  });
  deferredInit('AvatarFeedback', 100, async () => {
    initAvatarFeedback();
  });

  // Premium features - load after 300ms (nice to have)
  deferredInit('AmbientSounds', 300, async () => {
    const { initAmbientSounds } = await import('../services/ambient-sounds.service.js');
    initAmbientSounds();
  });
  deferredInit('BrandService', 300, async () => {
    const { initBrandService } = await import('../services/brand-service.js');
    initBrandService();
  });
  deferredInit('CelebrationsUI', 300, async () => {
    const { initCelebrationsUI } = await import('../ui/celebrations.ui.js');
    initCelebrationsUI();
  });
  // 📊 Contextual Feedback - avatar-attached feedback during natural pauses
  deferredInit('ContextualFeedbackUI', 300, async () => {
    const { initContextualFeedbackUI } = await import('../ui/contextual-feedback.ui.js');
    initContextualFeedbackUI();
  });
  // 📊 Feedback Insights Panel - user reflection on conversation patterns
  deferredInit('FeedbackInsightsPanel', 300, async () => {
    const { initFeedbackInsightsPanel } = await import('../ui/feedback-insights-panel.ui.js');
    initFeedbackInsightsPanel();
  });
  // 📜 Music History - slide-out drawer showing recently played tracks
  deferredInit('MusicHistoryUI', 300, async () => {
    const { initMusicHistoryUI } = await import('../ui/music-history.ui.js');
    initMusicHistoryUI();
  });
  // 🔖 Bookmark - double-tap avatar to save moments
  deferredInit('BookmarkUI', 300, async () => {
    const { initBookmarkUI } = await import('../ui/bookmark.ui.js');
    initBookmarkUI();
  });
  // 🔥 Streak - DISABLED: Now consolidated into Connection Heart indicator
  // The connection heart shows both streak (top-left fire badge) and milestones (bottom-right)
  // Opening Journey modal shows full stats including streak, milestones, and relationship stage
  // deferredInit('StreakUI', 300, async () => {
  //   const { initStreakUI } = await import('../ui/streak.ui.js');
  //   initStreakUI();
  // });
  deferredInit('StatsUI', 300, async () => {
    const { initStatsUI } = await import('../ui/stats.ui.js');
    initStatsUI();
  });
  deferredInit('PresenceUI', 300, async () => {
    const { initPresenceUI } = await import('../ui/presence.ui.js');
    initPresenceUI();
  });
  deferredInit('RippleUI', 300, async () => {
    const { initRippleUI } = await import('../ui/ripple.ui.js');
    initRippleUI();
  });
  deferredInit('MicroInteractionsUI', 300, async () => {
    const { initMicroInteractions } = await import('../ui/micro-interactions.ui.js');
    initMicroInteractions();
  });
  deferredInit('EasterEggsUI', 500, async () => {
    const { initEasterEggsUI } = await import('../ui/easter-eggs.ui.js');
    initEasterEggsUI();
  });
  // 🎂 Ferni Birthday - special celebration on June 15
  deferredInit('FerniBirthdayUI', 500, async () => {
    const { initFerniBirthdayUI } = await import('../ui/ferni-birthday.ui.js');
    initFerniBirthdayUI();
  });
  // 🎨 Mood Backgrounds - subtle color shifts based on emotional mood
  deferredInit('MoodBackgroundsUI', 200, async () => {
    const { initMoodBackgroundsUI } = await import('../ui/mood-backgrounds.ui.js');
    initMoodBackgroundsUI();
  });
  // 👆 Avatar Tap Reactions - tap avatar for laugh/wink reactions
  deferredInit('AvatarTapReactionsUI', 400, async () => {
    const { initAvatarTapReactionsUI } = await import('../ui/avatar-tap-reactions.ui.js');
    initAvatarTapReactionsUI();
  });
  // 😴 Sleep Mode - gentle resting animation when idle
  deferredInit('SleepModeUI', 1000, async () => {
    const { initSleepModeUI } = await import('../ui/sleep-mode.ui.js');
    initSleepModeUI();
  });
  // 📸 Memory Lane - "On This Day" memories and highlights
  deferredInit('MemoryLaneUI', 500, async () => {
    const { initMemoryLaneUI } = await import('../ui/memory-lane.ui.js');
    initMemoryLaneUI();
  });
  // 📊 Pattern Insights - behavioral patterns visualization
  deferredInit('PatternInsightsUI', 600, async () => {
    const { initPatternInsightsUI } = await import('../ui/pattern-insights.ui.js');
    initPatternInsightsUI();
  });
  // 💭 Check-in Badge - shows when Ferni is thinking of you
  deferredInit('CheckinBadgeUI', 700, async () => {
    const { initCheckinBadgeUI } = await import('../ui/checkin-badge.ui.js');
    initCheckinBadgeUI();

    // Listen for check-in acknowledgment to start conversation with context
    // FIX: Use tracked listener to prevent memory leak
    addTrackedListener(window, 'ferni:checkin-acknowledged', ((
      event: CustomEvent<{ checkinId: string; message: string; type: string }>
    ) => {
      const { message, type } = event.detail;
      log.info(
        { type, message: message.slice(0, 50) },
        '💭 Check-in acknowledged, starting conversation'
      );

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
        void host.connect();
      }
    }) as EventListener);
  });
  // 🧠 Knowledge Quiz - "How Well Do You Know Me?" game
  deferredInit('KnowledgeQuizUI', 800, async () => {
    const { initKnowledgeQuizUI } = await import('../ui/knowledge-quiz.ui.js');
    initKnowledgeQuizUI();
  });
  // 📔 Growth Journal - auto-generated reflections on your journey
  deferredInit('GrowthJournalUI', 900, async () => {
    const { initGrowthJournalUI } = await import('../ui/growth-journal.ui.js');
    initGrowthJournalUI();
  });

  // Relationship features - load after 400ms
  deferredInit('YourPeopleUI', 400, async () => {
    const { initYourPeopleUI } = await import('../ui/your-people.ui.js');
    initYourPeopleUI();
  });

  // 📱 Mobile features - load after 200ms on mobile only
  if (window.innerWidth <= 768) {
    deferredInit('MobileDelights', 200, async () => {
      const { initMobileDelights } = await import('../ui/mobile-delights.ui.js');
      const { gesturesUI } = await import('../ui/gestures.ui.js');
      initMobileDelights({
        onConnectRequest: () => {
          const state = appState.get('connection');
          if (state === 'disconnected' || state === 'error') {
            void host.connect();
          }
        },
        onPersonaSwipe: (direction) => {
          const persona =
            direction === 'left' ? gesturesUI.getNextPersona() : gesturesUI.getPreviousPersona();
          host.selectPersona(persona);
          soundUI.play('switch');
        },
      });
    });
    deferredInit('MobileBottomSheet', 200, async () => {
      const { initMobileBottomSheet } = await import('../ui/mobile-bottom-sheet.ui.js');
      initMobileBottomSheet();
    });
  }

  // 🌨️ Weather Effects - load after 1 second (purely decorative)
  deferredInit('WeatherEffects', 1000, async () => {
    const { initWeatherEffects } = await import('../ui/weather-effects.ui.js');
    initWeatherEffects();
  });

  // 🎭 Ferni Moments - load after 500ms
  deferredInit('FerniMoments', 500, async () => {
    const { initFerniMoments } = await import('../ui/ferni-moments.ui.js');
    initFerniMoments();
  });

  // 🤲 Avatar Sidekicks - load after 550ms (expressive side icons)
  deferredInit('AvatarSidekicks', 550, async () => {
    const { avatarSidekicks } = await import('../ui/avatar-sidekicks.ui.js');
    avatarSidekicks.init();
  });

  // 🎉 Ferni Milestones - load after 600ms
  deferredInit('FerniMilestones', 600, async () => {
    const { initFerniMilestones } = await import('../ui/ferni-milestones.ui.js');
    initFerniMilestones();
  });

  // 💚 Unified Indicator - load after 200ms (single smart avatar badge)
  deferredInit('UnifiedIndicator', 200, async () => {
    const { initUnifiedIndicator } = await import('../ui/unified-indicator.ui.js');
    initUnifiedIndicator();
  });

  // 🎬 Ferni Expressions - load after 300ms
  deferredInit('FerniExpressions', 300, async () => {
    const { initFerniExpressions } = await import('../ui/ferni-expressions.ui.js');
    initFerniExpressions();
  });

  // 🔗 Emotion ↔ Expression Bridge - load after 400ms
  deferredInit('EmotionExpressionBridge', 400, async () => {
    const { enableEmotionExpressionBridge } =
      await import('../emotion/emotion-expression-bridge.js');
    enableEmotionExpressionBridge();
  });

  // 🎨 Logo Expressions - load after 400ms
  deferredInit('LogoExpressions', 400, async () => {
    const { initLogoExpressions, hookIntoAvatarFeedback } =
      await import('../ui/logo-expressions.ui.js');
    initLogoExpressions();
    hookIntoAvatarFeedback();
  });

  // 🎉 Celebration Service - load after 600ms
  deferredInit('CelebrationService', 600, async () => {
    const { initCelebrationService } = await import('../services/celebration.service.js');
    initCelebrationService();
  });

  // 🎤 Speech Event Dispatcher - load after 300ms (needed before FerniEQ)
  deferredInit('SpeechEventDispatcher', 300, async () => {
    const { initSpeechEventDispatcher } = await import('../services/speech-event-dispatcher.js');
    initSpeechEventDispatcher();
  });

  // 🚀 Ferni EQ - load after 500ms (depends on SpeechEventDispatcher)
  deferredInit('FerniEQ', 500, async () => {
    const { initFerniEQ } = await import('../ui/better-than-human.ui.js');
    const { initHumanizationBridge } = await import('../services/humanization-bridge.service.js');
    const { initProactiveOutreachUI } = await import('../ui/proactive-outreach.ui.js');
    const { initTeamInsightsUI } = await import('../ui/team-insights.ui.js');
    const { initCrossTeamNotifications } =
      await import('../services/cross-team-notifications.service.js');
    const { initVoiceEvents } = await import('../services/voice-events.service.js');

    initFerniEQ();
    initHumanizationBridge();
    initProactiveOutreachUI();
    initTeamInsightsUI();

    // 🌟 Transcendent Animation Systems - Initialize signature moments
    // This must come after FerniEQ and HumanizationBridge
    const { initTranscendentSystems: initTS } = await import('../systems/index.js');
    initTS();

    // Initialize cross-team notifications with userId if available
    const userId = appState.get('deviceId');
    if (userId) {
      initCrossTeamNotifications(userId);
      initVoiceEvents(userId);
    }

    // Set up gentle check-in handler for significant concern detection
    addTrackedListener(document, 'ferni:gentle-checkin', ((e: CustomEvent) => {
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
  deferredInit('AvatarSoul', 600, async () => {
    const { initAvatarSoul, avatarSoul } = await import('../ui/avatar-soul.ui.js');
    initAvatarSoul();
    addTrackedListener(document, 'ferni:conversation-turn', () => {
      avatarSoul.recordInteraction(0.5);
    });
  });

  // 🎬 Avatar Lamp - load after 700ms
  deferredInit('AvatarLamp', 700, async () => {
    const { initAvatarLamp, avatarLamp } = await import('../ui/avatar-lamp.ui.js');
    initAvatarLamp();
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__avatarLamp = avatarLamp;
    }
  });

  // 🌿 Ambient Life - load after 800ms
  deferredInit('AmbientLife', 800, async () => {
    const { initAmbientLife } = await import('../ui/ambient-life.ui.js');
    initAmbientLife();
  });

  // 🌅 Mood Context - load after 400ms
  deferredInit('MoodContext', 400, async () => {
    const { initMoodContext } = await import('../services/mood-context.service.js');
    initMoodContext();
  });

  // 🎬 Animation Orchestrator - load after 500ms
  deferredInit('AnimationOrchestrator', 500, async () => {
    const { initAnimationOrchestrator } = await import('../ui/animation-orchestrator.ui.js');
    initAnimationOrchestrator();
  });

  // 🌟 Soul System - load after 600ms
  deferredInit('Soul', 600, async () => {
    const { initSoul } = await import('../ui/soul.ui.js');
    void initSoul({
      showFirstLaunch: false,
      enablePersonaMagic: true,
    });
  });

  // 🎭 Ritual Engine - load after 700ms
  deferredInit('RitualEngine', 700, async () => {
    const { wireRitualEngineToApp, getRitualEngine } =
      await import('../services/ritual-engine.service.js');
    wireRitualEngineToApp();
    void getRitualEngine().initialize();
  });

  // 🛠️ Dev Panel - load after 1 second
  // Only where it can turn on: production visitors skip its large chunk
  deferredInit('DevPanel', 1000, async () => {
    if (!devPanelMayEnable()) return;
    const { initDevPanel } = await import('../ui/dev-panel.ui.js');
    initDevPanel();
  });

  // 🔍 Debug Panels - load after 1.5 seconds
  deferredInit('DebugPanels', 1500, async () => {
    const [{ initInsightsDebugPanel }, { initTriggerDebugPanel }] = await Promise.all([
      import('../ui/insights-debug-panel.ui.js'),
      import('../ui/trigger-debug-panel.ui.js'),
    ]);
    initInsightsDebugPanel();
    initTriggerDebugPanel();
  });

  // 📔 Journaling - load after 800ms
  deferredInit('Journaling', 800, async () => {
    const [{ initJournalingShortcut }, { initJournalCapture }] = await Promise.all([
      import('../ui/digital-twin.ui.js'),
      import('../services/journal-capture.service.js'),
    ]);
    initJournalingShortcut();
    initJournalCapture();
  });
}
