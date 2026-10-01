/**
 * Disconnect Flow
 *
 * Ending a call: the goodbye ceremony when the agent wrapped up, the
 * standard disconnect sequence, and microphone mute.
 */

import { appState, setAudioState, setWrappingUp } from '../state/app.state.js';
import { delightService } from '../services/delight.service.js';
import {
  connectionService,
  handoffService,
  moodService,
  spotifyService,
} from '../services/index.js';
import { controlsUI } from '../ui/controls.ui.js';
import { expressiveEyes } from '../ui/expressive-eyes.ui.js';
import { messageUI } from '../ui/message.ui.js';
import { waveformUI } from '../ui/waveform.ui.js';
import { refreshProactiveMessages } from '../ui/proactive-messages.ui.js';
import { presenceUI } from '../ui/presence.ui.js';
import { soundUI } from '../ui/sound.ui.js';
import { statsUI } from '../ui/stats.ui.js';
import { connectionQualityUI } from '../ui/connection-quality.ui.js';
import { transcriptUI } from '../ui/transcript.ui.js';
import { engagementTriggerUI } from '../ui/engagement-trigger.ui.js';
import { destroyGameBoard } from '../ui/game-board.ui.js';
import { conversationTracker } from '../services/conversation-tracker.service.js';
import { modalCoordinator } from '../services/modal-coordinator.service.js';
import { appRuntime } from './app-runtime-state.js';
import { recordConversationUsage } from './subscription-gating.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('App');

const DIRECTOR_TRIGGER_ID = 'directorConsoleTrigger';

function hideDirectorTriggerButton(): void {
  const el = document.getElementById(DIRECTOR_TRIGGER_ID);
  if (el) el.style.display = 'none';
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
export async function disconnectFromCoach(): Promise<void> {
  // A second tap / conversation-end event would count and bill the call twice
  if (appRuntime.isDisconnecting) return;
  appRuntime.isDisconnecting = true;

  try {
    const isWrappingUp = appState.get('isWrappingUp');

    // 🌅 GOODBYE CEREMONY - When agent has said goodbye, make it magical
    if (isWrappingUp) {
      await performGoodbyeCeremony();
    } else {
      // Standard disconnect (abrupt end - user didn't say goodbye)
      await performStandardDisconnect();
    }
  } finally {
    appRuntime.isDisconnecting = false;
  }
}

/**
 * 🌅 Perform the magical goodbye ceremony.
 *
 * This is the "Better than Human" moment - making goodbye feel meaningful.
 * Per sonic identity: "That was meaningful" feeling.
 */
async function performGoodbyeCeremony(): Promise<void> {
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
  await performStandardDisconnect(true); // true = skip disconnect sound

  // Step 9: 💰 Show conversation cost transparency ("tip jar")
  // Give the user a moment to settle, then show the cost card
  setTimeout(async () => {
    try {
      const { showConversationCost } = await import('../ui/conversation-cost.ui.js');
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
async function performStandardDisconnect(skipSound = false): Promise<void> {
  // Stop waveform visualization
  waveformUI.stop();

  // Clean up audio visualization
  if (appRuntime.audioCleanup) {
    appRuntime.audioCleanup();
    appRuntime.audioCleanup = null;
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

  // Disconnect from LiveKit first so the mic and agent stop immediately,
  // not after the network calls below
  await connectionService.disconnect();

  // 📝 End conversation tracking and persist
  await conversationTracker.endSession();

  // 💰 Record conversation usage for subscription tracking
  // (statsUI.endSession() already cleared startTime, so pass the duration)
  await recordConversationUsage(durationMinutes);

  // Pause Spotify if playing
  await spotifyService.pause();

  hideDirectorTriggerButton();

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

  // Next call starts unmuted (connect() enables the mic)
  appState.set('isMuted', false);

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
export function toggleMicrophoneMute(): void {
  const room = connectionService.getRoom();
  if (!room) return;

  const currentMuted = appState.get('isMuted');
  const newMuted = !currentMuted;

  // Toggle local audio track
  void room.localParticipant?.setMicrophoneEnabled(!newMuted);
  appState.set('isMuted', newMuted);

  messageUI.show(newMuted ? "I'll wait quietly" : "I'm listening", 'info', 1500);
}
