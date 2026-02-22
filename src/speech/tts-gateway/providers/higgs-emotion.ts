/**
 * Centralized emotion → Higgs mapping.
 *
 * Higgs supports: neutral, gentle, whisper, serious, playful, empathetic, excited
 * and aliases (sad→gentle, concern→gentle, joy→excited, etc.).
 * This module is the single place we map SSMLProsodyConfig to Higgs emotion + intensity.
 *
 * @module speech/tts-gateway/providers/higgs-emotion
 */

import type { SSMLProsodyConfig } from '../types.js';

/** Higgs direct emotions (from Rust README) */
const HIGGS_DIRECT = new Set([
  'neutral',
  'gentle',
  'whisper',
  'serious',
  'playful',
  'empathetic',
  'excited',
]);

/** Map our/common emotion names to Higgs emotion (direct or alias) */
const EMOTION_TO_HIGGS: Record<string, string> = {
  neutral: 'neutral',
  gentle: 'gentle',
  whisper: 'whisper',
  serious: 'serious',
  playful: 'playful',
  empathetic: 'empathetic',
  excited: 'excited',
  sad: 'gentle',
  concern: 'gentle',
  concerned: 'gentle',
  joy: 'excited',
  happy: 'excited',
  anger: 'serious',
  warmth: 'empathetic',
  warm: 'empathetic',
  calm: 'gentle',
  vulnerable: 'whisper',
  curious: 'playful',
  sadness: 'gentle',
  empathy: 'empathetic',
  excitement: 'excited',
};

/**
 * Map SSML prosody to Higgs emotion and intensity.
 * Single source of truth for all Higgs TTS calls.
 */
export function mapProsodyToHiggsEmotion(prosody?: SSMLProsodyConfig): {
  emotion?: string;
  intensity?: number;
} {
  if (!prosody?.emotion) {
    return {};
  }
  const raw = prosody.emotion.toLowerCase().trim();
  const emotion =
    HIGGS_DIRECT.has(raw) ? raw : EMOTION_TO_HIGGS[raw] ?? 'neutral';
  let intensity: number | undefined;
  if (prosody.emotionIntensity !== undefined && prosody.emotionIntensity !== null) {
    intensity = Math.max(0, Math.min(1, Number(prosody.emotionIntensity)));
  }
  return { emotion, intensity };
}
