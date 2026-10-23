/**
 * Wires the slow-turn sound (slow-turn-sound.ts) into a live call: the clip
 * player, the reply's progress at TTS, the crisis gate and the tool signal.
 * Attached only with SLOW_TURN_SOUND on (live-call-behaviors.ts).
 *
 * @module agents/integrations/slow-turn-wiring
 */

import { mayNeedTool } from '../model-provider/fast-lane.js';
import { noteTurnOpened } from '../personas/laugh-ledger.js';
import { crisisDecidedOn, crisisVerdictPending } from '../safety/crisis-gate-signal.js';
import { getCachedAudioForPersona } from '../shared/conversational-audio-cache.js';
import { onToolCallRequested } from '../voice-agent/empty-response-watchdog.js';
import {
  holdReplyAudio,
  replyAudioSince,
  replyTextSince,
} from '../../speech/output-control/reply-activity.js';
import { sessionIsGrave } from './presence-heavy.js';
import { attachSlowTurnSound } from './slow-turn-sound.js';
import { noteTurnOpenedBySound } from './turn-opening-sound.js';

interface Clips {
  playClip: (text: string) => boolean;
  lastPlayedAt: () => number;
  wireDelayMs?: () => number;
}

export function attachSlowTurnSoundToCall(
  session: object,
  sessionId: string,
  clips: Clips,
  personaId: () => string
): () => void {
  return attachSlowTurnSound(session as Parameters<typeof attachSlowTurnSound>[0], {
    playClip: clips.playClip,
    lastPlayedAt: clips.lastPlayedAt,
    replyStartedSince: (since) =>
      replyTextSince(sessionId, since) || replyAudioSince(sessionId, since),
    grave: () => crisisDecidedOn(session) || sessionIsGrave(session),
    crisisPending: () => crisisVerdictPending(session),
    mayNeedTool,
    onToolRequested: (listener) => onToolCallRequested(session, listener),
    // The reply waits until the clip has played on the wire (24 kHz mono s16le: 48 bytes a ms).
    holdReply: (text) =>
      holdReplyAudio(
        sessionId,
        (getCachedAudioForPersona(text, personaId())?.byteLength ?? 0) / 48 +
          (clips.wireDelayMs?.() ?? 0)
      ),
    noteOpened: () => {
      noteTurnOpenedBySound(session);
      noteTurnOpened(sessionId); // LAUGH_CAP: no laugh opening this reply too (laugh-ledger.ts)
    },
  });
}
