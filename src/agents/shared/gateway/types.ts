/**
 * Gateway option and result types.
 * Extracted to avoid circular imports between gateway modules.
 *
 * @module gateway/types
 */

export interface GatewayOptions {
  instructions: string;
  allowInterruptions?: boolean;
  context?: string;
  priority?: 'high' | 'normal' | 'low';
  /** If true, wait for audio playout. If false, returns after LLM response received */
  waitForPlayout?: boolean;
  /** Fallback message if generateReply fails */
  fallbackMessage?: string;
  /** Timeout in ms (default: 4000 - reduced for human-like latency) */
  timeoutMs?: number;
  /**
   * Optional user transcript for Higgs full loop.
   * When set and TTS is Higgs pipeline with generate_reply available, the gateway
   * calls Higgs generateReply(transcript) and plays the reply audio (if a raw-audio
   * handler is registered); otherwise falls back to session.generateReply().
   */
  transcript?: string;
}

export interface GatewayResult {
  success: boolean;
  usedFallback: boolean;
  error?: string;
  sessionNotReady?: boolean;
  queuePosition?: number;
  latencyMs?: number;
  /** True if the call was skipped (session not ready, low priority) */
  skipped?: boolean;
  /** True if the call was debounced (too rapid) */
  debounced?: boolean;
  /** True if call succeeded but LLM returned empty/no-speech response (Jan 2026 fix) */
  noSpeechProduced?: boolean;
}
