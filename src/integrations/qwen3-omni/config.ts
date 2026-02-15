/**
 * Qwen3-Omni Configuration
 *
 * Environment-based configuration for Qwen3-Omni (Thinker) + Qwen3-TTS integration.
 */

import { VOICE_IDS } from '../../config/voice-ids.js';
import { createLogger } from '../../utils/safe-logger.js';
import type { Qwen3OmniConfig, Qwen3OmniModel, VoiceCloneConfig } from './types.js';

const log = createLogger({ module: 'Qwen3OmniConfig' });

// =============================================================================
// ENVIRONMENT CONFIGURATION
// =============================================================================

/**
 * Check if Qwen3-Omni integration is enabled
 */
export function isQwen3OmniEnabled(): boolean {
  return process.env.USE_QWEN3_OMNI === 'true';
}

/**
 * Check if Qwen3-Omni should run in text-only mode (no STT/TTS/audio).
 * Used for stress testing and headless runs.
 */
export function isQwen3OmniTextOnly(): boolean {
  return process.env.QWEN3_OMNI_TEXT_ONLY === 'true';
}

/**
 * Get Qwen3-Omni configuration from environment
 */
export function getQwen3OmniConfig(): Qwen3OmniConfig {
  const serverHost = process.env.QWEN3_OMNI_HOST || 'localhost';
  const serverPort = process.env.QWEN3_OMNI_PORT || '8000';
  const ttsHost = process.env.QWEN3_TTS_HOST || serverHost;
  const ttsPort = process.env.QWEN3_TTS_PORT || '8001';

  return {
    serverUrl: process.env.QWEN3_OMNI_URL || `http://${serverHost}:${serverPort}`,
    ttsServerUrl: process.env.QWEN3_TTS_URL || `http://${ttsHost}:${ttsPort}`,
    model: (process.env.QWEN3_OMNI_MODEL || 'Qwen3-Omni') as Qwen3OmniModel,
    debug: process.env.QWEN3_OMNI_DEBUG === 'true',
    connectionTimeoutMs: parseInt(process.env.QWEN3_OMNI_TIMEOUT_MS || '30000', 10),
    sampleRate: parseInt(process.env.QWEN3_OMNI_SAMPLE_RATE || '24000', 10),
    enableFunctionCalling: process.env.QWEN3_OMNI_FUNCTION_CALLING !== 'false',
    maxTokens: parseInt(process.env.QWEN3_OMNI_MAX_TOKENS || '4096', 10),
    temperature: parseFloat(process.env.QWEN3_OMNI_TEMPERATURE || '0.7'),
    topP: parseFloat(process.env.QWEN3_OMNI_TOP_P || '0.9'),
    quantization:
      (process.env.QWEN3_OMNI_QUANTIZATION as 'none' | 'int4' | 'int8' | 'gptq') || 'int4',
    textOnly: process.env.QWEN3_OMNI_TEXT_ONLY === 'true',
  };
}

// =============================================================================
// VOICE CLONE CONFIGURATION
// =============================================================================

/**
 * Sample text used to generate reference audio from Cartesia for voice cloning.
 * Should be ~3 seconds of natural speech covering persona voice characteristics.
 * Qwen3-TTS only needs 3 seconds for rapid cloning.
 */
const VOICE_CLONE_REFERENCE_TEXT = `
Hello, it's wonderful to connect with you today. I've been thinking about how meaningful 
our conversations are, and I want you to know that I'm here to support you.
`.trim();

/**
 * Voice clone configurations for each persona.
 * Maps Ferni personas to Qwen3-TTS voice clones.
 */
