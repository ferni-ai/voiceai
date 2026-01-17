/**
 * Application Layer Index
 *
 * Use cases that orchestrate domain logic with infrastructure.
 * These are the entry points for personality intelligence operations.
 *
 * @module personality/application
 */

export {
  BuildPersonalityContext,
  type BuildPersonalityContextInput,
  type PersonalityContextOutput,
} from './build-personality-context.js';

export {
  RecordEmotionalMoment,
  type RecordEmotionalMomentInput,
  type RecordEmotionalMomentOutput,
} from './record-emotional-moment.js';
