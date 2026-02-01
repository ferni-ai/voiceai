/**
 * Pre-STT Audio Transform - Re-export barrel
 *
 * The canonical implementation has moved to utils/audio/pre-stt-transform.ts
 * (Level 10 - Foundation layer) so it can be imported by both agents/ (Level 100)
 * and services/ (Level 60) without architecture layer violations.
 *
 * This file re-exports everything for backward compatibility with existing
 * agent-level imports.
 *
 * @module agents/shared/performance/pre-stt-transform
 */

export {
  PreSTTProcessor,
  PreSTTPresets,
  DEFAULT_CONFIG,
  TWILIO_CONFIG,
  getPreSTTMetrics,
  resetPreSTTMetrics,
  getOrCreateProcessor,
  removeSessionProcessor,
  getActiveProcessorCount,
  clearAllProcessors,
  isPreSTTAvailable,
  applyAgc,
  type PreSTTConfig,
  type PreSTTMetrics,
} from '../../../utils/audio/pre-stt-transform.js';

// Re-export default for backward compatibility
export { default } from '../../../utils/audio/pre-stt-transform.js';
