/**
 * Per-turn observers for a final user transcript, shared by the single-agent
 * (voice-agent-entry) and multi-agent handlers so both paths behave the same.
 *
 * Order matters: the caller's voice for this turn is captured first, so the
 * crisis shadow sees this turn's reading rather than the previous one's.
 * (How the reply should sound is the Speech Director's: its emotion and
 * prosody levers read the caller. The adaptive-delivery style that used to be
 * picked here only reached LiveKit's Cartesia plugin, which the TTS gateway
 * bypasses, so it never changed a reply.)
 *
 * @module agents/shared/final-transcript-observer
 */

import { getSessionAudioProsodyAnalyzer } from '../../speech/audio-prosody/index.js';
import { trackEmotionDetection } from '../integrations/speech-metrics-integration.js';
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
  transcript: string;
  userData: Record<string, unknown>;
  sessionId: string;
  crisisMode: CrisisGuardMode;
  /** Defaults to the session's prosody analyzer. */
  analyzer?: TurnProsodyAnalyzer;
}

export interface FinalTranscriptObservation {
  crisis: CrisisShadowRecord | null;
}

/** Run every per-turn observer for one final transcript. Never throws. */
export function observeFinalTranscript(input: FinalTranscriptInput): FinalTranscriptObservation {
  captureTurnVoice(input);
  return { crisis: recordCrisisShadow(input) };
}

/**
 * Record this turn's voice reading on userData (voiceEmotion) for the crisis
 * guard and others, and in the speech metrics. The metrics used to hear only
 * the reading taken when the audio stream closed, and in prod none arrived:
 * all 394 session summaries since 2026-10-01, app and phone, logged
 * emotionConfidence 0.
 */
function captureTurnVoice(input: FinalTranscriptInput): void {
  const { userData, sessionId } = input;
  try {
    const analyzer = input.analyzer ?? getSessionAudioProsodyAnalyzer(sessionId);
    const reading = captureTurnVoiceEmotion(analyzer, userData) as { confidence?: unknown } | null;
    if (typeof reading?.confidence === 'number' && Number.isFinite(reading.confidence)) {
      trackEmotionDetection(sessionId, reading.confidence);
    }
  } catch (error) {
    turnVoiceLog.error({ sessionId, error: String(error) }, 'Per-turn voice failed');
  }
}

function recordCrisisShadow(input: FinalTranscriptInput): CrisisShadowRecord | null {
  const { transcript, userData, sessionId, crisisMode } = input;
  try {
    const voiceEmotion = toGuardVoiceEmotion(
      userData.voiceEmotion as ProsodyEmotionLike | undefined
    );
    const recent = userData.recentTranscripts;
    const crisis = observeCrisisTurn(transcript, voiceEmotion, crisisMode, {
      recentMessages: Array.isArray(recent) ? recent.filter((m) => typeof m === 'string') : [],
    });
    if (crisis && crisis.severity > 0) {
      crisisLog.info({ sessionId, turn: userData.turnCount, ...crisis }, 'CRISIS_SHADOW');
    }
    return crisis;
  } catch (error) {
    crisisLog.error({ sessionId, error: String(error) }, 'Crisis shadow evaluation failed');
    return null;
  }
}
