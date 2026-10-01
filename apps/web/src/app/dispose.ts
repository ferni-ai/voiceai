/**
 * App Disposal
 *
 * Releases every service, UI module and tracked listener.
 */

import { circadianManager } from '../services/circadian-manager.js';
import { personaAura } from '../services/persona-aura.js';
import { visualStorytellingService } from '../services/visual-storytelling.service.js';
import { warmthManager } from '../services/warmth-manager.js';
import { audioService, connectionService, spotifyService } from '../services/index.js';
import { coachUI } from '../ui/coach.ui.js';
import { controlsUI } from '../ui/controls.ui.js';
import { messageUI } from '../ui/message.ui.js';
import { teamUI } from '../ui/team.ui.js';
import { waveformUI } from '../ui/waveform.ui.js';
import { celebrationsUI } from '../ui/celebrations.ui.js';
import { easterEggsUI } from '../ui/easter-eggs.ui.js';
import { gesturesUI } from '../ui/gestures.ui.js';
import { presenceUI } from '../ui/presence.ui.js';
import { rippleUI } from '../ui/ripple.ui.js';
import { soundUI } from '../ui/sound.ui.js';
import { dispose as disposeAmbientSounds } from '../services/ambient-sounds.service.js';
import { statsUI } from '../ui/stats.ui.js';
import { microInteractionsUI } from '../ui/micro-interactions.ui.js';
import { disposeMobileDelights } from '../ui/mobile-delights.ui.js';
import { disposeMobileBottomSheet } from '../ui/mobile-bottom-sheet.ui.js';
import { avatarFeedback } from '../ui/avatar-feedback.ui.js';
import { connectionQualityUI } from '../ui/connection-quality.ui.js';
import { moodUI } from '../ui/mood.ui.js';
import { thinkingUI } from '../ui/thinking.ui.js';
import { transcriptUI } from '../ui/transcript.ui.js';
import { dispose as disposeWeatherEffects } from '../ui/weather-effects.ui.js';
import { dispose as disposeFerniMoments } from '../ui/ferni-moments.ui.js';
import { dispose as disposeSidekicks } from '../ui/avatar-sidekicks.ui.js';
import { disposeUnifiedIndicator } from '../ui/unified-indicator.ui.js';
import { ferniExpressions } from '../ui/ferni-expressions.ui.js';
import { disposeLogoExpressions } from '../ui/logo-expressions.ui.js';
import { disposeFerniEQ } from '../ui/better-than-human.ui.js';
import { destroyTranscendentSystems } from '../systems/index.js';
import { disposeHumanizationBridge } from '../services/humanization-bridge.service.js';
import { disposeProactiveOutreachUI as disposeProactiveOutreach } from '../ui/proactive-outreach.ui.js';
import { disposeTeamInsightsUI } from '../ui/team-insights.ui.js';
import { disposeCrossTeamNotifications } from '../services/cross-team-notifications.service.js';
import { disposeVoiceEvents } from '../services/voice-events.service.js';
import { disposeAvatarSoul } from '../ui/avatar-soul.ui.js';
import { disposeAvatarLamp } from '../ui/avatar-lamp.ui.js';
import { disposeAmbientLife } from '../ui/ambient-life.ui.js';
import { disposeSpeechEventDispatcher } from '../services/speech-event-dispatcher.js';
import { disposeMoodContext } from '../services/mood-context.service.js';
import { resetMusicAudioController } from '../services/music-audio.controller.js';
import { appRuntime } from './app-runtime-state.js';
import { removeTrackedListeners } from './init-helpers.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('App');

/**
 * Clean up resources.
 */
export function disposeApp(): void {
  // Clean up audio
  if (appRuntime.audioCleanup) {
    appRuntime.audioCleanup();
    appRuntime.audioCleanup = null;
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
  import('../ui/insights-debug-panel.ui.js')
    .then(({ disposeInsightsDebugPanel }) => disposeInsightsDebugPanel())
    .catch(() => {
      /* ignore if not loaded */
    });
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
  const removed = removeTrackedListeners();
  log.debug(`Cleaned up ${removed} tracked event listeners`);

  appRuntime.isInitialized = false;
}
