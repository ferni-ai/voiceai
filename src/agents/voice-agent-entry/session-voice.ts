/**
 * The voice a single-agent session starts in (session-creator.ts).
 *
 * A caller with a non-American accent gets the persona's localized voice. A live
 * custom agent (CUSTOM_AGENT_LIVE, agents/shared/custom-agent-live.ts) is never
 * localized: localization looks the voice up by persona id, which for an agent id
 * is Ferni's, so the agent would speak in a localized Ferni instead of its own.
 *
 * @module agents/voice-agent-entry/session-voice
 */

import type { EnglishAccent } from '../../config/voice-accents.js';
import type { PersonaConfig, VoiceConfig } from '../../personas/types.js';
import { isLiveCustomAgent } from '../shared/custom-agent-live.js';

export interface SessionVoice {
  voiceConfig: VoiceConfig;
  effectiveVoiceId: string;
  isLocalizedVoice: boolean;
}

export async function resolveSessionVoice(
  sessionPersona: PersonaConfig,
  userAccent: string | null
): Promise<SessionVoice> {
  const { getDefaultVoiceConfig } = await import('../../config/cartesia-config.js');
  const defaultVoice = getDefaultVoiceConfig();
  const voiceConfig = sessionPersona.voice || defaultVoice;
  let effectiveVoiceId = voiceConfig.voiceId;
  let isLocalizedVoice = false;

  if (userAccent && userAccent !== 'american' && !isLiveCustomAgent(sessionPersona)) {
    try {
      const { getLocalizedVoiceId } =
        await import('../../services/voice/cartesia-voice-localization.js');
      const localizationResult = await getLocalizedVoiceId(
        sessionPersona.id,
        userAccent as EnglishAccent
      );
      effectiveVoiceId = localizationResult.voiceId;
      isLocalizedVoice = localizationResult.isLocalized;
      process.stderr.write(
        `[voice-agent-entry] 🌍 Voice localized: ${userAccent ? 'yes' : 'no'} (cached: ${localizationResult.cached})\n`
      );
    } catch (locErr) {
      process.stderr.write(
        `[voice-agent-entry] Voice localization failed (non-fatal): ${locErr}\n`
      );
    }
  }
  return { voiceConfig, effectiveVoiceId, isLocalizedVoice };
}
