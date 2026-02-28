/**
 * Backchanneling Extended Bounded Context
 * @module speech/backchanneling-ext
 */
export * from './backchannel-phrase-selector.js';
export * from './enhanced-backchanneling.js';
export {
  // BackchannelType skipped — already exported by enhanced-backchanneling
  // BackchannelContext skipped — already exported by backchanneling
  type BackchannelInstructions,
  generateBackchannelInstructions,
  generateSilenceInstructions,
  generateResonanceCheck,
} from './llm-backchannel.js';
export * from './backchanneling.js';
export * from './multi-signal-laughter.js';
export * from './concern-detection-pipeline.js';
