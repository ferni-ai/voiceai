/**
 * The slow-turn sound (slow-turn-sound.ts) on a live call's real signals.
 * Attached only with SLOW_TURN_SOUND on (live-call-behaviors.ts).
 *
 * @module agents/integrations/slow-turn-wiring
 */

import { getDJController } from '../../audio/dj-controller.js';
import { mayNeedTool } from '../model-provider/fast-lane.js';
import { noteTurnOpened } from '../personas/laugh-ledger.js';
import { crisisDecidedOn, crisisVerdictPending } from '../safety/crisis-gate-signal.js';
import { callerAsksToHangUp, callerSaysGoodbye, stayQuiet } from '../shared/call-farewell.js';
import { getCachedAudioForPersona } from '../shared/conversational-audio-cache.js';
import { onToolNamesRequested } from '../voice-agent/empty-response-watchdog.js';
import {
  holdReplyAudio,
  replyAudioSince,
  replyTextSince,
} from '../../speech/output-control/reply-activity.js';
import { noteOpeningSound, openingSoundAllowed, trackTurnSounds } from './opening-sound-ledger.js';
import { sessionIsGrave } from './presence-heavy.js';
import { attachSlowTurnSound, type SlowTurnDeps } from './slow-turn-sound.js';

type Clips = Pick<SlowTurnDeps, 'playClip' | 'lastPlayedAt'> & { wireDelayMs?: () => number };

export function musicPlaying(): boolean {
  try {
    return getDJController().isMusicActive();
  } catch {
    return false; // no DJ controller: no music
  }
}

export function attachSlowTurnSoundToCall(
  session: object,
  sessionId: string,
  clips: Clips,
  personaId: () => string
): () => void {
  const events = session as NodeJS.EventEmitter;
  trackTurnSounds(events);
  return attachSlowTurnSound(events, {
    playClip: clips.playClip,
    lastPlayedAt: clips.lastPlayedAt,
    replyStartedSince: (since) =>
      replyTextSince(sessionId, since) || replyAudioSince(sessionId, since),
    grave: () => crisisDecidedOn(session) || sessionIsGrave(session),
    crisisPending: () => crisisVerdictPending(session),
    stayQuiet: (words) =>
      stayQuiet(sessionId) ||
      musicPlaying() ||
      callerSaysGoodbye(words) ||
      callerAsksToHangUp(words),
    soundAllowed: () => openingSoundAllowed(session),
    mayNeedTool,
    onToolRequested: (listener) => onToolNamesRequested(session, listener),
    // The reply waits until the clip has played on the wire (24 kHz mono s16le: 48 bytes a ms).
    holdReply: (text) =>
      holdReplyAudio(
        sessionId,
        (getCachedAudioForPersona(text, personaId())?.byteLength ?? 0) / 48 +
          (clips.wireDelayMs?.() ?? 0)
      ),
    noteOpened: () => {
      noteOpeningSound(session, 'slow');
      noteTurnOpened(sessionId); // LAUGH_CAP: no laugh opening this reply too (laugh-ledger.ts)
    },
  });
}
