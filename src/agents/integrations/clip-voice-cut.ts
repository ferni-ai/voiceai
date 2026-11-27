/**
 * The caller's VAD says they started talking: take back a clip still in its first
 * CANCEL_WINDOW_MS (direct-clip-track.ts), and note why. startDirectClips binds it to the
 * session's UserStateChanged event.
 *
 * @module agents/integrations/clip-voice-cut
 */
import { createLogger } from '../../utils/safe-logger.js';
import { noteClipCut } from '../shared/call-timeline.js';
import { noteBackchannelCancelled } from './backchannel-played.js';

// Same module tag as before this moved out of direct-clip-track.ts, so CLIP_CANCELLED queries hold.
const log = createLogger({ module: 'DirectClipTrack' });

export function cutFreshClipOnVoice(
  session: object,
  track: { cancelIfFresh(): boolean },
  ev: { newState?: string }
): void {
  if (ev.newState !== 'speaking' || !track.cancelIfFresh()) return;
  log.info({ by: 'vad' }, 'CLIP_CANCELLED');
  noteClipCut(session, 'vad');
  noteBackchannelCancelled(session, 'vad');
}
