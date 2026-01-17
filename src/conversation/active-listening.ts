/**
 * Active Listening Module
 *
 * @deprecated Import from './active-listening/index.js' directly
 *
 * This file re-exports the active listening module for backward compatibility.
 * The implementation has been split into focused submodules:
 *
 * - types.ts - Type definitions
 * - backchannels.ts - Backchannel library and persona styles
 * - silence-handling.ts - Silence evaluation and gentle prompts
 * - mirroring.ts - Vocabulary mirroring and emotional echoing
 * - clarification.ts - Clarifying questions
 * - index.ts - Main engine and exports
 *
 * @module conversation/active-listening
 */

export {
  ActiveListeningEngine,
  getActiveListeningEngine,
  resetActiveListeningEngine,
  default,
} from './active-listening/index.js';

export type {
  Backchannel,
  BackchannelContext,
  ClarifyingQuestion,
  MirroredPhrase,
  SilenceBackchannelContext,
  SilenceEvaluation,
} from './active-listening/index.js';
