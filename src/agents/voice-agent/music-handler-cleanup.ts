/**
 * Session teardown for the music handler (see music-handler.ts).
 *
 * @module voice-agent/music-handler-cleanup
 */

import { resetDJController, type DJController } from '../../audio/dj-controller.js';
import { resetDJTimingEngine } from '../../audio/dj-timing-engine.js';
import { clearMusicFeedbackRecorder } from '../../audio/music-feedback-manager.js';
import {
  isMusicPlayerOwnedBy,
  resetMusicPlayer,
  type CallMusicPlayer,
} from '../../audio/music-player.js';
import { clearMusicContext } from '../../audio/music-session-context.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'MusicHandler' });

/**
 * Build the cleanup for one session's music handler. Takes the controller and
 * player instances the session wired up, not fresh lookups.
 */
export function createMusicHandlerCleanup(
  sessionId: string,
  djController: DJController,
  musicPlayer: CallMusicPlayer
): () => void {
  return (): void => {
    log.info({ sessionId }, 'Cleaning up Music Handler');
    clearMusicContext(sessionId);

    // The player, DJ controller and timing engine are shared by the process.
    // If the next call already took them over, leave them alone (see
    // resetMusicPlayer).
    if (!isMusicPlayerOwnedBy(sessionId)) {
      log.info({ sessionId }, '🎵 Music now belongs to a newer session - skipping shared reset');
      return;
    }

    // Remove DJ Controller event listeners to prevent memory leaks
    djController.removeAllListeners('state_changed');
    djController.removeAllListeners('track_started');
    djController.removeAllListeners('should_speak_outro');
    djController.removeAllListeners('fading_started');
    djController.removeAllListeners('track_ended');
    djController.removeAllListeners('ducking_started');
    djController.removeAllListeners('ducking_ended');

    musicPlayer.setOnMusicStateChangeCallback(() => {});
    musicPlayer.setOnTrackEndedCallback(() => {});

    clearMusicFeedbackRecorder();
    resetDJController();
    resetDJTimingEngine();
    resetMusicPlayer(sessionId).catch((err) =>
      log.warn({ error: String(err) }, 'Music player reset failed during cleanup')
    );
  };
}
