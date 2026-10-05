/**
 * Development stubs for voice-clone-service when CARTESIA_API_KEY is missing.
 * Served only outside production (see utils/dev-stub.ts); production gets
 * the *_UNAVAILABLE error instead.
 */

export const CLONE_UNAVAILABLE =
  'Voice cloning service is not available: Cartesia API key is not configured. Contact support to enable this feature.';

export const PREVIEW_UNAVAILABLE =
  'Voice preview service is not available: Cartesia API key is not configured. Contact support to enable this feature.';

export function simulatedVoiceClone(name: string) {
  return {
    id: `voice_sim_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    name,
    description: `Custom voice for ${name} (simulated)`,
    is_public: false,
    created_at: new Date().toISOString(),
  };
}

export function simulatedVoicePreview(voiceId: string, text: string) {
  return {
    audioUrl: `preview://${voiceId}/${Date.now()}.mp3`,
    durationSeconds: text.length * 0.05,
  };
}
