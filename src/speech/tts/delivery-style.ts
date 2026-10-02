/**
 * Adaptive delivery: how Ferni's reply should SOUND, given how the caller
 * sounded this turn.
 *
 * The mapping is empathic, not mirroring: sadness gets a sympathetic voice,
 * anxiety and anger get calm, a happy caller gets a lift. Anything uncertain
 * returns null, meaning default delivery. Emotion names are Cartesia Sonic-3
 * generation_config values, verified against the live API on 2026-09-27.
 *
 * Gated by ADAPTIVE_DELIVERY (default off): this changes what callers hear,
 * so it goes live only after a blind comparison shows it helps.
 *
 * @module speech/tts/delivery-style
 */

export interface DeliveryStyle {
  /** Cartesia Sonic-3 emotion (generation_config.emotion). */
  emotion: string;
  /** Cartesia Sonic-3 speed, 0.6-2.0 (1.0 = normal). */
  speed: number;
}

export interface UserVoiceReading {
  primary?: string;
  confidence?: number;
  stressLevel?: number;
}

const MIN_CONFIDENCE = 0.5;
const HIGH_STRESS = 0.8;

const STYLE_BY_EMOTION: Record<string, DeliveryStyle> = {
  sad: { emotion: 'sympathetic', speed: 0.92 },
  hurt: { emotion: 'sympathetic', speed: 0.92 },
  anxious: { emotion: 'calm', speed: 0.9 },
  fearful: { emotion: 'calm', speed: 0.9 },
  scared: { emotion: 'calm', speed: 0.9 },
  angry: { emotion: 'calm', speed: 0.95 },
  happy: { emotion: 'happy', speed: 1.05 },
  excited: { emotion: 'excited', speed: 1.05 },
};

export function deliveryStyleForUserVoice(
  voice: UserVoiceReading | null | undefined
): DeliveryStyle | null {
  if (!voice?.primary) return null;
  if ((voice.confidence ?? 0) < MIN_CONFIDENCE) return null;
  const byLabel: DeliveryStyle | undefined = STYLE_BY_EMOTION[voice.primary.toLowerCase()];
  if (byLabel !== undefined) return byLabel;
  if ((voice.stressLevel ?? 0) >= HIGH_STRESS) return STYLE_BY_EMOTION.anxious;
  return null;
}

export function isAdaptiveDeliveryEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.ADAPTIVE_DELIVERY?.trim().toLowerCase() === 'on';
}
