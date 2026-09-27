/**
 * Cartesia cascade provider: Cartesia STT -> Gemini text LLM (Vertex) -> Cartesia TTS.
 *
 * Why a cascade: Ferni speaks in Cartesia persona voices, so the LLM must emit
 * TEXT. The Gemini Live text-output model Ferni was built on
 * (gemini-2.0-flash-live-preview-04-09) is retired on Vertex, and the current
 * Gemini Live models (gemini-live-2.5-flash-native-audio, gemini-3.8-live) are
 * audio-output only and reject TEXT. A cascade keeps the persona voices and
 * lets STT, LLM and TTS be chosen and measured independently.
 *
 * LLM defaults were measured (2026-09-27, Vertex global, streaming,
 * voice-length reply): gemini-3.5-flash at MINIMAL thinking reached first
 * text in 0.7-0.9s; LOW took 1.4-1.9s. gemini-3.8-flash rejects MINIMAL, so
 * it is not the default.
 *
 * Credentials: Vertex via Application Default Credentials
 * (GOOGLE_APPLICATION_CREDENTIALS on LiveKit Cloud); Cartesia via
 * CARTESIA_API_KEY.
 *
 * @module agents/model-provider/cartesia-cascade
 */

import { ThinkingLevel } from '@google/genai';
import * as cartesia from '@livekit/agents-plugin-cartesia';
import * as google from '@livekit/agents-plugin-google';
import { createLogger } from '../../utils/safe-logger.js';
import type {
  AgentSessionTurnDetection,
  LLMModelConfig,
  ModelProvider,
  ModelProviderId,
  PromptModuleConfig,
} from './types.js';

const log = createLogger({ module: 'CartesiaCascadeProvider' });

type Env = Record<string, string | undefined>;

export interface CascadeLLMOptions {
  model: string;
  vertexai: true;
  project?: string;
  location: string;
  temperature?: number;
  thinkingConfig: { thinkingLevel: ThinkingLevel };
}

export interface CascadeSTTOptions {
  model: string;
  language: string;
}

/** LLM options for the cascade. Pure, so the defaults are pinned by tests. */
export function buildCascadeLLMOptions(
  env: Env = process.env,
  temperature?: number
): CascadeLLMOptions {
  return {
    model: env.CASCADE_LLM_MODEL || 'gemini-3.5-flash',
    vertexai: true,
    project: env.GOOGLE_CLOUD_PROJECT,
    location: env.CASCADE_LLM_LOCATION || 'global',
    temperature,
    // Gemini 3.x thinks by default and the hidden tokens delay the first word.
    // The plugin ignores thinkingBudget for Gemini 3; only the level applies.
    thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
  };
}

/** STT options for the cascade. ink-2 is Cartesia's English streaming model. */
export function buildCascadeSTTOptions(env: Env = process.env): CascadeSTTOptions {
  return {
    model: env.CASCADE_STT_MODEL || 'ink-2',
    language: env.CASCADE_STT_LANGUAGE || 'en',
  };
}

export class CartesiaCascadeProvider implements ModelProvider {
  readonly id: ModelProviderId = 'cartesia-cascade';
  readonly displayName = 'Cartesia Cascade (Cartesia STT + Gemini LLM + Cartesia TTS)';

  hasNativeFunctionCalling(): boolean {
    return true;
  }

  needsJsonWorkaround(): boolean {
    return false;
  }

  hasBuiltInTurnDetection(): boolean {
    return false;
  }

  getPromptModules(): PromptModuleConfig {
    return {
      includeFunctionCallingBase: false,
      includeFunctionCallingSpecialty: false,
      includeToolUsageGuidance: true,
      includeModelBaseInstructions: true,
      useMinimalInstructions: false,
      sparseSpeechMarkup: true,
      modelInstructionsInAgentPrompt: true,
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

  /**
   * The realtime model name in `config.model` does not apply to a text LLM and
   * is ignored; the cascade model comes from buildCascadeLLMOptions.
   */
  async createLLMModel(config: LLMModelConfig): Promise<unknown> {
    const opts = buildCascadeLLMOptions(process.env, config.temperature);
    log.info({ model: opts.model, location: opts.location }, 'Creating cascade Gemini text LLM');
    return new google.LLM(opts);
  }

  createSTT(): unknown {
    const opts = buildCascadeSTTOptions();
    log.info({ model: opts.model, language: opts.language }, 'Creating cascade Cartesia STT');
    return new cartesia.STT(opts);
  }

  getSessionTurnDetection(): AgentSessionTurnDetection {
    return 'vad';
  }

  needsPrewarm(): boolean {
    return false;
  }

  getLogPrefix(): string {
    return '🎛️';
  }
}

/**
 * STT for a provider that has no realtime model of its own. Returns the
 * cascade's Cartesia STT for cartesia-cascade and undefined for realtime
 * providers (their model transcribes internally). Used by both session
 * builders (voice-agent-entry and multi-agent) so a handoff keeps its STT.
 */
export function createProviderSTT(provider: { id: string }): unknown {
  return provider instanceof CartesiaCascadeProvider ? provider.createSTT() : undefined;
}
