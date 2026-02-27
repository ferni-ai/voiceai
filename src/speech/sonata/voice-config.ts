/**
 * Sonata voice configuration — maps persona IDs to voice embedding paths.
 *
 * Each persona has a safetensors voice embedding that conditions the TTS model
 * to produce their unique voice. These files are stored in the pocket-voice
 * model repo or locally alongside the model weights.
 */

/** Map of persona ID to voice embedding path (relative to model directory). */
const SONATA_VOICES: Record<string, string> = {
  ferni: 'voices/ferni.safetensors',
  maya: 'voices/maya.safetensors',
  peter: 'voices/peter.safetensors',
  jordan: 'voices/jordan.safetensors',
  nayan: 'voices/nayan.safetensors',
  alex: 'voices/alex.safetensors',
};

/** Default voice used when no persona match is found. */
const DEFAULT_VOICE = 'voices/ferni.safetensors';

/**
 * Resolve a persona/voice ID to the voice embedding path.
 * Falls back to Ferni's voice if the persona is unknown.
 */
export function resolveVoicePath(voiceId: string): string | undefined {
  const normalized = voiceId.toLowerCase().replace(/[^a-z]/g, '');
  return SONATA_VOICES[normalized] ?? DEFAULT_VOICE;
}

/**
 * Check if a voice embedding exists for the given persona.
 */
export function hasVoice(voiceId: string): boolean {
  const normalized = voiceId.toLowerCase().replace(/[^a-z]/g, '');
  return normalized in SONATA_VOICES;
}

/** Sonata audio format constants. */
export const SONATA_SAMPLE_RATE = 24000;
export const SONATA_FRAME_SIZE = 1920; // 80ms at 24kHz
export const SONATA_CHANNELS = 1;
