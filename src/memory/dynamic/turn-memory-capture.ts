/**
 * Crisis-turn memory is session only, no extraction: a capture site that knows its turn's crisis
 * read captures as before (keep), or records the caller's line for this call only (hold): it stays
 * in short-term memory, nothing is extracted from it, and session-end promotion skips it
 * (stm-buffer.ts promotableTurns). Logs carry the site and the reason, never words.
 *
 * @module memory/dynamic/turn-memory-capture
 */
import { createLogger } from '../../utils/safe-logger.js';
import { noCapture } from '../third-party-call.js';
import { fastCapture, type FastCaptureInput, type FastCaptureResult } from './fast-capture.js';
import { recordTurn, type VoiceEmotionSnapshot } from './stm-buffer.js';
/** keep: capture as before. crisis: the turn's crisis read said crisis (crisisReadTurn). */
export type TurnMemoryVerdict = 'keep' | 'crisis';

const log = createLogger({ module: 'TurnMemoryCapture' });

/** Whether the words may go to long-term memory; a hold is logged with its site and reason. */
export async function memoryKept(
  site: string,
  sessionId: string,
  verdict: Promise<TurnMemoryVerdict>
): Promise<boolean> {
  const decided = await verdict;
  if (decided !== 'keep') log.info({ site, reason: decided, sessionId }, 'TURN_MEMORY_HELD');
  return decided === 'keep';
}

/** One capture of a caller turn's words, as each capture site made it before. */
export interface TurnCapture {
  input: FastCaptureInput;
  personaId?: string;
  voiceEmotion?: VoiceEmotionSnapshot;
}

interface VoiceReading {
  primary?: unknown;
  confidence?: number;
  stressLevel?: number;
  valence?: number;
  arousal?: number;
}

/** A voice reading in the short-term buffer's shape (for the emotional trajectory). */
export function voiceEmotionSnapshot(
  voice: VoiceReading | undefined
): VoiceEmotionSnapshot | undefined {
  if (!voice || typeof voice.primary !== 'string') return undefined;
  return {
    primary: voice.primary,
    confidence: voice.confidence ?? 0.5,
    stressLevel: voice.stressLevel ?? 0.3,
    valence: voice.valence ?? 0,
    arousal: voice.arousal ?? 0.5,
  };
}

/**
 * Keep: fastCapture, then the short-term record, as before; resolves to the capture. Hold: the
 * short-term record only, marked session only, with nothing captured from the words; null.
 */
export function captureTurnMemory(
  site: string,
  verdict: Promise<TurnMemoryVerdict>,
  capture: TurnCapture
): Promise<FastCaptureResult | null> {
  const { input, personaId, voiceEmotion } = capture;
  const { sessionId, userId, transcript, turnNumber } = input;
  return (async () => {
    const kept = await memoryKept(site, sessionId, verdict);
    const result = kept ? await fastCapture(input) : noCapture();
    recordTurn(sessionId, userId, result, transcript, turnNumber, personaId, voiceEmotion, !kept);
    return kept ? result : null;
  })();
}
