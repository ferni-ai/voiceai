/**
 * Connection Callbacks
 *
 * Reacts to LiveKit connection events: agent presence, audio tracks,
 * music ducking, mic activity and errors (with one automatic reconnect).
 */

import { appState, setAudioState } from '../state/app.state.js';
import { audioService, connectionService } from '../services/index.js';
import { coachUI } from '../ui/coach.ui.js';
import { expressiveEyes } from '../ui/expressive-eyes.ui.js';
import { messageUI } from '../ui/message.ui.js';
import { waveformUI } from '../ui/waveform.ui.js';
import { presenceUI } from '../ui/presence.ui.js';
import { soundUI } from '../ui/sound.ui.js';
import { statsUI } from '../ui/stats.ui.js';
import { avatarFeedback } from '../ui/avatar-feedback.ui.js';
import { connectionQualityUI } from '../ui/connection-quality.ui.js';
import { thinkingUI } from '../ui/thinking.ui.js';
import { ferniExpressions } from '../ui/ferni-expressions.ui.js';
import {
  dispatchAgentSpeechEnd,
  dispatchAgentSpeechStart,
  dispatchThinking,
  dispatchUserSpeechEnd,
  dispatchUserSpeechStart,
} from '../services/speech-event-dispatcher.js';
import { playBeat, updateNarrativeContext } from '../narrative/narrative-director.js';
import { getMusicAudioController } from '../services/music-audio.controller.js';
import { handleDataMessage } from '../app/data-message-handlers.js';
import { appRuntime } from './app-runtime-state.js';
import type { AppHost } from './app-host.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('App');

/**
 * Wire connection service callbacks to the UI.
 */
export function setupConnectionCallbacks(host: AppHost): void {
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
        appRuntime.autoReconnectAttempted = false;
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
        personaId: persona.id as 'ferni' | 'jack' | 'peter' | 'alex' | 'maya' | 'jordan' | 'nayan',
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
      void attachAudioVisualization(audioElement, mediaStreamTrack);
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
          const { nowPlayingUI } = await import('../ui/now-playing.ui.js');
          const { waveformUI } = await import('../ui/waveform.ui.js');

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
      thinkingUI.hide();
      waveformUI.setThinking(false);

      // Prefer one automatic reconnect with backoff, then honest copy + tap-to-retry
      if (!appRuntime.autoReconnectAttempted) {
        appRuntime.autoReconnectAttempted = true;
        messageUI.show('Something went wrong. Reconnecting...', 'info');
        const backoffMs = 1000;
        setTimeout(() => {
          void host.connect().catch((reconnectErr) => {
            // connect() already shows an honest error; log here for diagnostics
            log.error('Auto-reconnect failed:', reconnectErr);
          });
        }, backoffMs);
        return;
      }

      messageUI.show("Couldn't connect. Tap to try again?", 'error');
    },
  });
}

/**
 * Attach audio visualization to an audio element or track.
 * Uses MediaStreamTrack for better WebRTC support, falls back to audio element.
 */
async function attachAudioVisualization(
  audioElement: HTMLAudioElement,
  mediaStreamTrack?: MediaStreamTrack
): Promise<void> {
  log.info('🎚️ attachAudioVisualization called', {
    hasMediaStreamTrack: !!mediaStreamTrack,
    trackId: mediaStreamTrack?.id,
    trackReadyState: mediaStreamTrack?.readyState,
    hadPreviousCleanup: !!appRuntime.audioCleanup,
  });

  // Clean up previous
  if (appRuntime.audioCleanup) {
    log.debug('🧹 Cleaning up previous audio visualization');
    appRuntime.audioCleanup();
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
    appRuntime.audioCleanup = await audioService.attachVisualization(
      mediaStreamTrack,
      volumeCallback
    );
  } else {
    log.debug('📻 Using audio element for visualization');
    appRuntime.audioCleanup = audioService.attachAudioElementVisualization(
      audioElement,
      volumeCallback
    );
  }
  log.info('✅ Audio visualization attached successfully');
}
