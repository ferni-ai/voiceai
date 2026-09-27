/**
 * Gemini native-audio provider: Gemini Live hears, thinks and SPEAKS.
 *
 * Unlike the cascade (Cartesia STT -> Gemini text -> Cartesia TTS), the model
 * produces the audio itself, so there is no separate STT or TTS and turn
 * detection is the model's own. Current Gemini Live models are audio-output
 * only (gemini-3.8-live rejects TEXT), which is why this is its own path.
 *
 * Custom voice: Gemini Live can replicate a voice from a 10-20s sample
 * (speech_config.voice_config.replicated_voice_config). LiveKit's Google
 * plugin hard-codes the prebuilt voice, so this relies on
 * patches/@livekit__agents-plugin-google@1.5.1.patch, which adds a
 * `voiceConfig` option. Replicated voices are allowlisted by Google ("select
 * customers") and require consent and rights for the sample.
 *
 * Each persona speaks with a voice replicated from its own Cartesia voice (see
 * replicated-voice.ts). If the project is not allowlisted, or no sample can be
 * made, the persona uses a prebuilt voice instead of failing the call.
 *
 * Selected with VOICE_PIPELINE=gemini-native-audio. Env:
 *   NATIVE_AUDIO_PROJECT        GCP project allowlisted for replicated voices
 *                               (default GOOGLE_CLOUD_PROJECT)
 *   NATIVE_AUDIO_MODEL          default gemini-3.8-live
 *   NATIVE_AUDIO_LOCATION       default us-central1 (3.8 Live is not served in global)
 *   NATIVE_AUDIO_VOICE          prebuilt fallback voice, default Puck
 *   NATIVE_AUDIO_VOICE_SAMPLE_<PERSONA> / NATIVE_AUDIO_VOICE_SAMPLE
 *                               optional hand-recorded sample, raw 24kHz s16le PCM, 10-20s
 *
 * @module agents/model-provider/gemini-native-audio
 */

import * as google from '@livekit/agents-plugin-google';
import { createLogger } from '../../utils/safe-logger.js';
import {
  REPLICATED_VOICE_MIME,
  getPersonaVoiceSample,
  isReplicatedVoiceAllowed,
} from './replicated-voice.js';
import type {
  AgentSessionTurnDetection,
  LLMModelConfig,
  ModelProvider,
  ModelProviderId,
  PromptModuleConfig,
} from './types.js';

const log = createLogger({ module: 'GeminiNativeAudioProvider' });

type Env = Record<string, string | undefined>;

export interface ReplicatedVoiceConfig {
  replicatedVoiceConfig: { voiceSampleAudio: string; mimeType: string };
}

export interface NativeAudioModelOptions {
  model: string;
  vertexai: true;
  project?: string;
  location: string;
  modalities: ['AUDIO'];
  instructions: string;
  temperature?: number;
  voice: string;
  voiceConfig?: ReplicatedVoiceConfig;
  inputAudioTranscription: Record<string, never>;
  outputAudioTranscription: Record<string, never>;
}

/** Wrap a PCM sample in the Live API's replicated voice config. */
export function toReplicatedVoiceConfig(sample: Buffer): ReplicatedVoiceConfig {
  return {
    replicatedVoiceConfig: {
      voiceSampleAudio: sample.toString('base64'),
      mimeType: REPLICATED_VOICE_MIME,
    },
  };
}

/** Options for the plugin's RealtimeModel. Pure. */
export function buildNativeAudioModelOptions(
  env: Env,
  instructions: string,
  temperature?: number,
  voiceConfig?: ReplicatedVoiceConfig
): NativeAudioModelOptions {
  return {
    model: env.NATIVE_AUDIO_MODEL || 'gemini-3.8-live',
    vertexai: true,
    project: env.NATIVE_AUDIO_PROJECT || env.GOOGLE_CLOUD_PROJECT,
    location: env.NATIVE_AUDIO_LOCATION || 'us-central1',
    modalities: ['AUDIO'],
    instructions,
    temperature,
    voice: env.NATIVE_AUDIO_VOICE || 'Puck',
    voiceConfig,
    // Keep transcripts flowing: crisis shadow, per-turn metrics and memory read them.
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
}

export class GeminiNativeAudioProvider implements ModelProvider {
  readonly id: ModelProviderId = 'gemini-native-audio';
  readonly displayName = 'Gemini Native Audio (Gemini Live speaks, optional replicated voice)';

  hasNativeFunctionCalling(): boolean {
    return true;
  }

  needsJsonWorkaround(): boolean {
    return false;
  }

  hasBuiltInTurnDetection(): boolean {
    return true;
  }

  getPromptModules(): PromptModuleConfig {
    return {
      includeFunctionCallingBase: false,
      includeFunctionCallingSpecialty: false,
      includeToolUsageGuidance: true,
      includeModelBaseInstructions: true,
      useMinimalInstructions: false,
      // Gemini Live speaks for itself; Cartesia markup would be read aloud.
      includeSpeechMarkup: false,
    };
  }

  getTokenLimit(): number {
    return 32768;
  }

  getMinimalInstructions(): string {
    return [
      'You are a caring AI companion with superhuman emotional intelligence.',
      'Keep responses conversational and under 2 sentences for voice.',
      'Be present, warm, and genuinely supportive.',
    ].join('\n');
  }

  async createLLMModel(config: LLMModelConfig): Promise<unknown> {
    const personaId = config.personaId ?? 'ferni';
    const base = buildNativeAudioModelOptions(process.env, config.instructions ?? '', config.temperature);
    const voiceConfig = await this.resolveVoiceConfig(personaId, base);
    const opts = voiceConfig ? { ...base, voiceConfig } : base;
    log.info(
      {
        personaId,
        model: opts.model,
        project: opts.project,
        location: opts.location,
        voice: voiceConfig ? 'replicated' : opts.voice,
      },
      'Creating Gemini native-audio realtime model'
    );
    return new google.realtime.RealtimeModel(
      opts as unknown as ConstructorParameters<typeof google.realtime.RealtimeModel>[0]
    );
  }

  /**
   * The persona's replicated voice, or undefined for the prebuilt voice when no
   * sample can be made or the project is not allowlisted (Google would close
   * the session at setup with 1007).
   */
  private async resolveVoiceConfig(
    personaId: string,
    opts: NativeAudioModelOptions
  ): Promise<ReplicatedVoiceConfig | undefined> {
    const sample = await getPersonaVoiceSample(personaId);
    if (!sample || !opts.project) return undefined;
    const allowed = await isReplicatedVoiceAllowed({
      project: opts.project,
      location: opts.location,
      model: opts.model,
      sample,
    });
    if (!allowed) {
      log.warn(
        { personaId, project: opts.project },
        'Replicated voice not available for this project; using the prebuilt voice'
      );
      return undefined;
    }
    return toReplicatedVoiceConfig(sample);
  }

  getSessionTurnDetection(): AgentSessionTurnDetection {
    return 'realtime_llm';
  }

  needsPrewarm(): boolean {
    return false;
  }

  getLogPrefix(): string {
    return '🗣️';
  }
}
