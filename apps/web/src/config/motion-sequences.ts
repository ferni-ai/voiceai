/**
 * Motion sequences: the one entry point to the generated sequence table.
 *
 * The table itself is generated from design-system/tokens/sequences.json into
 * sequences.generated.ts (pnpm build:sequences); code imports it from here.
 *
 * @module config/motion-sequences
 */
export {
  REDUCED_MOTION,
  SEQUENCES,
  type ReducedMotionSimplification,
  type Sequence,
  type SequenceId,
  type SequenceStep,
} from './sequences.generated.js';
