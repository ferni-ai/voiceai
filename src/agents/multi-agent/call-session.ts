/**
 * The call's voice session: VAD, STT, turn handling and the AgentSession itself.
 *
 * Built once per call. With single-session handoffs (persona-swap.ts), a persona
 * swapped in later joins this session instead of building one of its own.
 */
import { voice } from '@livekit/agents';
import { loadWorldFactsForCall } from '../../intelligence/world-model/temporal/in-call-load.js';
import type { PersonaConfig } from '../../personas/types.js';
import { SonataSTT } from '../../speech/providers/sonata-stt-adapter.js';
import type { SessionServices } from '../../services/types.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  buildCascadeKeyterms,
  createProviderSTT,
  getModelProvider,
} from '../model-provider/index.js';
import { watchAgentState } from '../shared/loop-watch.js';
import { routeSayThroughModel } from '../shared/native-speech.js';
import { limitSessionListeners } from '../shared/session-listener-limit.js';
import { endpointingDelays, sessionTurnDetection } from '../shared/turn-patience.js';
import type { UserData } from '../shared/types.js';
import { interruptionOverrides, phoneInterruptTuningOn } from './interruption-config.js';
import { logBargeInDecisions } from './live-call-behaviors.js';
import { watchPhoneAudio } from './phone-audio-summary.js';
import { preemptiveGenerationOverrides } from './preemptive-tts.js';
import {
  installPersonaSpeakingAttribute,
  type PersonaAttributeRoom,
} from './persona-speaking-attribute.js';
import type { createPersonaTTS } from './persona-tts.js';

const log = getLogger();

export interface CallSessionParts {
  persona: PersonaConfig;
  sessionId: string;
  services: SessionServices;
  userData: UserData;
  /** The caller's account, when known: their world facts load for the call (WORLD_FACTS_IN_CALL). */
  userId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  llmModel: any;
  tts: Awaited<ReturnType<typeof createPersonaTTS>>;
  /** A phone (SIP) caller: the STT may take narrowband settings (PHONE_AUDIO_MODE). */
  phone?: boolean;
  room?: PersonaAttributeRoom; // the agent's persona attributes go on it
}

export async function createCallSession(
  parts: CallSessionParts
): Promise<voice.AgentSession<UserData>> {
  const { persona, sessionId, services, userData, llmModel, tts, phone } = parts;
  // WORLD_FACTS_IN_CALL=on: where their life stands now, read once per call while
  // the session is built; each turn's request picks from it (turn-request.ts).
  void loadWorldFactsForCall(userData, parts.userId);
  const modelProvider = getModelProvider();

  // =========================================================================
  // VAD CONFIGURATION (Always-On)
  // =========================================================================
  // Silero VAD is loaded for ALL LLM backends to enable sub-100ms barge-in.
  // Without VAD, Gemini mode relies on server-side STT turn detection which
  // adds 200-300ms before interruption fires. With VAD, the LiveKit SDK
  // detects speech at the audio level (~30-50ms) and auto-interrupts.
  //
  // DISABLE_VAD=true is an escape hatch to disable if issues arise.
  // See: https://docs.livekit.io/agents/voice-agent/interruptions/
  // =========================================================================
  const DISABLE_VAD = process.env.DISABLE_VAD === 'true';
  let vad: Awaited<ReturnType<typeof import('@livekit/agents-plugin-silero').VAD.load>> | undefined;

  if (!DISABLE_VAD) {
    try {
      const vadLoadStart = Date.now();
      const { VAD } = await import('@livekit/agents-plugin-silero');
      // 350 ms of silence ends the caller's speech (Silero's default is 550).
      // The barge-in fast path reads speech length from these state changes;
      // with 550 ms a 0.45 s "uh-huh" looked like a second of talk-over.
      vad = await VAD.load({ minSilenceDuration: Number(process.env.VAD_MIN_SILENCE_MS) || 350 });
      log.info(
        {
          personaId: persona.id,
          loadTimeMs: Date.now() - vadLoadStart,
          reason: 'always-on',
        },
        '🎙️ Silero VAD loaded (always-on)'
      );
    } catch (vadErr) {
      log.warn(
        { error: String(vadErr), personaId: persona.id },
        '⚠️ VAD load failed - barge-in will fall back to transcript-based detection'
      );
    }
  } else {
    log.info({ personaId: persona.id }, '🎙️ VAD disabled by DISABLE_VAD env var');
  }

  // Create voice session
  // Turn detection: Provider-specific (Gemini uses 'realtime_llm', OpenAI uses undefined + VAD)
  // TTS: Sonata TTS for persona voice
  // STT: Sonata STT (USE_SONATA_STT=true) or LLM-internal
  // VAD: Always-on for sub-100ms barge-in (DISABLE_VAD=true to opt out)

  const useSonataStt = process.env.USE_SONATA_STT === 'true';
  const externalStt = useSonataStt
    ? new SonataSTT({
        hfRepo: process.env.SONATA_STT_HF_REPO,
        enableVad: process.env.SONATA_STT_ENABLE_VAD !== 'false',
      })
    : (createProviderSTT(
        modelProvider,
        buildCascadeKeyterms({
          userName: (services.userProfile?.preferredName ||
            services.userProfile?.name ||
            userData?.userName) as string | undefined,
        }),
        { phone: phone === true }
      ) as InstanceType<typeof SonataSTT> | undefined);

  const session = new voice.AgentSession<UserData>({
    turnDetection: sessionTurnDetection(
      modelProvider.getSessionTurnDetection(),
      process.env,
      vad !== undefined
    ),
    vad, // Silero VAD for turn detection (required for OpenAI to support allowInterruptions: false)
    ...(externalStt && { stt: externalStt }),
    llm: llmModel,
    tts, // Cartesia TTS for both (OpenAI text-only mode outputs text)
    userData,
    // Barge-in vs "mm-hmm": see interruption-config.ts. Overrides voiceOptions.
    // PREEMPTIVE_TTS=on also synthesizes the preemptive reply (preemptive-tts.ts).
    // PHONE_INTERRUPT_TUNING=on: phone callers need more audio to pause Ferni.
    turnHandling: {
      interruption: interruptionOverrides(process.env, { phone }),
      ...preemptiveGenerationOverrides(),
    },
    // Not dead: the SDK still takes the endpointing delays and the interruption
    // duration (and minWords under INTERRUPTION_MODE=vad) from here.
    voiceOptions: {
      allowInterruptions: true,
      ...endpointingDelays(), // waits through thinking pauses: see turn-patience.ts
      minInterruptionWords: 1,
      minInterruptionDuration: 150, // Was 200ms - faster interrupt detection
      preemptiveGeneration: true,
    },
  });
  limitSessionListeners(session); // ~16 features watch agent_state_changed

  logBargeInDecisions(session, sessionId);
  // PHONE_AUDIO_SUMMARY at call end: the phone audio A/B reads it.
  if (phone === true) watchPhoneAudio(session, sessionId, phoneInterruptTuningOn(phone));
  // LOOP_STALL lines say whether Ferni was speaking (loop-watch.ts).
  watchAgentState(session);
  installPersonaSpeakingAttribute(session, parts.room, userData); // the app's name chip

  // Gemini native audio speaks for itself: scripted say() lines must come from
  // the model too, or the call alternates between Gemini's and Cartesia's voice.
  if (modelProvider.speaksNatively?.()) {
    routeSayThroughModel(session as unknown as Parameters<typeof routeSayThroughModel>[0]);
  }

  return session;
}
