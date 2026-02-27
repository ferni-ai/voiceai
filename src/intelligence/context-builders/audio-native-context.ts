/**
 * Audio-Native Context Builder (5C: Our pipeline, better than Gemini Live)
 *
 * We do NOT send raw audio to the LLM. Instead we run our own STT (e.g. Parakeet/Higgs)
 * plus prosody analysis and voice biomarkers, then inject a structured [AUDIO ANALYSIS]
 * block so any text-mode LLM (OpenAI, Gemini TEXT) "hears" the user through rich
 * quantitative context. This gives us full control over TTS (e.g. Higgs) and lets us
 * exceed what Gemini Live offers by adding biomarkers, stress, and optional embeddings.
 *
 * Use: buildAudioNativeContextForLLM() with Higgs biomarkers and/or voice emotion/prosody.
 */

import type { ProsodyFeatures } from '../../speech/audio-prosody/types.js';
import type { VoiceState } from '../../speech/voice-biomarkers/types.js';

/** Full or minimal voice emotion (e.g. from userData.voiceEmotion or ctx.voiceEmotion) */
interface VoiceEmotionLike {
  primary?: string;
  confidence?: number;
  stressLevel?: number;
  arousal?: number;
  valence?: number;
  anxietyMarkers?: boolean;
  prosody?: ProsodyFeatures;
}

/** Voice biomarkers from DSP pipeline (pitch, jitter, shimmer, etc.) */
export interface HiggsVoiceBiomarkers {
  pitch_hz: number;
  energy: number;
  jitter: number;
  shimmer: number;
  breathiness: number;
  speech_rate: number;
  is_speech: boolean;
}

export interface AudioNativeContextInput {
  /** From Higgs STT path (Parakeet + our DSP) */
  higgsBiomarkers?: HiggsVoiceBiomarkers | null;
  /** From audio-processor (Cartesia path) or turn context (may be minimal: primary, confidence only) */
  voiceEmotion?: VoiceEmotionLike | null;
  /** From voice biomarker pipeline (stress, fatigue, anxiety, etc.) */
  voiceBiomarkers?: VoiceState | null;
  /** Optional: when 5B audio embedding pipeline is available, pass a short summary */
  audioEmbeddingSummary?: string | null;
}

function formatProsodyLine(p: ProsodyFeatures): string {
  const pitch = `pitch_mean=${Math.round(p.pitchMean)}Hz pitch_variance=${p.pitchVariance > 30 ? 'high' : p.pitchVariance > 15 ? 'medium' : 'low'}`;
  const energy = `energy_mean=${(p.energyMean * 100).toFixed(0)}% energy_contour=${p.energyVariance > 0.1 ? 'variable' : 'stable'}`;
  const rate = `speaking_rate=${(p.speechRate / 60).toFixed(1)}wps`;
  const pauses = `pause_count≈${Math.round(p.pauseFrequency)} pause_avg_ms=${Math.round(p.pauseDuration)}`;
  const quality = `jitter=${p.jitter.toFixed(2)} shimmer=${p.shimmer.toFixed(2)} breathiness=${(p.breathiness * 100).toFixed(0)}%`;
  const timing = `utterance_duration_ms=${Math.round(p.utteranceDuration)}`;
  return [pitch, energy, rate, pauses, quality, timing].join(' ');
}

function formatHiggsLine(h: HiggsVoiceBiomarkers): string {
  const parts = [
    `pitch_hz=${Math.round(h.pitch_hz)}`,
    `energy=${(h.energy * 100).toFixed(0)}%`,
    `jitter=${h.jitter.toFixed(2)}`,
    `shimmer=${h.shimmer.toFixed(2)}`,
    `breathiness=${(h.breathiness * 100).toFixed(0)}%`,
    `speech_rate=${h.speech_rate.toFixed(1)}`,
    `is_speech=${h.is_speech}`,
  ];
  return parts.join(' ');
}

/**
 * Builds the [AUDIO ANALYSIS] context block for the LLM.
 * Call this when we have Higgs biomarkers and/or voice emotion so the model
 * receives structured "what we heard" — our audio-native understanding, better than Gemini Live.
 */
export function buildAudioNativeContextForLLM(input: AudioNativeContextInput): string {
  const lines: string[] = ['[AUDIO ANALYSIS]'];
  let hasContent = false;

  const h = input.higgsBiomarkers;
  const ve = input.voiceEmotion;
  const vb = input.voiceBiomarkers;
  const emb = input.audioEmbeddingSummary;

  if (h && h.is_speech) {
    lines.push(`Raw_metrics: ${formatHiggsLine(h)}`);
    hasContent = true;
  }

  if (ve?.prosody) {
    lines.push(`Prosody: ${formatProsodyLine(ve.prosody)}`);
    hasContent = true;
  }

  if (ve) {
    const emotion = `emotion=${ve.primary ?? 'unknown'} confidence=${((ve.confidence ?? 0) * 100).toFixed(0)}%`;
    const stress = ve.stressLevel != null ? ` stress_level=${(ve.stressLevel * 100).toFixed(0)}%` : '';
    const arc = ve.arousal != null || ve.valence != null
      ? ` arousal=${(ve.arousal ?? 0).toFixed(2)} valence=${(ve.valence ?? 0).toFixed(2)}`
      : '';
    lines.push(`Voice_state: ${emotion}${stress}${arc}`);
    if (ve.anxietyMarkers) {
      lines.push('Anxiety_markers: tremor_detected=true');
    }
    hasContent = true;
  }

  if (vb) {
    lines.push(`Biomarkers: primary=${vb.primary} stress=${(vb.stressLevel * 100).toFixed(0)}% energy=${(vb.energyLevel * 100).toFixed(0)}%`);
    if (vb.biomarkers?.length) {
      const top = vb.biomarkers.slice(0, 3).map((b) => `${b.type}=${(b.confidence * 100).toFixed(0)}%`).join(' ');
      lines.push(`Detected: ${top}`);
    }
    if (vb.recommendedPacing && vb.recommendedPacing !== 'normal') {
      lines.push(`Recommended_pacing: ${vb.recommendedPacing}`);
    }
    hasContent = true;
  }

  if (emb && emb.trim()) {
    lines.push(`Audio_embedding_summary: ${emb.trim()}`);
    hasContent = true;
  }

  if (!hasContent) return '';
  return lines.join('\n');
}
