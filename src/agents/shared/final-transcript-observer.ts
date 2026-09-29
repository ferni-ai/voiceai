/**
 * Per-turn observers for a final user transcript, shared by the single-agent
 * (voice-agent-entry) and multi-agent handlers so both paths behave the same.
 *
 * Order matters: the caller's voice for this turn is captured first, so the
 * crisis shadow and adaptive delivery both see this turn's reading rather
 * than the previous one's.
 *
 * @module agents/shared/final-transcript-observer
 */

import { getSessionAudioProsodyAnalyzer } from '../../speech/audio-prosody/index.js';
import {
  deliveryStyleForUserVoice,
  isAdaptiveDeliveryEnabled,
  type DeliveryStyle,
  type UserVoiceReading,
} from '../../speech/tts/delivery-style.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  observeCrisisTurn,
  toGuardVoiceEmotion,
  type CrisisGuardMode,
  type CrisisShadowRecord,
  type ProsodyEmotionLike,
} from '../safety/crisis-shadow.js';
import {
  captureTurnVoiceEmotion,
  type TurnProsodyAnalyzer,
} from '../voice-agent/turn-voice-emotion.js';

const crisisLog = createLogger({ module: 'CrisisShadow' });
const turnVoiceLog = createLogger({ module: 'TurnVoice' });

export interface FinalTranscriptInput {
  session: unknown;
  transcript: string;
  userData: Record<string, unknown>;
  sessionId: string;
  crisisMode: CrisisGuardMode;
  /** Defaults to the session's prosody analyzer. */
  analyzer?: TurnProsodyAnalyzer;
  env?: Record<string, string | undefined>;
}

export interface FinalTranscriptObservation {
  style: DeliveryStyle | null;
  crisis: CrisisShadowRecord | null;
}

/** Run every per-turn observer for one final transcript. Never throws. */
export function observeFinalTranscript(input: FinalTranscriptInput): FinalTranscriptObservation {
  const style = applyTurnVoice(input);
  const crisis = recordCrisisShadow(input);
  return { style, crisis };
}

function applyTurnVoice(input: FinalTranscriptInput): DeliveryStyle | null {
  const { session, userData, sessionId } = input;
  try {
    const analyzer = input.analyzer ?? getSessionAudioProsodyAnalyzer(sessionId);
    const reading = captureTurnVoiceEmotion(analyzer, userData) as UserVoiceReading | null;
    if (!isAdaptiveDeliveryEnabled(input.env)) return null;
    const style = deliveryStyleForUserVoice(reading);
    // The TTS gateway reads it per reply (speech/expression); the LiveKit TTS takes it directly.
    userData.deliveryStyle = style;
    const tts = (session as { tts?: { setDeliveryStyle?: (s: DeliveryStyle | null) => void } })
      ?.tts;
    tts?.setDeliveryStyle?.(style);
    turnVoiceLog.info(
      { sessionId, turn: userData.turnCount, voice: reading?.primary ?? null, style },
      'DELIVERY_STYLE'
    );
    return style;
  } catch (error) {
    turnVoiceLog.error({ sessionId, error: String(error) }, 'Per-turn voice failed');
    return null;
  }
}

function recordCrisisShadow(input: FinalTranscriptInput): CrisisShadowRecord | null {
  const { transcript, userData, sessionId, crisisMode } = input;
  try {
    const voiceEmotion = toGuardVoiceEmotion(
      userData.voiceEmotion as ProsodyEmotionLike | undefined
    );
    const crisis = observeCrisisTurn(transcript, voiceEmotion, crisisMode);
    if (crisis && crisis.severity > 0) {
      crisisLog.info({ sessionId, turn: userData.turnCount, ...crisis }, 'CRISIS_SHADOW');
    }
    return crisis;
  } catch (error) {
    crisisLog.error({ sessionId, error: String(error) }, 'Crisis shadow evaluation failed');
    return null;
  }
}
