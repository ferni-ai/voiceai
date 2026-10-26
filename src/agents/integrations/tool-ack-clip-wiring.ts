/**
 * TOOL_ACK_CLIP (tool-ack-clip.ts) on a live call's real signals, with the sound
 * paths' own gates (crisis gate, crisis risk, grave, heavy, minor-care, goodbyes,
 * music). Attached only with the flag on (live-call-behaviors.ts).
 *
 * @module agents/integrations/tool-ack-clip-wiring
 */

import { voice, type llm } from '@livekit/agents';
import { getVoiceIdForPersona } from '../../config/voice-ids.js';
import { crisisRiskNoted } from '../../services/safety/crisis-call-risk.js';
import { isCustomAgentId } from '../../services/custom-agent/custom-agent-ids.js';
import { likelyMinor } from '../../utils/minor-care.js';
import { noteTurnOpened } from '../personas/laugh-ledger.js';
import { askedForTool } from '../personas/tool-ack-clip-lines.js';
import { crisisDecidedOn, crisisVerdictPending } from '../safety/crisis-gate-signal.js';
import { callerAsksToHangUp, callerSaysGoodbye, stayQuiet } from '../shared/call-farewell.js';
import { getCachedAudioForPersona } from '../shared/conversational-audio-cache.js';
import { asSessionVoice, spokenVoiceId, type SessionVoice } from '../shared/spoken-voice.js';
import {
  holdReplyAudio,
  replyAudioSince,
  replyTextSince,
} from '../../speech/output-control/reply-activity.js';
import { noteOpeningSound, openingSoundThisTurn, trackTurnSounds } from './opening-sound-ledger.js';
import { presenceSilenceIsHeavy, sessionIsGrave } from './presence-heavy.js';
import { musicPlaying } from './slow-turn-wiring.js';
import { attachToolAckClip } from './tool-ack-clip.js';

const FERNI_IDS: ReadonlySet<string> = new Set(['ferni', 'jack-b', 'coach', 'life-coach']);

/** The clip voice is the reply's: no custom agent, localized voice or fallback to Ferni's. */
export function clipVoiceIsOwn(
  personaId: string,
  sessionVoice: SessionVoice | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!personaId || isCustomAgentId(personaId)) return false;
  const clipVoice = getVoiceIdForPersona(personaId);
  if (!clipVoice || spokenVoiceId(personaId, sessionVoice, env) !== clipVoice) return false;
  return FERNI_IDS.has(personaId.toLowerCase()) || clipVoice !== getVoiceIdForPersona('ferni');
}

/** Why this call gets no acknowledgement now, or null. */
export function ackSilencedBy(session: object, sessionId: string): string | null {
  if (crisisDecidedOn(session) || crisisRiskNoted(sessionId)) return 'crisis';
  if (likelyMinor(sessionId)) return 'minor';
  if (sessionIsGrave(session)) return 'grave';
  return presenceSilenceIsHeavy(session) ? 'heavy' : null;
}

/** Each tool the SDK starts executing on any reply (the tool-hum.ts pattern). */
function onToolStarted(events: NodeJS.EventEmitter, listener: (name: string) => void): () => void {
  const onSpeech = (ev: voice.SpeechCreatedEvent): void => {
    const handle = ev.speechHandle;
    const onItem = (item: llm.ChatItem): void => {
      if (item.type === 'function_call') listener(item.name);
    };
    handle._addItemAddedCallback(onItem);
    handle.addDoneCallback(() => handle._removeItemAddedCallback(onItem));
  };
  events.on(voice.AgentSessionEventTypes.SpeechCreated, onSpeech);
  return () => events.off(voice.AgentSessionEventTypes.SpeechCreated, onSpeech);
}

interface Clips {
  playClip: (text: string) => boolean;
  wireDelayMs?: () => number;
}

export function attachToolAckClipToCall(
  session: object,
  sessionId: string,
  clips: Clips,
  personaId: () => string
): () => void {
  const events = session as NodeJS.EventEmitter;
  trackTurnSounds(events);
  const userData = () => (session as { userData?: { sessionVoice?: unknown } }).userData;
  const clip = (text: string): ArrayBuffer | null =>
    clipVoiceIsOwn(personaId(), asSessionVoice(userData()?.sessionVoice))
      ? getCachedAudioForPersona(text, personaId())
      : null;
  return attachToolAckClip(events, {
    onToolStarted: (listener) => onToolStarted(events, listener),
    asked: (words) => askedForTool(words),
    clipReady: (text) => clip(text) !== null,
    playClip: clips.playClip,
    // The reply waits until the clip has played on the wire (24 kHz mono s16le: 48 bytes a ms).
    holdReply: (text) =>
      holdReplyAudio(sessionId, (clip(text)?.byteLength ?? 0) / 48 + (clips.wireDelayMs?.() ?? 0)),
    replyStartedSince: (since) =>
      replyTextSince(sessionId, since) || replyAudioSince(sessionId, since),
    silencedBy: () => ackSilencedBy(session, sessionId),
    crisisPending: () => crisisVerdictPending(session),
    stayQuiet: (words) =>
      stayQuiet(sessionId) ||
      musicPlaying() ||
      callerSaysGoodbye(words) ||
      callerAsksToHangUp(words),
    soundThisTurn: () => openingSoundThisTurn(session),
    noteOpened: () => {
      noteOpeningSound(session, 'tool');
      noteTurnOpened(sessionId); // LAUGH_CAP: the answer does not open with a laugh too
    },
  });
}