export const VOICE_CLONE_CONFIGS: VoiceCloneConfig[] = [
  {
    personaId: 'ferni',
    cartesiaVoiceId: VOICE_IDS.FERNI,
    referenceAudioPath: 'voice-clones/ferni-ref.wav',
    referenceTranscript: VOICE_CLONE_REFERENCE_TEXT,
    cacheFilename: 'ferni-clone.json',
    voiceDesignDescription:
      'Male, 30 years old, warm baritone, friendly and grounded, like a caring life coach who genuinely listens',
  },
  {
    personaId: 'maya-santos',
    cartesiaVoiceId: VOICE_IDS.MAYA_SANTOS,
    referenceAudioPath: 'voice-clones/maya-ref.wav',
    referenceTranscript: VOICE_CLONE_REFERENCE_TEXT,
    cacheFilename: 'maya-clone.json',
    voiceDesignDescription:
      'Female, 28 years old, alto range, encouraging and energetic, like a personal trainer who motivates with warmth',
  },
  {
    personaId: 'alex-chen',
    cartesiaVoiceId: VOICE_IDS.ALEX_CHEN,
    referenceAudioPath: 'voice-clones/alex-ref.wav',
    referenceTranscript: VOICE_CLONE_REFERENCE_TEXT,
    cacheFilename: 'alex-clone.json',
    voiceDesignDescription:
      'Female, 32 years old, clear and articulate mezzo-soprano, professional yet warm, like a trusted communications advisor',
  },
  {
    personaId: 'peter-john',
    cartesiaVoiceId: VOICE_IDS.PETER_JOHN,
    referenceAudioPath: 'voice-clones/peter-ref.wav',
    referenceTranscript: VOICE_CLONE_REFERENCE_TEXT,
    cacheFilename: 'peter-clone.json',
    voiceDesignDescription:
      'Male, 45 years old, deep tenor, thoughtful and measured, like an Ivy League professor explaining complex topics simply',
  },
  {
    personaId: 'jordan-taylor',
    cartesiaVoiceId: VOICE_IDS.JORDAN_TAYLOR,
    referenceAudioPath: 'voice-clones/jordan-ref.wav',
    referenceTranscript: VOICE_CLONE_REFERENCE_TEXT,
    cacheFilename: 'jordan-clone.json',
    voiceDesignDescription:
      'Female, 26 years old, bright soprano, enthusiastic and organized, like a creative wedding planner full of ideas',
  },
  {
    personaId: 'nayan-patel',
    cartesiaVoiceId: VOICE_IDS.NAYAN_PATEL,
    referenceAudioPath: 'voice-clones/nayan-ref.wav',
    referenceTranscript: VOICE_CLONE_REFERENCE_TEXT,
    cacheFilename: 'nayan-clone.json',
    voiceDesignDescription:
      'Male, 60 years old, deep bass-baritone, wise and serene, like an Indian philosopher sharing ancient wisdom with modern relevance',
  },
  {
    personaId: 'joel-dickson',
    cartesiaVoiceId: VOICE_IDS.JOEL_DICKSON,
    referenceAudioPath: 'voice-clones/joel-ref.wav',
    referenceTranscript: VOICE_CLONE_REFERENCE_TEXT,
    cacheFilename: 'joel-clone.json',
    voiceDesignDescription:
      'Male, 55 years old, warm tenor, authoritative yet approachable, like a seasoned mentor sharing life lessons',
  },
  {
    personaId: 'peter-lynch',
    cartesiaVoiceId: VOICE_IDS.PETER_LYNCH,
    referenceAudioPath: 'voice-clones/lynch-ref.wav',
    referenceTranscript: VOICE_CLONE_REFERENCE_TEXT,
    cacheFilename: 'lynch-clone.json',
    voiceDesignDescription:
      'Male, 50 years old, energetic tenor, charismatic and witty, like a Wall Street legend telling stories over dinner',
  },
  {
    personaId: 'john-bogle',
    cartesiaVoiceId: VOICE_IDS.JOHN_BOGLE,
    referenceAudioPath: 'voice-clones/bogle-ref.wav',
    referenceTranscript: VOICE_CLONE_REFERENCE_TEXT,
    cacheFilename: 'bogle-clone.json',
    voiceDesignDescription:
      'Male, 70 years old, deep resonant bass, principled and steady, like a financial statesman imparting timeless wisdom',
  },
];

/**
 * Get voice clone config for a persona
 */
export function getVoiceCloneConfig(personaId: string): VoiceCloneConfig | undefined {
  const normalized = personaId.toLowerCase();
  return VOICE_CLONE_CONFIGS.find(
    (config) => config.personaId === normalized || config.personaId.startsWith(normalized)
  );
}

/**
 * Get the emotion instruction for Qwen3-TTS based on current emotional context.
 * Qwen3-TTS supports natural language emotion/tone instructions via `instruct` param.
 */
