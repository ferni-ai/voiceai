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
 * Selected with VOICE_PIPELINE=gemini-native-audio. Env:
 *   NATIVE_AUDIO_MODEL          default gemini-3.8-live
 *   NATIVE_AUDIO_LOCATION       default us-central1
 *   NATIVE_AUDIO_VOICE          prebuilt voice when no sample, default Puck
 *   NATIVE_AUDIO_VOICE_SAMPLE   path to raw PCM, 24kHz 16-bit mono, 10-20s. Make one with:
 *     ffmpeg -i sample.wav -ac 1 -ar 24000 -f s16le sample.pcm
 *
 * @module agents/model-provider/gemini-native-audio
 */

import { readFileSync } from 'node:fs';
import * as google from '@livekit/agents-plugin-google';
import { createLogger } from '../../utils/safe-logger.js';
import type {
  AgentSessionTurnDetection,
  LLMModelConfig,
  ModelProvider,
  ModelProviderId,
  PromptModuleConfig,
} from './types.js';

const log = createLogger({ module: 'GeminiNativeAudioProvider' });

type Env = Record<string, string | undefined>;

const SAMPLE_RATE = 24000;
const BYTES_PER_SECOND = SAMPLE_RATE * 2; // 16-bit mono
const MIN_SAMPLE_SECONDS = 10;
const MAX_SAMPLE_SECONDS = 20;

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

/**
 * Replicated-voice config from NATIVE_AUDIO_VOICE_SAMPLE, or undefined to use
 * a prebuilt voice. Throws on a sample Google would reject, so a bad file
 * fails at session start instead of silently changing the voice.
 */
export function buildNativeAudioVoiceConfig(
  env: Env = process.env,
  readFile: (path: string) => Buffer = readFileSync
): ReplicatedVoiceConfig | undefined {
  const path = env.NATIVE_AUDIO_VOICE_SAMPLE;
  if (!path) return undefined;
  if (!path.toLowerCase().endsWith('.pcm')) {
    throw new Error(
      `NATIVE_AUDIO_VOICE_SAMPLE must be raw PCM (.pcm, 24kHz 16-bit mono), got ${path}`
    );
  }
  const audio = readFile(path);
  const seconds = audio.length / BYTES_PER_SECOND;
  if (seconds < MIN_SAMPLE_SECONDS || seconds > MAX_SAMPLE_SECONDS) {
    throw new Error(
      `Voice sample must be 10-20s of 24kHz 16-bit mono PCM; ${path} is ${seconds.toFixed(1)}s`
    );
  }
  return {
    replicatedVoiceConfig: {
      voiceSampleAudio: audio.toString('base64'),
      mimeType: `audio/pcm;rate=${SAMPLE_RATE}`,
    },
  };
}

/** Options for the plugin's RealtimeModel. Pure apart from reading the sample. */
export function buildNativeAudioModelOptions(
  env: Env,
  instructions: string,
  temperature?: number
): NativeAudioModelOptions {
  return {
    model: env.NATIVE_AUDIO_MODEL || 'gemini-3.8-live',
    vertexai: true,
    project: env.GOOGLE_CLOUD_PROJECT,
    location: env.NATIVE_AUDIO_LOCATION || 'us-central1',
    modalities: ['AUDIO'],
    instructions,
    temperature,
    voice: env.NATIVE_AUDIO_VOICE || 'Puck',
    voiceConfig: buildNativeAudioVoiceConfig(env),
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
    const opts = buildNativeAudioModelOptions(
      process.env,
      config.instructions ?? '',
      config.temperature
    );
    log.info(
      {
        model: opts.model,
        location: opts.location,
        voice: opts.voiceConfig ? 'replicated' : opts.voice,
      },
      'Creating Gemini native-audio realtime model'
    );
    return new google.realtime.RealtimeModel(
      opts as unknown as ConstructorParameters<typeof google.realtime.RealtimeModel>[0]
    );
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
