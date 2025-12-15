/**
 * Voice Agent Phase: Load Dependencies
 *
 * Loads voice dependencies (LiveKit agents, Google, Silero, GenAI).
 * These are lazy-loaded and cached for subsequent sessions.
 *
 * @module voice-agent/phases/load-deps
 */

import type { voice as voiceType } from '@livekit/agents';
import type { VoiceDeps } from './types.js';

// Lazy-loaded module cache (shared across sessions)
let voice: typeof voiceType | null = null;
let google: typeof import('@livekit/agents-plugin-google') | null = null;
let silero: typeof import('@livekit/agents-plugin-silero') | null = null;
let genai: typeof import('@google/genai') | null = null;

/**
 * Load core voice dependencies.
 * Cached after first load for subsequent sessions.
 */
export async function loadVoiceDeps(): Promise<VoiceDeps> {
  if (voice && google && silero && genai) {
    return { voice, google, silero, genai };
  }

  const startTime = Date.now();
  process.stderr.write(`[load-deps] Loading voice dependencies...\n`);

  const [agents, googleMod, sileroMod, genaiMod] = await Promise.all([
    import('@livekit/agents'),
    import('@livekit/agents-plugin-google'),
    import('@livekit/agents-plugin-silero'),
    import('@google/genai'),
  ]);

  voice = agents.voice;
  google = googleMod;
  silero = sileroMod;
  genai = genaiMod;

  process.stderr.write(`[load-deps] Voice deps loaded in ${Date.now() - startTime}ms\n`);

  return { voice, google, silero, genai };
}

/**
 * Get cached voice deps (must call loadVoiceDeps first).
 */
export function getCachedVoiceDeps(): VoiceDeps | null {
  if (!voice || !google || !silero || !genai) {
    return null;
  }
  return { voice, google, silero, genai };
}

/**
 * Check if voice deps are loaded.
 */
export function areVoiceDepsLoaded(): boolean {
  return voice !== null && google !== null && silero !== null && genai !== null;
}
