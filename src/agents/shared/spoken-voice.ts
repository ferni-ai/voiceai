/**
 * The Cartesia voice a reply is spoken in.
 *
 * Built-in personas resolve their voice by persona id (getVoiceIdForPersona). Two
 * kinds of session resolve a different voice when the call starts (session-creator):
 * a custom agent speaks in the voice its owner picked, and a caller with a non-American
 * accent gets the persona's localized voice. The gateway TTS used to look up by persona
 * id only, so a custom agent fell back to Ferni's voice and localized voices were lost.
 *
 * With SESSION_OWN_VOICE=on, the voice resolved at call start wins while the session is
 * still speaking as that persona. A handoff or a roundtable line changes the persona id,
 * so a built-in teammate always keeps its own voice.
 */
import { getVoiceIdForPersona } from '../../config/voice-ids.js';
import { isCustomAgentId } from '../../services/custom-agent/custom-agent-ids.js';

/** The voice session-creator resolved for the persona the call started as. */
export interface SessionVoice {
  personaId: string;
  voiceId: string;
  localized: boolean;
}

export function sessionOwnVoiceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SESSION_OWN_VOICE === 'on';
}

export function asSessionVoice(value: unknown): SessionVoice | undefined {
  const v = value as Partial<SessionVoice> | undefined;
  if (!v || typeof v.personaId !== 'string' || typeof v.voiceId !== 'string' || !v.voiceId)
    return undefined;
  return { personaId: v.personaId, voiceId: v.voiceId, localized: v.localized === true };
}

export function spokenVoiceId(
  personaId: string,
  sessionVoice: SessionVoice | undefined,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (
    sessionOwnVoiceEnabled(env) &&
    sessionVoice?.personaId === personaId &&
    (sessionVoice.localized || isCustomAgentId(personaId))
  ) {
    return sessionVoice.voiceId;
  }
  return getVoiceIdForPersona(personaId);
}
