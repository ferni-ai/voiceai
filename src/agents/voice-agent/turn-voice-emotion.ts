/**
 * Per-turn voice emotion.
 *
 * The prosody analyzer is fed every audio frame, but it used to be analysed
 * only when the audio stream closed, so no turn ever saw a voice reading.
 * Called on each final user transcript, this analyses the audio since the
 * previous turn, stores the result on userData.voiceEmotion (where the crisis
 * shadow and adaptive delivery read it), and clears the buffer.
 *
 * Known limit: when the native Rust processor is active, its features
 * accumulate for the whole session (only reset() clears them, and reset()
 * also discards calibration), so native readings are session-wide, not
 * per-turn.
 *
 * @module agents/voice-agent/turn-voice-emotion
 */

export interface TurnProsodyAnalyzer {
  analyze: () => unknown;
  clearBuffers: () => void;
}

export function captureTurnVoiceEmotion(
  analyzer: TurnProsodyAnalyzer,
  userData: Record<string, unknown>
): unknown {
  let reading: unknown = null;
  try {
    reading = analyzer.analyze() ?? null;
  } catch {
    reading = null;
  }
  try {
    analyzer.clearBuffers();
  } catch {
    // A failed clear only widens the next window; never break the turn.
  }
  if (reading !== null && reading !== undefined) userData.voiceEmotion = reading;
  return reading;
}
