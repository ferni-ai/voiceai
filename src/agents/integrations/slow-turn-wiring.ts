/**
 * Wires the slow-turn sound (slow-turn-sound.ts) into a live call: the clip
 * player, the reply's progress at TTS, the shared one-sound-per-turn ledger,
 * the crisis gate, the call's closing signals and the tool signal. Attached
 * only with SLOW_TURN_SOUND on (live-call-behaviors.ts).
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
import {
  callerTurnStartedAt,
  noteOpeningSound,
  openingDecidedSince,
  openingSoundAllowed,
  trackTurnSounds,
} from './opening-sound-ledger.js';
import { sessionIsGrave } from './presence-heavy.js';
import { attachSlowTurnSound } from './slow-turn-sound.js';
import { noteTurnOpenedBySound } from './turn-opening-sound.js';

interface Clips {
  playClip: (text: string) => boolean;
  lastPlayedAt: () => number;
  wireDelayMs?: () => number;
}

function musicPlaying(): boolean {
  try {
    return getDJController().isMusicActive();
  } catch {
    return false; // DJ controller not initialized: no music
  }
}

export function attachSlowTurnSoundToCall(
  session: object,
  sessionId: string,
  clips: Clips,
  personaId: () => string
): () => void {
  const events = session as Parameters<typeof attachSlowTurnSound>[0];
  trackTurnSounds(events);
  return attachSlowTurnSound(events, {
    playClip: clips.playClip,
    lastPlayedAt: clips.lastPlayedAt,
    replyStartedSince: (since) =>
      replyTextSince(sessionId, since) || replyAudioSince(sessionId, since),
    openingDecidedSince: (since) => openingDecidedSince(session, since),
    grave: () => crisisDecidedOn(session) || sessionIsGrave(session),
    crisisPending: () => crisisVerdictPending(session),
    // Never-silent's stayQuiet plus the caller's own goodbye or hang-up words.
    stayQuiet: (words) =>
      stayQuiet(sessionId) ||
      musicPlaying() ||
      callerSaysGoodbye(words) ||
      callerAsksToHangUp(words),
    soundAllowed: () => openingSoundAllowed(session),
    turnStartedAt: () => callerTurnStartedAt(session),
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
      noteTurnOpenedBySound(session);
      noteTurnOpened(sessionId); // LAUGH_CAP: no laugh opening this reply too (laugh-ledger.ts)
    },
  });
}
