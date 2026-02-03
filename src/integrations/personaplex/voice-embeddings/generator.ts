/**
 * Voice Embedding Generator
 *
 * Generates PersonaPlex voice embeddings from Cartesia TTS samples.
 *
 * Process:
 * 1. Generate audio sample using Cartesia TTS
 * 2. Save as WAV file
 * 3. (External step) Run PersonaPlex offline mode to create .pt embedding
 *
 * The actual .pt conversion requires a GPU and the PersonaPlex Python environment,
 * so this module generates the intermediate WAV files that can be processed separately.
 */

import { existsSync } from 'fs';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { createLogger } from '../../../utils/safe-logger.js';
import { VOICE_EMBEDDING_CONFIGS, getPersonaPlexConfig } from '../config.js';
import type { VoiceEmbeddingConfig, VoiceEmbeddingResult } from '../types.js';

const log = createLogger({ module: 'VoiceEmbeddingGenerator' });

// =============================================================================
// CARTESIA TTS INTEGRATION
// =============================================================================

interface CartesiaTTSOptions {
  voiceId: string;
  text: string;
  model?: string;
}

interface CartesiaTTSResponse {
  audio: ArrayBuffer;
  contentType: string;
}

/**
 * Generate audio using Cartesia TTS API
 */
async function generateCartesiaAudio(options: CartesiaTTSOptions): Promise<CartesiaTTSResponse> {
  const apiKey = process.env.CARTESIA_API_KEY;
  if (!apiKey) {
    throw new Error('CARTESIA_API_KEY environment variable is required');
  }

  const model = options.model || 'sonic-3-latest';

  log.info({ voiceId: options.voiceId, textLength: options.text.length }, 'Generating Cartesia audio');

  const response = await fetch('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Cartesia-Version': '2024-06-10',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_id: model,
      transcript: options.text,
      voice: {
        mode: 'id',
        id: options.voiceId,
      },
      output_format: {
        container: 'wav',
        encoding: 'pcm_f32le',
        sample_rate: 24000,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cartesia API error: ${response.status} - ${errorText}`);
  }

  const audio = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || 'audio/wav';

  return { audio, contentType };
}

// =============================================================================
// VOICE SAMPLE GENERATION
// =============================================================================

/**
 * Generate a voice sample WAV file for a persona
 */
export async function generateVoiceSample(config: VoiceEmbeddingConfig): Promise<string> {
  const { voicePromptDir } = getPersonaPlexConfig();
  const samplesDir = join(voicePromptDir, 'samples');

  // Ensure directory exists
  await mkdir(samplesDir, { recursive: true });

  const outputPath = join(samplesDir, `${config.personaId}.wav`);

  log.info(
    { personaId: config.personaId, voiceId: config.cartesiaVoiceId, outputPath },
    'Generating voice sample'
  );

  try {
    const { audio } = await generateCartesiaAudio({
      voiceId: config.cartesiaVoiceId,
      text: config.sampleText,
    });

    await writeFile(outputPath, Buffer.from(audio));

    log.info(
      { personaId: config.personaId, outputPath, sizeBytes: audio.byteLength },
      'Voice sample generated successfully'
    );

    return outputPath;
  } catch (error) {
    log.error({ personaId: config.personaId, error: String(error) }, 'Failed to generate voice sample');
    throw error;
  }
}

/**
 * Generate voice samples for all personas
 */
export async function generateAllVoiceSamples(): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  for (const config of VOICE_EMBEDDING_CONFIGS) {
    try {
      const path = await generateVoiceSample(config);
      results.set(config.personaId, path);
    } catch (error) {
      log.error(
        { personaId: config.personaId, error: String(error) },
        'Failed to generate voice sample, continuing with others'
      );
    }
  }

  return results;
}

// =============================================================================
// EMBEDDING GENERATION (External Process)
// =============================================================================

/**
 * Generate the command to create PersonaPlex embeddings from WAV samples.
 * This must be run on a machine with GPU and PersonaPlex installed.
 */
export function getEmbeddingGenerationCommand(personaId: string): string {
  const config = VOICE_EMBEDDING_CONFIGS.find((c) => c.personaId === personaId);
  if (!config) {
    throw new Error(`No voice embedding config found for persona: ${personaId}`);
  }

  const { voicePromptDir } = getPersonaPlexConfig();
  const samplePath = join(voicePromptDir, 'samples', `${config.personaId}.wav`);
  const outputPath = join(voicePromptDir, config.embeddingFilename);

  // PersonaPlex offline mode with save_voice_prompt_embeddings=True saves embeddings
  // The model needs to be run once to generate the embedding
  return `
# Generate embedding for ${config.personaId}
# Run this on a machine with GPU and PersonaPlex installed

HF_TOKEN=$HF_TOKEN python -m moshi.offline \\
  --voice-prompt "${samplePath}" \\
  --text-prompt "Hello, this is a test." \\
  --input-wav "${join(voicePromptDir, 'samples', 'silence-10s.wav')}" \\
  --output-wav "/dev/null" \\
  --save-voice-prompt-embeddings

# This will create ${config.personaId}.pt in the same directory as the input WAV
mv "${samplePath.replace('.wav', '.pt')}" "${outputPath}"
`.trim();
}

/**
 * Get all embedding generation commands
 */
export function getAllEmbeddingGenerationCommands(): string {
  const commands = VOICE_EMBEDDING_CONFIGS.map((config) => getEmbeddingGenerationCommand(config.personaId));

  return `#!/bin/bash
# Voice Embedding Generation Script
# Run this on a GPU machine with PersonaPlex installed

set -e

# Ensure HF_TOKEN is set
if [ -z "$HF_TOKEN" ]; then
  echo "Error: HF_TOKEN environment variable is required"
  exit 1
fi

${commands.join('\n\n')}

echo "All embeddings generated successfully!"
`;
}

// =============================================================================
// EMBEDDING VALIDATION
// =============================================================================

/**
 * Check if a voice embedding exists for a persona
 */
export function voiceEmbeddingExists(personaId: string): boolean {
  const config = VOICE_EMBEDDING_CONFIGS.find((c) => c.personaId === personaId);
  if (!config) return false;

  const { voicePromptDir } = getPersonaPlexConfig();
  const embeddingPath = join(voicePromptDir, config.embeddingFilename);

  return existsSync(embeddingPath);
}

/**
 * Get the path to a voice embedding, or fallback voice name
 */
export function getVoiceEmbeddingPath(personaId: string): { path: string; isCustom: boolean } {
  const config = VOICE_EMBEDDING_CONFIGS.find((c) => c.personaId === personaId);
  if (!config) {
    return { path: 'NATM1.pt', isCustom: false };
  }

  const { voicePromptDir } = getPersonaPlexConfig();
  const embeddingPath = join(voicePromptDir, config.embeddingFilename);

  if (existsSync(embeddingPath)) {
    return { path: embeddingPath, isCustom: true };
  }

  // Fall back to stock PersonaPlex voice
  return { path: `${config.fallbackVoice}.pt`, isCustom: false };
}

/**
 * Validate all voice embeddings and report status
 */
export function validateVoiceEmbeddings(): VoiceEmbeddingResult[] {
  const results: VoiceEmbeddingResult[] = [];

  for (const config of VOICE_EMBEDDING_CONFIGS) {
    const { path, isCustom } = getVoiceEmbeddingPath(config.personaId);

    results.push({
      personaId: config.personaId,
      embeddingPath: path,
      duration: 0, // Would need to read the file to get actual duration
      success: isCustom,
      error: isCustom ? undefined : `Using fallback voice: ${config.fallbackVoice}`,
    });
  }

  return results;
}