export function getEmotionInstruction(
  userEmotion: string,
  agentTone: string,
  energy: number
): string {
  const emotionInstructions: Record<string, string> = {
    happy: 'Warm, genuine happiness with a smile in the voice',
    excited: 'Energetic and enthusiastic, matching excitement with bright delivery',
    sad: 'Soft, gentle compassion with a slower, careful pace',
    anxious: 'Calm, steady, and grounding, like a safe harbor',
    angry: 'Patient and measured, acknowledging without escalating',
    frustrated: 'Understanding and validating, steady tone',
    confused: 'Clear, reassuring, slightly slower for clarity',
    fearful: 'Soothing and protective, warm and safe',
    neutral: 'Warm and present, natural conversational tone',
    hopeful: 'Encouraging and uplifting, reflecting hope back',
    grateful: 'Gracious and warm, receiving gratitude sincerely',
    vulnerable: 'Extra gentle, accepting, creating safety with voice',
    overwhelmed: 'Very slow and calm, a peaceful presence',
    lonely: 'Deep warmth and connection, you are not alone energy',
    grief: 'Quiet, holding compassion, minimal words but maximum presence',
  };

  const base = emotionInstructions[userEmotion] || emotionInstructions.neutral;

  // Adjust for energy level
  const energyModifier =
    energy > 0.7 ? ', with higher energy' : energy < 0.3 ? ', with very gentle, low energy' : '';

  return `${base}${energyModifier}`;
}

// =============================================================================
// PLATFORM DETECTION & INFERENCE BACKEND
// =============================================================================

export type InferenceBackend = 'candle' | 'vllm' | 'mlx';

/**
 * Detect the best inference backend for the current platform.
 * - In-repo: Candle (Rust) — default on all platforms; no Python in repo.
 * - External: vLLM (Linux/multi-GPU) or MLX (Mac, best Apple Silicon perf) when you run a server and set BACKEND.
 * - Env override: QWEN3_OMNI_BACKEND=candle|vllm|mlx
 */
export function getInferenceBackend(): InferenceBackend {
  const override = process.env.QWEN3_OMNI_BACKEND as InferenceBackend | undefined;
  if (override && ['candle', 'vllm', 'mlx'].includes(override)) {
    return override;
  }

  // Default: Candle (Rust, in-repo). vLLM/MLX only when explicitly set (external servers).
  if (process.env.QWEN3_OMNI_VLLM === 'true') return 'vllm';
  if (process.env.QWEN3_OMNI_MLX === 'true' && process.platform === 'darwin') return 'mlx';
  return 'candle';
}

/** Default weight cache directories per backend. MLX/vLLM = external servers; dirs for docs/local cache. */
const WEIGHT_DIRS: Record<InferenceBackend, string[]> = {
  candle: [
    process.env.CANDLE_WEIGHT_PATH || '',
    process.env.QWEN3_OMNI_WEIGHT_PATH || '',
    `${process.env.HOME || '~'}/.cache/candle-qwen3-omni`,
    `${process.env.HOME || '~'}/.cache/huggingface/hub/models--Qwen--Qwen3-Omni`,
  ],
  vllm: [
    process.env.VLLM_WEIGHT_PATH || '',
    `${process.env.HOME || '~'}/.cache/huggingface/hub/models--Qwen--Qwen3-Omni`,
  ],
  mlx: [
    process.env.MLX_WEIGHT_PATH || '',
    process.env.QWEN3_OMNI_WEIGHT_PATH || '',
    `${process.env.HOME || '~'}/.cache/rust-mlx-omni`,
    `${process.env.HOME || '~'}/.cache/huggingface/hub/models--Qwen--Qwen3-Omni`,
  ],
};

/**
 * Resolve the model weight path with a fallback chain.
 * Checks env var override first, then standard cache dirs.
 * Returns the first directory that exists, or the primary default.
 */
export function getModelWeightPath(backend?: InferenceBackend): string {
  const effectiveBackend = backend ?? getInferenceBackend();

  // Explicit env var override takes priority
  const explicitPath = process.env.QWEN3_OMNI_WEIGHT_PATH;
  if (explicitPath) {
    return explicitPath;
  }

  const candidates = WEIGHT_DIRS[effectiveBackend].filter(Boolean);

  // In Node we can check sync — but to avoid fs import overhead at module level,
  // we do a lazy check. The caller can use validateModelWeights() for thorough checks.
  try {
    const fs = require('fs');
    for (const dir of candidates) {
      if (fs.existsSync(dir)) {
        return dir;
      }
    }
  } catch {
    // fs not available (edge runtime), return first candidate
  }

  // Return the primary cache dir as default (will be created on first download)
  return candidates[0] || `${process.env.HOME || '~'}/.cache/${effectiveBackend}-qwen3-omni`;
}

