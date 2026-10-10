/**
 * What the DJ controller hears when the music player's state changes.
 *
 * The controller's state_changed is what reaches the app (music_state). A resume replays
 * the paused track, so the player reports 'playing' for the same track; that was only
 * forwarded for a NEW track, so after a resume the controller stayed 'paused' and the app
 * was never told the music was playing again.
 */
import type { DJCommand, DJControllerState } from '../../audio/dj-controller.js';
import type { MusicState, MusicTrack } from '../../audio/music-player.js';

export function djCommandFor(
  state: MusicState,
  track: MusicTrack | null,
  isAmbient: boolean,
  controller: Pick<DJControllerState, 'state' | 'currentTrack'>
): DJCommand | null {
  switch (state) {
    case 'playing': {
      if (!track) return null;
      const sameTrack = controller.currentTrack?.name === track.name;
      if (sameTrack && controller.state === 'paused') return { type: 'RESUME' };
      // The same track coming back up after a duck is not a new track: forwarding it
      // made track_started, then DJ speech, then a duck, in a loop
      if (sameTrack) return null;
      return { type: 'PLAY_TRACK', track, isAmbient };
    }
    case 'stopped':
      return { type: 'STOP' };
    case 'paused':
      return { type: 'PAUSE' };
    case 'fading':
      return { type: 'TRACK_NEAR_END' };
    default:
      return null;
  }
}
