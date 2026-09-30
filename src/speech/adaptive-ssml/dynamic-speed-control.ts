/**
 * Dynamic Speed Control Types
 *
 * The shape of a pace decision, shared by the context manager's speech
 * insights. The calculator that produced it ran only in the removed post-LLM
 * response processor; a live reply's pace is decided once per reply by the
 * TTS path.
 *
 * @module dynamic-speed-control
 */

export interface SpeedControlResult {
  /** Final speed multiplier (0.7-1.3 range) */
  speedMultiplier: number;
  /** Individual contribution factors */
  factors: {
    engagement: number;
    complexity: number;
    emotion: number;
    wpmMirroring: number;
    topicWeight: number;
  };
  /** Human-readable reason for the speed */
  reason: string;
  /** Should add extra pauses? */
  addExtraPauses: boolean;
  /** Recommended pause duration multiplier */
  pauseMultiplier: number;
}
