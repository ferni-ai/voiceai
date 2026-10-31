/**
 * Which caller frames reach the session's SpeakerChangeDetector.
 *
 * While Ferni speaks, the caller's track carries Ferni's own voice leaking
 * back from speakers or a speakerphone, and that voice is no voice print of
 * the caller. Compared with the caller's reference it reads as "someone else",
 * which put the web's "Someone new?" prompt in front of callers who were alone.
 * With SPEAKER_CHECK_STRICT on (the default), those frames, and the
 * AGENT_SPEECH_TAIL_MS after Ferni stops (the room's echo dies away), are not
 * fed at all. Off (the kill switch): every frame is fed, as before.
 *
 * "Ferni is speaking" is the agent state the session-state handler records
 * (response-orchestrator isAgentSpeaking, userData.lastAgentSpeechEndTime).
 *
 * @module agents/voice-agent/speaker-change-feed
 */

import { speakerCheckStrict } from '../../services/voice/speaker-change-evidence.js';
import { getSpeakerChangeDetector } from '../../services/voice/voice-speaker-change.js';
import { convertI16ToF32 } from '../../speech/audio-prosody/native-analyzer.js';
import { isAgentSpeaking } from '../shared/response-orchestrator.js';
import type { UserData } from '../shared/types.js';

/** After Ferni stops, the caller's track is still ignored this long. */
export const AGENT_SPEECH_TAIL_MS = 600;

/** True while Ferni is speaking, or stopped less than AGENT_SPEECH_TAIL_MS ago. */
function agentAudibleOnCallerTrack(
  sessionId: string,
  userData: Pick<UserData, 'lastAgentSpeechEndTime'> | undefined,
  now = Date.now()
): boolean {
  if (isAgentSpeaking(sessionId)) return true;
  const endedAt = userData?.lastAgentSpeechEndTime;
  return endedAt !== undefined && now - endedAt < AGENT_SPEECH_TAIL_MS;
}

function int16ToFloat32(samples: Int16Array): Float32Array {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] / 32768.0;
  return out;
}

/**
 * Feed one caller frame to the session's detector unless Ferni is audible
 * (strict). Returns whether it was fed.
 */
export function feedSpeakerChangeDetector(
  sessionId: string,
  samples: Int16Array,
  nativeAudio: boolean,
  userData?: Pick<UserData, 'lastAgentSpeechEndTime'>,
  now = Date.now()
): boolean {
  if (speakerCheckStrict() && agentAudibleOnCallerTrack(sessionId, userData, now)) return false;
  try {
    const audio = nativeAudio ? convertI16ToF32(samples) : int16ToFloat32(samples);
    getSpeakerChangeDetector(sessionId).feedAudio(audio);
  } catch {
    // Detector not initialized, or the native conversion is unavailable
  }
  return true;
}