/**
 * Validate that model weights exist and log clear errors if missing.
 * Call at startup to surface configuration issues early.
 */
export async function validateModelWeights(backend?: InferenceBackend): Promise<{
  valid: boolean;
  backend: InferenceBackend;
  weightPath: string;
  errors: string[];
}> {
  const effectiveBackend = backend ?? getInferenceBackend();
  const weightPath = getModelWeightPath(effectiveBackend);
  const errors: string[] = [];

  try {
    const fs = await import('fs');

    if (!fs.existsSync(weightPath)) {
      errors.push(`Weight directory not found: ${weightPath}`);
      errors.push(`Run weight download for ${effectiveBackend} backend first.`);

      if (effectiveBackend === 'candle') {
        errors.push(
          '  → huggingface-cli download Qwen/Qwen3-Omni (safetensors load directly in Rust)'
        );
      } else if (effectiveBackend === 'mlx') {
        errors.push(
          '  → Point QWEN3_OMNI_URL at your MLX server (external; best Apple Silicon perf). No Python in this repo.'
        );
      } else {
        errors.push('  → huggingface-cli download Qwen/Qwen3-Omni');
      }
    } else {
      // Check for key files based on backend (mlx = external server, no local files required)
      const expectedFiles: Record<InferenceBackend, string[]> = {
        candle: ['config.json', 'model.safetensors.index.json'],
        vllm: ['config.json'],
        mlx: [],
      };

      const missing = expectedFiles[effectiveBackend].filter(
        (f) => !fs.existsSync(`${weightPath}/${f}`)
      );

      if (missing.length > 0) {
        errors.push(`Missing weight files in ${weightPath}: ${missing.join(', ')}`);
      }
    }
  } catch {
    errors.push('Could not access filesystem to validate weights');
  }

  const valid = errors.length === 0;

  if (valid) {
    log.info({ backend: effectiveBackend, weightPath }, 'Model weights validated');
  } else {
    log.warn({ backend: effectiveBackend, weightPath, errors }, 'Model weight validation failed');
  }

  return { valid, backend: effectiveBackend, weightPath, errors };
}

// =============================================================================
// MODEL CONFIGURATION
// =============================================================================

/**
 * GPU memory requirements by model and quantization
 */
export const GPU_MEMORY_REQUIREMENTS: Record<string, { vram: number; recommended: string }> = {
  'Qwen3-Omni-BF16': { vram: 79, recommended: 'A100-80GB' },
  'Qwen3-Omni-INT8': { vram: 40, recommended: 'A100-40GB or 2x L4' },
  'Qwen3-Omni-INT4': { vram: 20, recommended: 'L4-24GB' },
  'Qwen3-Omni-Thinker-BF16': { vram: 69, recommended: 'A100-80GB' },
  'Qwen3-Omni-Thinker-INT4': { vram: 18, recommended: 'L4-24GB' },
  'Qwen3-TTS-1.7B': { vram: 4, recommended: 'Any GPU with 8GB+' },
};

/**
 * Maximum system prompt length for Qwen3-Omni.
 * Qwen3-Omni has a large context window, allowing rich persona context.
 */
export const MAX_SYSTEM_PROMPT_LENGTH = 16000;

/**
 * Default conversation style suffix
 */
export const CONVERSATION_STYLE_SUFFIX = `
You enjoy having a good conversation. Be present, warm, and supportive.
Listen actively and respond thoughtfully to what the user shares.
Never announce your tools or capabilities - just help naturally.
`.trim();

// =============================================================================
// LOGGING
// =============================================================================

/**
 * Log configuration summary
 */
export function logQwen3OmniConfig(): void {
  const config = getQwen3OmniConfig();
  log.info(
    {
      enabled: isQwen3OmniEnabled(),
      serverUrl: config.serverUrl,
      ttsServerUrl: config.ttsServerUrl,
      model: config.model,
      quantization: config.quantization,
      functionCalling: config.enableFunctionCalling,
      personas: VOICE_CLONE_CONFIGS.map((c) => c.personaId),
    },
    'Qwen3-Omni Configuration'
  );
}
